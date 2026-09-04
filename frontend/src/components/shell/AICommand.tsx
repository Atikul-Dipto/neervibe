"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

/** The top-bar AI command line. Questions are answered on the AI page,
 * which keeps one implementation of the query engine. */
export function AICommand() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const text = q.trim();
        if (!text) return;
        router.push(`/ai?q=${encodeURIComponent(text)}`);
        setQ("");
      }}
      className="relative hidden w-full max-w-xs lg:block"
    >
      <Sparkles className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-violet-400" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask: why did SLA fall today?"
        aria-label="Ask the AI copilot"
        className="w-full rounded-md border border-violet-500/30 bg-violet-500/5 py-1.5 pl-8 pr-3 text-sm text-ink-900 placeholder:text-ink-500 transition-colors hover:border-violet-500/50 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/30"
      />
    </form>
  );
}
