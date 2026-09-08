"""Health check endpoints."""

from typing import Dict

import psycopg
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

    Verifies the Supabase API and direct PostgreSQL connection used by LangGraph.

    Returns:
        Dict[str, str]: Readiness status
    """
    settings = get_settings()
    db = get_database()

    try:
        # Verify the Supabase API connection.
        await db.get_active_reviewers()

        # LangGraph checkpoints use a direct psycopg connection, not the
        # Supabase API client. Check it here so readiness matches the workflow.
        with psycopg.connect(settings.database_url, connect_timeout=5) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
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
