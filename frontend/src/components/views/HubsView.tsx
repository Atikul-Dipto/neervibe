"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { NODE_TYPE_COLORS } from "@/components/map/nodeStyle";
import type { LogisticsNode, NodeType } from "@/types/domain";

const NODE_TYPES = Object.keys(NODE_TYPE_COLORS) as NodeType[];

export function HubsView() {
  const [nodeType, setNodeType] = useState<NodeType | "">("");
  const [nodes, setNodes] = useState<LogisticsNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectNode = useControlTowerStore((s) => s.selectNode);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listNodes({ node_type: nodeType || undefined })
      .then(setNodes)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load nodes"))
      .finally(() => setLoading(false));
  }, [nodeType]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Hubs &amp; Nodes</h1>
        <select
          value={nodeType}
          onChange={(e) => setNodeType(e.target.value as NodeType | "")}
          className="rounded-md border border-nv-700 bg-nv-900 px-3 py-1.5 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
        >
          <option value="">All types</option>
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading nodes…</div>}
      {error && <div className="text-sm text-rose-400">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-nv-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-nv-900 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">City</th>
                <th className="px-4 py-2.5">Capacity</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nv-800">
              {nodes.map((n) => (
                <tr
                  key={n.id}
                  onClick={() => selectNode(n)}
                  className="cursor-pointer transition-colors hover:bg-nv-900/60"
                >
                  <td className="px-4 py-2.5 font-mono text-slate-200">{n.node_code}</td>
                  <td className="px-4 py-2.5 text-slate-300">{n.node_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: NODE_TYPE_COLORS[n.node_type] }}
                      />
                      {n.node_type.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{n.city}</td>
                  <td className="px-4 py-2.5 text-slate-400">{n.capacity.toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        n.operating_status === "OPERATIONAL"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {n.operating_status}
                    </span>
                  </td>
                </tr>
              ))}
              {nodes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No nodes match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
