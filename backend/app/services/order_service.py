"""Business logic for order creation."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.schemas.order import OrderCreate


async def create_order(db: AsyncSession, data: OrderCreate) -> Order:
    order = Order(
        order_number=f"ORD-{uuid.uuid4().hex[:10].upper()}",
        customer_id=data.customer_id,
        merchant_id=data.merchant_id,
        order_value=data.order_value,
        status="PLACED",
        placed_at=datetime.now(timezone.utc),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order
