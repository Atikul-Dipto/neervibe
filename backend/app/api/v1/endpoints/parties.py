"""Read endpoints for merchants and customers, the parties on either end
of a shipment. The frontend joins these onto packages client-side for
merchant performance, customer context and COD settlement views."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.party import Customer, Merchant
from app.schemas.party import CustomerRead, MerchantRead

merchants_router = APIRouter(prefix="/merchants", tags=["merchants"])
customers_router = APIRouter(prefix="/customers", tags=["customers"])


@merchants_router.get("", response_model=list[MerchantRead])
async def list_merchants(
    city: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Merchant]:
    stmt = select(Merchant)
    if city:
        stmt = stmt.where(Merchant.city == city)
    stmt = stmt.order_by(Merchant.business_name).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@merchants_router.get("/{merchant_id}", response_model=MerchantRead)
async def get_merchant(merchant_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Merchant:
    merchant = await db.get(Merchant, merchant_id)
    if merchant is None:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return merchant


@customers_router.get("", response_model=list[CustomerRead])
async def list_customers(
    city: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Customer]:
    stmt = select(Customer)
    if city:
        stmt = stmt.where(Customer.city == city)
    stmt = stmt.order_by(Customer.name).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@customers_router.get("/{customer_id}", response_model=CustomerRead)
async def get_customer(customer_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Customer:
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer
