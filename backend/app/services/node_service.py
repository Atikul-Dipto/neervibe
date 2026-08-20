"""Business logic for logistics node creation."""
from app.models.node import LogisticsNode
from app.schemas.node import NodeCreate
from sqlalchemy.ext.asyncio import AsyncSession


async def create_node(db: AsyncSession, data: NodeCreate) -> LogisticsNode:
    node = LogisticsNode(
        node_code=data.node_code,
        node_name=data.node_name,
        node_type=data.node_type,
        latitude=data.latitude,
        longitude=data.longitude,
        geog=f"POINT({data.longitude} {data.latitude})",
        address=data.address,
        city=data.city,
        capacity=data.capacity,
        current_load=0,
        opening_time=data.opening_time,
        closing_time=data.closing_time,
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return node
