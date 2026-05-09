from datetime import datetime, timezone
from typing import Optional, Tuple

import gridfs
from pymongo import MongoClient
from pymongo.errors import OperationFailure
from pymongo.database import Database
import logging

logger = logging.getLogger("sihl-api.db")

_MONGO_CLIENT: Optional[MongoClient] = None


def get_database() -> Tuple[MongoClient, Database]:
    global _MONGO_CLIENT
    if _MONGO_CLIENT is None:
        # Read env lazily at runtime (Render/Vercel provide env vars at process start).
        # Avoid capturing defaults at import-time (which can accidentally point to localhost in production).
        import os

        mongodb_uri = os.getenv("MONGODB_URI", "").strip() or "mongodb://localhost:27017/nubra_ai"
        mongodb_db_name = os.getenv("MONGODB_DB_NAME", "").strip() or "nubra_ai"
        _MONGO_CLIENT = MongoClient(mongodb_uri, maxPoolSize=50, minPoolSize=1)
        _MONGO_CLIENT._nubra_db_name = mongodb_db_name  # type: ignore[attr-defined]
    db_name = getattr(_MONGO_CLIENT, "_nubra_db_name", None) or "nubra_ai"
    return _MONGO_CLIENT, _MONGO_CLIENT[db_name]


def get_gridfs(db: Database):
    return gridfs.GridFS(db)


def ensure_indexes():
    _, db = get_database()
    try:
        db.reports.create_index([("company_ticker", 1), ("quarter", 1)], unique=True)
        db.reports.create_index("uploaded_at")
        db.reports.create_index("source_sha256", unique=True, sparse=True)
        db.extracted_json.create_index([("report_id", 1), ("section_type", 1)])
        db.embeddings.create_index([("report_id", 1), ("chunk_id", 1)], unique=True)
        db.embeddings.create_index([("company_ticker", 1), ("quarter", 1)])
        db.chat_history.create_index([("session_id", 1), ("created_at", 1)])
        db.users.create_index("email", unique=True, sparse=True)
    except OperationFailure as exc:
        # Atlas free tier can throw quota errors when storage is exceeded. Don't crash the API startup.
        logger.warning("ensure_indexes skipped due to MongoDB error: %s", str(exc))


def utc_now():
    return datetime.now(timezone.utc)
