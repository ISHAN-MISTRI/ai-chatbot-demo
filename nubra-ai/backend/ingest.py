import json
import os
import re
import hashlib
import logging
from io import BytesIO
from typing import Dict, List

import pdfplumber
import tiktoken
from dotenv import load_dotenv
from openai import OpenAI

from database import get_database, get_gridfs, utc_now

load_dotenv()

EMBEDDING_MODEL = "text-embedding-3-small"
METADATA_MODEL = "gpt-4o"  # Use gpt-4o for reliable JSON extraction
# Storage budgeting (Atlas free tier):
# - Bigger chunks => fewer embeddings => far less storage
# - Overlap increases chunks => increases storage
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "900"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "100"))
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "24"))
# Optional safety valve for free-tier deployments processing huge PDFs.
# 0 or missing means "no limit".
MAX_PAGES = int(os.getenv("MAX_PAGES", "120"))
# Prevent pathological pages (tables/OCR noise) from blowing up memory during tokenization.
# 0 means "no truncation".
MAX_PAGE_CHARS = int(os.getenv("MAX_PAGE_CHARS", "20000"))
# Total chunk cap per report. 0 means unlimited.
MAX_CHUNKS_PER_REPORT = int(os.getenv("MAX_CHUNKS_PER_REPORT", "1200"))

logger = logging.getLogger("sihl-api.ingest")

UNKNOWN_METADATA = {
    "company_ticker": "UNKNOWN",
    "company_name": "UNKNOWN",
    "report_type": "UNKNOWN",
    "quarter": "UNKNOWN",
    "fiscal_year": "UNKNOWN",
}

# Annual report types that don't have a quarter — use fiscal year as the period key
ANNUAL_REPORT_TYPES = {"AnnualReport", "IntegratedReport", "annual", "integrated"}


