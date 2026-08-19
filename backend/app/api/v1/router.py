"""Aggregates all v1 endpoint routers.

Phase 1 ships read/health/ml endpoints, backed by real DB queries and the
trained ETA model, so the foundation can be verified end-to-end against
seeded data. Write endpoints and vehicles/riders/routes/events/analytics
routers are added in later phases per the project's phased development
strategy.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import health, ml, nodes, packages, tracking

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(nodes.router)
api_router.include_router(packages.router)
api_router.include_router(tracking.router)
api_router.include_router(ml.router)
