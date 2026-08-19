"""Feature preprocessing shared by training and inference for the ETA model.

Persisted alongside the model artifact so inference always applies the exact
transform the model was trained with, even as the pipeline evolves.
"""
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from ml.data.synthetic_eta_data import NODE_TYPES, PRIORITIES, VEHICLE_TYPES

NUMERIC_COLUMNS = [
    "distance_km",
    "package_weight",
    "route_distance_km",
    "historical_travel_time",
    "congestion_level",
    "hour",
    "day_of_week",
    "active_package_count",
    "weather_severity",
]
CATEGORICAL_COLUMNS = {
    "node_type": NODE_TYPES,
    "vehicle_type": VEHICLE_TYPES,
    "priority": PRIORITIES,
}


@dataclass
class ETAFeaturePreprocessor:
    means: dict[str, float] = field(default_factory=dict)
    stds: dict[str, float] = field(default_factory=dict)

    def fit(self, df: pd.DataFrame) -> "ETAFeaturePreprocessor":
        for col in NUMERIC_COLUMNS:
            self.means[col] = float(df[col].mean())
            self.stds[col] = float(df[col].std() or 1.0)
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        numeric = np.stack(
            [(df[col].to_numpy(dtype=float) - self.means[col]) / self.stds[col] for col in NUMERIC_COLUMNS],
            axis=1,
        )
        categorical_blocks = []
        for col, categories in CATEGORICAL_COLUMNS.items():
            one_hot = pd.get_dummies(df[col], columns=categories).reindex(columns=categories, fill_value=0)
            categorical_blocks.append(one_hot.to_numpy(dtype=float))
        return np.concatenate([numeric, *categorical_blocks], axis=1)

    def feature_count(self) -> int:
        return len(NUMERIC_COLUMNS) + sum(len(v) for v in CATEGORICAL_COLUMNS.values())

    def save(self, path: Path) -> None:
        path.write_text(json.dumps({"means": self.means, "stds": self.stds}))

    @classmethod
    def load(cls, path: Path) -> "ETAFeaturePreprocessor":
        data = json.loads(path.read_text())
        return cls(means=data["means"], stds=data["stds"])
