"""Pydantic schemas for delivery attempts."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DeliveryAttemptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    package_id: uuid.UUID
    rider_id: uuid.UUID | None
    attempt_number: int
    result: str
    notes: str | None
    attempted_at: datetime
