# Nubra AI - Production Stock Analysis Chatbot

End-to-end dynamic AI platform for stock report analysis:
- Upload/admin-manage PDF reports
- Extract report content and metadata into structured JSON
- Persist report, JSON chunks, embeddings, and chat history in MongoDB
- Use semantic retrieval + OpenAI generation for context-rich financial answers
- Premium dark, minimal chat UI with markdown/tables and streaming responses

## Folder Structure

```text
nubra-ai/
├── backend/
│   ├── main.py
│   ├── ingest.py
│   ├── retrieval.py
│   ├── database.py
│   ├── models.py
│   └── requirements.txt
├── frontend/
│   ├── src/pages/NubraAI.jsx
│   └── package.json
└── README.md
```

## MongoDB Collections

- `reports`: one document per uploaded report (status, ticker, quarter, file pointers)
- `extracted_json`: structured extracted chunks for downstream analytics
- `embeddings`: semantic vectors and chunk text for RAG retrieval
- `chat_history`: user/assistant conversational history by session
- `users`: auth-ready user collection (email index already created)

## Environment Setup

Create `backend/.env`:
```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=nubra_ai
OPENAI_API_KEY=your_openai_api_key
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000
```

## Run Locally

Backend:
```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend:
```powershell
cd frontend
npm install
npm run dev
```

## API Routes

- `POST /api/upload` - upload one or more PDF reports
- `POST /api/chat` - non-streaming RAG answer
- `POST /api/chat/stream` - SSE streaming RAG answer
- `GET /api/reports` - list all report ingestions
- `GET /api/reports/tickers` - available tickers + quarters
- `GET /api/reports/{ticker}/{quarter}/status` - ingestion status
- `DELETE /api/reports/{ticker}/{quarter}` - delete report + vectors + extracted data
- `GET /api/chat/history/{session_id}` - chat history replay
- `GET /api/health` - health + Mongo connectivity

## Sample Extracted JSON Shape

```json
{
  "report_id": "6640f2c18c...",
  "chunk_id": "6640f2c18c...:12:3",
  "company_ticker": "TATASTEEL",
  "quarter": "Q3FY25",
  "page_number": 12,
  "chunk_text": "Consolidated revenue for the quarter was..."
}
```

## Deployment Guide

- Frontend: deploy `frontend` on Vercel (`npm run build`)
- Backend: deploy `backend` on Render/Railway with start command:
  - `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Use managed MongoDB Atlas in production
- Add CORS allowlist for deployed frontend URL
- Configure secrets (`OPENAI_API_KEY`, `MONGODB_URI`) in provider environment settings

## Architecture Notes

- Ingestion is async via background tasks to avoid blocking uploads
- Indexes are auto-created on startup for query speed and uniqueness
- Embedding retrieval is semantic, dynamic, and fully DB-backed (no static responses)
- Chat history is persisted for replay and future user-auth integration
