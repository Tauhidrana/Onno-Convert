import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { categoryMeta, toolById, tools } from "@/convert/registry";
import { ToolClient } from "@/components/tool-client";
import { ToolIcon } from "@/components/tool-icon";
import { tileColor } from "@/components/colors";

export function generateStaticParams() {
  return tools.map((tool) => ({ slug: tool.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = toolById.get(slug);
  if (!tool) return { title: "Tool not found" };
  return { title: tool.label, description: `${tool.label} in your browser. ${tool.hint}. Files never leave your device.` };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = toolById.get(slug);
  if (!tool) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-lg py-1 text-sm text-black/55 transition hover:text-black dark:text-white/55 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> All tools
      </Link>

      <div className="mt-5 flex items-start gap-4">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tileColor[tool.color]}`}>
          <ToolIcon name={tool.icon} className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
            {categoryMeta[tool.category].label}
            {tool.server && " · Server tool"}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">{tool.label}</h1>
          <p className="mt-1 text-sm text-black/55 dark:text-white/55">{tool.hint}</p>
        </div>
      </div>

      <div className="mt-7">
        {tool.server ? (
          <div className="rounded-2xl border border-black/10 bg-white p-6 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
            <p className="font-semibold">This tool needs a server. Phase 3 — not built yet.</p>
            <p className="mt-2 text-black/60 dark:text-white/60">
              Onno Convert Phase 1 and 2 run entirely in your browser. Converting {tool.from.toUpperCase()} to{" "}
              {tool.to.toUpperCase()} at full fidelity needs LibreOffice, Calibre or a native renderer, which cannot run
              in a static site. No conversion request is sent anywhere today.
            </p>
          </div>
        ) : (
          <ToolClient toolId={tool.id} />
        )}
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-black/45 dark:text-white/45">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Processed on this device. Nothing is uploaded.
      </p>
    </main>
  );
}
