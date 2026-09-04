"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api, ApiError } from "@/services/api";
import type { ETAPredictResponse, Priority } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";

const PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
const VEHICLE_TYPES = ["BICYCLE", "MOTORCYCLE", "VAN", "TRUCK", "MINI_TRUCK"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function AIIntelligenceView() {
  const [distanceKm, setDistanceKm] = useState(15);
  const [congestion, setCongestion] = useState(0.4);
  const [weight, setWeight] = useState(2.5);
  const [hour, setHour] = useState(14);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [vehicleType, setVehicleType] = useState("MOTORCYCLE");

  const [result, setResult] = useState<ETAPredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.predictEta({
        distance_km: distanceKm,
        congestion_level: congestion,
        package_weight: weight,
        hour,
        day_of_week: dayOfWeek,
        priority,
        vehicle_type: vehicleType,
      });
      setResult(res);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 503
            ? "ETA model isn't trained yet — run: python -m ml.training.train_eta_model"
            : e.message
          : "Prediction failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold text-ink-900">AI Intelligence</h1>
      <p className="mb-6 text-sm text-ink-500">
        TensorFlow/Keras ETA prediction — POST /api/v1/ml/eta/predict
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-nv-800 bg-nv-900/60 p-5 shadow-[var(--shadow-sm)]">
          <Field label={`Distance: ${distanceKm.toFixed(1)} km`}>
            <input
              type="range"
              min={0.5}
              max={250}
              step={0.5}
              value={distanceKm}
              onChange={(e) => setDistanceKm(Number(e.target.value))}
              className="w-full accent-plum"
            />
          </Field>

          <Field label={`Congestion level: ${(congestion * 100).toFixed(0)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={congestion}
              onChange={(e) => setCongestion(Number(e.target.value))}
              className="w-full accent-plum"
            />
          </Field>

          <Field label={`Package weight: ${weight.toFixed(1)} kg`}>
            <input
              type="range"
              min={0.1}
              max={100}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="w-full accent-plum"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Hour of day">
              <Select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i.toString().padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Day of week">
              <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Vehicle type">
              <Select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                {VEHICLE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {loading ? "Predicting…" : "Predict ETA"}
          </Button>
        </form>

        <Card className="p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-500">Prediction</h2>

          {!result && !error && (
            <div className="flex h-40 items-center justify-center text-sm text-ink-500">
              Submit the form to run inference.
            </div>
          )}

          {error && <ErrorState message={error} />}

          {result && (
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-ink-500">Predicted ETA</div>
                <div className="text-4xl font-semibold tabular-nums text-accent-700">
                  {Math.round(result.predicted_eta_minutes)}{" "}
                  <span className="text-lg font-normal text-ink-600">minutes</span>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-ink-500">Confidence</div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-nv-800">
                  <div
                    className="h-full bg-accent-500 transition-[width] duration-500"
                    style={{ width: `${Math.round(result.confidence * 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-sm tabular-nums text-ink-600">{Math.round(result.confidence * 100)}%</div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs text-ink-600">{label}</div>
      {children}
    </label>
  );
}
