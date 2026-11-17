"use client";

import { ArrowLeft, AudioLines, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toolById } from "@/convert/registry";
import { runTool, type RunHandle } from "@/convert/runner";
import type { OutputFile } from "@/convert/types";
import { Button, Card, Dropzone, ProgressBar } from "@/components/ui";
import { ShareBar } from "@/components/workspace/share-bar";
import { MAX_SAFE_BYTES } from "@/convert/types";
import { formatBytes } from "@/lib/utils";

async function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / width));
  context.fillStyle = "#6d5efc";
  for (let x = 0; x < width; x++) {
    let peak = 0;
    for (let i = 0; i < step; i++) peak = Math.max(peak, Math.abs(data[x * step + i] ?? 0));
    const bar = Math.max(1, peak * height * 0.9);
    context.fillRect(x, (height - bar) / 2, 1, bar);
  }
}

async function decode(blob: Blob) {
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void context.close();
  }
}

export function VoiceCleanerClient({ toolId }: { toolId: string }) {
  const tool = toolById.get(toolId)!;
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<Record<string, string | number | boolean>>(() =>
    Object.fromEntries((tool.options ?? []).map((field) => [field.key, field.default])),
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<OutputFile | null>(null);
  const [before, setBefore] = useState<AudioBuffer | null>(null);
  const [ab, setAb] = useState<"before" | "after">("before");
  const beforeRef = useRef<HTMLAudioElement>(null);
  const afterRef = useRef<HTMLAudioElement>(null);
  const beforeCanvas = useRef<HTMLCanvasElement>(null);
  const afterCanvas = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<RunHandle | null>(null);
  const beforeUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  const afterUrl = useMemo(() => (result ? URL.createObjectURL(result.blob) : ""), [result]);

  useEffect(() => {
    if (!file || !beforeCanvas.current) return;
    let alive = true;
    void decode(file).then((buffer) => { if (alive) setBefore(buffer); }).catch(() => { if (alive) setMessage("Waveform preview is unavailable for this input; cleaning still works."); });
    return () => { alive = false; };
  }, [file]);

  useEffect(() => {
    if (before && beforeCanvas.current) void drawWaveform(beforeCanvas.current, before);
  }, [before]);

  useEffect(() => {
    if (result && afterCanvas.current) {
      void decode(result.blob).then((buffer) => { if (afterCanvas.current) void drawWaveform(afterCanvas.current, buffer); }).catch(() => {});
    }
  }, [result]);

  useEffect(() => {
    if (!result) return;
    const from = ab === "before" ? beforeRef.current : afterRef.current;
    const to = ab === "before" ? afterRef.current : beforeRef.current;
    if (from && to) {
      to.currentTime = from.currentTime;
      from.pause();
      void to.play().catch(() => {});
    }
  }, [ab, result]);

  function set(key: string, value: string | number | boolean) {
    setOpts((current) => ({ ...current, [key]: value }));
  }

  async function run() {
    if (!file || running) return;
    setRunning(true);
    setProgress(0);
    setMessage("");
    setResult(null);
    const handle = runTool(tool.id, [file], opts, setProgress);
    handleRef.current = handle;
    try {
      const output = await handle.promise;
      if (output[0]) setResult(output[0]);
    } catch (error) {
      if (error instanceof Error && error.message !== "Cancelled.") setMessage(error.message);
    } finally {
      handleRef.current = null;
      setRunning(false);
    }
  }

  const outputName = result?.name ?? "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/#tools" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> All tools</Link>
        <span className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium text-muted">Voice Noise Cleaner</span>
      </div>

      {message && <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning" role="status">{message}</p>}

      {!file ? (
        <Dropzone accept={tool.accept} onFiles={(files) => { setFile(files?.[0] ?? null); setResult(null); }} className="py-14">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-[var(--accent-text)]"><AudioLines className="h-6 w-6" /></span>
          <p className="mt-4 text-sm font-medium">Drop an audio or video file here, browse, or paste</p>
          <span className="pointer-events-none mt-1 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-[var(--accent-contrast)]">Choose a file</span>
          <p className="mt-2 text-xs text-muted">WAV, MP3, M4A, OGG, FLAC, MP4, WebM · up to 200 MB suggested</p>
        </Dropzone>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-[var(--accent-text)]"><AudioLines className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-xs text-muted">
                    {formatBytes(file.size)}
                    {file.size > MAX_SAFE_BYTES && <span className="ml-2 text-warning">Large — may run out of memory</span>}
                  </p>
                </div>
                {!running && <Button size="sm" variant="ghost" onClick={() => { setFile(null); setResult(null); setBefore(null); }}><Trash2 className="h-4 w-4" /> Change</Button>}
              </div>
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Waveform · before</p>
              <canvas ref={beforeCanvas} width={760} height={120} className="h-24 w-full rounded-lg bg-surface-2" aria-label="Waveform before cleaning" />
              {result && (
                <>
                  <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">Waveform · after ({outputName})</p>
                  <canvas ref={afterCanvas} width={760} height={120} className="h-24 w-full rounded-lg bg-surface-2" aria-label="Waveform after cleaning" />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button size="sm" variant={ab === "before" ? "primary" : "secondary"} onClick={() => setAb("before")}>A · Before</Button>
                    <Button size="sm" variant={ab === "after" ? "success" : "secondary"} onClick={() => setAb("after")}>B · After</Button>
                    <span className="text-xs text-muted">Switches at the same position</span>
                  </div>
                  <audio ref={beforeRef} src={beforeUrl} className="mt-3 w-full" controls aria-label="Original audio" />
                  <audio ref={afterRef} src={afterUrl} className="mt-2 w-full" controls aria-label="Cleaned audio" />
                </>
              )}
            </Card>

            {result && <ShareBar blob={result.blob} name={outputName} note="Cleaned locally. No upload, no hosted link." />}
          </div>

          <aside className="space-y-4">
            <Card className="p-4">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-subtle">Cleaning options</p>
              <div className="space-y-4">
                <label className="block text-sm font-medium" htmlFor="engine">Engine
                  <select id="engine" value={String(opts.engine)} onChange={(event) => set("engine", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-2 text-sm">
                    <option value="fast">Fast (ffmpeg filters)</option>
                    <option value="ai">AI (RNNoise WASM)</option>
                  </select>
                  <span className="mt-1 block text-xs text-muted">{opts.engine === "ai" ? "About 5 MB downloaded once; runs in a Worker on device." : "Always available; spectral denoise + filters."}</span>
                </label>
                <label className="block text-sm font-medium" htmlFor="preset">Preset
                  <select id="preset" value={String(opts.preset)} onChange={(event) => set("preset", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-2 text-sm">
                    <option value="speech">Speech</option><option value="heavy">Heavy noise</option><option value="light">Light hiss</option>
                  </select>
                </label>
                <label className="block text-sm font-medium" htmlFor="strength">Denoise strength · {String(opts.strength)}
                  <input id="strength" type="range" min={0} max={1} step={0.05} value={Number(opts.strength)} onChange={(event) => set("strength", Number(event.target.value))} className="mt-1 w-full accent-brand" />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm" htmlFor="loudnorm">
                  <input id="loudnorm" type="checkbox" checked={Boolean(opts.loudnorm)} onChange={(event) => set("loudnorm", event.target.checked)} className="accent-brand" /> Normalize volume
                </label>
                <label className="block text-sm font-medium" htmlFor="output">Output
                  <select id="output" value={String(opts.output)} onChange={(event) => set("output", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-2 text-sm">
                    <option value="wav">WAV (lossless)</option><option value="mp3">MP3 (smaller)</option>
                  </select>
                </label>
              </div>
              <p className="mt-4 text-xs text-subtle">{tool.note}</p>
            </Card>

            {running && <ProgressBar value={progress} stage="Cleaning audio" />}
            <Button size="lg" className="w-full" loading={running} onClick={() => void run()}><Upload className="h-4 w-4" /> Clean audio</Button>
            {running && <Button size="lg" variant="secondary" className="w-full" onClick={() => handleRef.current?.cancel()}><Trash2 className="h-4 w-4" /> Cancel</Button>}
          </aside>
        </div>
      )}
    </div>
  );
}
