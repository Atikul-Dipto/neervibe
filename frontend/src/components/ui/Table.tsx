import type { ReactNode } from "react";
import { EmptyState } from "./States";

export interface TableColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = "No rows match this filter.",
}: {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-nv-800">
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-nv-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-nv-900 text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            {columns.map((col) => (
              <th key={col.header} className="px-4 py-2.5 font-medium">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-nv-800">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer transition-colors hover:bg-nv-850/60" : undefined}
            >
              {columns.map((col) => (
                <td key={col.header} className={`px-4 py-2.5 ${col.className ?? ""}`}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
