"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import clsx from "clsx";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { DataGate, usePageData } from "@/components/pages/common";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/StatusPill";
import { ErrorState } from "@/components/ui/States";
import { RecommendationCard } from "@/components/drawer/shared";
import { runQuery, SUGGESTED_QUERIES, type NlqResult } from "@/ai/nlq";
import { detectAnomalies } from "@/ai/anomaly";
import { recommendForHub, recommendForRider, recommendForShipment, type Recommendation } from "@/ai/recommend";
import { simulateCorridorHold, simulateHubCapacity, simulateRiderMove, type ScenarioResult } from "@/ai/simulate";
import { api, ApiError } from "@/services/api";
import { useOpenDrawer } from "@/data/hooks";
import { useOpsStore } from "@/data/ops";
import { formatRelative } from "@/data/format";
import type { ETAPredictResponse, Priority } from "@/types/domain";

type Tab = "copilot" | "anomalies" | "recommend" | "predict" | "simulate";

export default function AiPage() {
  return (
    <DataGate>
      <Suspense fallback={null}>
        <Ai />
      </Suspense>
    </DataGate>
  );
}

function Ai() {
  const params = useSearchParams();
  const initialTab = (params.get("tab") as Tab | null) ?? "copilot";
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <Page>
      <PageHeader title="AI Intelligence" description="Decision support over the live snapshot: copilot, anomaly detection, root cause, recommendations, the trained ETA model and what-if simulation." />
      <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ key: "copilot", label: "Copilot" }, { key: "anomalies", label: "Anomalies & root cause" }, { key: "recommend", label: "Recommendations" }, { key: "predict", label: "ETA prediction" }, { key: "simulate", label: "Simulation" }]} />
      {tab === "copilot" && <Copilot initialQuery={params.get("q") ?? ""} />}
      {tab === "anomalies" && <Anomalies />}
      {tab === "recommend" && <Recommendations />}
      {tab === "predict" && <EtaPredictor />}
      {tab === "simulate" && <Simulator from={params.get("from")} to={params.get("to")} riders={params.get("riders")} />}
    </Page>
  );
}

