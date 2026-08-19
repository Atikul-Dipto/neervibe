"""Liveness/readiness checks — verifies DB and Redis connectivity."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness(db: AsyncSession = Depends(get_db)) -> dict:
    checks = {"database": False, "redis": False}

    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        pass

    try:
        redis = get_redis()
        await redis.ping()
        checks["redis"] = True
    except Exception:
        pass

    status = "ready" if all(checks.values()) else "degraded"
    return {"status": status, "checks": checks}
