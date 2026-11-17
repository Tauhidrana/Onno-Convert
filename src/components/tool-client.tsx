"use client";

import {
  AlertCircle,
  ArrowRight,
  Check,
  Download,
  FileUp,
  Printer,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { availableTools, toolById } from "@/convert/registry";
import { runPrint, runTool, type RunHandle } from "@/convert/runner";
import { type ConvertOptions, type Field, type OutputFile } from "@/convert/types";
import { baseName, cn, formatBytes } from "@/lib/utils";
import { saveBlob, saveZip } from "@/lib/download";
import { VoiceRecorder } from "@/components/voice-recorder";
import { PdfPageGrid } from "@/components/pdf-page-grid";
import { Button, Card, Dropzone, FileRow, Toast } from "@/components/ui";
import { ToolIcon } from "@/components/tool-icon";

type Status = "queued" | "running" | "done" | "error";
type Item = { key: string; file: File; status: Status; progress: number; error?: string };

function accepts(file: File, accept: string) {
  return accept.split(",").some((rule) => {
    const r = rule.trim().toLowerCase();
    if (!r) return true;
    if (r.endsWith("/*")) return file.type.toLowerCase().startsWith(r.slice(0, -1));
    if (r.startsWith(".")) return file.name.toLowerCase().endsWith(r);
    return file.type.toLowerCase() === r;
  });
}

function defaults(fields: Field[]): ConvertOptions {
  return Object.fromEntries(fields.map((f) => [f.key, f.default]));
}

function remembered(toolId: string, fields: Field[]): ConvertOptions {
  const base = defaults(fields);
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(`onno-opts:${toolId}`) ?? "null");
    if (saved && typeof saved === "object") return { ...base, ...(saved as ConvertOptions) };
  } catch {
    // Private mode or disabled storage: defaults still work.
  }
  return base;
}

function stageFor(toolId: string, progress: number, status: Status): string {
  if (status === "queued") return "Ready";
  if (status === "done") return "Done";
  if (status === "error") return "Failed";
  if (toolId === "speech-to-text") {
    if (progress < 0.45) return "Downloading model";
    if (progress < 0.58) return "Preparing";
    return "Transcribing";
  }
  if (toolId === "image-to-text") return "Reading image";
  if (toolId === "voice-recorder") return "Encoding audio";
  return progress > 0 ? "Converting" : "Working";
}

function nextToolId(toolId: string): string {
  const tool = toolById.get(toolId);
  const next = availableTools.find((item) => item.from === tool?.to && item.id !== toolId);
  return next?.id ?? "image-to-pdf";
}