function Copilot({ initialQuery }: { initialQuery: string }) {
  const { derived } = usePageData();
  const open = useOpenDrawer();
  const logAction = useOpsStore((s) => s.logAction);
  const [q, setQ] = useState(initialQuery);
  const [history, setHistory] = useState<{ q: string; r: NlqResult; at: number }[]>(() =>
    initialQuery ? [{ q: initialQuery, r: runQuery(initialQuery, derived), at: Date.now() }] : [],
  );

  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const r = runQuery(t, derived);
    setHistory((h) => [{ q: t, r, at: Date.now() }, ...h].slice(0, 12));
    logAction({ action: "Asked copilot", target: r.intent, detail: t.slice(0, 80), scope: "local" });
    setQ("");
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
      <div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Sparkles className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about the network in plain language…" className="pl-9" aria-label="Copilot question" />
          </div>
          <Button variant="ai" type="submit">
            Ask
          </Button>
        </form>
        <div className="mt-3 space-y-3">
          {history.length === 0 && (
            <Card className="p-4 text-xs text-ink-500">
              Every answer is computed from the current snapshot, never generated from thin air. Pick a suggestion on the right or type your own question.
            </Card>
          )}
          {history.map((h, i) => (
            <Card key={i} className="border-violet-500/20 p-4">
              <div className="mb-2 flex items-center justify-between text-[11px] text-ink-500">
                <span className="text-ink-700">“{h.q}”</span>
                <span>
                  {h.r.intent} · {formatRelative(new Date(h.at))}
                </span>
              </div>
              <p className="text-sm text-ink-900">{h.r.answer}</p>
              {h.r.bullets.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-700">
                  {h.r.bullets.map((b, j) => (
                    <li key={j}>{h.r.intent === "help" ? <button onClick={() => ask(b)} className="text-violet-300 hover:underline">{b}</button> : b}</li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {h.r.drawer && (
                  <Button size="xs" variant="secondary" onClick={() => open(h.r.drawer!.kind, h.r.drawer!.id)}>
                    Open detail
                  </Button>
                )}
                {h.r.actions.map((a) => (
                  <Link key={a.href} href={a.href}>
                    <Button size="xs" variant="secondary">{a.label}</Button>
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
      <Card className="p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Try asking</div>
        <div className="flex flex-col gap-1">
          {SUGGESTED_QUERIES.map((s) => (
            <button key={s} onClick={() => ask(s)} className="rounded px-2 py-1.5 text-left text-xs text-ink-700 hover:bg-nv-850 hover:text-ink-900">
              {s}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Anomalies() {
  const { derived, daily } = usePageData();
  const open = useOpenDrawer();
  const anomalies = useMemo(() => detectAnomalies(derived, daily), [derived, daily]);
  const root = useMemo(() => runQuery("why did sla fall today", derived), [derived]);
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card>
        <CardHeader title="Anomaly detection" subtitle="Values more than 2σ from their 7-day baseline, and entities that are outliers among peers" />
        <div className="px-4 pb-4">
          {anomalies.length === 0 ? (
            <div className="py-6 text-center text-xs text-ink-500">Nothing unusual against the baseline right now.</div>
          ) : (
            <ul className="space-y-2">
              {anomalies.map((a) => (
                <li key={a.id} className="rounded-md border border-nv-800 bg-nv-950/40 p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <StatusPill tone={a.severity === "high" ? "danger" : a.severity === "medium" ? "warning" : "neutral"} size="xs">{a.severity}</StatusPill>
                    <span className="text-ink-900">{a.title}</span>
                  </div>
                  <div className="mt-1 text-ink-600">{a.detail}</div>
                  <div className="mt-1.5 flex gap-2">
                    {a.href && (
                      <Link href={a.href} className="text-[11px] text-accent-700 hover:underline">
                        Investigate
                      </Link>
                    )}
                    {a.entity && a.entity.kind !== "city" && (
                      <button onClick={() => open(a.entity!.kind as "hub" | "rider", a.entity!.id)} className="text-[11px] text-accent-700 hover:underline">
                        Open {a.entity.kind}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Root cause · SLA" subtitle="Where today's SLA performance is coming from" />
        <div className="px-4 pb-4 text-xs">
          <p className="text-sm text-ink-900">{root.answer}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-700">
            {root.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {root.actions.map((a) => (
              <Link key={a.href} href={a.href}>
                <Button size="xs" variant="secondary">{a.label}</Button>
              </Link>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Recommendations() {
  const { derived, shipments } = usePageData();
  const open = useOpenDrawer();
  const items = useMemo(() => {
    const out: { rec: Recommendation; kind: "hub" | "rider" | "shipment"; id: string; label: string }[] = [];
    for (const h of derived.hubs) {
      const rec = recommendForHub(h);
      if (rec) out.push({ rec, kind: "hub", id: h.id, label: h.name });
    }
    for (const r of derived.riders) {
      const rec = recommendForRider(r, derived.riders.filter((x) => x.city === r.city && x.workload === "idle"));
      if (rec) out.push({ rec, kind: "rider", id: r.id, label: r.name });
    }
    for (const s of [...shipments].filter((x) => x.isActive).sort((a, b) => b.riskScore - a.riskScore).slice(0, 12)) {
      const rec = recommendForShipment(s);
      if (rec) out.push({ rec, kind: "shipment", id: s.id, label: s.trackingNumber });
    }
    return out.sort((a, b) => b.rec.confidence - a.rec.confidence);
  }, [derived, shipments]);
  if (items.length === 0) return <Card className="p-6 text-center text-xs text-ink-500">No recommendations: nothing is under pressure right now.</Card>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => (
        <div key={`${it.kind}:${it.id}`}>
          <button onClick={() => open(it.kind, it.id)} className="mb-1 text-xs text-accent-700 hover:underline">
            {it.kind} · {it.label}
          </button>
          <RecommendationCard rec={it.rec} />
        </div>
      ))}
    </div>
  );
}

const PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
const VEHICLE_TYPES = ["BICYCLE", "MOTORCYCLE", "VAN", "TRUCK", "MINI_TRUCK"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function EtaPredictor() {
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
  const logAction = useOpsStore((s) => s.logAction);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.predictEta({ distance_km: distanceKm, congestion_level: congestion, package_weight: weight, hour, day_of_week: dayOfWeek, priority, vehicle_type: vehicleType });
      setResult(res);
      logAction({ action: "Ran ETA prediction", target: `${distanceKm} km`, detail: `${Math.round(res.predicted_eta_minutes)} min`, scope: "api" });
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 503 ? "ETA model isn't trained yet on the server." : err.message) : "Prediction failed");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-nv-800 bg-nv-900 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">TensorFlow ETA model · POST /ml/eta/predict</div>
        <Field label={`Distance: ${distanceKm.toFixed(1)} km`}>
          <input type="range" min={0.5} max={250} step={0.5} value={distanceKm} onChange={(e) => setDistanceKm(Number(e.target.value))} className="w-full accent-cyan-400" />
        </Field>
        <Field label={`Congestion: ${(congestion * 100).toFixed(0)}%`}>
          <input type="range" min={0} max={1} step={0.01} value={congestion} onChange={(e) => setCongestion(Number(e.target.value))} className="w-full accent-cyan-400" />
        </Field>
        <Field label={`Weight: ${weight.toFixed(1)} kg`}>
          <input type="range" min={0.1} max={100} step={0.1} value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="w-full accent-cyan-400" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hour of day">
            <Select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>
              ))}
            </Select>
          </Field>
          <Field label="Day of week">
            <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Vehicle type">
            <Select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>{v.replaceAll("_", " ")}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          <Sparkles className="h-3.5 w-3.5" /> {loading ? "Predicting…" : "Predict ETA"}
        </Button>
      </form>
      <Card className="p-4">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Prediction</div>
        {!result && !error && <div className="flex h-40 items-center justify-center text-sm text-ink-500">Submit the form to run inference on the server.</div>}
        {error && <ErrorState message={error} />}
        {result && (
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-500">Predicted ETA</div>
              <div className="text-4xl font-semibold tabular-nums text-cyan-300">
                {Math.round(result.predicted_eta_minutes)} <span className="text-lg font-normal text-ink-600">minutes</span>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-500">Confidence</div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-nv-800">
                <div className="h-full bg-cyan-400 transition-[width] duration-500" style={{ width: `${Math.round(result.confidence * 100)}%` }} />
              </div>
              <div className="mt-1 text-sm tabular-nums text-ink-600">{Math.round(result.confidence * 100)}%</div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Simulator({ from, to, riders }: { from: string | null; to: string | null; riders: string | null }) {
  const { derived } = usePageData();
  const lastScenario = useOpsStore((s) => s.lastScenario);
  const setLastScenario = useOpsStore((s) => s.setLastScenario);
  const logAction = useOpsStore((s) => s.logAction);
  const cities = derived.cities;
  const [kind, setKind] = useState<"riders" | "hub" | "corridor">("riders");
  const [fromCity, setFromCity] = useState(from ?? lastScenario?.fromHub ?? cities[1] ?? "");
  const [toCity, setToCity] = useState(to ?? lastScenario?.toHub ?? cities[0] ?? "");
  const [n, setN] = useState(Number(riders ?? lastScenario?.riders ?? 3));
  const [hubId, setHubId] = useState(derived.hubs[0]?.id ?? "");
  const [extra, setExtra] = useState(25);
  const [routeId, setRouteId] = useState(derived.routes[0]?.id ?? "");
  const [hours, setHours] = useState(3);
  const [result, setResult] = useState<ScenarioResult | null>(null);

  const run = () => {
    let r: ScenarioResult;
    if (kind === "riders") {
      r = simulateRiderMove(derived, fromCity, toCity, n);
      setLastScenario({ fromHub: fromCity, toHub: toCity, riders: n });
    } else if (kind === "hub") {
      const hub = derived.hubsById.get(hubId);
      if (!hub) return;
      r = simulateHubCapacity(derived, hub, extra);
    } else {
      r = simulateCorridorHold(derived, routeId, hours);
    }
    setResult(r);
    logAction({ action: "Ran simulation", target: r.title, detail: r.summary.slice(0, 80), scope: "local" });
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[360px_1fr]">
      <Card className="p-4">
        <Tabs value={kind} onChange={setKind} className="mb-3" tabs={[{ key: "riders", label: "Move riders" }, { key: "hub", label: "Add capacity" }, { key: "corridor", label: "Hold corridor" }]} />
        {kind === "riders" && (
          <div className="space-y-2 text-xs">
            <label className="block">
              <div className="mb-1 text-ink-600">From city</div>
              <Select value={fromCity} onChange={(e) => setFromCity(e.target.value)}>
                {cities.map((c) => (
                  <option key={c} value={c}>{c} · {derived.riders.filter((r) => r.city === c).length} riders</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <div className="mb-1 text-ink-600">To city</div>
              <Select value={toCity} onChange={(e) => setToCity(e.target.value)}>
                {cities.map((c) => (
                  <option key={c} value={c}>{c} · {derived.shipments.filter((s) => s.isActive && s.city === c && (s.sla === "at_risk" || s.sla === "breached")).length} at risk</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <div className="mb-1 text-ink-600">Riders to move: {n}</div>
              <input type="range" min={1} max={10} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full accent-violet-400" />
            </label>
          </div>
        )}
        {kind === "hub" && (
          <div className="space-y-2 text-xs">
            <label className="block">
              <div className="mb-1 text-ink-600">Hub</div>
              <Select value={hubId} onChange={(e) => setHubId(e.target.value)}>
                {[...derived.hubs].sort((a, b) => b.utilization - a.utilization).map((h) => (
                  <option key={h.id} value={h.id}>{h.name} · {Math.round(h.utilization * 100)}%</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <div className="mb-1 text-ink-600">Temporary capacity: +{extra}%</div>
              <input type="range" min={5} max={100} step={5} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="w-full accent-violet-400" />
            </label>
          </div>
        )}
        {kind === "corridor" && (
          <div className="space-y-2 text-xs">
            <label className="block">
              <div className="mb-1 text-ink-600">Corridor</div>
              <Select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                {[...derived.routes].sort((a, b) => b.congestion_level - a.congestion_level).map((r) => (
                  <option key={r.id} value={r.id}>
                    {derived.nodesById.get(r.source_node_id)?.city} → {derived.nodesById.get(r.destination_node_id)?.city} · {Math.round(r.congestion_level * 100)}%
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <div className="mb-1 text-ink-600">Hold for {hours}h</div>
              <input type="range" min={1} max={12} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full accent-violet-400" />
            </label>
          </div>
        )}
        <Button variant="ai" className="mt-3 w-full" onClick={run}>
          <Sparkles className="h-3.5 w-3.5" /> Run simulation
        </Button>
      </Card>
      <Card className="p-4">
        {!result ? (
          <div className="flex h-48 items-center justify-center text-center text-xs text-ink-500">Configure a scenario and run it. Results show current state, simulated state, the difference, SLA impact and cost.</div>
        ) : (
          <div>
            <div className="text-sm font-semibold text-ink-900">{result.title}</div>
            <p className={clsx("mt-1 text-sm", result.slaImpactPp >= 0 ? "text-emerald-300" : "text-rose-300")}>{result.summary}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <ScenarioColumn title="Current state" rows={result.current} />
              <ScenarioColumn title="Simulated state" rows={result.simulated} />
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Difference</div>
                <div className="space-y-1">
                  {result.difference.map((d) => (
                    <div key={d.label} className="flex justify-between rounded border border-nv-800 bg-nv-950/40 px-2 py-1 text-xs">
                      <span className="text-ink-600">{d.label}</span>
                      <span className={clsx("tabular-nums", d.tone === "good" ? "text-emerald-300" : d.tone === "warning" ? "text-amber-300" : d.tone === "danger" ? "text-rose-300" : "text-ink-900")}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-ink-500">Model: {result.method}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-ink-600">{label}</div>
      {children}
    </label>
  );
}

function ScenarioColumn({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between rounded border border-nv-800 bg-nv-950/40 px-2 py-1 text-xs">
            <span className="text-ink-600">{r.label}</span>
            <span className="tabular-nums text-ink-900">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
