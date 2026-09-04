"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "neervibe-theme";

/**
 * Applied by an inline script in the document head before first paint, so the
 * page never flashes the wrong theme. Kept as a string here because it is
 * injected verbatim and must not depend on any bundle having loaded.
 */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="light"&&t!=="dark"){t="light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

const listeners = new Set<() => void>();
let current: Theme = "light";

function read(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function emit() {
  for (const l of listeners) l();
}

export function setTheme(theme: Theme) {
  current = theme;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing: the theme still applies for this session.
  }
  emit();
}

export function toggleTheme() {
  setTheme(read() === "dark" ? "light" : "dark");
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * The active theme. Anything that paints with a literal colour rather than a
 * CSS class — the map, SVG charts — reads this so it repaints on a switch.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => {
      // The bootstrap script has already stamped the element; trust it.
      current = read();
      return current;
    },
    () => "light" as Theme,
  );
}

/**
 * Resolve theme CSS variables to concrete colour strings, for canvas/SVG
 * consumers that cannot use `var()`. Reads live computed styles, so it always
 * matches whatever the stylesheet says.
 */
export function cssVar(name: string, fallback = "#000000"): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
