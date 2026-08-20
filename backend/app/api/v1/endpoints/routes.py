"""Read endpoints for the logistics network's edges (routes between nodes)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.edge import LogisticsEdge
from app.models.node import LogisticsNode
from app.schemas.route import RouteDetail, RouteRead

router = APIRouter(prefix="/routes", tags=["routes"])


@router.get("", response_model=list[RouteRead])
async def list_routes(
    source_node_id: uuid.UUID | None = Query(default=None),
    destination_node_id: uuid.UUID | None = Query(default=None),
    route_status: str | None = Query(default=None),
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[LogisticsEdge]:
    stmt = select(LogisticsEdge)
    if source_node_id:
        stmt = stmt.where(LogisticsEdge.source_node_id == source_node_id)
    if destination_node_id:
        stmt = stmt.where(LogisticsEdge.destination_node_id == destination_node_id)
    if route_status:
        stmt = stmt.where(LogisticsEdge.route_status == route_status)
    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{route_id}", response_model=RouteDetail)
async def get_route(route_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> RouteDetail:
    edge = await db.get(LogisticsEdge, route_id)
    if edge is None:
        raise HTTPException(status_code=404, detail="Route not found")

    source = await db.get(LogisticsNode, edge.source_node_id)
    destination = await db.get(LogisticsNode, edge.destination_node_id)

    return RouteDetail(
        **RouteRead.model_validate(edge).model_dump(),
        source_node_code=source.node_code if source else "",
        source_node_name=source.node_name if source else "",
        destination_node_code=destination.node_code if destination else "",
        destination_node_name=destination.node_name if destination else "",
    )
