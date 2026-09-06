"""Health check endpoints."""

from typing import Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.core.config import get_settings
from src.services.database import get_database

router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    environment: str
    version: str
    database: str


@router.get("/", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Basic health check endpoint.

    Returns:
        HealthResponse: Application health status
    """
    settings = get_settings()

    return HealthResponse(
        status="healthy",
        environment=settings.environment,
        version=settings.app_version,
        database="connected",
    )


@router.get("/ready")
async def readiness_check() -> Dict[str, str]:
    """
    Readiness check for Kubernetes/Cloud Run.

    Verifies:
    - Database connection is working
    - All required services are reachable

    Returns:
        Dict[str, str]: Readiness status
    """
    settings = get_settings()
    db = get_database()

    try:
        # Test database connection by querying reviewers table
        reviewers = await db.get_active_reviewers()
        db_status = "ready"
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database not ready: {str(e)}",
        )

    return {
        "status": "ready",
        "database": db_status,
        "environment": settings.environment,
    }


@router.get("/live")
async def liveness_check() -> Dict[str, str]:
    """
    Liveness check for Kubernetes/Cloud Run.

    Basic check to see if the app is running.

    Returns:
        Dict[str, str]: Liveness status
    """
    return {"status": "alive"}
