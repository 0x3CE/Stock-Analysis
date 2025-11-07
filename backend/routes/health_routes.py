from fastapi import APIRouter
from datetime import datetime

router = APIRouter()

@router.get("/")
async def root():
    return {"message": "Stock Analysis API", "version": "1.0.0"}

@router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}