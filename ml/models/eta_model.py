"""Keras model architecture for ETA prediction — a small feed-forward
regressor. Deliberately simple: the point of Phase 6 is to prove the full
data -> preprocessing -> TensorFlow -> API pipeline works end-to-end on
synthetic data, not to squeeze out accuracy.
"""
import keras
from keras import layers


def build_eta_model(input_dim: int) -> keras.Model:
    inputs = keras.Input(shape=(input_dim,), name="features")
    x = layers.Dense(64, activation="relu")(inputs)
    x = layers.Dropout(0.15)(x)
    x = layers.Dense(32, activation="relu")(x)
    x = layers.Dense(16, activation="relu")(x)
    output = layers.Dense(1, activation="linear", name="eta_minutes")(x)

    model = keras.Model(inputs=inputs, outputs=output, name="eta_predictor")
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="mean_squared_error",
        metrics=["mean_absolute_error"],
    )
    return model
