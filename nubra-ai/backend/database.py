import os
from datetime import datetime, timezone
from typing import Optional, Tuple

import gridfs
from pymongo import MongoClient
from pymongo.database import Database

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/nubra_ai")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "nubra_ai")

_MONGO_CLIENT: Optional[MongoClient] = None


def get_database() -> Tuple[MongoClient, Database]:
    global _MONGO_CLIENT
    if _MONGO_CLIENT is None:
        _MONGO_CLIENT = MongoClient(MONGODB_URI, maxPoolSize=50, minPoolSize=3)
    return _MONGO_CLIENT, _MONGO_CLIENT[MONGODB_DB_NAME]


def get_gridfs(db: Database):
    return gridfs.GridFS(db)


def ensure_indexes():
    _, db = get_database()
    db.reports.create_index([("company_ticker", 1), ("quarter", 1)], unique=True)
    db.reports.create_index("uploaded_at")
    db.extracted_json.create_index([("report_id", 1), ("section_type", 1)])
    db.embeddings.create_index([("report_id", 1), ("chunk_id", 1)], unique=True)
    db.embeddings.create_index([("company_ticker", 1), ("quarter", 1)])
    db.chat_history.create_index([("session_id", 1), ("created_at", 1)])
    db.users.create_index("email", unique=True, sparse=True)


def utc_now():
    return datetime.now(timezone.utc)
