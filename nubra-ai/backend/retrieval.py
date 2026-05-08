import os
from math import sqrt
from typing import Dict, List

from dotenv import load_dotenv
from openai import OpenAI

from database import get_database

load_dotenv()

EMBEDDING_MODEL = "text-embedding-3-small"


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
    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return -1.0
    return dot_product / (left_norm * right_norm)


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
            },
        )
    )
    if not docs:
        raise ValueError("No report data found. Upload relevant PDFs first.")

    scored = []
    for doc in docs:
        score = _cosine_similarity(query_embedding, doc.get("embedding", []))
        if score < 0:
            continue
        doc["score"] = score
        doc.pop("embedding", None)
        scored.append(doc)

    scored.sort(key=lambda item: item["score"], reverse=True)
    top_docs = scored[:10]
    if not top_docs:
        raise ValueError("No semantic matches found for the selected company/quarters.")
    return top_docs


def retrieve_relevant_chunks(query: str, company_ticker: str, quarters_list: List[str]) -> str:
    docs = retrieve_chunk_documents(query, company_ticker, quarters_list)
    combined = "\n\n".join(doc["chunk_text"] for doc in docs if doc.get("chunk_text"))
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
                [quarter for quarter in item.get("quarters", []) if quarter and quarter != "UNKNOWN"],
                reverse=True,
            ),
        }
        for item in results
        if item.get("_id")
    ]
