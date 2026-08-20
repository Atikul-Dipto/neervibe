"""Aggregates all v1 endpoint routers.

Every resource group in the spec's API architecture is now covered:
packages/orders/nodes/vehicles/riders (full read/write via a services/
layer), routes/events (read-only), tracking, ml, and analytics (read-only
aggregates for the Operations/Analytics frontend pages).
"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
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
api_router.include_router(analytics.router)
