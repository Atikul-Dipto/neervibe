"""ML prediction endpoints. Thin wrapper — all model logic lives in ml/."""
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))

from ml.inference.eta_predictor import ModelNotTrainedError, get_eta_predictor

from app.core.logging import get_logger
from app.schemas.ml import ETAPredictRequest, ETAPredictResponse

router = APIRouter(prefix="/ml", tags=["ml"])
logger = get_logger(__name__)


@router.post("/eta/predict", response_model=ETAPredictResponse)
async def predict_eta(request: ETAPredictRequest) -> ETAPredictResponse:
    try:
        predictor = get_eta_predictor()
    except ModelNotTrainedError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    eta_minutes, confidence = predictor.predict(
        distance_km=request.distance_km,
        congestion_level=request.congestion_level,
        package_weight=request.package_weight,
        hour=request.hour,
        priority=request.priority.value,
        day_of_week=request.day_of_week,
        vehicle_type=request.vehicle_type,
    )
    logger.info(
        "ML_PREDICTION_GENERATED",
        model="eta_predictor_v1",
        predicted_eta_minutes=eta_minutes,
        confidence=confidence,
    )
    return ETAPredictResponse(predicted_eta_minutes=eta_minutes, confidence=confidence)
