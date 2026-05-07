import os
from datetime import datetime, timezone
import gridfs
from pymongo import MongoClient

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/nubra_ai")

def get_database():
    client = MongoClient(MONGODB_URI)
    db = client.get_default_database()
    return client, db

def get_gridfs(db):
    return gridfs.GridFS(db)

def utc_now():
    return datetime.now(timezone.utc)
