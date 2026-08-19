"""Integration tests for the FastAPI app boot and health endpoints.

/health requires no infrastructure. /health/ready degrades gracefully (HTTP
200, status="degraded") when Postgres/Redis aren't reachable, so this suite
runs in any environment — a live database is only needed to assert
status=="ready".
"""
import httpx
import pytest
from httpx import ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_root_endpoint_reports_online():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "online"


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_readiness_endpoint_reports_dependency_status():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in ("ready", "degraded")
    assert set(body["checks"].keys()) == {"database", "redis"}
