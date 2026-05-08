import sys
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("Fetching available tickers and quarters...")
response = client.get("/api/reports/tickers")
tickers_data = response.json()
print("Tickers available:", tickers_data)

# Let's see if we have TATA
has_tata = False
for t in tickers_data.get("tickers", []):
    if t.get("ticker") == "TATA":
        has_tata = True
        break

if not has_tata:
    print("TATA ticker not found. Make sure PDFs are correctly ingested.")
    sys.exit(1)

payload = {
    "session_id": "test_session_123",
    "user_message": "What is the reported PAT and revenue?",
    "company_ticker": "TATA",
    "quarters": [] 
}

print("\nAsking a question to the chatbot...")
response = client.post("/api/chat", json=payload)
if response.status_code == 200:
    data = response.json()
    print("\nSUCCESS!")
    print("Tokens used:", data.get("tokens_used"))
    print("Chunks used:", data.get("chunks_used"))
    print("\n--- Chatbot Response ---")
    print(data.get("response"))
else:
    print(f"\nError: {response.status_code}")
    print(response.text)
