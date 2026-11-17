import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { categoryMeta, toolById, tools } from "@/convert/registry";
import { ToolClient } from "@/components/tool-client";
import { WorkspaceClient } from "@/components/workspace-client";
import { VoiceCleanerClient } from "@/components/voice-cleaner-client";
import { ToolIcon } from "@/components/tool-icon";
import { tileColor } from "@/components/colors";

export function generateStaticParams() {
  return tools.map((tool) => ({ slug: tool.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = toolById.get(slug);
  if (!tool) return { title: "Tool not found" };
  if (tool.status === "planned") {
    return { title: tool.label, description: "Not available yet. No files are processed or uploaded." };
  }
  return { title: tool.label, description: `${tool.label} in your browser. ${tool.hint}. Files never leave your device.` };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = toolById.get(slug);
  if (!tool) notFound();

  return (
    <main className={tool.kind === "workspace" ? "mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6" : "mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12"}>
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
            {tool.status === "planned" && " · Planned"}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">{tool.label}</h1>
          {tool.status !== "planned" && (
            <p className="mt-1 text-sm text-black/55 dark:text-white/55">{tool.hint}</p>
          )}
        </div>
      </div>

      <div className="mt-7">
        {tool.status === "planned" ? (
          <div className="rounded-2xl border border-black/10 bg-white p-6 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
            <p className="font-semibold">Not available yet</p>
            <p className="mt-2 text-black/60 dark:text-white/60">
              This tool is planned for a future release. No files are processed or uploaded.
            </p>
          </div>
        ) : (
          tool.kind === "workspace" ? <WorkspaceClient toolId={tool.id} /> : tool.id === "voice-cleaner" ? <VoiceCleanerClient toolId={tool.id} /> : <ToolClient toolId={tool.id} />
        )}
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-black/45 dark:text-white/45">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {tool.status === "planned" ? "No files are processed or uploaded." : "Processed on this device. Nothing is uploaded."}
      </p>
    </main>
  );
}
