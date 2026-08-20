"""End-to-end integration test for Phase 2 write endpoints, run against a
real PostgreSQL/Redis stack (docker compose up postgres redis). Skips
automatically if that stack isn't reachable, rather than failing CI in
environments without Docker.
"""
import socket

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.main import app
from app.models.node import LogisticsNode
from app.models.party import Customer, Merchant


def _postgres_reachable() -> bool:
    try:
        with socket.create_connection(("localhost", 5432), timeout=1):
            return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(
    not _postgres_reachable(), reason="PostgreSQL not reachable on localhost:5432"
)


@pytest.fixture
async def seeded_ids():
    async with AsyncSessionLocal() as session:
        customer = (await session.execute(select(Customer).limit(1))).scalar_one_or_none()
        merchant = (await session.execute(select(Merchant).limit(1))).scalar_one_or_none()
        merchant_node = (
            await session.execute(
                select(LogisticsNode).where(LogisticsNode.node_type == "MERCHANT").limit(1)
            )
        ).scalar_one_or_none()
        customer_node = (
            await session.execute(
                select(LogisticsNode).where(LogisticsNode.node_type == "CUSTOMER").limit(1)
            )
        ).scalar_one_or_none()

    if not all([customer, merchant, merchant_node, customer_node]):
        pytest.skip("Database not seeded — run scripts/seed_database.py and generate_dummy_packages.py")

    return {
        "customer_id": str(customer.id),
        "merchant_id": str(merchant.id),
        "source_node_id": str(merchant_node.id),
        "destination_node_id": str(customer_node.id),
    }


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_full_package_lifecycle_through_the_api(client, seeded_ids):
    order_resp = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": seeded_ids["customer_id"],
            "merchant_id": seeded_ids["merchant_id"],
            "order_value": 1500.0,
        },
    )
    assert order_resp.status_code == 201
    order = order_resp.json()

    package_resp = await client.post(
        "/api/v1/packages",
        json={
            "order_id": order["id"],
            "customer_id": seeded_ids["customer_id"],
            "merchant_id": seeded_ids["merchant_id"],
            "package_weight": 2.4,
            "source_node_id": seeded_ids["source_node_id"],
            "destination_node_id": seeded_ids["destination_node_id"],
        },
    )
    assert package_resp.status_code == 201
    package = package_resp.json()
    assert package["current_status"] == "PACKAGE_CREATED"

    tracking_resp = await client.get(f"/api/v1/tracking/{package['tracking_number']}")
    assert tracking_resp.status_code == 200
    timeline = tracking_resp.json()["timeline"]
    assert len(timeline) == 1
    assert timeline[0]["event_type"] == "PACKAGE_CREATED"

    valid_transition = await client.patch(
        f"/api/v1/packages/{package['id']}/status",
        json={"new_status": "PICKUP_ASSIGNED"},
    )
    assert valid_transition.status_code == 200
    assert valid_transition.json()["current_status"] == "PICKUP_ASSIGNED"

    invalid_transition = await client.patch(
        f"/api/v1/packages/{package['id']}/status",
        json={"new_status": "DELIVERED"},
    )
    assert invalid_transition.status_code == 409

    events_resp = await client.get(f"/api/v1/events?package_id={package['id']}")
    assert events_resp.status_code == 200
    assert len(events_resp.json()) == 2


@pytest.mark.asyncio
async def test_vehicle_and_rider_write_endpoints(client):
    vehicle_resp = await client.post(
        "/api/v1/vehicles",
        json={"registration_number": f"TEST-{id(client)}", "vehicle_type": "MOTORCYCLE", "capacity": 50},
    )
    assert vehicle_resp.status_code == 201
    vehicle = vehicle_resp.json()
    assert vehicle["status"] == "IDLE"

    location_resp = await client.patch(
        f"/api/v1/vehicles/{vehicle['id']}/location",
        json={"latitude": 23.81, "longitude": 90.41, "speed": 32.5, "heading": 180},
    )
    assert location_resp.status_code == 200
    updated = location_resp.json()
    assert updated["current_latitude"] == pytest.approx(23.81)
    assert updated["speed"] == pytest.approx(32.5)

    rider_resp = await client.post(
        "/api/v1/riders", json={"name": "Test Rider", "phone": "01700000000"}
    )
    assert rider_resp.status_code == 201
    rider = rider_resp.json()

    assign_resp = await client.patch(
        f"/api/v1/riders/{rider['id']}/assign-vehicle", json={"vehicle_id": vehicle["id"]}
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["vehicle_id"] == vehicle["id"]


@pytest.mark.asyncio
async def test_routes_list_returns_seeded_edges(client):
    resp = await client.get("/api/v1/routes?limit=5")
    assert resp.status_code == 200
    routes = resp.json()
    assert len(routes) > 0
    assert "distance_km" in routes[0]
