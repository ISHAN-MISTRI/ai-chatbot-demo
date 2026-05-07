import os
from typing import List

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

from database import get_database, get_gridfs, utc_now
from ingest import ingest_pdf
from models import ChatRequest, ChatResponse, HealthResponse
from retrieval import get_all_tickers_and_quarters, retrieve_chunk_documents, retrieve_relevant_chunks

load_dotenv()

SYSTEM_PROMPT = """
You are a financial research assistant for Indian stock market investors on the Nubra AI platform.

When the user asks about a company's financial reports, analyze the retrieved report chunks 
provided in the user message and respond in EXACTLY this format. If multiple quarters or 
years are requested, repeat the full format block for each quarter separated by ---.

➤ [COMPANY_TICKER] – [Report Type] Report ([QuarterYear])

**Sentiment**
[Single word only: Bullish / Bearish / Neutral]

**Positive Highlights**
- [concise point, max 15 words]
- [concise point, max 15 words]
- [concise point, max 15 words]
- [concise point, max 15 words]
- [concise point, max 15 words]

**Negative Highlights**
- [concise point, max 15 words]
- [concise point, max 15 words]
- [concise point, max 15 words]
- [concise point, max 15 words]

**Summary**
### Company Financial Report

#### Financial Performance
| Metric | [Latest Quarter] (₹ Crores) | [Previous Quarter] (₹ Crores) | [Year Ago Quarter] (₹ Crores) | Comments |
|---|---|---|---|---|
| Consolidated Revenue | | | | |
| Raw Material Cost | | | | |
| Change in Inventories | | | | |
| Employee Benefits Expenses | | | | |
| Other Expenses | | | | |
| Adjusted EBITDA | | | | |
| Adjusted EBITDA per ton (₹) | | | | |
| Finance Cost | | | | |
| Reported PAT | | | | |
| Capital Expenditure (₹ Crores) | | — | — | |

#### Operational Highlights
- [5–7 bullet points covering volumes, capacity, key business segments]

#### Risks and Challenges
- [4–5 bullet points]

#### Outlook
- [4–5 bullet points on growth drivers, capex plans, market strategy]

#### Conclusion
[Exactly 2–3 sentences on overall performance, key strengths, and forward-looking stance]

#### References
1. [COMPANY_TICKER] – [Report Name] ([Quarter+Year]). [Link]

*This summary was retrieved directly from our database and represents a pre-generated overview of the report.*

STRICT RULES:
1. Use ₹ for all Indian currency values, Crores for large numbers
2. Sentiment must be exactly ONE word: Bullish, Bearish, or Neutral
3. Never add, rename, or remove any section
4. Financial table must always have exactly 3 quarter columns
5. Every bullet point is a single line, no sub-bullets
6. Conclusion is exactly 2–3 sentences
7. If any data is missing write — never leave blank
8. Multiple quarters = one full block per quarter separated by ---
9. No commentary or preamble outside format blocks
10. References and italic disclaimer always last in every block
""".strip()

app = FastAPI(title="Nubra AI API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in backend/.env")
    return OpenAI(api_key=api_key)


def _serialize_report(doc):
    return {
        "company_ticker": doc.get("company_ticker", "UNKNOWN"),
        "company_name": doc.get("company_name", "UNKNOWN"),
        "quarter": doc.get("quarter", "UNKNOWN"),
        "report_type": doc.get("report_type", "UNKNOWN"),
        "original_filename": doc.get("original_filename", ""),
        "total_pages": doc.get("total_pages", 0),
        "total_chunks": doc.get("total_chunks", 0),
        "uploaded_at": doc.get("uploaded_at"),
        "status": doc.get("status", "unknown"),
    }


def _ingest_file_bytes(file_bytes: bytes, original_filename: str):
    ingest_pdf(file_bytes, original_filename)


