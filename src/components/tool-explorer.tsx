"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { availableTools, categoryMeta, type Tool } from "@/convert/registry";
import { groupOf, type ToolGroup } from "@/convert/types";
import { ToolIcon } from "@/components/tool-icon";
import { tileColor } from "@/components/colors";
import { cn } from "@/lib/utils";

const tabs: { id: ToolGroup | "all"; label: string }[] = [
  { id: "all", label: "All tools" },
  { id: "from-pdf", label: "Convert from PDF" },
  { id: "to-pdf", label: "Convert to PDF" },
  { id: "other", label: "Other formats" },
];

export function ToolExplorer() {
  const [tab, setTab] = useState<ToolGroup | "all">("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableTools.filter((tool) => {
      if (tab !== "all" && groupOf(tool.from, tool.to) !== tab) return false;
      if (!q) return true;
      return [tool.label, tool.hint, tool.from, tool.to, tool.category, tool.id].join(" ").toLowerCase().includes(q);
    });
  }, [tab, query]);

  return (
    <section id="tools" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 sm:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl border border-black/5 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5" role="group" aria-label="Tool categories">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3.5 py-2 text-sm font-medium transition",
                tab === t.id
                  ? "bg-ink text-white shadow-sm dark:bg-white dark:text-black"
                  : "text-black/60 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35 dark:text-white/35" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
            aria-label="Search tools"
            className="h-11 w-full rounded-xl border border-black/10 bg-white pl-9 pr-9 text-sm shadow-sm outline-none transition placeholder:text-black/35 focus:border-brand/60 dark:border-white/10 dark:bg-white/5 dark:placeholder:text-white/35"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-black/10 px-1.5 py-0.5 text-[11px] text-black/40 sm:block dark:border-white/15 dark:text-white/40">
            /
          </kbd>
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm text-black/50 dark:text-white/50" aria-live="polite">
        {visible.length} {visible.length === 1 ? "tool" : "tools"}
        {query ? ` matching “${query}”` : ""}
      </p>

      {visible.length ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </ul>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-black/15 p-10 text-center dark:border-white/15">
          <p className="font-medium">No tool matches that search.</p>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            Try “pdf”, “video”, “excel”, or browse{" "}
            <button onClick={() => setTab("all")} className="font-medium text-brand underline">
              all tools
            </button>
            .
          </p>
        </div>
      )}
    </section>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <li>
      <Link
        href={`/convert/${tool.id}`}
        className="group flex h-full flex-col gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-brand/40"
      >
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tileColor[tool.color])}>
          <ToolIcon name={tool.icon} />
        </span>
        <span className="flex-1">
          <span className="flex items-center gap-2 text-[15px] font-semibold leading-snug">
            {tool.label}
          </span>
          <span className="mt-0.5 block text-xs text-black/50 dark:text-white/50">{tool.hint}</span>
        </span>
        <span className="text-[11px] font-medium text-black/60 dark:text-white/60">{categoryMeta[tool.category].label}</span>
      </Link>
    </li>
  );
}
