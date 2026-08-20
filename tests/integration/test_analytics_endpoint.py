"""Integration test for the analytics overview endpoint against the live
database. Skips if PostgreSQL isn't reachable, matching the other
DB-dependent integration tests.
"""
import socket

import httpx
import pytest
from httpx import ASGITransport

from app.main import app


def _postgres_reachable() -> bool:
    try:
        with socket.create_connection(("localhost", 5432), timeout=1):
            return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(
    not _postgres_reachable(), reason="PostgreSQL not reachable on localhost:5432"
)


@pytest.mark.asyncio
async def test_analytics_overview_returns_consistent_aggregates():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/overview")

    assert response.status_code == 200
    body = response.json()

    network = body["network"]
    assert network["total_packages"] >= 0
    # in_transit/delivered/failed_deliveries/returns are disjoint status buckets
    assert (
        network["in_transit"] + network["delivered"] + network["failed_deliveries"] + network["returns"]
        <= network["total_packages"]
    )
    assert 0 <= network["network_utilization_pct"] <= 100

    operations = body["operations"]
    assert 0 <= operations["return_rate_pct"] <= 100
    assert 0 <= operations["cancellation_rate_pct"] <= 100
    if operations["on_time_delivery_rate_pct"] is not None:
        assert 0 <= operations["on_time_delivery_rate_pct"] <= 100
        assert operations["sla_breach_rate_pct"] == pytest.approx(
            100 - operations["on_time_delivery_rate_pct"], abs=0.1
        )

    network_metrics = body["network_metrics"]
    assert network_metrics["active_nodes"] >= 0
    assert len(network_metrics["highest_volume_hubs"]) <= 5
    for i in range(len(network_metrics["highest_volume_hubs"]) - 1):
        assert (
            network_metrics["highest_volume_hubs"][i]["current_load"]
            >= network_metrics["highest_volume_hubs"][i + 1]["current_load"]
        )
