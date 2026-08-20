"""Pydantic schemas for orders."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OrderCreate(BaseModel):
    customer_id: uuid.UUID
    merchant_id: uuid.UUID
    order_value: float = Field(gt=0)


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    customer_id: uuid.UUID
    merchant_id: uuid.UUID
    order_value: float
    status: str
    placed_at: datetime
    created_at: datetime
    updated_at: datetime
