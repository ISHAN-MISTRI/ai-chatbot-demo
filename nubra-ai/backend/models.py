from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    session_id: str
    user_message: str
    company_ticker: str
    quarters: List[str] = Field(default_factory=list)


class UploadReportResponse(BaseModel):
    message: str
    files: List[dict]

class ChatResponse(BaseModel):
    response: str
    chunks_used: int
    tokens_used: int
    references: List[dict] = Field(default_factory=list)


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime

class HealthResponse(BaseModel):
    status: str
    mongodb: str
    timestamp: datetime


class ReportStatus(BaseModel):
    company_ticker: str
    quarter: str
    status: str
    total_chunks: int
    original_filename: str
    uploaded_at: Optional[datetime] = None
