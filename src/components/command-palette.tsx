"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { availableTools } from "@/convert/registry";
import { Dialog, Kbd } from "@/components/ui";
import { ToolIcon } from "@/components/tool-icon";
import { tileColor } from "@/components/colors";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableTools.slice(0, 8);
    return availableTools.filter((tool) => [tool.label, tool.hint, tool.id, tool.from, tool.to].join(" ").toLowerCase().includes(q)).slice(0, 12);
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setQuery(""); setOpen(true); }}
        aria-label="Search tools"
        className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-2.5 text-sm text-muted transition hover:border-brand/50 hover:text-ink sm:px-3"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Search</span>
        <Kbd>⌘K</Kbd>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Jump to a tool">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools or formats…"
            aria-label="Jump to a tool"
            className="h-12 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-3 outline-none focus:border-brand"
          />
        </div>
        <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
          {results.map((tool) => (
            <li key={tool.id}>
              <Link
                href={`/convert/${tool.id}`}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm transition hover:bg-surface-2"
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", tileColor[tool.color])}>
                  <ToolIcon name={tool.icon} className="h-4 w-4" />
                </span>
                <span className="flex-1 font-medium">{tool.label}</span>
                <span className="text-xs text-subtle">{tool.from} → {tool.to}</span>
              </Link>
            </li>
          ))}
          {!results.length && <li className="px-2 py-4 text-sm text-muted">No tool matches that search.</li>}
        </ul>
      </Dialog>
    </>
  );
}
