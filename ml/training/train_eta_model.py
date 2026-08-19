"""Train the ETA prediction model on synthetic data and save the artifact.

Usage:
    python -m ml.training.train_eta_model
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))

import numpy as np
from sklearn.model_selection import train_test_split

from ml.data.synthetic_eta_data import TARGET_COLUMN, generate
from ml.models.eta_model import build_eta_model
from ml.preprocessing.eta_features import ETAFeaturePreprocessor

ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "models" / "artifacts" / "eta_predictor_v1"


def train(n_samples: int = 20000, epochs: int = 30) -> dict:
    df = generate(n_samples=n_samples)
    train_df, test_df = train_test_split(df, test_size=0.2, random_state=42)

    preprocessor = ETAFeaturePreprocessor().fit(train_df)
    x_train = preprocessor.transform(train_df)
    y_train = train_df[TARGET_COLUMN].to_numpy(dtype=float)
    x_test = preprocessor.transform(test_df)
    y_test = test_df[TARGET_COLUMN].to_numpy(dtype=float)

    model = build_eta_model(input_dim=preprocessor.feature_count())
    history = model.fit(
        x_train,
        y_train,
        validation_split=0.1,
        epochs=epochs,
        batch_size=64,
        verbose=2,
    )

    test_loss, test_mae = model.evaluate(x_test, y_test, verbose=0)
    residuals = y_test - model.predict(x_test, verbose=0).flatten()
    residual_std = float(np.std(residuals))

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    model.save(ARTIFACT_DIR / "model.keras")
    preprocessor.save(ARTIFACT_DIR / "preprocessor.json")
    (ARTIFACT_DIR / "metadata.json").write_text(
        f'{{"test_mae_minutes": {test_mae:.4f}, "residual_std_minutes": {residual_std:.4f}, '
        f'"n_samples": {n_samples}, "epochs": {epochs}}}'
    )

    print(f"Test MAE: {test_mae:.2f} minutes | Residual std: {residual_std:.2f} minutes")
    print(f"Artifact saved to {ARTIFACT_DIR}")
    return {"test_mae": test_mae, "residual_std": residual_std}


if __name__ == "__main__":
    train()
