"""Aggregates all v1 endpoint routers.

Phase 2 adds write endpoints for packages/orders/nodes/vehicles/riders, plus
read-only routes/events routers, all backed by a services/ layer that owns
the business logic (state machine transitions, event writes) so endpoints
stay thin. Analytics is not implemented yet.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    events,
    health,
    ml,
    nodes,
    orders,
    packages,
    riders,
    routes,
    tracking,
    vehicles,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(nodes.router)
api_router.include_router(packages.router)
api_router.include_router(orders.router)
api_router.include_router(vehicles.router)
api_router.include_router(riders.router)
api_router.include_router(routes.router)
api_router.include_router(events.router)
api_router.include_router(tracking.router)
api_router.include_router(ml.router)
