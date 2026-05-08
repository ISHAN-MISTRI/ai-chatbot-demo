import os
import sys
import glob
from dotenv import load_dotenv

load_dotenv()

from ingest import ingest_pdf
from database import get_database

def add_pdfs(pdf_dir: str):
    if not os.path.exists(pdf_dir):
        print(f"Directory {pdf_dir} does not exist. Creating it...")
        os.makedirs(pdf_dir)
        print("Please place your PDF files in this directory and run the script again.")
        return

    pdf_files = glob.glob(os.path.join(pdf_dir, "*.pdf"))
    if not pdf_files:
        print(f"No PDF files found in {pdf_dir}.")
        return

    print(f"Found {len(pdf_files)} PDF files. Starting ingestion...")
    
    # Optional: cleanup stale processing markers without closing shared client
    _, db = get_database()
    db.reports.delete_many({"status": "processing"})

    for pdf_path in pdf_files:
        filename = os.path.basename(pdf_path)
        print(f"\nProcessing {filename}...")
        
        with open(pdf_path, "rb") as f:
            file_bytes = f.read()
            
        try:
            result = ingest_pdf(file_bytes, filename)
            print(f"✅ Success! Extracted ticker: {result.get('company_ticker')} | Chunks: {result.get('total_chunks')}")
        except Exception as e:
            print(f"❌ Failed to process {filename}: {str(e)}")

if __name__ == "__main__":
    pdf_dir = sys.argv[1] if len(sys.argv) > 1 else "../pdfs"
    add_pdfs(pdf_dir)