export function ToolClient({ toolId }: { toolId: string }) {
  const tool = toolById.get(toolId)!;
  const fields = tool.options ?? [];
  const [opts, setOpts] = useState<ConvertOptions>(() => remembered(toolId, fields));
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [results, setResults] = useState<OutputFile[]>([]);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<RunHandle | null>(null);
  const cancelledRef = useRef(false);

  const totalBytes = useMemo(() => items.reduce((sum, i) => sum + i.file.size, 0), [items]);
  const outputBytes = useMemo(() => results.reduce((sum, file) => sum + file.blob.size, 0), [results]);
  const stage = running ? "Converting" : cancelling ? "Stopping" : results.length ? "Done" : items.length ? "Ready" : "Empty";
  const failed = failure || items.find((item) => item.status === "error")?.error || "";
  const next = toolById.get(nextToolId(toolId))!;

  useEffect(() => {
    try {
      const recent: unknown = JSON.parse(localStorage.getItem("onno-recent-tools") ?? "[]");
      const list = Array.isArray(recent) ? recent.filter((id): id is string => typeof id === "string") : [];
      localStorage.setItem("onno-recent-tools", JSON.stringify([toolId, ...list.filter((id) => id !== toolId)].slice(0, 8)));
    } catch {
      // History is optional.
    }
  }, [toolId]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length && tool.id !== "voice-recorder") {
        event.preventDefault();
        addFiles(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function setOption(key: string, value: string | number | boolean) {
    const nextOpts = { ...opts, [key]: value };
    setOpts(nextOpts);
    try {
      localStorage.setItem(`onno-opts:${toolId}`, JSON.stringify(nextOpts));
    } catch {
      // Options still apply to the current conversion.
    }
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const accepted = incoming.filter((file) => accepts(file, tool.accept));
    const rejected = incoming.length - accepted.length;
    setMessage(rejected ? `${rejected} file${rejected > 1 ? "s" : ""} ignored — wrong format for this tool.` : "");
    setFailure("");
    if (!accepted.length) return;

    setResults([]);
    setItems((prev) => {
      const nextItems = tool.multiple ? [...prev] : [];
      for (const file of tool.multiple ? accepted : accepted.slice(0, 1)) {
        nextItems.push({ key: crypto.randomUUID(), file, status: "queued", progress: 0 });
      }
      return nextItems;
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(key: string) {
    if (running) return;
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  function move(key: string, direction: -1 | 1) {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const nextItems = [...prev];
      [nextItems[index], nextItems[target]] = [nextItems[target], nextItems[index]];
      return nextItems;
    });
  }

  function patch(key: string, changes: Partial<Item>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }

  async function convert() {
    if (!items.length || running) return;
    setRunning(true);
    setCancelling(false);
    cancelledRef.current = false;
    setResults([]);
    setMessage("");
    setFailure("");

    try {
      if (tool.combine) {
        setItems((prev) => prev.map((item) => ({ ...item, status: "running" as const, progress: 0, error: undefined })));
        const handle = runTool(tool.id, items.map((item) => item.file), opts, (progress) =>
          setItems((prev) => prev.map((item) => ({ ...item, progress }))),
        );
        handleRef.current = handle;
        const output = await handle.promise;
        if (cancelledRef.current) return;
        setItems((prev) => prev.map((item) => ({ ...item, status: "done" as const, progress: 1 })));
        setResults(output);
      } else {
        const collected: OutputFile[] = [];
        for (const item of items) {
          if (cancelledRef.current) break;
          patch(item.key, { status: "running", progress: 0, error: undefined });
          const handle = runTool(tool.id, [item.file], opts, (progress) => patch(item.key, { progress }));
          handleRef.current = handle;
          try {
            const output = await handle.promise;
            if (cancelledRef.current) break;
            collected.push(...output);
            patch(item.key, { status: "done", progress: 1 });
          } catch (error) {
            if (cancelledRef.current) break;
            patch(item.key, {
              status: "error",
              error: error instanceof Error ? error.message : "Conversion failed.",
            });
          }
        }
        setResults(collected);
      }
    } catch (error) {
      if (!cancelledRef.current) {
        setFailure(error instanceof Error ? error.message : "Conversion failed.");
        setItems((prev) => prev.map((item) => (item.status === "running" ? { ...item, status: "error" as const } : item)));
      }
    } finally {
      handleRef.current = null;
      setRunning(false);
      setCancelling(false);
    }
  }

  function cancel() {
    cancelledRef.current = true;
    setCancelling(true);
    handleRef.current?.cancel();
    setMessage("");
    setItems((prev) => prev.map((item) => (item.status === "running" ? { ...item, status: "queued" as const, progress: 0 } : item)));
  }

  function reset() {
    setItems([]);
    setResults([]);
    setMessage("");
    setFailure("");
  }

  async function openPrint() {
    if (!items.length) return;
    setMessage("");
    try {
      await runPrint(tool.id, [items[0].file], opts);
      setMessage("Print dialog opened. Choose “Save as PDF” as the destination.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open the print dialog.");
    }
  }

  function downloadAll() {
    if (results.length === 1) saveBlob(results[0].blob, results[0].name);
    else void saveZip(results, `${baseName(items[0]?.file.name ?? "onno")}-converted.zip`);
  }

  const canRun = items.length > 0 && !running;

  return (
    <div
      className={cn("pb-28 lg:pb-0", dragging && "rounded-2xl ring-2 ring-brand ring-offset-4")}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        if (tool.id !== "voice-recorder") addFiles(event.dataTransfer.files);
      }}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {!items.length && tool.id !== "voice-recorder" && (
            <Dropzone accept={tool.accept} multiple={tool.multiple} onFiles={addFiles} inputRef={inputRef} className="py-14">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-[var(--accent-text)]">
                <Upload className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-4 text-sm font-medium">
                Drag {tool.multiple ? "files" : "a file"} here, browse, or paste
              </p>
              <span className="pointer-events-none mt-1 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-[var(--accent-contrast)]">
                Choose {tool.multiple ? "files" : "a file"}
              </span>
              <p className="mt-1 max-w-sm text-xs text-muted">
                {formatAccept(tool.accept)} · up to 200 MB suggested. Files stay on this device.
              </p>
            </Dropzone>
          )}

          {tool.id === "voice-recorder" && (
            <VoiceRecorder onRecorded={(file) => { setItems([{ key: crypto.randomUUID(), file, status: "queued", progress: 0 }]); setResults([]); setMessage(""); }} />
          )}

          {message && <Toast>{message}</Toast>}

          {failed && (
            <Card className="onno-pop border-danger/30 bg-danger-soft/60 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
                <div className="flex-1">
                  <h2 className="font-semibold">That file could not be converted</h2>
                  <p className="mt-1 text-sm text-muted">{fixFor(failed)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={convert}>Try again</Button>
                    <Button size="sm" variant="ghost" onClick={reset}>Choose another file</Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {items.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm">
                <span className="font-medium">
                  {items.length} {items.length === 1 ? "file" : "files"} · {formatBytes(totalBytes)}
                  {tool.combine && items.length > 1 && (
                    <span className="ml-2 font-mono text-xs text-subtle">{items.map((_, index) => index + 1).join(" → ")}</span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  {tool.multiple && !running && (
                    <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
                      <FileUp className="h-4 w-4" /> Add more
                    </Button>
                  )}
                  {!running && <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>}
                </div>
              </div>
              <ul className="divide-y divide-line">
                {items.map((item, index) => (
                  <FileRow
                    key={item.key}
                    file={item.file}
                    progress={item.progress}
                    status={item.status}
                    error={item.error}
                    stageLabel={stageFor(tool.id, item.progress, item.status)}
                    canReorder={Boolean(tool.combine && !running)}
                    isFirst={index === 0}
                    isLast={index === items.length - 1}
                    onRemove={running ? undefined : () => remove(item.key)}
                    onMove={(direction) => move(item.key, direction)}
                  />
                ))}
              </ul>
            </Card>
          )}

          {results.length > 0 && (
            <Card className="onno-pop border-success/40 bg-success-soft/70 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success text-[var(--success-contrast)]">
                  <Check className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <p className="text-lg font-semibold" role="status" aria-live="polite">
                    {results.length} {results.length === 1 ? "file" : "files"} ready
                  </p>
                  <p className="whitespace-nowrap text-sm text-muted">{formatBytes(totalBytes)} → {formatBytes(outputBytes)}</p>
                </div>
                <Button variant="success" size="lg" onClick={downloadAll}>
                  <Download className="h-4 w-4" /> {results.length === 1 ? "Download" : "Download all (ZIP)"}
                </Button>
              </div>
              <ul className="mt-4 space-y-1 border-t border-success/20 pt-3">
                {results.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{file.name}</span>
                    <span className="flex items-center gap-2 text-muted">
                      {formatBytes(file.blob.size)}
                      <Button size="sm" variant="ghost" aria-label={`Download ${file.name}`} onClick={() => saveBlob(file.blob, file.name)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              {results.map((file, index) => <ResultPreview key={`preview-${index}`} file={file} />)}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-success/20 pt-4 text-sm">
                <Button variant="secondary" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> Convert another</Button>
                <a href={`/convert/${next.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[var(--accent-text)] hover:bg-brand-soft">
                  <ToolIcon name={next.icon} className="h-4 w-4" /> Use result in {next.label} <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          {fields.length > 0 && (
            <Card className="p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-subtle">Options</p>
              {["reorder-pdf", "rotate-pdf", "split-pdf"].includes(tool.id) && (
                <PdfPageGrid
                  file={items[0]?.file ?? null}
                  toolId={tool.id}
                  order={String(opts.order ?? "")}
                  onChange={setOption}
                />
              )}
              <div className="space-y-4">
                {fields.map((field) => (
                  <FieldInput key={field.key} field={field} value={opts[field.key]} onChange={(value) => setOption(field.key, value)} />
                ))}
              </div>
            </Card>
          )}

          {tool.note && <p className="rounded-xl border border-line bg-surface-2/60 p-4 text-xs leading-relaxed text-muted">{tool.note}</p>}

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 p-3 shadow-lg backdrop-blur lg:static lg:inset-auto lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <div className="mx-auto max-w-6xl space-y-2 lg:mx-0">
              {tool.print ? (
                <Button size="lg" className="w-full" disabled={!canRun} onClick={openPrint}>
                  <Printer className="h-4 w-4" /> Open print dialog
                </Button>
              ) : (
                <>
                  <Button size="lg" className="w-full" disabled={!canRun} loading={running} onClick={convert}>
                    {running ? "Converting…" : "Convert"}
                  </Button>
                  {running && (
                    <Button size="lg" variant="secondary" className="w-full" disabled={cancelling} onClick={cancel}>
                      <Trash2 className="h-4 w-4" /> {cancelling ? "Stopping…" : "Cancel"}
                    </Button>
                  )}
                </>
              )}
              <p className="hidden text-center text-xs text-subtle lg:block">Stage: {stage} · processed on your device</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function formatAccept(accept: string) {
  const mime: Record<string, string> = {
    "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WEBP", "image/avif": "AVIF",
    "image/heic": "HEIC", "image/gif": "GIF", "image/svg+xml": "SVG", "image/tiff": "TIFF", "image/bmp": "BMP",
    "application/pdf": "PDF", "text/plain": "TXT", "text/html": "HTML",
  };
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const part of accept.split(",").map((item) => item.trim()).filter(Boolean)) {
    const label = part.startsWith(".") ? part.slice(1).toUpperCase() : mime[part] ?? part.split("/")[1]?.toUpperCase() ?? part;
    if (!seen.has(label)) { seen.add(label); labels.push(label); }
  }
  return labels.slice(0, 6).join(", ") + (labels.length > 6 ? "…" : "");
}

function fixFor(message: string) {
  if (/avif/i.test(message)) return "This browser can't encode AVIF. Try Chrome or Edge, or convert to WebP instead.";
  if (/could not be opened|corrupt|password/i.test(message)) return "The file could not be read. Check that it is not password-protected or damaged, then try another file.";
  if (/memory|too large/i.test(message)) return "The file may be too large for this browser. Try a smaller file or a lower resolution.";
  return message;
}

function ResultPreview({ file }: { file: OutputFile }) {
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [media, setMedia] = useState<string | null>(null);

  useEffect(() => {
    if (!/\.(txt|csv|srt|md)$/i.test(file.name)) return;
    let alive = true;
    void file.blob.text().then((value) => { if (alive) setText(value); }).catch(() => {});
    return () => { alive = false; };
  }, [file]);

  useEffect(() => {
    if (!/\.(mp3|wav|m4a|ogg|flac|mp4|webm|mov|mkv|avi)$/i.test(file.name)) return;
    let alive = true;
    let url: string | null = null;
    void Promise.resolve().then(() => {
      url = URL.createObjectURL(file.blob);
      if (alive) setMedia(url);
      else URL.revokeObjectURL(url);
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => () => { if (media) URL.revokeObjectURL(media); }, [media]);

  if (media) {
    const video = /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);
    return (
      <div className="mt-4 rounded-xl border border-line bg-surface p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Preview · {file.name} · {formatBytes(file.blob.size)}</p>
        {video ? <video controls src={media} className="max-h-64 w-full rounded-lg" aria-label="Preview converted video" /> : <audio controls src={media} className="w-full" aria-label="Preview converted audio" />}
      </div>
    );
  }

  if (text === null) return null;
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Editable output · {file.name}</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (!navigator.clipboard) return;
            void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy text"}
        </Button>
      </div>
      <textarea
        value={text}
        onChange={(event) => { setText(event.target.value); setCopied(false); }}
        rows={6}
        aria-label={`Edit ${file.name}`}
        className="w-full rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed outline-none focus:border-brand"
      />
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  const id = `opt-${field.key}`;
  const input = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition focus:border-brand";

  if (field.type === "select") {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{field.label}</label>
        <select id={id} value={String(value)} onChange={(event) => onChange(event.target.value)} className={input}>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {field.help && <p className="mt-1 text-xs text-muted">{field.help}</p>}
      </div>
    );
  }

  if (field.type === "range") {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={id} className="text-sm font-medium">{field.label}</label>
          <span className="font-mono text-xs text-muted">{String(value)}</span>
        </div>
        <input id={id} type="range" min={field.min} max={field.max} step={field.step} value={Number(value)} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-brand" />
        {field.help && <p className="mt-1 text-xs text-muted">{field.help}</p>}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-brand" />
        {field.label}
      </label>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{field.label}</label>
      <input
        id={id}
        type={field.type === "number" ? "number" : "text"}
        min={field.min}
        max={field.max}
        step={field.step}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
        className={input}
      />
      {field.help && <p className="mt-1 text-xs text-muted">{field.help}</p>}
    </div>
  );
}
