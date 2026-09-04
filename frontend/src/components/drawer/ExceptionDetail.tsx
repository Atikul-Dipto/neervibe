"use client";

import { useState } from "react";
import { useDerived } from "@/data/provider";
import { useOpsStore, type ExceptionStatus } from "@/data/ops";
import { ROLE_BY_KEY } from "@/config/roles";
import { EXCEPTION_TYPE_LABELS } from "@/data/derive";
import { formatDateTime, formatRelative, humanize } from "@/data/format";
import { StatusPill, priorityTone } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DrawerSection, EntityLink, NotFound } from "./shared";
import type { DrawerKind } from "@/data/drawer";

const KIND_FOR_ENTITY: Record<string, DrawerKind> = { shipment: "shipment", hub: "hub", rider: "rider", vehicle: "vehicle", route: "route", merchant: "merchant" };

export const EXCEPTION_STATUS_TONE: Record<ExceptionStatus, "neutral" | "info" | "warning" | "good" | "accent"> = {
  open: "neutral",
  assigned: "info",
  escalated: "warning",
  resolved: "good",
  snoozed: "accent",
};

export function ExceptionDetail({ id }: { id: string }) {
  const derived = useDerived();
  const role = useOpsStore((s) => s.role);
  const userName = useOpsStore((s) => s.userName);
  const workflow = useOpsStore((s) => s.exceptions[id]);
  const update = useOpsStore((s) => s.updateException);
  const addNote = useOpsStore((s) => s.addExceptionNote);
  const [note, setNote] = useState("");
  const e = derived.exceptions.find((x) => x.id === id);
  if (!e) return <NotFound what="exception" />;
  const canAct = ROLE_BY_KEY[role].canAct;
  const status = workflow?.status ?? "open";
  const target = e.entity.label;

  return (
    <div>
      <div className="border-b border-nv-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone={priorityTone(e.priority)} withDot>
            {e.priority}
          </StatusPill>
          <StatusPill tone="neutral">{EXCEPTION_TYPE_LABELS[e.type]}</StatusPill>
          <StatusPill tone={EXCEPTION_STATUS_TONE[status]}>{humanize(status)}</StatusPill>
        </div>
        <h3 className="mt-2 text-sm font-semibold text-ink-900">{e.title}</h3>
        <p className="mt-1 text-xs text-ink-700">{e.detail}</p>
        <div className="mt-2 text-[11px] text-ink-500">
          Detected {formatRelative(new Date(e.detectedAt))} · {e.city ?? "Network-wide"}
          {workflow?.assignee && <> · assigned to {workflow.assignee}</>}
          {workflow?.snoozedUntil && <> · snoozed until {formatDateTime(workflow.snoozedUntil)}</>}
        </div>
      </div>

      <DrawerSection title="Related">
        <div className="text-xs">
          {KIND_FOR_ENTITY[e.entity.kind] ? (
            <EntityLink kind={KIND_FOR_ENTITY[e.entity.kind]} id={e.entity.id}>
              {humanize(e.entity.kind)} · {e.entity.label}
            </EntityLink>
          ) : (
            <span className="text-ink-700">{e.entity.label}</span>
          )}
          {e.hubId && derived.hubsById.get(e.hubId) && e.entity.kind !== "hub" && (
            <div className="mt-1">
              <EntityLink kind="hub" id={e.hubId}>Hub · {derived.hubsById.get(e.hubId)!.name}</EntityLink>
            </div>
          )}
          {e.riderId && derived.ridersById.get(e.riderId) && e.entity.kind !== "rider" && (
            <div className="mt-1">
              <EntityLink kind="rider" id={e.riderId}>Rider · {derived.ridersById.get(e.riderId)!.name}</EntityLink>
            </div>
          )}
        </div>
      </DrawerSection>

      <DrawerSection title="Recommended action">
        <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-2.5 text-xs text-ink-900">{e.recommendation}</div>
      </DrawerSection>

      <DrawerSection title="Workflow">
        {!canAct ? (
          <div className="text-xs text-ink-500">Your role can view exceptions but not work them.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => update(id, { status: "assigned", assignee: userName }, "Took ownership of exception", target)} disabled={status === "resolved"}>
              Assign to me
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                const who = window.prompt("Assign to (name)", workflow?.assignee ?? "");
                if (who) update(id, { status: "assigned", assignee: who }, `Assigned exception to ${who}`, target);
              }}
              disabled={status === "resolved"}
            >
              Reassign
            </Button>
            <Button size="xs" variant="secondary" onClick={() => update(id, { status: "escalated" }, "Escalated exception", target)} disabled={status === "resolved" || status === "escalated"}>
              Escalate
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => update(id, { status: "snoozed", snoozedUntil: new Date(Date.now() + 4 * 3600e3).toISOString() }, "Snoozed exception 4h", target)}
              disabled={status === "resolved"}
            >
              Snooze 4h
            </Button>
            <Button size="xs" onClick={() => update(id, { status: "resolved" }, "Resolved exception", target)} disabled={status === "resolved"}>
              Resolve
            </Button>
            {status === "resolved" && (
              <Button size="xs" variant="ghost" onClick={() => update(id, { status: "open" }, "Reopened exception", target)}>
                Reopen
              </Button>
            )}
          </div>
        )}
        <p className="mt-2 text-[10px] text-ink-500">Workflow state is kept in this portal and audited; the underlying condition clears automatically when the data no longer shows it.</p>
      </DrawerSection>

      <DrawerSection title={`Notes · ${workflow?.notes.length ?? 0}`}>
        {workflow?.notes.length ? (
          <ul className="mb-2 space-y-1.5">
            {[...workflow.notes].reverse().map((n, i) => (
              <li key={i} className="rounded border border-nv-800 bg-nv-950/40 px-2.5 py-1.5 text-xs">
                <div className="text-ink-900">{n.text}</div>
                <div className="text-[10px] text-ink-500">
                  {n.by} · {formatDateTime(n.at)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mb-2 text-xs text-ink-500">No notes yet.</div>
        )}
        {canAct && (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!note.trim()) return;
              addNote(id, note.trim());
              setNote("");
            }}
            className="flex gap-1.5"
          >
            <Input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Add a note…" aria-label="Note" />
            <Button size="sm" type="submit" disabled={!note.trim()}>
              Add
            </Button>
          </form>
        )}
      </DrawerSection>
    </div>
  );
}
