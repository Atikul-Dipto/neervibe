"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download } from "lucide-react";
import clsx from "clsx";
import { Button } from "./Button";
import { NoResults } from "./States";
import { downloadText, toCsv } from "@/data/format";

export interface DataColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Value used for sorting and CSV export; defaults to the cell text. */
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: "left" | "right";
  className?: string;
  /** Hidden by default; still selectable from the column menu. */
  defaultHidden?: boolean;
  /** Cannot be hidden. */
  locked?: boolean;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Key of the row currently open in the detail drawer. */
  activeKey?: string | null;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (keys: Set<string>) => void;
  /** Rendered in the toolbar when rows are selected. */
  bulkActions?: (rows: T[]) => ReactNode;
  toolbar?: ReactNode;
  pageSize?: number;
  emptyWhat?: string;
  onClearFilters?: () => void;
  exportName?: string;
  dense?: boolean;
  initialSort?: { key: string; dir: "asc" | "desc" } | null;
  /** Row-level subtle highlight, e.g. exceptions. */
  rowClassName?: (row: T) => string | undefined;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  activeKey,
  selectable,
  selected,
  onSelectedChange,
  bulkActions,
  toolbar,
  pageSize: initialPageSize = 25,
  emptyWhat = "records",
  onClearFilters,
  exportName = "export",
  dense,
  initialSort = null,
  rowClassName,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
  const [colMenu, setColMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setColMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colMenu]);

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));
  const textOf = (col: DataColumn<T>, row: T): string | number | null | undefined => {
    if (col.value) return col.value(row);
    const cell = col.cell(row);
    return typeof cell === "string" || typeof cell === "number" ? cell : null;
  };

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = textOf(col, a);
      const vb = textOf(col, b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  const allOnPageSelected = selectable && pageRows.length > 0 && pageRows.every((r) => selected?.has(rowKey(r)));
  const toggleAll = () => {
    if (!onSelectedChange) return;
    const next = new Set(selected);
    if (allOnPageSelected) pageRows.forEach((r) => next.delete(rowKey(r)));
    else pageRows.forEach((r) => next.add(rowKey(r)));
    onSelectedChange(next);
  };
  const toggleOne = (key: string) => {
    if (!onSelectedChange) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange(next);
  };

  const exportCsv = () => {
    const cols = visibleColumns.map((c) => ({ key: c.key, header: c.header }));
    const data = sorted.map((r) => Object.fromEntries(visibleColumns.map((c) => [c.key, textOf(c, r) ?? ""])));
    downloadText(`${exportName}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data, cols as { key: string; header: string }[]));
  };

  const selectedRows = selectable && selected ? rows.filter((r) => selected.has(rowKey(r))) : [];
  const cellPad = dense ? "px-3 py-1.5" : "px-3 py-2";

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-nv-800 bg-nv-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-nv-800 px-3 py-2">
        <div className="text-[11px] text-ink-500">
          <span className="font-semibold tabular-nums text-ink-700">{rows.length.toLocaleString()}</span> {emptyWhat}
          {selectedRows.length > 0 && (
            <span className="ml-2 text-accent-700">· {selectedRows.length} selected</span>
          )}
        </div>
        {selectedRows.length > 0 && bulkActions && <div className="flex items-center gap-1.5">{bulkActions(selectedRows)}</div>}
        <div className="ml-auto flex items-center gap-1.5">
          {toolbar}
          <div className="relative" ref={menuRef}>
            <Button variant="ghost" size="xs" onClick={() => setColMenu((v) => !v)} title="Columns" aria-haspopup="menu" aria-expanded={colMenu}>
              <Columns3 className="h-3.5 w-3.5" aria-hidden />
              Columns
            </Button>
            {colMenu && (
              <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-nv-700 bg-nv-900 p-1.5 shadow-[var(--shadow-lg)]">
                {columns.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-ink-700 hover:bg-nv-850">
                    <input
                      type="checkbox"
                      className="accent-cyan-400"
                      checked={!hidden.has(c.key)}
                      disabled={c.locked}
                      onChange={() =>
                        setHidden((h) => {
                          const next = new Set(h);
                          if (next.has(c.key)) next.delete(c.key);
                          else next.add(c.key);
                          return next;
                        })
                      }
                    />
                    {c.header}
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button variant="ghost" size="xs" onClick={exportCsv} title="Export the current rows as CSV" disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <NoResults onClear={onClearFilters} what={emptyWhat} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-nv-950/50 text-[10px] uppercase tracking-wider text-ink-500">
              <tr>
                {selectable && (
                  <th className={clsx("w-8", cellPad)}>
                    <input type="checkbox" className="accent-cyan-400" checked={!!allOnPageSelected} onChange={toggleAll} aria-label="Select all on page" />
                  </th>
                )}
                {visibleColumns.map((col) => (
                  <th key={col.key} className={clsx("font-medium", cellPad, col.align === "right" && "text-right", col.className)} aria-sort={col.sortable === false ? undefined : sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    {col.sortable === false ? (
                      col.header
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={clsx("inline-flex items-center gap-1 hover:text-ink-900", sort?.key === col.key && "text-accent-700")}
                      >
                        {col.header}
                        {sort?.key === col.key ? (
                          sort.dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-nv-800">
              {pageRows.map((row) => {
                const key = rowKey(row);
                const isActive = activeKey === key;
                const isSelected = selected?.has(key);
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={clsx(
                      "transition-colors",
                      onRowClick && "cursor-pointer hover:bg-nv-850/70",
                      isActive && "bg-accent-100/40 shadow-[inset_2px_0_0_0_#22d3ee]",
                      isSelected && !isActive && "bg-nv-850/50",
                      rowClassName?.(row),
                    )}
                  >
                    {selectable && (
                      <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="accent-cyan-400" checked={!!isSelected} onChange={() => toggleOne(key)} aria-label="Select row" />
                      </td>
                    )}
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={clsx(cellPad, col.align === "right" && "text-right tabular-nums", col.className)}>
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-nv-800 px-3 py-1.5 text-[11px] text-ink-500">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="rounded border border-nv-700 bg-nv-950/60 px-1.5 py-0.5 text-[11px] text-ink-700"
              aria-label="Rows per page"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              {safePage * pageSize + 1}–{Math.min(sorted.length, (safePage + 1) * pageSize)} of {sorted.length.toLocaleString()}
            </span>
            <Button variant="ghost" size="xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="xs" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
