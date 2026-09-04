"use client";

import { create } from "zustand";

/**
 * The right-side contextual drawer. Any page can open any entity; the
 * drawer keeps a small history so drilling from a hub to one of its
 * shipments to that shipment's rider can be walked back.
 */
export type DrawerKind = "shipment" | "hub" | "node" | "rider" | "vehicle" | "merchant" | "exception" | "route" | "region" | "customer";

export interface DrawerItem {
  kind: DrawerKind;
  id: string;
}

interface DrawerState {
  item: DrawerItem | null;
  history: DrawerItem[];
  open: (kind: DrawerKind, id: string) => void;
  close: () => void;
  back: () => void;
}

export const useDrawerStore = create<DrawerState>((set) => ({
  item: null,
  history: [],
  open: (kind, id) =>
    set((s) => {
      if (s.item?.kind === kind && s.item.id === id) return {};
      return { item: { kind, id }, history: s.item ? [...s.history, s.item].slice(-10) : s.history };
    }),
  close: () => set({ item: null, history: [] }),
  back: () =>
    set((s) => {
      const prev = s.history[s.history.length - 1] ?? null;
      return { item: prev, history: s.history.slice(0, -1) };
    }),
}));
