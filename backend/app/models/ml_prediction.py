"""Persisted output of ML inference calls — decouples ML service from operational tables."""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPKMixin


class MLPrediction(Base, UUIDPKMixin):
    __tablename__ = "ml_predictions"

    model_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(32), nullable=False)
    prediction_type: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)  # PACKAGE, EDGE, NODE
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    input_features: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    predicted_value: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
