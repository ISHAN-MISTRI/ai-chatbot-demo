#!/usr/bin/env python3
"""
Local PDF ingestion script - bypasses the Render server to avoid memory issues
This script processes PDFs locally and uploads chunks directly to MongoDB
"""
import json
import os
import re
import sys
from io import BytesIO
from pathlib import Path
from typing import Dict, List

import pdfplumber
import tiktoken
from dotenv import load_dotenv
from openai import OpenAI
from pymongo import MongoClient
from datetime import datetime, timezone

# Load environment variables
load_dotenv(dotenv_path="/vercel/share/v0-project/nubra-ai/backend/.env")

EMBEDDING_MODEL = "text-embedding-3-small"
CHUNK_SIZE = 300
CHUNK_OVERLAP = 30

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/nubra_ai")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "nubra_ai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize clients
client_openai = OpenAI(api_key=OPENAI_API_KEY)
client_mongo = MongoClient(MONGODB_URI, maxPoolSize=50, minPoolSize=3)
db = client_mongo[MONGODB_DB_NAME]

print(f"[INFO] Connected to MongoDB: {MONGODB_DB_NAME}")
print(f"[INFO] Using OpenAI API key: {OPENAI_API_KEY[:20]}...")


def _clean_upper_alnum(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def _infer_fiscal_year_from_text(text: str) -> str:
    """Infer fiscal year from patterns like '2024-25', 'FY25', 'FY 2025', '2021-22'."""
    if not text:
        return "UNKNOWN"
    m = re.search(r"\bFY\s*(20)?([0-9]{2})\b", text, re.IGNORECASE)
    if m:
        return f"FY{m.group(2)}"
    m = re.search(r"\b(20[0-9]{2})[-–](2[0-9]|[0-9]{2})\b", text)
    if m:
        end_year = m.group(2)[-2:]
        return f"FY{end_year}"
    return "UNKNOWN"


def ingest_pdf(pdf_path: str) -> bool:
    """Ingest a single PDF file and store chunks in MongoDB"""
    pdf_name = Path(pdf_path).name
    print(f"\n[INFO] Processing {pdf_name}...")
    
    try:
        # Read PDF
        with open(pdf_path, "rb") as f:
            file_bytes = f.read()
        
        # Extract text
        print(f"[INFO] Extracting text from {pdf_name}...")
        page_texts = []
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            total_pages = len(pdf.pages)
            for i, page in enumerate(pdf.pages):
                page_text = (page.extract_text() or "").strip()
                page_texts.append(page_text)
                if (i + 1) % 10 == 0:
                    print(f"  - Processed {i + 1}/{total_pages} pages")
        
        full_text = " ".join(page_texts)
        print(f"[INFO] Extracted {len(full_text)} characters from {total_pages} pages")
        
        # Infer metadata
        first_page_text = page_texts[0] if page_texts else ""
        fiscal_year = _infer_fiscal_year_from_text(first_page_text)
        
        # Determine company ticker and report type from filename
        filename_lower = pdf_name.lower()
        if "tata" in filename_lower and "steel" in filename_lower:
            company_ticker = "TATASTEEL"
            company_name = "Tata Steel Limited"
        else:
            company_ticker = "UNKNOWN"
            company_name = "Unknown Company"
        
        if "integrated" in filename_lower:
            report_type = "IntegratedReport"
        elif "annual" in filename_lower:
            report_type = "AnnualReport"
        else:
            report_type = "Report"
        
        print(f"[INFO] Metadata - Ticker: {company_ticker}, FY: {fiscal_year}, Type: {report_type}")
        
        # Create chunks
        print(f"[INFO] Creating chunks (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})...")
        enc = tiktoken.encoding_for_model("gpt-4")
        chunks = []
        chunk_id = 0
        start = 0
        
        while start < len(full_text):
            end = min(start + CHUNK_SIZE, len(full_text))
            chunk_text = full_text[start:end].strip()
            
            if chunk_text:
                chunks.append({
                    "chunk_id": chunk_id,
                    "text": chunk_text,
                    "start_pos": start,
                    "end_pos": end,
                    "token_count": len(enc.encode(chunk_text))
                })
                chunk_id += 1
            
            start = end - CHUNK_OVERLAP
        
        print(f"[INFO] Created {len(chunks)} chunks")
        
        # Generate embeddings in batches
        print(f"[INFO] Generating embeddings for {len(chunks)} chunks...")
        batch_size = 100
        embeddings_data = []
        
        for batch_idx in range(0, len(chunks), batch_size):
            batch_chunks = chunks[batch_idx:batch_idx + batch_size]
            texts = [c["text"] for c in batch_chunks]
            
            print(f"  - Processing batch {batch_idx // batch_size + 1}/{(len(chunks) + batch_size - 1) // batch_size}")
            
            # Get embeddings from OpenAI
            response = client_openai.embeddings.create(
                model=EMBEDDING_MODEL,
                input=texts
            )
            
            for i, embedding_obj in enumerate(response.data):
                chunk = batch_chunks[i]
                embeddings_data.append({
                    "report_id": pdf_name.replace(".pdf", ""),
                    "chunk_id": chunk["chunk_id"],
                    "company_ticker": company_ticker,
                    "company_name": company_name,
                    "report_type": report_type,
                    "quarter": "FY",  # Annual reports use FY
                    "fiscal_year": fiscal_year,
                    "text": chunk["text"],
                    "embedding": embedding_obj.embedding,
                    "start_pos": chunk["start_pos"],
                    "end_pos": chunk["end_pos"],
                    "token_count": chunk["token_count"],
                    "created_at": datetime.now(timezone.utc)
                })
        
        # Insert into MongoDB
        print(f"[INFO] Inserting {len(embeddings_data)} embeddings into MongoDB...")
        result = db.embeddings.insert_many(embeddings_data, ordered=False)
        print(f"[SUCCESS] Inserted {len(result.inserted_ids)} documents for {pdf_name}")
        
        # Create/update report document
        db.reports.update_one(
            {"company_ticker": company_ticker, "quarter": "FY", "fiscal_year": fiscal_year},
            {
                "$set": {
                    "company_name": company_name,
                    "report_type": report_type,
                    "filename": pdf_name,
                    "chunk_count": len(embeddings_data),
                    "uploaded_at": datetime.now(timezone.utc),
                    "status": "indexed"
                }
            },
            upsert=True
        )
        
        return True
        
    except Exception as e:
        print(f"[ERROR] Failed to ingest {pdf_name}: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Ingest all PDFs from the pdfs directory"""
    pdf_dir = Path("/vercel/share/v0-project/nubra-ai/pdfs")
    
    if not pdf_dir.exists():
        print(f"[ERROR] PDF directory not found: {pdf_dir}")
        return False
    
    pdf_files = list(pdf_dir.glob("*.pdf"))
    print(f"[INFO] Found {len(pdf_files)} PDF files")
    
    if not pdf_files:
        print("[ERROR] No PDF files found!")
        return False
    
    success_count = 0
    for pdf_file in pdf_files:
        if ingest_pdf(str(pdf_file)):
            success_count += 1
    
    print(f"\n[INFO] Successfully ingested {success_count}/{len(pdf_files)} PDFs")
    
    # Verify data in MongoDB
    print("\n[INFO] Verifying data in MongoDB...")
    tickers = db.embeddings.distinct("company_ticker")
    print(f"[INFO] Unique tickers in DB: {tickers}")
    
    report_count = db.reports.count_documents({})
    embedding_count = db.embeddings.count_documents({})
    print(f"[INFO] Total reports: {report_count}")
    print(f"[INFO] Total embeddings: {embedding_count}")
    
    return success_count == len(pdf_files)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
