from database import get_database

_, db = get_database()

old_tickers = ["TSL", "UNKNOWN"]
new_ticker = "TATA"

print("Updating reports...")
try:
    res1 = db.reports.update_many(
        {"company_ticker": {"$in": old_tickers}},
        {"$set": {"company_ticker": new_ticker, "company_name": "Tata Steel"}}
    )
    print(f"Reports modified: {res1.modified_count}")
except Exception as e:
    print(f"Error updating reports (possibly unique constraint): {e}")
    # If duplicate key error, we can iterate and update one by one
    for doc in db.reports.find({"company_ticker": {"$in": old_tickers}}):
        try:
            db.reports.update_one({"_id": doc["_id"]}, {"$set": {"company_ticker": new_ticker, "company_name": "Tata Steel"}})
        except Exception as ex:
            print(f"Skipping {doc['company_ticker']} {doc.get('quarter')} due to error: {ex}")

print("Updating embeddings...")
res2 = db.embeddings.update_many(
    {"company_ticker": {"$in": old_tickers}},
    {"$set": {"company_ticker": new_ticker}}
)
print(f"Embeddings modified: {res2.modified_count}")

print("Updating chat_history...")
res3 = db.chat_history.update_many(
    {"company_ticker": {"$in": old_tickers}},
    {"$set": {"company_ticker": new_ticker}}
)
print(f"Chat history modified: {res3.modified_count}")

print("Done!")
