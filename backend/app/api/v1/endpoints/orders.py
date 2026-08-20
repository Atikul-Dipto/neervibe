"""Read and write endpoints for orders."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderRead
from app.services import order_service

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderRead])
async def list_orders(
    customer_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Order]:
    stmt = select(Order)
    if customer_id:
        stmt = stmt.where(Order.customer_id == customer_id)
    stmt = stmt.order_by(Order.placed_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(order_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Order:
    order = await db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(data: OrderCreate, db: AsyncSession = Depends(get_db)) -> Order:
    return await order_service.create_order(db, data)
