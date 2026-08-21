"""Centralized application configuration loaded from environment variables."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "NeerVibe — Logistics Control Tower"
    app_env: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    # Database
    database_url: str = "postgresql+asyncpg://logistics:change-me@localhost:5432/logistics_control_tower"
    database_url_sync: str = "postgresql+psycopg2://logistics:change-me@localhost:5432/logistics_control_tower"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Simulation
    simulation_tick_seconds: float = 3.0
    simulation_vehicle_count: int = 40
    simulation_package_spawn_rate: int = 5
    # Edge travel times are real-world minutes (e.g. an 85-minute highway
    # leg). At 1x that's 85 real minutes for a vehicle to arrive — dead air
    # for a "real-time" control tower demo. Default 30x means that leg
    # completes in well under 3 minutes of wall-clock time instead.
    simulation_time_acceleration: float = 30.0
    # Standalone (python -m simulator.engine, a separate process/service) is
    # the default — matches docker-compose's dedicated `simulator` container.
    # Some hosts only allow a small number of services on their free tier;
    # setting this runs the same engine as a background asyncio task inside
    # the API process instead, needing one fewer service.
    run_simulator_inprocess: bool = False

    # ML
    ml_model_dir: str = "./ml/models/artifacts"
    ml_eta_model_name: str = "eta_predictor_v1"

    # Logging
    log_level: str = "INFO"
    log_format: str = "json"

    # Rate limiting
    rate_limit_per_minute: int = 120


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
