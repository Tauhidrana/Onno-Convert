"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Loader2,
  Printer,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toolById } from "@/convert/registry";
import { runPrint, runTool, type RunHandle } from "@/convert/runner";
import { MAX_SAFE_BYTES, type ConvertOptions, type Field, type OutputFile } from "@/convert/types";
import { baseName, cn, formatBytes } from "@/lib/utils";
import { saveBlob, saveZip } from "@/lib/download";

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

export function ToolClient({ toolId }: { toolId: string }) {
  const tool = toolById.get(toolId)!;
  const fields = tool.options ?? [];
  const [opts, setOpts] = useState<ConvertOptions>(() => defaults(fields));
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<OutputFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<RunHandle | null>(null);
  const cancelledRef = useRef(false);

  const totalBytes = useMemo(() => items.reduce((sum, i) => sum + i.file.size, 0), [items]);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const accepted = incoming.filter((f) => accepts(f, tool.accept));
    const rejected = incoming.length - accepted.length;
    setMessage(rejected ? `${rejected} file${rejected > 1 ? "s" : ""} ignored — wrong format for this tool.` : "");
    if (!accepted.length) return;

    setResults([]);
    setItems((prev) => {
      const next = tool.multiple ? [...prev] : [];
      for (const file of tool.multiple ? accepted : accepted.slice(0, 1)) {
        next.push({ key: crypto.randomUUID(), file, status: "queued", progress: 0 });
      }
      return next;
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(key: string) {
    if (running) return;
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function move(key: string, direction: -1 | 1) {
    setItems((prev) => {
      const index = prev.findIndex((i) => i.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function patch(key: string, changes: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...changes } : i)));
  }

  async function convert() {
    if (!items.length || running) return;
    setRunning(true);
    cancelledRef.current = false;
    setResults([]);
    setMessage("");

    try {
      if (tool.combine) {
        setItems((prev) => prev.map((i) => ({ ...i, status: "running" as const, progress: 0, error: undefined })));
        const handle = runTool(tool.id, items.map((i) => i.file), opts, (progress) =>
          setItems((prev) => prev.map((i) => ({ ...i, progress }))),
        );
        handleRef.current = handle;
        const output = await handle.promise;
        if (cancelledRef.current) return;
        setItems((prev) => prev.map((i) => ({ ...i, status: "done" as const, progress: 1 })));
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
        setMessage(error instanceof Error ? error.message : "Conversion failed.");
        setItems((prev) => prev.map((i) => (i.status === "running" ? { ...i, status: "error" as const } : i)));
      }
    } finally {
      handleRef.current = null;
      setRunning(false);
    }
  }

  function cancel() {
    cancelledRef.current = true;
    handleRef.current?.cancel();
    setMessage("Cancellation requested.");
    setItems((prev) =>
      prev.map((i) => (i.status === "running" ? { ...i, status: "queued" as const, progress: 0 } : i)),
    );
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
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition focus-within:outline-2 focus-within:outline-brand focus-within:outline-offset-2",
            dragging
              ? "border-brand bg-brand-soft dark:bg-brand/10"
              : "border-black/15 bg-white hover:border-brand/50 dark:border-white/15 dark:bg-white/[0.03] dark:hover:border-brand/50",
          )}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand dark:bg-brand/20 dark:text-violet-300">
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium">
            Drop {tool.multiple ? "files" : "a file"} here or <span className="text-brand underline">browse</span>
          </span>
          <span className="max-w-sm text-xs text-black/45 dark:text-white/45">
            {tool.accept.replaceAll(",", " · ")} {tool.multiple ? "· multiple allowed" : ""}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={tool.accept}
            multiple={tool.multiple}
            onChange={(e) => addFiles(e.target.files)}
            className="sr-only"
            aria-label={`Choose ${tool.multiple ? "files" : "a file"}`}
          />
        </label>

        {message && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-200" role="status">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {message}
          </p>
        )}

        {items.length > 0 && (
          <div className="mt-4 rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <span>
                {items.length} {items.length === 1 ? "file" : "files"} · {formatBytes(totalBytes)}
              </span>
              {!running && (
                <button
                  onClick={() => {
                    setItems([]);
                    setResults([]);
                    setMessage("");
                  }}
                  className="rounded px-1.5 py-0.5 font-medium hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Clear
                </button>
              )}
            </div>
            <ul className="divide-y divide-black/5 dark:divide-white/10">
              {items.map((item, index) => (
                <li key={item.key} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <p className="mt-0.5 text-xs text-black/45 dark:text-white/45">
                        {formatBytes(item.file.size)}
                        {item.file.size > MAX_SAFE_BYTES && (
                          <span className="ml-2 font-medium text-amber-600 dark:text-amber-300">
                            Large — may run out of memory
                          </span>
                        )}
                      </p>
                      {(item.status === "running" || item.progress > 0) && item.status !== "error" && (
                        <div
                          className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
                          role="progressbar"
                          aria-label={`Converting ${item.file.name}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(item.progress * 100)}
                        >
                          <div
                            aria-hidden="true"
                            className="h-full rounded-full bg-brand transition-[width]"
                            style={{ width: `${Math.round(item.progress * 100)}%` }}
                          />
                        </div>
                      )}
                      {item.error && (
                        <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-300" role="alert">
                          {item.error}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.status === "done" && <Check className="h-4 w-4 text-emerald-500" aria-label="Done" />}
                      {item.status === "error" && <AlertCircle className="h-4 w-4 text-rose-500" aria-label="Failed" />}
                      {tool.combine && !running && (
                        <>
                          <button
                            onClick={() => move(item.key, -1)}
                            disabled={index === 0}
                            className="rounded p-1 text-black/40 hover:bg-black/5 disabled:opacity-25 dark:text-white/40 dark:hover:bg-white/10"
                            aria-label={`Move ${item.file.name} up`}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => move(item.key, 1)}
                            disabled={index === items.length - 1}
                            className="rounded p-1 text-black/40 hover:bg-black/5 disabled:opacity-25 dark:text-white/40 dark:hover:bg-white/10"
                            aria-label={`Move ${item.file.name} down`}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {!running && (
                        <button
                          onClick={() => remove(item.key)}
                          className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-rose-600 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-rose-300"
                          aria-label={`Remove ${item.file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200" role="status" aria-live="polite">
                {results.length} {results.length === 1 ? "file" : "files"} ready
              </p>
              <button
                onClick={downloadAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
              >
                <Download className="h-3.5 w-3.5" />
                {results.length === 1 ? "Download" : "Download all (ZIP)"}
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {results.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-emerald-900/80 dark:text-emerald-100/80">{file.name}</span>
                  <span className="flex shrink-0 items-center gap-2 text-emerald-900/60 dark:text-emerald-100/60">
                    {formatBytes(file.blob.size)}
                    <button
                      onClick={() => saveBlob(file.blob, file.name)}
                      className="rounded p-1 hover:bg-emerald-600/10"
                      aria-label={`Download ${file.name}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        {fields.length > 0 && (
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/45">Options</p>
            <div className="space-y-3">
              {fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={opts[field.key]}
                  onChange={(value) => setOpts((prev) => ({ ...prev, [field.key]: value }))}
                />
              ))}
            </div>
          </div>
        )}

        {tool.print ? (
          <button
            onClick={openPrint}
            disabled={!canRun}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
          >
            <Printer className="h-4 w-4" /> Open print dialog
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={convert}
              disabled={!canRun}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {running ? "Converting…" : "Convert"}
            </button>
            {running && (
              <button
                onClick={cancel}
                disabled={cancelledRef.current}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-medium transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                <Trash2 className="h-4 w-4" /> {cancelledRef.current ? "Stopping…" : "Cancel"}
              </button>
            )}
          </div>
        )}

        {tool.note && (
          <p className="rounded-xl border border-black/5 bg-white/60 p-3 text-xs leading-relaxed text-black/55 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/55">
            {tool.note}
          </p>
        )}
        <p className="text-xs leading-relaxed text-black/40 dark:text-white/40">
          Output keeps your filename: <code className="font-mono">name.converted.ext</code>
        </p>
      </aside>
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

  if (field.type === "select") {
    return (
      <div>
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-black/65 dark:text-white/65">
          {field.label}
        </label>
        <select
          id={id}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm outline-none focus:border-brand dark:border-white/15 dark:bg-[#17171a] dark:text-white"
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "range") {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={id} className="text-xs font-medium text-black/65 dark:text-white/65">
            {field.label}
          </label>
          <span className="font-mono text-xs text-black/50 dark:text-white/50">{String(value)}</span>
        </div>
        <input
          id={id}
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-brand"
        />
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label htmlFor={id} className="flex items-center gap-2 text-xs font-medium text-black/65 dark:text-white/65">
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand" />
        {field.label}
      </label>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-black/65 dark:text-white/65">
        {field.label}
      </label>
      <input
        id={id}
        type={field.type === "number" ? "number" : "text"}
        min={field.min}
        max={field.max}
        step={field.step}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
        className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm outline-none focus:border-brand dark:border-white/15 dark:bg-[#17171a] dark:text-white"
      />
      {field.help && <p className="mt-1 text-[11px] text-black/40 dark:text-white/40">{field.help}</p>}
    </div>
  );
}
