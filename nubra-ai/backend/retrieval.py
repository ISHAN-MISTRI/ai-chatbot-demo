import os
import re
from math import sqrt
from typing import Dict, List

from dotenv import load_dotenv
from openai import OpenAI

from database import get_database

load_dotenv()

EMBEDDING_MODEL = "text-embedding-3-small"

# Keywords that signal a broad/summary query — needs balanced multi-period retrieval
SUMMARY_KEYWORDS = {
    "summarize", "summarise", "summary", "report", "overview",
    "earnings", "all years", "all periods", "full report", "give me a report",
    "annual", "historical", "trend", "across years", "compare years",
    "performance", "highlights", "analysis",
}

# For specific/narrow queries — standard top-N retrieval
SPECIFIC_TOP_N = 30

# For summary queries — N chunks per period to ensure every year is represented
CHUNKS_PER_PERIOD = 8


def _openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in backend/.env")
    return OpenAI(api_key=api_key)


def _embed_text(text: str) -> List[float]:
    client = _openai_client()
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=text)
    return response.data[0].embedding


def _cosine_similarity(left: List[float], right: List[float]) -> float:
    if not left or not right or len(left) != len(right):
        return -1.0
    dot_product = sum(a * b for a, b in zip(left, right))
    left_norm = sqrt(sum(v * v for v in left))
    right_norm = sqrt(sum(v * v for v in right))
    if left_norm == 0 or right_norm == 0:
        return -1.0
    return dot_product / (left_norm * right_norm)


def _is_summary_query(query: str) -> bool:
    """Return True if the query is a broad/overview/summary type request."""
    q = query.lower()
    return any(kw in q for kw in SUMMARY_KEYWORDS)


def _extract_query_time_constraints(query: str) -> Dict[str, set]:
    """Extract explicit quarter/year constraints from the user query."""
    q = (query or "").upper()
    quarter_matches = re.findall(r"\bQ([1-4])\b", q)
    year_matches = re.findall(r"\b(20\d{2})\b", q)
    fy_matches = re.findall(r"\bFY\s*([0-9]{2}|20[0-9]{2})\b", q)

    year_suffixes = {y[-2:] for y in year_matches}
    for fy in fy_matches:
        year_suffixes.add(fy[-2:])

    return {
        "quarters": {f"Q{quarter}" for quarter in quarter_matches},
        "year_suffixes": year_suffixes,
    }


def _doc_matches_time_constraints(doc: Dict, constraints: Dict[str, set]) -> bool:
    """Return True if a chunk document matches explicit time constraints in query."""
    required_quarters = constraints.get("quarters", set())
    required_year_suffixes = constraints.get("year_suffixes", set())

    period = str(doc.get("quarter") or "").upper()
    source_filename = str(doc.get("source_filename") or "").upper()
    period_haystack = f"{period} {source_filename}"

    if required_quarters and not any(q in period_haystack for q in required_quarters):
        return False

    if required_year_suffixes:
        has_year_match = any(
            f"FY{yy}" in period_haystack
            or f"20{yy}" in period_haystack
            or f"-{yy}" in period_haystack
            for yy in required_year_suffixes
        )
        if not has_year_match:
            return False

    return True


def _doc_matches_year_only(doc: Dict, year_suffixes: set) -> bool:
    if not year_suffixes:
        return True
    period = str(doc.get("quarter") or "").upper()
    source_filename = str(doc.get("source_filename") or "").upper()
    period_haystack = f"{period} {source_filename}"
    return any(
        f"FY{yy}" in period_haystack
        or f"20{yy}" in period_haystack
        or f"-{yy}" in period_haystack
        for yy in year_suffixes
    )


def _doc_matches_quarter_only(doc: Dict, quarters: set) -> bool:
    if not quarters:
        return True
    period = str(doc.get("quarter") or "").upper()
    source_filename = str(doc.get("source_filename") or "").upper()
    period_haystack = f"{period} {source_filename}"
    return any(q in period_haystack for q in quarters)


