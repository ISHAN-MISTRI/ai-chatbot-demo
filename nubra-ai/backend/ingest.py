import json
import os
from io import BytesIO
from typing import Dict, List

import pdfplumber
import tiktoken
from dotenv import load_dotenv
from openai import OpenAI

from database import get_database, get_gridfs, utc_now

load_dotenv()

EMBEDDING_MODEL = "text-embedding-3-small"
METADATA_MODEL = "gpt-5"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

UNKNOWN_METADATA = {
    "company_ticker": "UNKNOWN",
    "company_name": "UNKNOWN",
    "report_type": "UNKNOWN",
    "quarter": "UNKNOWN",
    "fiscal_year": "UNKNOWN",
}


def _openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in backend/.env")
    return OpenAI(api_key=api_key)


def extract_metadata_from_pdf(first_3_pages_text: str) -> Dict[str, str]:
    prompt = f"""
Read the following text extracted from the first 3 pages of an Indian company 
financial report PDF. Extract and return ONLY a JSON object with these fields:
{{
  "company_ticker": "NSE ticker symbol in uppercase e.g. TATASTEEL",
  "company_name": "Full legal company name",
  "report_type": "One of: InvestorPresentation / AnnualReport / QuarterlyResults",
  "quarter": "Quarter code e.g. Q3FY25",
  "fiscal_year": "Fiscal year e.g. FY25"
}}
Return ONLY the JSON. No explanation. No markdown. No extra text.
PDF text: {first_3_pages_text}
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
    metadata["company_ticker"] = metadata["company_ticker"].upper()
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
    mongo_client, db = get_database()
    fs = get_gridfs(db)
    openai_client = _openai_client()
    encoding = tiktoken.get_encoding("cl100k_base")

    report_file_id = None
    total_chunks = 0
    total_pages = 0

    try:
        gridfs_file_id = fs.put(
            file_bytes,
            filename=original_filename,
            upload_date=utc_now(),
            metadata={"original_filename": original_filename},
        )

        page_texts = []
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            total_pages = len(pdf.pages)
            for page in pdf.pages:
                page_texts.append((page.extract_text() or "").strip())

        metadata = extract_metadata_from_pdf("\n\n".join(page_texts[:3]))

        report_file_id = db.report_files.insert_one(
            {
                "company_ticker": metadata["company_ticker"],
                "company_name": metadata["company_name"],
                "report_type": metadata["report_type"],
                "quarter": metadata["quarter"],
                "fiscal_year": metadata["fiscal_year"],
                "original_filename": original_filename,
                "gridfs_file_id": gridfs_file_id,
                "total_pages": total_pages,
                "total_chunks": 0,
                "uploaded_at": utc_now(),
                "status": "processing",
            }
        ).inserted_id

        all_chunks = []
        for page_number, page_text in enumerate(page_texts, start=1):
            if not page_text:
                continue

            chunks = _chunk_text(page_text, encoding)
            for chunk_index, chunk_text in enumerate(chunks):
                all_chunks.append({
                    "company_ticker": metadata["company_ticker"],
                    "company_name": metadata["company_name"],
                    "report_type": metadata["report_type"],
                    "quarter": metadata["quarter"],
                    "fiscal_year": metadata["fiscal_year"],
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                    "chunk_text": chunk_text,
                    "source_filename": original_filename,
                    "source_file_id": gridfs_file_id,
                    "created_at": utc_now(),
                })

        batch_size = 500
        for i in range(0, len(all_chunks), batch_size):
            batch = all_chunks[i : i + batch_size]
            texts = [c["chunk_text"] for c in batch]
            embeddings = _embed_text_batch(openai_client, texts)
            for c, emb in zip(batch, embeddings):
                c["embedding"] = emb
            db.report_chunks.insert_many(batch)
            total_chunks += len(batch)

        db.report_files.update_one(
            {"_id": report_file_id},
            {
                "$set": {
                    "status": "completed",
                    "total_pages": total_pages,
                    "total_chunks": total_chunks,
                }
            },
        )

        return {
            **metadata,
            "report_file_id": str(report_file_id),
            "gridfs_file_id": str(gridfs_file_id),
            "total_pages": total_pages,
            "total_chunks": total_chunks,
        }
    except Exception:
        if report_file_id:
            db.report_files.update_one(
                {"_id": report_file_id},
                {"$set": {"status": "failed", "total_pages": total_pages, "total_chunks": total_chunks}},
            )
        raise
    finally:
        mongo_client.close()
