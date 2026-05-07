# Nubra AI

Nubra AI is a financial report chatbot for Indian stock market investors. It runs with a React frontend, FastAPI backend, local MongoDB with GridFS, and OpenAI for both metadata extraction and final report generation.

## Structure

```text
nubra-ai/
├── frontend/
├── backend/
├── mongo_setup.md
├── test.py
└── README.md
```

## Backend Environment

Create `backend/.env`:

```env
MONGODB_URI=mongodb://localhost:27017/nubra_ai
OPENAI_API_KEY=your_openai_api_key
```

## Frontend Environment

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

## Local MongoDB

See [mongo_setup.md](./mongo_setup.md) for setup.

## Install

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

## Main Endpoints

- `POST /api/upload`
- `POST /api/chat`
- `GET /api/reports`
- `GET /api/reports/tickers`
- `GET /api/reports/{ticker}/{quarter}/status`
- `DELETE /api/reports/{ticker}/{quarter}`
- `GET /api/chat/history/{session_id}`
- `GET /api/health`

## Flow

1. Upload one or more PDFs from the modal.
2. The backend stores the raw PDF in GridFS.
3. OpenAI extracts ticker, company, report type, quarter, and fiscal year from the first three pages.
4. The PDF is chunked and embedded with `text-embedding-3-small`.
5. Local MongoDB documents are ranked with cosine similarity in Python.
6. OpenAI formats the final answer using the strict report template.

## Test Script

Run:

```powershell
python test.py
```

If you want upload testing, place sample PDFs in `./samples` named:

- `tatasteel_q3fy25.pdf`
- `reliance_q2fy25.pdf`
