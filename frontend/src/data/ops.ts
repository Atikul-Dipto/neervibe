"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RoleKey } from "@/config/roles";

/**
 * Operator-side state that has no backend home yet: the exception
 * workflow (assign / escalate / resolve / snooze / notes), saved filter
 * views, the session role, and an audit log of every action taken in the
 * portal. Persisted per browser via localStorage so it survives reloads;
 * moving it server-side is a matter of replacing the persistence layer.
 */
export type ExceptionStatus = "open" | "assigned" | "escalated" | "resolved" | "snoozed";

export interface ExceptionNote {
  at: string;
  by: string;
  text: string;
}

export interface ExceptionWorkflow {
  status: ExceptionStatus;
  assignee: string | null;
  snoozedUntil: string | null;
  notes: ExceptionNote[];
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  role: RoleKey;
  action: string;
  target: string;
  detail?: string;
  /** "api" when the backend was changed, "local" when only this portal's state changed. */
  scope: "api" | "local";
}

export interface SavedView {
  id: string;
  name: string;
  route: string;
  params: string;
  createdAt: string;
}

interface OpsState {
  role: RoleKey;
  userName: string;
  exceptions: Record<string, ExceptionWorkflow>;
  audit: AuditEntry[];
  savedViews: SavedView[];
  notificationsSeenAt: string | null;
  sidebarExpanded: boolean;
  /** Dispatch simulation scenarios remembered between visits. */
  lastScenario: { fromHub: string; toHub: string; riders: number } | null;

  setRole: (role: RoleKey) => void;
  setUserName: (name: string) => void;
  setSidebarExpanded: (expanded: boolean) => void;
  markNotificationsSeen: () => void;
  updateException: (id: string, patch: Partial<Omit<ExceptionWorkflow, "notes">>, actionLabel: string, target: string) => void;
  addExceptionNote: (id: string, text: string) => void;
  logAction: (entry: Omit<AuditEntry, "id" | "at" | "actor" | "role">) => void;
  saveView: (name: string, route: string, params: string) => void;
  deleteView: (id: string) => void;
  setLastScenario: (s: OpsState["lastScenario"]) => void;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const useOpsStore = create<OpsState>()(
  persist(
    (set, get) => ({
      role: "super_admin",
      userName: "Operator",
      exceptions: {},
      audit: [],
      savedViews: [],
      notificationsSeenAt: null,
      sidebarExpanded: false,
      lastScenario: null,

      setRole: (role) => {
        set({ role });
        get().logAction({ action: "Switched session role", target: role, scope: "local" });
      },
      setUserName: (userName) => set({ userName }),
      setSidebarExpanded: (sidebarExpanded) => set({ sidebarExpanded }),
      markNotificationsSeen: () => set({ notificationsSeenAt: new Date().toISOString() }),

      updateException: (id, patch, actionLabel, target) => {
        const now = new Date().toISOString();
        set((s) => {
          const prev = s.exceptions[id] ?? { status: "open", assignee: null, snoozedUntil: null, notes: [], updatedAt: now };
          return { exceptions: { ...s.exceptions, [id]: { ...prev, ...patch, updatedAt: now } } };
        });
        get().logAction({ action: actionLabel, target, scope: "local" });
      },

      addExceptionNote: (id, text) => {
        const now = new Date().toISOString();
        set((s) => {
          const prev = s.exceptions[id] ?? { status: "open", assignee: null, snoozedUntil: null, notes: [], updatedAt: now };
          return {
            exceptions: {
              ...s.exceptions,
              [id]: { ...prev, notes: [...prev.notes, { at: now, by: s.userName, text }], updatedAt: now },
            },
          };
        });
        get().logAction({ action: "Added note", target: id, detail: text.slice(0, 80), scope: "local" });
      },

      logAction: (entry) =>
        set((s) => ({
          audit: [
            { id: uid(), at: new Date().toISOString(), actor: s.userName, role: s.role, ...entry },
            ...s.audit,
          ].slice(0, 500),
        })),

      saveView: (name, route, params) =>
        set((s) => ({
          savedViews: [{ id: uid(), name, route, params, createdAt: new Date().toISOString() }, ...s.savedViews].slice(0, 50),
        })),
      deleteView: (id) => set((s) => ({ savedViews: s.savedViews.filter((v) => v.id !== id) })),
      setLastScenario: (lastScenario) => set({ lastScenario }),
    }),
    { name: "neervibe-ops", version: 1 },
  ),
);