def retrieve_chunk_documents(query: str, company_ticker: str, quarters_list: List[str]):
    _, db = get_database()
    query_embedding = _embed_text(query)
    query_filter: Dict = {"company_ticker": company_ticker.upper()}
    if quarters_list:
        query_filter["quarter"] = {"$in": quarters_list}

    docs = list(
        db.embeddings.find(
            query_filter,
            {
                "chunk_text": 1,
                "quarter": 1,
                "page_number": 1,
                "embedding": 1,
                "report_id": 1,
                "source_filename": 1,
            },
        )
    )
    if not docs:
        raise ValueError(
            "No report data found for this company. "
            "If this is production, the server may still be ingesting bundled PDFs (or ingestion failed)."
        )

    # Score every doc first
    for doc in docs:
        doc["score"] = _cosine_similarity(query_embedding, doc.get("embedding", []))
        doc.pop("embedding", None)

    # Filter out negative scores (cosine < 0 means very different direction)
    valid_docs = [d for d in docs if d["score"] >= 0]
    if not valid_docs:
        raise ValueError("No semantic matches found for the selected company/quarters.")

    query_constraints = _extract_query_time_constraints(query)
    has_explicit_time_constraint = bool(query_constraints["quarters"] or query_constraints["year_suffixes"])
    if has_explicit_time_constraint:
        constrained_docs = [d for d in valid_docs if _doc_matches_time_constraints(d, query_constraints)]
        if constrained_docs:
            valid_docs = constrained_docs
        else:
            # Graceful fallback:
            # if exact quarter+year isn't available, prefer year-only, then quarter-only.
            fallback_docs = []
            if query_constraints["year_suffixes"]:
                fallback_docs = [
                    d for d in valid_docs if _doc_matches_year_only(d, query_constraints["year_suffixes"])
                ]
            if not fallback_docs and query_constraints["quarters"]:
                fallback_docs = [
                    d for d in valid_docs if _doc_matches_quarter_only(d, query_constraints["quarters"])
                ]

            if fallback_docs:
                valid_docs = fallback_docs
            else:
                raise ValueError(
                    "No chunks match the requested period (quarter/year). "
                    "Try selecting the matching quarter or re-uploading the relevant report."
                )

    unique_periods = set(d.get("quarter", "UNKNOWN") for d in valid_docs)

    # -----------------------------------------------------------------------
    # SUMMARY MODE: balanced retrieval — top CHUNKS_PER_PERIOD from every year
    # This prevents cosine similarity from clustering all results in 1-2 years
    # -----------------------------------------------------------------------
    if _is_summary_query(query) and len(unique_periods) > 1 and not has_explicit_time_constraint:
        per_period: Dict[str, list] = {}
        for doc in valid_docs:
            period = doc.get("quarter", "UNKNOWN")
            per_period.setdefault(period, []).append(doc)

        top_docs = []
        for period in sorted(per_period.keys(), reverse=True):  # newest first
            period_docs = sorted(per_period[period], key=lambda d: d["score"], reverse=True)
            top_docs.extend(period_docs[:CHUNKS_PER_PERIOD])

        return top_docs

    # -----------------------------------------------------------------------
    # SPECIFIC MODE: standard global top-N by cosine similarity
    # -----------------------------------------------------------------------
    valid_docs.sort(key=lambda d: d["score"], reverse=True)
    return valid_docs[:SPECIFIC_TOP_N]


def retrieve_relevant_chunks(query: str, company_ticker: str, quarters_list: List[str]) -> str:
    docs = retrieve_chunk_documents(query, company_ticker, quarters_list)
    parts = []
    for doc in docs:
        if not doc.get("chunk_text"):
            continue
        period = doc.get("quarter") or "Unknown"
        parts.append(f"[Period: {period}] {doc['chunk_text']}")
    combined = "\n\n".join(parts)
    if not combined.strip():
        raise ValueError("No data found. Please upload the PDF first.")
    return combined


def get_all_tickers_and_quarters():
    _, db = get_database()
    pipeline = [
        {"$match": {"status": {"$in": ["processing", "completed"]}}},
        {
            "$group": {
                "_id": "$company_ticker",
                "company_name": {"$first": "$company_name"},
                "quarters": {"$addToSet": "$quarter"},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    results = list(db.reports.aggregate(pipeline))
    return [
        {
            "ticker": item.get("_id", "UNKNOWN"),
            "company_name": item.get("company_name", "UNKNOWN"),
            "quarters": sorted(
                [q for q in item.get("quarters", []) if q and q != "UNKNOWN"],
                reverse=True,
            ),
        }
        for item in results
        if item.get("_id")
    ]
