"""Loads the trained ETA model/preprocessor once and serves predictions.

Used by the FastAPI ML router (POST /api/v1/ml/eta/predict). Kept separate
from the core logistics engine per the project's architecture rules — the
API layer calls into this module, it never touches TensorFlow directly.
"""
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from ml.preprocessing.eta_features import ETAFeaturePreprocessor

ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "models" / "artifacts" / "eta_predictor_v1"

DEFAULT_NODE_TYPE = "HUB"
DEFAULT_ACTIVE_PACKAGE_COUNT = 40
DEFAULT_WEATHER_SEVERITY = 0.1
AVG_SPEED_KMH = 32.0


class ModelNotTrainedError(RuntimeError):
    pass


class ETAPredictor:
    def __init__(self) -> None:
        if not (ARTIFACT_DIR / "model.keras").exists():
            raise ModelNotTrainedError(
                f"No trained model found at {ARTIFACT_DIR}. "
                "Run: python -m ml.training.train_eta_model"
            )
        import keras  # deferred import — keeps API startup fast when unused

        self.model = keras.models.load_model(ARTIFACT_DIR / "model.keras")
        self.preprocessor = ETAFeaturePreprocessor.load(ARTIFACT_DIR / "preprocessor.json")
        self.metadata = json.loads((ARTIFACT_DIR / "metadata.json").read_text())

    def predict(
        self,
        distance_km: float,
        congestion_level: float,
        package_weight: float,
        hour: int,
        priority: str = "NORMAL",
        day_of_week: int = 0,
        vehicle_type: str = "MOTORCYCLE",
    ) -> tuple[float, float]:
        route_distance_km = distance_km * 1.1
        historical_travel_time = (route_distance_km / AVG_SPEED_KMH) * 60 * (1 + congestion_level * 0.5)

        row = pd.DataFrame(
            [
                {
                    "distance_km": distance_km,
                    "package_weight": package_weight,
                    "route_distance_km": route_distance_km,
                    "historical_travel_time": historical_travel_time,
                    "congestion_level": congestion_level,
                    "hour": hour,
                    "day_of_week": day_of_week,
                    "node_type": DEFAULT_NODE_TYPE,
                    "active_package_count": DEFAULT_ACTIVE_PACKAGE_COUNT,
                    "weather_severity": DEFAULT_WEATHER_SEVERITY,
                    "vehicle_type": vehicle_type,
                    "priority": priority,
                }
            ]
        )
        x = self.preprocessor.transform(row)
        predicted = float(self.model.predict(x, verbose=0).flatten()[0])
        predicted = max(3.0, predicted)

        residual_std = self.metadata.get("residual_std_minutes", predicted * 0.2)
        confidence = float(np.clip(1 - (residual_std / max(predicted, 1e-6)), 0.05, 0.99))
        return round(predicted, 1), round(confidence, 2)


@lru_cache
def get_eta_predictor() -> ETAPredictor:
    return ETAPredictor()
