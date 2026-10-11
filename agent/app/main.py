from fastapi import FastAPI, HTTPException
from app.schemas import (
    ResourceExtractionRequest,
    ResourceExtractionResponse,
    TriageRequest,
    TriageResponse,
    StepLog,
)
from app.pipeline import run_pipeline
from app.llm_provider import provider

app = FastAPI(title="Agent Worker", version="1.0.0")

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.post("/triage", response_model=TriageResponse)
def triage(req: TriageRequest):
    try:
        resp = run_pipeline(req.traceId, req.ticket.dict(), [k.dict() for k in req.kb])
        resp["stepLogs"] = [StepLog(**s).dict() for s in resp["stepLogs"]]
        return resp
    except Exception as e:
        raise HTTPException(status_code=500, detail="Agent error")

@app.post("/resource-extract", response_model=ResourceExtractionResponse)
def resource_extract(req: ResourceExtractionRequest):
    try:
        return provider.extract_resource_request(req.dict())
    except Exception:
        raise HTTPException(status_code=503, detail="Resource extraction unavailable")
