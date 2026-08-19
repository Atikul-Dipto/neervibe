"""Unit tests for the ETA model's feature preprocessing pipeline."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml.data.synthetic_eta_data import generate
from ml.preprocessing.eta_features import CATEGORICAL_COLUMNS, NUMERIC_COLUMNS, ETAFeaturePreprocessor


def test_preprocessor_output_shape_matches_feature_count():
    df = generate(n_samples=200, seed=1)
    preprocessor = ETAFeaturePreprocessor().fit(df)

    transformed = preprocessor.transform(df)

    expected_cols = len(NUMERIC_COLUMNS) + sum(len(v) for v in CATEGORICAL_COLUMNS.values())
    assert transformed.shape == (200, expected_cols)
    assert transformed.shape[1] == preprocessor.feature_count()


def test_preprocessor_roundtrip_save_load(tmp_path):
    df = generate(n_samples=100, seed=2)
    preprocessor = ETAFeaturePreprocessor().fit(df)

    path = tmp_path / "preprocessor.json"
    preprocessor.save(path)
    loaded = ETAFeaturePreprocessor.load(path)

    assert loaded.means == preprocessor.means
    assert loaded.stds == preprocessor.stds


def test_numeric_columns_are_standardized():
    df = generate(n_samples=5000, seed=3)
    preprocessor = ETAFeaturePreprocessor().fit(df)
    transformed = preprocessor.transform(df)

    numeric_block = transformed[:, : len(NUMERIC_COLUMNS)]
    assert abs(numeric_block.mean()) < 0.5
