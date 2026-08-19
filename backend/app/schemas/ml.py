"""Pydantic schemas for the ML prediction API."""
from pydantic import BaseModel, Field

from app.models.enums import Priority


class ETAPredictRequest(BaseModel):
    distance_km: float = Field(gt=0)
    congestion_level: float = Field(ge=0, le=1)
    package_weight: float = Field(gt=0)
    hour: int = Field(ge=0, le=23)
    priority: Priority = Priority.NORMAL
    day_of_week: int = Field(ge=0, le=6, default=0)
    vehicle_type: str = "MOTORCYCLE"


class ETAPredictResponse(BaseModel):
    predicted_eta_minutes: float
    confidence: float
