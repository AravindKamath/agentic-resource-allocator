from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class KBItem(BaseModel):
    id: str
    title: str
    body: str
    tags: List[str] = []

class TicketIn(BaseModel):
    id: str
    title: str
    description: str

class TriageRequest(BaseModel):
    traceId: str
    ticket: TicketIn
    kb: List[KBItem]

class StepLog(BaseModel):
    action: str
    meta: Dict[str, Any] = {}

class ConfidenceFactors(BaseModel):
    classification: float
    retrieval: float
    draft: float
    coverage: float

class QualityMetrics(BaseModel):
    retrievalQuality: float
    draftQuality: float
    citationCount: int
    responseLength: int
    kbCoverage: float

class TriageResponse(BaseModel):
    predictedCategory: str
    draftReply: str
    citations: List[str]
    confidence: float
    originalConfidence: Optional[float] = None
    confidenceFactors: Optional[ConfidenceFactors] = None
    modelInfo: Dict[str, Any]
    stepLogs: List[StepLog] = []
    quality: Optional[QualityMetrics] = None

class ResourceExtractionRequest(BaseModel):
    traceId: str
    title: str = Field(min_length=3, max_length=200)
    purpose: str = Field(min_length=3, max_length=2000)
    description: str = Field(min_length=5, max_length=5000)
    category: Optional[str] = None
    specifications: Dict[str, Any] = {}
    quantity: int = Field(default=1, ge=1, le=50)

class ResourceExtractionResponse(BaseModel):
    extractionStatus: str
    escalationOutcome: str
    category: Optional[str] = None
    purpose: Optional[str] = None
    specifications: Dict[str, Any] = {}
    quantity: Optional[int] = None
    missingFields: List[str] = []
    ambiguities: List[str] = []
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    reason: str
    sourceHash: str
    model: str
