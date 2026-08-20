"""Read and write endpoints for logistics network nodes."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.node import LogisticsNode
from app.schemas.node import NodeCreate, NodeRead
from app.services import node_service

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.get("", response_model=list[NodeRead])
async def list_nodes(
    city: str | None = Query(default=None),
    node_type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[LogisticsNode]:
    stmt = select(LogisticsNode)
    if city:
        stmt = stmt.where(LogisticsNode.city == city)
    if node_type:
        stmt = stmt.where(LogisticsNode.node_type == node_type)
    result = await db.execute(stmt.order_by(LogisticsNode.node_code))
    return list(result.scalars().all())


@router.get("/{node_id}", response_model=NodeRead)
async def get_node(node_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> LogisticsNode:
    node = await db.get(LogisticsNode, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.post("", response_model=NodeRead, status_code=status.HTTP_201_CREATED)
async def create_node(data: NodeCreate, db: AsyncSession = Depends(get_db)) -> LogisticsNode:
    return await node_service.create_node(db, data)
