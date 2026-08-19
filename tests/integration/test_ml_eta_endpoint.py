"""Integration test for POST /api/v1/ml/eta/predict against the trained
model artifact. Skips if the model hasn't been trained yet (CI without the
artifact present) rather than failing — training is a separate, explicit
step (`python -m ml.training.train_eta_model`).
"""
import httpx
import pytest
from httpx import ASGITransport

from app.main import app
from ml.inference.eta_predictor import ARTIFACT_DIR

pytestmark = pytest.mark.skipif(
    not (ARTIFACT_DIR / "model.keras").exists(),
    reason="ETA model artifact not trained yet",
)


@pytest.mark.asyncio
async def test_eta_predict_returns_plausible_result():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/ml/eta/predict",
            json={
                "distance_km": 15.4,
                "congestion_level": 0.72,
                "package_weight": 2.4,
                "hour": 18,
                "priority": "NORMAL",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["predicted_eta_minutes"] > 0
    assert 0 <= body["confidence"] <= 1