@app.post("/api/upload")
async def upload_reports(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] | None = File(default=None),
    files_array: List[UploadFile] | None = File(default=None, alias="files[]"),
):
    all_files = (files or []) + (files_array or [])
    if not all_files:
        raise HTTPException(status_code=400, detail="No PDF files uploaded.")

    response_files = []
    for file in all_files:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"{file.filename} is not a PDF file.")
        file_bytes = await file.read()
        background_tasks.add_task(_ingest_file_bytes, file_bytes, file.filename)
        response_files.append({"filename": file.filename, "status": "processing"})

    return {
        "message": f"{len(response_files)} files uploaded and processing started",
        "files": response_files,
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        chunks = retrieve_relevant_chunks(request.user_message, request.company_ticker, request.quarters)
        chunk_docs = retrieve_chunk_documents(
            request.user_message, request.company_ticker, request.quarters
        )
        user_prompt = (
            "Here is the extracted financial report data:\n\n"
            f"{chunks}\n\n"
            f"User question: {request.user_message}"
        )
        client = openai_client()
        completion = client.chat.completions.create(
            model="gpt-4.1-mini",
            max_tokens=4000,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        response_text = (completion.choices[0].message.content or "").strip()
        usage = completion.usage
        tokens_used = (usage.prompt_tokens if usage else 0) + (
            usage.completion_tokens if usage else 0
        )

        mongo_client, db = get_database()
        try:
            db.chat_history.insert_one(
                {
                    "session_id": request.session_id,
                    "user_message": request.user_message,
                    "ai_response": response_text,
                    "company_ticker": request.company_ticker.upper(),
                    "quarters": request.quarters,
                    "tokens_used": tokens_used,
                    "created_at": utc_now(),
                }
            )
        finally:
            mongo_client.close()

        return ChatResponse(
            response=response_text,
            chunks_used=len(chunk_docs),
            tokens_used=tokens_used,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/reports")
async def get_reports():
    mongo_client, db = get_database()
    try:
        docs = list(db.report_files.find({}, {"_id": 0}).sort("uploaded_at", -1))
        return {"reports": [_serialize_report(doc) for doc in docs]}
    finally:
        mongo_client.close()


@app.get("/api/reports/tickers")
async def get_tickers():
    return {"tickers": get_all_tickers_and_quarters()}


@app.get("/api/reports/{ticker}/{quarter}/status")
async def get_report_status(ticker: str, quarter: str):
    mongo_client, db = get_database()
    try:
        doc = db.report_files.find_one(
            {"company_ticker": ticker.upper(), "quarter": quarter},
            {"_id": 0, "status": 1, "total_chunks": 1},
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Report not found.")
        return {"status": doc.get("status", "unknown"), "total_chunks": doc.get("total_chunks", 0)}
    finally:
        mongo_client.close()


@app.delete("/api/reports/{ticker}/{quarter}")
async def delete_report(ticker: str, quarter: str):
    mongo_client, db = get_database()
    try:
        doc = db.report_files.find_one({"company_ticker": ticker.upper(), "quarter": quarter})
        if not doc:
            raise HTTPException(status_code=404, detail="Report not found.")

        db.report_chunks.delete_many({"company_ticker": ticker.upper(), "quarter": quarter})
        if doc.get("gridfs_file_id"):
            fs = get_gridfs(db)
            try:
                fs.delete(doc["gridfs_file_id"])
            except Exception:
                pass
        db.report_files.delete_one({"_id": doc["_id"]})
        return {"message": f"Deleted report for {ticker.upper()} {quarter}"}
    finally:
        mongo_client.close()


@app.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    mongo_client, db = get_database()
    try:
        docs = list(db.chat_history.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1))
        return {"session_id": session_id, "history": docs}
    finally:
        mongo_client.close()


@app.get("/api/health", response_model=HealthResponse)
async def health():
    mongo_client, db = get_database()
    try:
        db.command("ping")
        return HealthResponse(status="ok", mongodb="connected", timestamp=utc_now())
    finally:
        mongo_client.close()
