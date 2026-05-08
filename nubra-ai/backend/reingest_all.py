"""
reingest_all.py -- Wipe all existing report data and re-ingest all PDFs cleanly.

Run from the backend/ directory:
    python reingest_all.py

This is needed when the ticker/fiscal-year metadata was previously wrong
(e.g. ticker inferred from filename, or all annual reports deduped to UNKNOWN quarter).
"""
import glob
import os
import sys

from dotenv import load_dotenv

load_dotenv()

from database import get_database, get_gridfs
from ingest import ingest_pdf


def wipe_all_reports(db):
    """Delete every report, embedding, extracted_json, and GridFS file."""
    print("[!] Wiping all existing report data from MongoDB...")

    # Get all GridFS file IDs before deleting reports
    gridfs_ids = [
        doc.get("gridfs_file_id")
        for doc in db.reports.find({}, {"gridfs_file_id": 1})
        if doc.get("gridfs_file_id")
    ]

    db.extracted_json.drop()
    db.embeddings.drop()
    db.reports.drop()
    print("   [OK] Dropped reports, embeddings, extracted_json collections.")

    # Delete GridFS files
    fs = get_gridfs(db)
    deleted_gridfs = 0
    for fid in gridfs_ids:
        try:
            fs.delete(fid)
            deleted_gridfs += 1
        except Exception:
            pass
    print(f"   [OK] Deleted {deleted_gridfs} GridFS files.")


def reingest_all(pdf_dir: str):
    pdf_dir = os.path.abspath(pdf_dir)
    if not os.path.isdir(pdf_dir):
        print(f"[ERR] PDF directory not found: {pdf_dir}")
        sys.exit(1)

    pdf_files = sorted(glob.glob(os.path.join(pdf_dir, "*.pdf")))
    if not pdf_files:
        print(f"[ERR] No PDF files found in: {pdf_dir}")
        sys.exit(1)

    _, db = get_database()
    wipe_all_reports(db)

    print(f"\nFound {len(pdf_files)} PDF(s) to ingest:\n")
    for f in pdf_files:
        print(f"   - {os.path.basename(f)}")

    print()
    success, failed = 0, 0
    for pdf_path in pdf_files:
        filename = os.path.basename(pdf_path)
        print(f"Processing: {filename}")
        try:
            with open(pdf_path, "rb") as fh:
                file_bytes = fh.read()
            result = ingest_pdf(file_bytes, filename)
            ticker = result.get("company_ticker", "UNKNOWN")
            quarter = result.get("quarter", "UNKNOWN")
            fy = result.get("fiscal_year", "UNKNOWN")
            chunks = result.get("total_chunks", 0)
            period_label = quarter if quarter.startswith("Q") else f"{quarter} (Annual)"
            print(f"   [OK] Ticker: {ticker} | Period: {period_label} | FY: {fy} | Chunks: {chunks}")
            success += 1
        except Exception as exc:
            print(f"   [FAIL] {exc}")
            failed += 1
        print()

    print("=" * 60)
    print(f"Ingested: {success}   Failed: {failed}")
    print("=" * 60)


if __name__ == "__main__":
    # Default: look for pdfs in nubra-ai/pdfs (one level up from backend/)
    pdf_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "pdfs")
    reingest_all(pdf_dir)
