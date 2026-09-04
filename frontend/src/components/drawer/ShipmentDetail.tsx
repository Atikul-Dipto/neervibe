"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { useDerived } from "@/data/provider";
import { useOpsStore } from "@/data/ops";
import { ROLE_BY_KEY } from "@/config/roles";
import { api } from "@/services/api";
import { PACKAGE_TRANSITIONS, RIDER_TRANSITIONS, TRANSITION_LABELS, errorMessage, transitionShipment } from "@/data/actions";
import { SLA_LABELS } from "@/data/derive";
import { formatBDT, formatDateTime, formatMinutes, formatRelative, humanize } from "@/data/format";
import { recommendForShipment } from "@/ai/recommend";
import { StatusPill, packageStatusTone, slaTone } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Progress } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/States";
import { DrawerSection, EntityLink, KV, NotFound, RecommendationCard } from "./shared";
import type { PackageStatus, PackageTracking } from "@/types/domain";

export function ShipmentDetail({ id }: { id: string }) {
  const derived = useDerived();
  const router = useRouter();
  const role = useOpsStore((s) => s.role);
  const canAct = ROLE_BY_KEY[role].canAct;
  const s = derived.shipmentsById.get(id);
  const [tracking, setTracking] = useState<PackageTracking | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<PackageStatus | "">("");
  const [riderId, setRiderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const trackingNumber = s?.trackingNumber;
  useEffect(() => {
    if (!trackingNumber) return;
    let cancelled = false;
    api
      .trackPackage(trackingNumber)
      .then((t) => {
        if (!cancelled) setTracking(t);
      })
      .catch((err) => {
        if (!cancelled) setTrackingError(errorMessage(err, "Could not load the full timeline"));
      });
    return () => {
      cancelled = true;
    };
  }, [trackingNumber, s?.updatedAt]);

  const rec = useMemo(() => (s ? recommendForShipment(s) : null), [s]);
  const ridersInCity = useMemo(() => (s ? derived.riders.filter((r) => r.city === s.city) : []), [derived.riders, s]);

  if (!s) return <NotFound what="shipment" />;

  const transitions = PACKAGE_TRANSITIONS[s.status];
  const needsRider = pendingStatus ? RIDER_TRANSITIONS.has(pendingStatus) : false;
  const timeline = tracking?.timeline ?? s.events.map((e) => ({ event_type: e.event_type, node_id: e.node_id, previous_status: e.previous_status, new_status: e.new_status, latitude: e.latitude, longitude: e.longitude, timestamp: e.timestamp }));

  const act = async () => {
    if (!pendingStatus) return;
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await transitionShipment(s.pkg, pendingStatus, { riderId: needsRider ? riderId || undefined : undefined, nodeId: s.pkg.current_node_id ?? undefined });
      setActionOk(`${TRANSITION_LABELS[pendingStatus] ?? pendingStatus} applied.`);
      setPendingStatus("");
      setRiderId("");
    } catch (err) {
      setActionError(errorMessage(err, "The API rejected this change"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="border-b border-nv-800 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-sm font-semibold text-ink-900">{s.trackingNumber}</div>
            <div className="text-[11px] text-ink-500">Order {s.order?.order_number ?? s.pkg.order_id.slice(0, 8)} · created {formatRelative(new Date(s.createdAt))}</div>
          </div>
          <button
            onClick={() => router.push("/control-tower")}
            className="flex items-center gap-1 rounded border border-nv-700 px-2 py-1 text-[11px] text-ink-700 hover:bg-nv-850"
            title="Show this shipment's path on the map"
          >
            <MapPin className="h-3 w-3" /> Map
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusPill tone={packageStatusTone(s.status)} withDot>
            {humanize(s.status)}
          </StatusPill>
          {s.sla !== "n_a" && <StatusPill tone={slaTone(s.sla)}>SLA {SLA_LABELS[s.sla]}</StatusPill>}
          <StatusPill tone={s.pkg.priority === "URGENT" ? "danger" : s.pkg.priority === "HIGH" ? "warning" : "neutral"}>{humanize(s.pkg.priority)}</StatusPill>
          {s.isCod && <StatusPill tone="info">COD {formatBDT(s.codAmount)}</StatusPill>}
        </div>
        {s.isActive && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-500">
              <span>Risk score</span>
              <span className="tabular-nums text-ink-700">{s.riskScore}/100</span>
            </div>
            <Progress value={s.riskScore / 100} tone={s.riskScore >= 70 ? "danger" : s.riskScore >= 40 ? "warning" : "good"} label="Risk score" />
          </div>
        )}
      </div>

      <DrawerSection title="ETA & SLA">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-semibold tabular-nums text-ink-900">
              {s.status === "DELIVERED"
                ? formatDateTime(s.pkg.actual_delivery_at)
                : s.hoursToSla == null
                  ? "—"
                  : s.hoursToSla < 0
                    ? `${formatMinutes(-s.hoursToSla * 60)} late`
                    : formatMinutes(s.hoursToSla * 60)}
            </div>
            <div className="text-[11px] text-ink-500">{s.status === "DELIVERED" ? "Delivered" : s.hoursToSla != null && s.hoursToSla < 0 ? "Past promised time" : "Until promised delivery"}</div>
          </div>
          <div className="text-right text-[11px] text-ink-500">
            <div>Promised {formatDateTime(s.pkg.expected_delivery_at)}</div>
            <div>Service {humanize(s.pkg.delivery_type)}</div>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Route">
        <ol className="space-y-1.5 text-xs">
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {s.origin ? <EntityLink kind={s.origin.node_type === "CUSTOMER" || s.origin.node_type === "MERCHANT" ? "node" : "hub"} id={s.origin.id}>{s.origin.node_name}</EntityLink> : "—"}
            <span className="text-ink-500">origin</span>
          </li>
          {s.currentNode && s.currentNode.id !== s.destination?.id && (
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              <EntityLink kind="hub" id={s.currentNode.id}>{s.currentNode.node_name}</EntityLink>
              <span className="text-ink-500">current</span>
            </li>
          )}
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            {s.destination ? <EntityLink kind="node" id={s.destination.id}>{s.destination.node_name}</EntityLink> : "—"}
            <span className="text-ink-500">destination · {s.city}</span>
          </li>
        </ol>
        <KV
          items={[
            { k: "Distance", v: `${s.distanceKm.toFixed(0)} km` },
            { k: "Zone", v: s.district ? `${s.district}${s.division ? ` · ${s.division}` : ""}` : s.city },
            { k: "Vehicle", v: s.vehicle ? <EntityLink kind="vehicle" id={s.vehicle.id}>{s.vehicle.registration_number}</EntityLink> : "—" },
            { k: "Rider", v: s.rider ? <EntityLink kind="rider" id={s.rider.id}>{s.rider.name}</EntityLink> : "Unassigned" },
          ]}
        />
      </DrawerSection>

      <DrawerSection title="AI explanation">
        <RecommendationCard rec={rec} />
      </DrawerSection>

      <DrawerSection title="Parties & payment">
        <KV
          items={[
            { k: "Merchant", v: <EntityLink kind="merchant" id={s.pkg.merchant_id}>{s.merchantName}</EntityLink> },
            { k: "Customer", v: s.customerName },
            { k: "Phone", v: s.customer?.phone ?? "—" },
            { k: "Address", v: s.customer?.address ?? s.destination?.address ?? "—" },
            { k: "Payment", v: s.isCod ? `COD · ${formatBDT(s.codAmount)}` : "Prepaid" },
            { k: "Declared value", v: formatBDT(s.pkg.declared_value) },
            { k: "Order value", v: formatBDT(s.order?.order_value) },
            { k: "Delivery fee", v: `${formatBDT(s.fee)} (modelled)` },
            { k: "Package", v: `${humanize(s.pkg.package_type)} · ${s.pkg.package_weight.toFixed(1)} kg` },
            { k: "Settlement", v: s.isCod ? (s.status === "DELIVERED" ? "Collected, settles T+3" : "Not yet collected") : "n/a" },
          ]}
        />
      </DrawerSection>

      <DrawerSection title={`Proof of delivery · ${s.attempts.length} attempt${s.attempts.length === 1 ? "" : "s"}`}>
        {s.attempts.length === 0 ? (
          <div className="text-xs text-ink-500">No doorstep attempt recorded yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {s.attempts.map((a) => (
              <li key={a.id} className="rounded border border-nv-800 bg-nv-950/40 px-2.5 py-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-900">
                    Attempt {a.attempt_number} · <StatusPill tone={a.result === "SUCCESS" ? "good" : "danger"} size="xs">{humanize(a.result)}</StatusPill>
                  </span>
                  <span className="text-[11px] text-ink-500">{formatDateTime(a.attempted_at)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-500">
                  {a.notes ?? ""}
                  {a.rider_id && derived.ridersById.get(a.rider_id) && <> · by {derived.ridersById.get(a.rider_id)!.name}</>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>

      <DrawerSection title="Event timeline" right={trackingError ? <span className="text-[10px] text-amber-300">partial</span> : null}>
        {timeline.length === 0 ? (
          <div className="text-xs text-ink-500">No events yet.</div>
        ) : (
          <ol className="space-y-0">
            {[...timeline].reverse().map((step, i) => (
              <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
                <div className="flex w-2.5 shrink-0 flex-col items-center">
                  <span className={i === 0 ? "z-10 h-2.5 w-2.5 animate-[pulse-ring_1.6s_ease-out_infinite] rounded-full bg-cyan-400 text-cyan-400" : "z-10 h-2.5 w-2.5 rounded-full bg-ink-400"} />
                  {i < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-nv-700" />}
                </div>
                <div className="min-w-0">
                  <div className={i === 0 ? "text-xs font-semibold text-ink-900" : "text-xs text-ink-700"}>{humanize(step.new_status ?? step.event_type)}</div>
                  <div className="text-[11px] text-ink-500">
                    {formatDateTime(step.timestamp)}
                    {step.node_id && derived.nodesById.get(step.node_id) && <> · {derived.nodesById.get(step.node_id)!.node_name}</>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </DrawerSection>

      <DrawerSection title="Actions">
        {!canAct ? (
          <div className="text-xs text-ink-500">Your role can view shipments but not change them.</div>
        ) : transitions.length === 0 ? (
          <div className="text-xs text-ink-500">This shipment is in a terminal state.</div>
        ) : (
          <div className="space-y-2">
            <Select value={pendingStatus} onChange={(e) => setPendingStatus(e.target.value as PackageStatus | "")} aria-label="Next status">
              <option value="">Choose an action…</option>
              {transitions.map((t) => (
                <option key={t} value={t}>
                  {TRANSITION_LABELS[t] ?? humanize(t)}
                </option>
              ))}
            </Select>
            {needsRider && (
              <Select value={riderId} onChange={(e) => setRiderId(e.target.value)} aria-label="Rider">
                <option value="">Any available rider (auto)</option>
                {ridersInCity.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.active.length} active · {humanize(r.rider.status)}
                  </option>
                ))}
              </Select>
            )}
            <Button size="sm" className="w-full" disabled={!pendingStatus || busy} onClick={act}>
              {busy ? "Applying…" : pendingStatus ? TRANSITION_LABELS[pendingStatus] ?? "Apply" : "Apply"}
            </Button>
            {actionError && <ErrorState message={actionError} />}
            {actionOk && <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200">{actionOk}</div>}
            <p className="text-[10px] text-ink-500">Applied through the backend state machine and recorded in the audit log.</p>
          </div>
        )}
      </DrawerSection>
    </div>
  );
}
