"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/services/api";
import { useControlTowerStore } from "@/store/useControlTowerStore";
import { NODE_TYPE_COLORS } from "@/components/map/nodeStyle";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
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

  const columns: TableColumn<LogisticsNode>[] = [
    { header: "Code", cell: (n) => <span className="font-mono text-zinc-200">{n.node_code}</span> },
    { header: "Name", cell: (n) => <span className="text-zinc-300">{n.node_name}</span> },
    {
      header: "Type",
      cell: (n) => (
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: NODE_TYPE_COLORS[n.node_type] }} />
          {n.node_type.replaceAll("_", " ")}
        </span>
      ),
    },
    { header: "City", cell: (n) => <span className="text-zinc-400">{n.city}</span> },
    { header: "Capacity", cell: (n) => <span className="tabular-nums text-zinc-400">{n.capacity.toLocaleString()}</span> },
    {
      header: "Status",
      cell: (n) => (
        <StatusPill tone={n.operating_status === "OPERATIONAL" ? "good" : "warning"}>
          {n.operating_status}
        </StatusPill>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-100">Hubs &amp; Nodes</h1>
        <Select value={nodeType} onChange={(e) => setNodeType(e.target.value as NodeType | "")} className="w-56">
          <option value="">All types</option>
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </div>

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState message={error} />}

      {!loading && !error && (
        <Table
          columns={columns}
          rows={nodes}
          rowKey={(n) => n.id}
          onRowClick={(n) => selectNode(n)}
          emptyMessage="No nodes match this filter."
        />
      )}
    </div>
  );
}
