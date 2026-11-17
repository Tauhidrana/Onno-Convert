"use client";

import Link from "next/link";
import { ArrowRight, LockKeyhole, Search, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { availableTools, categoryMeta, type Tool } from "@/convert/registry";
import type { Category } from "@/convert/types";
import { ToolIcon } from "@/components/tool-icon";
import { tileColor } from "@/components/colors";
import { Button, EmptyState, Kbd, Tabs } from "@/components/ui";
import { cn } from "@/lib/utils";

type Filter = "all" | "voice" | Category;

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All tools" },
  { id: "pdf", label: "PDF" },
  { id: "workspace", label: "PDF Workspace" },
  { id: "image", label: "Image" },
  { id: "audio", label: "Audio" },
  { id: "video", label: "Video" },
  { id: "document", label: "Document" },
  { id: "data", label: "Data" },
  { id: "ebook", label: "Ebook" },
  { id: "voice", label: "Voice" },
];

const aliases: Record<string, string> = {
  jpeg: "jpg", excel: "xlsx", word: "docx", powerpoint: "pptx", subtitle: "srt",
};

function haystack(tool: Tool) {
  return [tool.label, tool.hint, tool.from, tool.to, tool.category, tool.id, aliases[tool.from] ?? "", aliases[tool.to] ?? ""]
    .join(" ")
    .toLowerCase();
}

function matches(tool: Tool, query: string) {
  const text = haystack(tool);
  return query.trim().toLowerCase().split(/\s+/).every((term) => {
    const t = aliases[term] ?? term;
    if (text.includes(t)) return true;
    if (t.length > 6) return false;
    let i = 0;
    for (const char of text) if (char === t[i]) i++;
    return i === t.length;
  });
}

function readList(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be disabled; the tools still work without history.
  }
}

const recentKey = "onno-recent-tools";
const favoriteKey = "onno-favorite-tools";

export function ToolExplorer() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [recent] = useState<string[]>(() => readList(recentKey));
  const [favorites, setFavorites] = useState<string[]>(() => readList(favoriteKey));
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) searchRef.current?.focus();
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

  const visible = useMemo(
    () => availableTools.filter((tool) => (filter === "all" || (filter === "voice" ? ["voice-recorder", "speech-to-text", "voice-cleaner"].includes(tool.id) : tool.category === filter)) && matches(tool, query)),
    [filter, query],
  );
  const byId = (id: string) => availableTools.find((tool) => tool.id === id);

  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    setFavorites(next);
    writeList(favoriteKey, next);
  }

  return (
    <main>
      <section className="relative overflow-hidden border-b border-line/70">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_-10%,var(--accent-soft)_0%,transparent_70%)]" />
        <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-12 text-center sm:px-6 sm:pt-16">
          <p className="mx-auto mb-4 w-fit rounded-full border border-brand/20 bg-surface px-3 py-1 text-xs font-medium text-[var(--accent-text)]">
            Private by design · nothing is uploaded
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Convert anything. <span className="text-brand">Privately.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted">
            PDF, images, spreadsheets, audio, video and ebooks — converted in your browser by OnnoPoth.
            Your files never leave this device.
          </p>
          <div className="relative mx-auto mt-8 max-w-2xl text-left">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tools or formats…"
              aria-label="Search tools"
              className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-16 text-base shadow-md outline-none transition placeholder:text-subtle focus:border-brand"
            />
            {query ? (
              <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            ) : (
              <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 sm:block"><Kbd>/</Kbd></span>
            )}
          </div>
        </div>
      </section>

      <section id="tools" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-16 sm:px-6">
        <div className="sticky top-16 z-30 -mx-4 border-b border-line/60 bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="overflow-x-auto pb-1">
            <Tabs tabs={filters} value={filter} onChange={setFilter} label="Tool categories" className="w-max min-w-full border-0 bg-transparent p-0" />
          </div>
        </div>

        {!query && (recent.length > 0 || favorites.length > 0) && (
          <div className="mt-6 space-y-5">
            <Row title="Recently used" ids={recent} byId={byId} />
            <Row title="Favorites" ids={favorites} byId={byId} />
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {visible.length} {visible.length === 1 ? "tool" : "tools"}
            {query ? ` matching “${query}”` : ""}
          </p>
          <span className="hidden text-xs text-subtle sm:block">{categoryMeta[filter === "all" || filter === "voice" ? "pdf" : filter].label} · on your device</span>
        </div>

        {visible.length ? (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((tool) => (
              <ToolCard key={tool.id} tool={tool} favorite={favorites.includes(tool.id)} onFavorite={() => toggleFavorite(tool.id)} />
            ))}
          </ul>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="No tool matches that search."
              hint="Try “pdf”, “image”, “excel”, or another category above."
            />
            <Button variant="secondary" className="mx-auto mt-4" onClick={() => { setQuery(""); setFilter("all"); }}>
              Show all tools
            </Button>
          </div>
        )}

        <div className="mt-12 flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></span>
          <div className="flex-1">
            <p className="font-semibold">Private by design</p>
            <p className="text-sm text-muted">Your files are converted inside this browser tab. They are never uploaded, stored on a server, or sent anywhere — even the first-time model downloads go straight into your browser cache.</p>
          </div>
          <ArrowRight className="hidden h-5 w-5 text-subtle sm:block" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
}

function Row({ title, ids, byId }: {
  title: string;
  ids: string[];
  byId: (id: string) => Tool | undefined;
}) {
  const tools = ids.map(byId).filter((tool): tool is Tool => Boolean(tool));
  if (!tools.length) return null;
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tools.slice(0, 8).map((tool) => (
          <Link key={tool.id} href={`/convert/${tool.id}`} className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium shadow-sm transition hover:border-brand/50">
            <ToolIcon name={tool.icon} className="h-4 w-4 text-brand" />
            {tool.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ToolCard({ tool, favorite, onFavorite }: { tool: Tool; favorite: boolean; onFavorite: () => void }) {
  return (
    <li className="relative">
      <Link
        href={`/convert/${tool.id}`}
        className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md active:translate-y-0"
      >
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tileColor[tool.color])}>
          <ToolIcon name={tool.icon} className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-[15px] font-semibold leading-snug">{tool.label}</span>
          <span className="mt-0.5 block text-xs text-muted">{tool.hint}</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          <Badge>{tool.from}</Badge>
          <span className="text-[11px] text-subtle">→</span>
          <Badge>{tool.to}</Badge>
        </span>
      </Link>
      <button
        type="button"
        onClick={onFavorite}
        aria-label={favorite ? `Remove ${tool.label} from favorites` : `Add ${tool.label} to favorites`}
        aria-pressed={favorite}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-subtle transition hover:bg-surface-2 hover:text-brand"
      >
        <Star className={cn("h-4 w-4", favorite && "fill-brand text-brand")} aria-hidden="true" />
      </button>
    </li>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] uppercase text-muted">{children}</span>;
}
