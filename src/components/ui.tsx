"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import Image from "next/image";
import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition duration-200 ease-[var(--ease)] disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]",
        size === "sm" && "min-h-11 px-3 text-xs",
        size === "lg" && "min-h-14 px-6 text-base",
        variant === "primary" && "bg-brand text-[var(--accent-contrast)] hover:brightness-110",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-ink",
        variant === "success" && "bg-success text-[var(--success-contrast)] hover:brightness-110",
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-sm", className)}>{children}</div>;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "min-h-11 rounded-lg px-3.5 text-sm font-medium transition duration-150",
            value === tab.id
              ? "bg-ink text-[var(--surface)] shadow-sm"
              : "text-muted hover:bg-surface-2 hover:text-ink",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Dropzone({
  accept,
  multiple,
  onFiles,
  children,
  className,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
  children: ReactNode;
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFiles(event.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition duration-200 focus-within:outline-2 focus-within:outline-brand focus-within:outline-offset-2",
        dragging ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand/60",
        className,
      )}
    >
      {children}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => onFiles(event.target.files)}
        className="sr-only"
        aria-label={`Choose ${multiple ? "files" : "a file"}`}
      />
    </label>
  );
}

export function ProgressBar({ value, stage }: { value: number; stage?: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="mt-2">
      <div
        role="progressbar"
        aria-label={stage ?? "Converting"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
      {stage && <p className="mt-1 text-xs text-muted">{stage} · {percent}%</p>}
    </div>
  );
}

export function FileRow({
  file,
  progress,
  status,
  error,
  canReorder,
  isFirst,
  isLast,
  onRemove,
  onMove,
}: {
  file: File;
  progress: number;
  status: "queued" | "running" | "done" | "error";
  error?: string;
  canReorder?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onRemove?: () => void;
  onMove?: (direction: -1 | 1) => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    let alive = true;
    reader.onload = () => {
      if (alive && typeof reader.result === "string") setThumb(reader.result);
    };
    reader.readAsDataURL(file);
    return () => { alive = false; };
  }, [file]);

  const stage = status === "done" ? "Done" : status === "error" ? "Failed" : status === "running" ? "Converting" : "Ready";
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-xs font-semibold text-muted">
        {thumb ? <Image src={thumb} alt="" width={44} height={44} unoptimized className="h-full w-full object-cover" /> : file.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
        <p className="text-xs text-muted">
          {formatBytes(file.size)} · {stage}
          {file.size > 200 * 1024 * 1024 && (
            <span className="ml-2 font-medium text-warning">Large — may run out of memory</span>
          )}
        </p>
        {status === "running" || (progress > 0 && status !== "done") ? <ProgressBar value={progress} /> : null}
        {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {status === "done" && <Check className="h-5 w-5 text-success" aria-label="Done" />}
        {status === "error" && <AlertCircle className="h-5 w-5 text-danger" aria-label="Failed" />}
        {canReorder && (
          <>
            <button type="button" onClick={() => onMove?.(-1)} disabled={isFirst} aria-label={`Move ${file.name} up`} className="h-11 w-11 rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30">↑</button>
            <button type="button" onClick={() => onMove?.(1)} disabled={isLast} aria-label={`Move ${file.name} down`} className="h-11 w-11 rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30">↓</button>
          </>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

export function Toast({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted shadow-sm">
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}
      aria-label={title}
      className="w-[min(92vw,560px)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-black/50"
    >
      <div className="flex min-h-11 items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2"><X className="h-4 w-4" /></button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span title={label}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("onno-skeleton h-4 rounded-lg", className)} />;
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">{children}</kbd>;
}