def _clean_upper_alnum(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def _infer_fiscal_year_from_text(text: str) -> str:
    """Infer fiscal year from patterns like '2024-25', 'FY25', 'FY 2025', '2021-22'."""
    if not text:
        return "UNKNOWN"
    # Pattern: FY25 or FY2025
    m = re.search(r"\bFY\s*(20)?([0-9]{2})\b", text, re.IGNORECASE)
    if m:
        return f"FY{m.group(2)}"
    # Pattern: 2024-25 or 2021-22 (Indian fiscal year notation)
    m = re.search(r"\b(20[0-9]{2})[-–](2[0-9]|[0-9]{2})\b", text)
    if m:
        end_year = m.group(2)[-2:]  # last 2 digits of end year
        return f"FY{end_year}"
    return "UNKNOWN"


def _infer_quarter_from_text(raw_text: str) -> str:
    if not raw_text:
        return "UNKNOWN"
    match = re.search(r"\bQ([1-4])\s*[- ]?\s*FY\s*(20)?([0-9]{2})\b", raw_text, flags=re.IGNORECASE)
    if not match:
        match = re.search(r"\b([1-4])Q\s*[- ]?\s*FY\s*(20)?([0-9]{2})\b", raw_text, flags=re.IGNORECASE)
    if not match:
        return "UNKNOWN"
    quarter = match.group(1)
    year = match.group(3) if match.lastindex >= 3 else match.group(2)[-2:]
    return f"Q{quarter}FY{year[-2:]}"


def _apply_metadata_fallbacks(
    metadata: Dict[str, str], first_3_pages_text: str, original_filename: str
) -> Dict[str, str]:
    """Apply fallback inference for missing metadata fields.
    
    Key design decisions:
    - We do NOT infer ticker from filename — it produces junk like 'TATA' or 'TSL' or 'FY25'.
    - For annual/integrated reports (no quarter), we use the fiscal year as the 'quarter' field
      so each report has a stable, unique identity key (ticker + fiscal_year_as_quarter).
    - Fiscal year is inferred from text patterns like '2024-25', 'FY25', etc.
    """
    text = first_3_pages_text or ""
    combined_text = f"{text}\n{original_filename}"

    report_type = metadata.get("report_type", "UNKNOWN")
    is_annual = any(t.lower() in report_type.lower() for t in ["annual", "integrated"]) or report_type == "UNKNOWN"

    # Step 1: Try to get fiscal year from text/filename
    if metadata.get("fiscal_year", "UNKNOWN") == "UNKNOWN":
        metadata["fiscal_year"] = _infer_fiscal_year_from_text(combined_text)

    # Step 2: For quarterly reports, infer quarter from text
    if metadata.get("quarter", "UNKNOWN") == "UNKNOWN" and not is_annual:
        metadata["quarter"] = _infer_quarter_from_text(combined_text)
        if metadata["quarter"] != "UNKNOWN" and metadata["fiscal_year"] == "UNKNOWN":
            metadata["fiscal_year"] = metadata["quarter"][-4:]  # e.g. Q3FY25 -> FY25

    # Step 3: For annual/integrated reports without a quarter, use the fiscal year as period key
    if metadata.get("quarter", "UNKNOWN") == "UNKNOWN":
        fy = metadata.get("fiscal_year", "UNKNOWN")
        if fy != "UNKNOWN":
            metadata["quarter"] = fy  # e.g. "FY25" — unique per year

    # Step 4: Normalize the ticker — strip all non-alphanumeric characters
    # NEVER fall back to filename-based ticker inference (produces wrong values)
    ticker = _clean_upper_alnum(metadata.get("company_ticker", "UNKNOWN"))
    metadata["company_ticker"] = ticker if ticker else "UNKNOWN"

    # Step 5 (safe fallback): if the LLM couldn't extract the ticker, try a very small
    # allow-listed filename heuristic for known bundled PDFs.
    # This keeps production working even if PDF text extraction misses the NSE ticker string.
    if metadata["company_ticker"] == "UNKNOWN":
        filename = (original_filename or "").lower()
        if ("tata" in filename and "steel" in filename) or "tatasteel" in filename or filename.startswith("tsl_") or "tsl" in filename:
            metadata["company_ticker"] = "TATASTEEL"
            if metadata.get("company_name", "UNKNOWN") == "UNKNOWN":
                metadata["company_name"] = "Tata Steel Limited"

    return metadata


def _openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in backend/.env")
    return OpenAI(api_key=api_key)


def extract_metadata_from_pdf(first_3_pages_text: str) -> Dict[str, str]:
    prompt = f"""
Read the following text extracted from the first 3 pages of an Indian company financial report PDF.
Extract and return ONLY a JSON object with these exact fields:

{{
  "company_ticker": "The official NSE ticker symbol in uppercase. Extract it from the document text (e.g. TATASTEEL, HDFCBANK, RELIANCE). DO NOT guess from the filename.",
  "company_name": "Full legal company name as written in the document",
  "report_type": "One of: InvestorPresentation / AnnualReport / IntegratedReport / QuarterlyResults",
  "quarter": "For quarterly reports use format like Q3FY25. For Annual/Integrated Reports that cover a full fiscal year, use the fiscal year itself as the period e.g. FY25, FY22. Do NOT leave this blank for annual reports.",
  "fiscal_year": "Fiscal year in format FY25 (2-digit year suffix). Always fill this."
}}

IMPORTANT RULES:
1. The ticker must come from the PDF content (company header, NSE listing, etc.), NOT from any filename or URL.
2. For Integrated Reports / Annual Reports, the 'quarter' field should be the fiscal year e.g. 'FY25'.
3. Look for year ranges like '2024-25' or '2021-22' to determine the fiscal year (the end year gives the FY code: 2024-25 = FY25).
4. Return ONLY valid JSON. No markdown. No explanation.

PDF text:
{first_3_pages_text}
""".strip()

    try:
        client = _openai_client()
        response = client.chat.completions.create(
            model=METADATA_MODEL,
            temperature=0,
            max_tokens=300,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        parsed = json.loads(response.choices[0].message.content or "{}")
    except Exception:
        parsed = {}

    metadata = {}
    for key, default_value in UNKNOWN_METADATA.items():
        value = parsed.get(key) if isinstance(parsed, dict) else None
        metadata[key] = str(value).strip() if value else default_value
    return metadata


def _chunk_text(text: str, encoding) -> List[str]:
    tokens = encoding.encode(text or "")
    if not tokens:
        return []

    chunks = []
    step = CHUNK_SIZE - CHUNK_OVERLAP
    for start in range(0, len(tokens), step):
        token_slice = tokens[start : start + CHUNK_SIZE]
        if not token_slice:
            continue
        chunk_text = encoding.decode(token_slice).strip()
        if chunk_text:
            chunks.append(chunk_text)
        if start + CHUNK_SIZE >= len(tokens):
            break
    return chunks


def _embed_text_batch(client: OpenAI, texts: List[str]) -> List[List[float]]:
    if not texts: return []
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [data.embedding for data in response.data]


def ingest_pdf(file_bytes: bytes, original_filename: str):
    _, db = get_database()
    store_pdf_in_gridfs = (os.getenv("STORE_PDF_IN_GRIDFS", "0") or "0").strip().lower() in {"1", "true", "yes"}
    fs = get_gridfs(db) if store_pdf_in_gridfs else None
    openai_client = _openai_client()
    encoding = tiktoken.get_encoding("cl100k_base")

    report_file_id = None
    total_chunks = 0
    total_pages = 0
    source_sha256 = hashlib.sha256(file_bytes or b"").hexdigest()

    try:
        # Idempotency: if this exact PDF has been ingested, skip.
        existing_by_hash = db.reports.find_one({"source_sha256": source_sha256}, {"_id": 1, "status": 1})
        if existing_by_hash and existing_by_hash.get("status") == "completed":
            return {
                "company_ticker": "UNKNOWN",
                "company_name": "UNKNOWN",
                "report_type": "UNKNOWN",
                "quarter": "UNKNOWN",
                "fiscal_year": "UNKNOWN",
                "report_file_id": str(existing_by_hash["_id"]),
                "gridfs_file_id": "",
                "total_pages": 0,
                "total_chunks": 0,
                "skipped": True,
                "reason": "already_ingested",
            }

        gridfs_file_id = None
        if fs is not None:
            # WARNING: GridFS storage will quickly exceed Atlas free-tier quota.
            gridfs_file_id = fs.put(
                file_bytes,
                filename=original_filename,
                upload_date=utc_now(),
                metadata={"original_filename": original_filename},
            )

        # Single-pass PDF open: capture first 3 pages for metadata, then ingest pages streaming.
        # This avoids reopening large PDFs twice (lower memory pressure on free-tier).
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            total_pages = len(pdf.pages)
            first_pages_texts: list[str] = []
            for idx in range(min(3, total_pages)):
                try:
                    t = (pdf.pages[idx].extract_text() or "").strip()
                except Exception:
                    t = ""
                first_pages_texts.append(t)

            first_3_pages_text = "\n\n".join(first_pages_texts[:3])
            metadata = extract_metadata_from_pdf(first_3_pages_text)
            metadata = _apply_metadata_fallbacks(metadata, first_3_pages_text, original_filename)

        previous_report = db.reports.find_one(
            {"company_ticker": metadata["company_ticker"], "quarter": metadata["quarter"]},
            {"_id": 1},
        )
        if previous_report:
            db.extracted_json.delete_many({"report_id": previous_report["_id"]})
            db.embeddings.delete_many({"report_id": previous_report["_id"]})
            db.reports.delete_one({"_id": previous_report["_id"]})
        report_file_id = db.reports.insert_one(
            {
                "company_ticker": metadata["company_ticker"],
                "company_name": metadata["company_name"],
                "report_type": metadata["report_type"],
                "quarter": metadata["quarter"],
                "fiscal_year": metadata["fiscal_year"],
                "original_filename": original_filename,
                "gridfs_file_id": gridfs_file_id,
                "source_sha256": source_sha256,
                "total_pages": total_pages,
                "total_chunks": 0,
                "uploaded_at": utc_now(),
                "status": "processing",
                "error": None,
                "last_processed_page": 0,
            }
        ).inserted_id

            # Stream chunking + embedding in small batches to stay within 512MB memory.
        pending_texts: list[str] = []
        pending_meta: list[dict] = []
        last_processed_page = 0

        def _flush_batch():
            nonlocal total_chunks
            if not pending_texts:
                return
            try:
                embeddings = _embed_text_batch(openai_client, pending_texts)
            except Exception as exc:
                # Persist the error on the report for debugging in production.
                db.reports.update_one(
                    {"_id": report_file_id},
                    {"$set": {"status": "failed", "error": f"embedding_failed: {exc}", "total_chunks": total_chunks}},
                )
                raise
            chunk_docs = []
            embedding_docs = []
            for m, emb in zip(pending_meta, embeddings):
                chunk_id = f"{str(report_file_id)}:{m['page_number']}:{m['chunk_index']}"
                chunk_docs.append(
                    {
                        "report_id": report_file_id,
                        "chunk_id": chunk_id,
                        "company_ticker": metadata["company_ticker"],
                        "quarter": metadata["quarter"],
                        "page_number": m["page_number"],
                        "chunk_text": m["chunk_text"],
                        "source_filename": original_filename,
                        "created_at": utc_now(),
                    }
                )
                embedding_docs.append(
                    {
                        "report_id": report_file_id,
                        "chunk_id": chunk_id,
                        "company_ticker": metadata["company_ticker"],
                        "quarter": metadata["quarter"],
                        "page_number": m["page_number"],
                        "chunk_text": m["chunk_text"],
                        "embedding": emb,
                        "created_at": utc_now(),
                    }
                )
            if chunk_docs:
                store_extracted_json = (os.getenv("STORE_EXTRACTED_JSON", "0") or "0").strip().lower() in {"1", "true", "yes"}
                if store_extracted_json:
                    # extracted_json duplicates chunk_text and increases DB size; keep disabled on free tier.
                    db.extracted_json.insert_many(chunk_docs)
                db.embeddings.insert_many(embedding_docs)
            total_chunks += len(chunk_docs)
            pending_texts.clear()
            pending_meta.clear()
            # Progress checkpoint (helps long ingestions survive restarts)
            db.reports.update_one(
                {"_id": report_file_id},
                {"$set": {"total_chunks": total_chunks, "last_processed_page": last_processed_page}},
            )

            # Keep chunk_index increasing per page (stable, deterministic)
            page_iter = enumerate(pdf.pages, start=1)
            for page_number, page in page_iter:
                if MAX_PAGES and page_number > MAX_PAGES:
                    logger.warning("MAX_PAGES=%s reached for %s; stopping early.", MAX_PAGES, original_filename)
                    break
                if MAX_CHUNKS_PER_REPORT and total_chunks >= MAX_CHUNKS_PER_REPORT:
                    logger.warning(
                        "MAX_CHUNKS_PER_REPORT=%s reached for %s; stopping early.",
                        MAX_CHUNKS_PER_REPORT,
                        original_filename,
                    )
                    break
                try:
                    page_text = (page.extract_text() or "").strip()
                except Exception:
                    page_text = ""
                if MAX_PAGE_CHARS and page_text and len(page_text) > MAX_PAGE_CHARS:
                    page_text = page_text[:MAX_PAGE_CHARS]
                last_processed_page = page_number
                if not page_text:
                    continue
                chunks = _chunk_text(page_text, encoding)
                for chunk_index, chunk_text in enumerate(chunks):
                    if MAX_CHUNKS_PER_REPORT and (total_chunks + len(pending_texts)) >= MAX_CHUNKS_PER_REPORT:
                        break
                    pending_texts.append(chunk_text)
                    pending_meta.append(
                        {
                            "page_number": page_number,
                            "chunk_index": chunk_index,
                            "chunk_text": chunk_text,
                        }
                    )
                    if len(pending_texts) >= EMBED_BATCH_SIZE:
                        _flush_batch()
            _flush_batch()

        db.reports.update_one(
            {"_id": report_file_id},
            {
                "$set": {
                    "status": "completed",
                    "total_pages": total_pages,
                    "total_chunks": total_chunks,
                    "error": None,
                    "last_processed_page": last_processed_page,
                }
            },
        )

        return {
            **metadata,
            "report_file_id": str(report_file_id),
            "gridfs_file_id": str(gridfs_file_id),
            "total_pages": total_pages,
            "total_chunks": total_chunks,
            "skipped": False,
        }
    except Exception:
        if report_file_id:
            db.reports.update_one(
                {"_id": report_file_id},
                {"$set": {"status": "failed", "total_pages": total_pages, "total_chunks": total_chunks}},
            )
        raise


def ingest_pdf_path(pdf_path: str):
    with open(pdf_path, "rb") as f:
        data = f.read()
    original_filename = os.path.basename(pdf_path)
    return ingest_pdf(data, original_filename)
