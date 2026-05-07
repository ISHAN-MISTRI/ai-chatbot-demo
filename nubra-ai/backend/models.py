from typing import List
from datetime import datetime
from pydantic import BaseModel

class ChatRequest(BaseModel):
    session_id: str
    user_message: str
    company_ticker: str
    quarters: List[str]

class ChatResponse(BaseModel):
    response: str
    chunks_used: int
    tokens_used: int

class HealthResponse(BaseModel):
    status: str
    mongodb: str
    timestamp: datetime
