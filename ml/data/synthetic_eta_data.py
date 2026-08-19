"""Synthetic training data generator for the ETA prediction model.

Produces physically-plausible delivery times from a formula with noise,
rather than pure randomness, so the model has real signal to learn from.
Swap `generate` for a query against `package_events`/`packages` once real
delivery history exists — the feature contract (see FEATURE_COLUMNS) stays
the same either way.
"""
import numpy as np
import pandas as pd

VEHICLE_TYPES = ["BICYCLE", "MOTORCYCLE", "VAN", "TRUCK", "MINI_TRUCK"]
PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"]
NODE_TYPES = ["HUB", "SORTING_CENTER", "REGIONAL_HUB", "DISTRIBUTION_CENTER", "DELIVERY_HUB"]

VEHICLE_BASE_SPEED_KMH = {
    "BICYCLE": 15,
    "MOTORCYCLE": 35,
    "VAN": 40,
    "TRUCK": 45,
    "MINI_TRUCK": 40,
}

PRIORITY_HANDLING_MINUTES = {"LOW": 25, "NORMAL": 15, "HIGH": 8, "URGENT": 3}

FEATURE_COLUMNS = [
    "distance_km",
    "package_weight",
    "route_distance_km",
    "historical_travel_time",
    "congestion_level",
    "hour",
    "day_of_week",
    "node_type",
    "active_package_count",
    "weather_severity",
    "vehicle_type",
    "priority",
]

TARGET_COLUMN = "delivery_time_minutes"


def _rush_hour_multiplier(hour: np.ndarray) -> np.ndarray:
    morning = np.exp(-((hour - 9) ** 2) / 8.0)
    evening = np.exp(-((hour - 18) ** 2) / 8.0)
    return 1.0 + 0.4 * np.maximum(morning, evening)


def generate(n_samples: int = 20000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    distance_km = rng.gamma(shape=2.5, scale=6.0, size=n_samples).clip(0.5, 250)
    package_weight = rng.gamma(shape=2.0, scale=2.5, size=n_samples).clip(0.1, 100)
    route_distance_km = distance_km * rng.uniform(1.0, 1.25, size=n_samples)
    congestion_level = rng.beta(2, 4, size=n_samples)
    hour = rng.integers(0, 24, size=n_samples)
    day_of_week = rng.integers(0, 7, size=n_samples)
    active_package_count = rng.poisson(lam=40, size=n_samples)
    weather_severity = rng.beta(1.5, 6, size=n_samples)  # 0=clear, 1=severe
    vehicle_type = rng.choice(VEHICLE_TYPES, size=n_samples)
    priority = rng.choice(PRIORITIES, size=n_samples, p=[0.15, 0.55, 0.22, 0.08])
    node_type = rng.choice(NODE_TYPES, size=n_samples)

    base_speed = np.array([VEHICLE_BASE_SPEED_KMH[v] for v in vehicle_type])
    congestion_penalty = 1 + congestion_level * 0.9 + weather_severity * 0.5
    effective_speed = base_speed / (congestion_penalty * _rush_hour_multiplier(hour))
    travel_time_minutes = (route_distance_km / effective_speed) * 60

    historical_travel_time = travel_time_minutes * rng.normal(1.0, 0.08, size=n_samples)

    handling_time = np.array([PRIORITY_HANDLING_MINUTES[p] for p in priority])
    weight_penalty = np.log1p(package_weight) * 1.5
    load_penalty = np.clip(active_package_count - 30, 0, None) * 0.05

    noise = rng.normal(0, travel_time_minutes * 0.06 + 2, size=n_samples)

    delivery_time_minutes = (
        travel_time_minutes + handling_time + weight_penalty + load_penalty + noise
    ).clip(3, None)

    df = pd.DataFrame(
        {
            "distance_km": distance_km,
            "package_weight": package_weight,
            "route_distance_km": route_distance_km,
            "historical_travel_time": historical_travel_time,
            "congestion_level": congestion_level,
            "hour": hour,
            "day_of_week": day_of_week,
            "node_type": node_type,
            "active_package_count": active_package_count,
            "weather_severity": weather_severity,
            "vehicle_type": vehicle_type,
            "priority": priority,
            TARGET_COLUMN: delivery_time_minutes,
        }
    )
    return df


if __name__ == "__main__":
    data = generate()
    print(data.describe(include="all"))
