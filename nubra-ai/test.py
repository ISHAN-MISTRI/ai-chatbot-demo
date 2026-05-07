import os
from pathlib import Path

import requests

BASE_URL = os.getenv("NUBRA_API_URL", "http://localhost:8000")
SESSION_ID = "test-session-123"
SAMPLES_DIR = Path(__file__).parent / "samples"


def print_result(label, response):
    print(f"\n[{label}] status={response.status_code}")
    try:
        print(response.json())
    except Exception:
        print(response.text)


def main():
    health = requests.get(f"{BASE_URL}/api/health", timeout=30)
    print_result("health", health)

    files = []
    for filename in ["tatasteel_q3fy25.pdf", "reliance_q2fy25.pdf"]:
        path = SAMPLES_DIR / filename
        if path.exists():
            files.append(("files[]", (filename, path.read_bytes(), "application/pdf")))

    if files:
        upload = requests.post(f"{BASE_URL}/api/upload", files=files, timeout=120)
        print_result("upload", upload)
    else:
        print("\n[upload] skipped - add sample PDFs under ./samples")

    reports = requests.get(f"{BASE_URL}/api/reports", timeout=30)
    print_result("reports", reports)

    tickers = requests.get(f"{BASE_URL}/api/reports/tickers", timeout=30)
    print_result("tickers", tickers)

    chat = requests.post(
        f"{BASE_URL}/api/chat",
        json={
            "user_message": "Summarize Q3 2025 earnings",
            "company_ticker": "TATASTEEL",
            "quarters": ["Q3FY25", "Q2FY25", "Q3FY24"],
            "session_id": SESSION_ID,
        },
        timeout=120,
    )
    print_result("chat", chat)

    history = requests.get(f"{BASE_URL}/api/chat/history/{SESSION_ID}", timeout=30)
    print_result("chat_history", history)


if __name__ == "__main__":
    main()
