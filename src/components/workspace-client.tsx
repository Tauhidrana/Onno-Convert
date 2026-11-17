"use client";

import {
  ArrowLeft, ArrowRight, Circle, Download, Eraser, FilePlus2, RotateCw,
  Square, Trash2, Type, Undo2, Redo2, ZoomIn, ZoomOut, Minus, Pencil, Image as ImageIcon,
  PenTool, MousePointer2, CalendarDays, ListChecks, Upload,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toolById } from "@/convert/registry";
import { baseName, cn } from "@/lib/utils";
import { Button, Card, Dialog } from "@/components/ui";
import { pageCount, renderPage } from "@/workspace/pdf-doc";
import { applyOverlays, buildForm, fillForm, listFormFields, type FormFieldInfo, type PageOps } from "@/workspace/export";
import { newId, signerColors, type FieldSpec, type Overlay, type OverlayKind, type Signer } from "@/workspace/model";
import { SignaturePad } from "@/components/workspace/signature-pad";
import { ShareBar } from "@/components/workspace/share-bar";

const fieldTools: FieldSpec["type"][] = ["text", "multiline", "checkbox", "radio", "dropdown", "date", "signature"];
const color = "#6d5efc";
const size = 14;
const font = "sans" as const;

export function WorkspaceClient({ toolId }: { toolId: string }) {
  const tool = toolById.get(toolId)!;
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [stageSize, setStageSize] = useState({ width: 760, height: 1000 });
  const [zoom, setZoom] = useState(1);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [past, setPast] = useState<Overlay[][]>([]);
  const [future, setFuture] = useState<Overlay[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [active, setActive] = useState<OverlayKind | "select">("select");
  const [draft, setDraft] = useState<Overlay | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const [rasterize, setRasterize] = useState(false);
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [flatten, setFlatten] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [saved, setSaved] = useState<{ name: string; dataUrl: string }[]>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem("onno-signatures") ?? "[]");
      return Array.isArray(raw) ? raw.filter((item): item is { name: string; dataUrl: string } => typeof item?.dataUrl === "string") : [];
    } catch {
      return [];
    }
  });
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [signers, setSigners] = useState<Signer[]>([{ id: newId(), name: "Signer 1", color: signerColors[0] }]);
  const [signerIndex, setSignerIndex] = useState(0);
  const [ops, setOps] = useState<PageOps>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ id: string; start: { x: number; y: number }; original: Overlay; resize: boolean; before: Overlay[] } | null>(null);

  const selected = overlays.find((item) => item.id === selectedId) ?? null;
  const isForm = toolId === "build-form" || toolId === "request-signatures";
  const isFill = toolId === "fill-form";
  const isSign = toolId === "sign-pdf";
  const isEdit = toolId === "edit-pdf";
  const isShare = toolId === "share-pdf";

  useEffect(() => {
    if (!file || isShare) return;
    let alive = true;
    void pageCount(file).then((count) => { if (alive) { setPages(count); setPage((value) => Math.min(value, count)); } }).catch(() => {});
    return () => { alive = false; };
  }, [file, isShare]);

  useEffect(() => {
    if (!file || isShare) return;
    let alive = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    void renderPage(file, page, canvas, zoom).then((size) => { if (alive) setStageSize(size); }).catch((error: Error) => {
      if (alive) setMessage(error.message);
    });
    return () => { alive = false; };
  }, [file, page, zoom, isShare]);

  useEffect(() => {
    if (!file || !isFill) return;
    void listFormFields(file).then((found) => {
      setFields(found);
      setValues(Object.fromEntries(found.map((field) => [field.name, field.value])));
    }).catch((error: Error) => setMessage(error.message));
  }, [file, isFill]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { event.preventDefault(); removeSelected(); return; }
      if (selectedId && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 0.02 : 0.005;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        commit(overlays.map((item) => item.id === selectedId ? { ...item, x: item.x + dx, y: item.y + dy } : item));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function commit(next: Overlay[]) {
    setPast((list) => [...list, overlays].slice(-40));
    setFuture([]);
    setOverlays(next);
  }

  function undo() {
    if (!past.length) return;
    setFuture((list) => [overlays, ...list].slice(0, 40));
    setOverlays(past[past.length - 1]);
    setPast((list) => list.slice(0, -1));
  }

  function redo() {
    if (!future.length) return;
    setPast((list) => [...list, overlays]);
    setOverlays(future[0]);
    setFuture((list) => list.slice(1));
  }

  function removeSelected() {
    if (!selectedId) return;
    commit(overlays.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  function fieldDefault(type: FieldSpec["type"]): FieldSpec {
    const signer = signers[signerIndex];
    return {
      type,
      name: isSign ? `signature_${overlays.length + 1}` : `${type}_${overlays.length + 1}`,
      required: false,
      options: type === "dropdown" ? ["Yes", "No"] : undefined,
      signer: toolId === "request-signatures" ? signer.name : undefined,
    };
  }

  function point(event: ReactPointerEvent) {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function onStageDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset.canvas) return;
    if (active === "select") { setSelectedId(null); return; }
    const p = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if ((active === "image" || (active === "signature" && isSign)) && !pendingImage) {
      setMessage(active === "image" ? "Choose an image in the side panel first." : "Create or choose a signature first.");
      return;
    }
    if (isForm && fieldTools.includes(active as FieldSpec["type"])) {
      const fieldOverlay: Overlay = {
        id: newId(), kind: "field", page, x: p.x, y: p.y, w: 0.32, h: 0.06,
        color: toolId === "request-signatures" ? signers[signerIndex].color : color,
        field: fieldDefault(active as FieldSpec["type"]),
      };
      commit([...overlays, fieldOverlay]);
      setSelectedId(fieldOverlay.id);
      setActive("select");
      return;
    }
    if (active === "text") {
      const textOverlay: Overlay = { id: newId(), kind: "text", page, x: p.x, y: p.y, w: 0.3, h: 0.06, text: "Text", size, color, font };
      commit([...overlays, textOverlay]);
      setSelectedId(textOverlay.id);
      setActive("select");
      return;
    }
    if (active === "image" || active === "signature") {
      const placed: Overlay = {
        id: newId(), kind: active, page, x: p.x, y: p.y,
        w: active === "signature" ? 0.28 : 0.3,
        h: active === "signature" ? 0.08 : 0.2,
        dataUrl: pendingImage ?? undefined,
      };
      commit([...overlays, placed]);
      setSelectedId(placed.id);
      setActive("select");
      return;
    }
    const base: Overlay = { id: newId(), kind: active as OverlayKind, page, x: p.x, y: p.y, w: 0, h: 0, color, width: 2, size };
    if (active === "draw") base.points = [p];
    setDraft(base);
  }

  function onStageMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      const { id, start, original, resize } = dragRef.current;
      const p = point(event);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      setOverlays((list) => list.map((item) => item.id === id ? resize
        ? { ...item, w: Math.max(0.02, original.w + dx), h: Math.max(0.02, original.h + dy) }
        : { ...item, x: Math.max(0, Math.min(1 - original.w, original.x + dx)), y: Math.max(0, Math.min(1 - original.h, original.y + dy)) } : item));
      return;
    }
    if (!draft) return;
    const p = point(event);
    setDraft(draft.kind === "draw" && draft.points
      ? { ...draft, points: [...draft.points, p] }
      : { ...draft, w: p.x - draft.x, h: p.y - draft.y });
  }

  function onStageUp() {
    if (dragRef.current) {
      setPast((list) => [...list, dragRef.current!.before].slice(-40));
      setFuture([]);
      dragRef.current = null;
    }
    if (!draft) return;
    const tooSmall = draft.kind !== "draw" && (Math.abs(draft.w) < 0.01 || Math.abs(draft.h) < 0.01);
    if (tooSmall && draft.kind !== "draw") {
      const clicked: Overlay = { ...draft, w: 0.22, h: 0.05 };
      commit([...overlays, clicked]);
      setSelectedId(clicked.id);
    } else if (draft.kind === "draw" && (draft.points?.length ?? 0) > 1 || !tooSmall) {
      const normal = draft.kind === "draw"
        ? draft
        : { ...draft, x: Math.min(draft.x, draft.x + draft.w), y: Math.min(draft.y, draft.y + draft.h), w: Math.abs(draft.w), h: Math.abs(draft.h) };
      if (draft.kind === "image" || draft.kind === "signature") normal.dataUrl = pendingImage ?? undefined;
      commit([...overlays, normal]);
      setSelectedId(normal.id);
    }
    setDraft(null);
    setActive("select");
  }

  function startDrag(event: ReactPointerEvent, item: Overlay, resize: boolean) {
    event.stopPropagation();
    setSelectedId(item.id);
    if (active !== "select") return;
    stageRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = { id: item.id, start: point(event), original: item, resize, before: overlays };
  }

  function patchSelected(changes: Partial<Overlay>) {
    if (!selected) return;
    setOverlays((list) => list.map((item) => item.id === selected.id ? { ...item, ...changes } : item));
  }

  function patchField(changes: Partial<FieldSpec>) {
    if (!selected?.field) return;
    setOverlays((list) => list.map((item) => item.id === selected.id ? { ...item, field: { ...item.field!, ...changes } } : item));
  }

  function saveSignature(dataUrl: string) {
    const item = { name: `Signature ${saved.length + 1}`, dataUrl };
    const next = [...saved, item];
    setSaved(next);
    try { localStorage.setItem("onno-signatures", JSON.stringify(next)); } catch { /* optional */ }
    setPendingImage(dataUrl);
    setActive("signature");
    setSignOpen(false);
  }

  async function runExport() {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      let bytes: Uint8Array;
      if (isFill) bytes = await fillForm(file, values, flatten);
      else if (isForm) bytes = await buildForm(file, overlays, ops);
      else bytes = await applyOverlays(file, overlays, ops, rasterize);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      setResult({ blob, name: `${baseName(file.name)}.converted.pdf` });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export this PDF.");
    } finally {
      setBusy(false);
    }
  }

  function changePage(delta: number) { setPage((value) => Math.max(1, Math.min(999, value + delta))); }

  const toolbar: { id: OverlayKind | "select"; label: string; icon: typeof Type; show: boolean }[] = [
    { id: "select", label: "Select", icon: MousePointer2, show: true },
    { id: "text", label: "Text", icon: Type, show: isEdit || isSign },
    { id: "rect", label: "Rectangle", icon: Square, show: isEdit },
    { id: "ellipse", label: "Ellipse", icon: Circle, show: isEdit },
    { id: "line", label: "Line", icon: Minus, show: isEdit },
    { id: "arrow", label: "Arrow", icon: ArrowRight, show: isEdit },
    { id: "draw", label: "Draw", icon: Pencil, show: isEdit },
    { id: "image", label: "Image", icon: ImageIcon, show: isEdit },
    { id: "whiteout", label: "Whiteout", icon: Eraser, show: isEdit },
    { id: "redact", label: "Redact", icon: Eraser, show: isEdit },
    { id: "signature", label: "Signature", icon: PenTool, show: isSign },
    ...fieldTools.map((type) => ({ id: type as OverlayKind, label: type[0].toUpperCase() + type.slice(1), icon: type === "date" ? CalendarDays : type === "signature" ? PenTool : ListChecks, show: isForm })),
  ];

  return (
    <div className="pb-32 lg:pb-0">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/#tools" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> All tools</Link>
        <span className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium text-muted">{tool.label}</span>
        <span className="flex-1" />
        {file && !isShare && <Button size="sm" variant="secondary" onClick={() => void runExport()} loading={busy}><Download className="h-4 w-4" /> Export PDF</Button>}
      </div>

      {message && <p className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning" role="status">{message}</p>}
      {result && <div className="mb-4"><ShareBar blob={result.blob} name={result.name} note={tool.note} /></div>}

      {!file ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-[var(--accent-text)]"><Upload className="h-6 w-6" /></span>
          <p className="text-lg font-semibold">Choose a PDF to {tool.label.toLowerCase()}</p>
          <p className="max-w-sm text-sm text-muted">Everything happens in this browser. Your file is never uploaded.</p>
          <Button onClick={() => document.querySelector<HTMLInputElement>('input[type="file"][data-workspace-input]')?.click()}>Choose a PDF</Button>
          <input data-workspace-input type="file" accept=".pdf,application/pdf" className="sr-only" aria-label="Choose a PDF" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); setPage(1); event.target.value = ""; }} />
        </Card>
      ) : isShare ? (
        <ShareBar blob={file} name={`${baseName(file.name)}.pdf`} note="No upload, no hosted link, no account. Email apps cannot attach a local file from a link; attach the downloaded file yourself." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div role="toolbar" aria-label="PDF editor tools" className="sticky top-16 z-20 mb-3 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface/95 p-2 shadow-sm backdrop-blur">
              {toolbar.filter((item) => item.show).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={active === id}
                  onClick={() => setActive(id)}
                  className={cn("flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-xs", active === id ? "bg-brand text-[var(--accent-contrast)]" : "text-muted hover:bg-surface-2")}
                >
                  <Icon className="h-4 w-4" /> <span className="ml-1 hidden sm:inline">{label}</span>
                </button>
              ))}
              <span className="mx-1 w-px shrink-0 bg-line" />
              <button type="button" title="Undo" aria-label="Undo" onClick={undo} disabled={!past.length} className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
              <button type="button" title="Redo" aria-label="Redo" onClick={redo} disabled={!future.length} className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
              <button type="button" title="Delete selected" aria-label="Delete selected" onClick={removeSelected} disabled={!selectedId} className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-danger hover:bg-danger/10 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>

            <div className="overflow-auto rounded-2xl border border-line bg-surface-2 p-4">
              <div className="mx-auto" style={{ width: stageSize.width }}>
                <div
                  ref={stageRef}
                  data-active={active}
                  className="relative mx-auto touch-none bg-white shadow-lg"
                  style={{ width: stageSize.width, height: stageSize.height }}
                  onPointerDown={onStageDown}
                  onPointerMove={onStageMove}
                  onPointerUp={onStageUp}
                  onPointerCancel={onStageUp}
                >
                  <canvas ref={canvasRef} data-canvas="true" className="absolute inset-0 h-full w-full" />
                  {overlays.filter((item) => item.page === page).map((item) => (
                    <OverlayView key={item.id} item={item} selected={item.id === selectedId} onPointerDown={(event) => startDrag(event, item, false)} onResize={(event) => startDrag(event, item, true)} />
                  ))}
                  {draft && draft.page === page && <OverlayView item={draft} selected={false} />}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
              <Button size="sm" variant="ghost" aria-label="Previous page" onClick={() => changePage(-1)} disabled={page <= 1}><ArrowLeft className="h-4 w-4" /></Button>
              <span className="min-w-20 text-center text-muted">Page {page}</span>
              <Button size="sm" variant="ghost" aria-label="Next page" onClick={() => changePage(1)} disabled={page >= pages}><ArrowRight className="h-4 w-4" /></Button>
              <span className="mx-2 w-px bg-line" />
              <Button size="sm" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.25) * 100) / 100))}><ZoomOut className="h-4 w-4" /></Button>
              <span className="min-w-12 text-center text-muted">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2, Math.round((value + 0.25) * 100) / 100))}><ZoomIn className="h-4 w-4" /></Button>
            </div>
          </div>

          <aside className="space-y-4">
            <Card className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Properties</p>
              {!selected && <p className="text-sm text-muted">Pick a tool, then click the page. Select an object to move or resize it. Arrow keys nudge; Delete removes.</p>}
              {selected && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{selected.kind} object · page {selected.page}</p>
                  {selected.kind === "text" && (
                    <>
                      <label className="block text-xs font-medium">Text<textarea value={selected.text ?? ""} onChange={(event) => patchSelected({ text: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-line bg-surface p-2 text-sm" /></label>
                      <label className="block text-xs font-medium">Size<input type="number" min={6} max={96} value={selected.size ?? 14} onChange={(event) => patchSelected({ size: Number(event.target.value) })} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2" /></label>
                      <label className="block text-xs font-medium">Font<select value={selected.font ?? "sans"} onChange={(event) => patchSelected({ font: event.target.value as "sans" | "bengali" })} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2"><option value="sans">Latin</option><option value="bengali">Bengali (বাংলা)</option></select></label>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(selected.bold)} onChange={(event) => patchSelected({ bold: event.target.checked })} className="accent-brand" /> Bold</label>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(selected.italic)} onChange={(event) => patchSelected({ italic: event.target.checked })} className="accent-brand" /> Italic</label>
                    </>
                  )}
                  <label className="block text-xs font-medium">Color<input type="color" value={selected.color ?? "#6d5efc"} onChange={(event) => patchSelected({ color: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface p-1" /></label>
                  {selected.field && (
                    <>
                      <label className="block text-xs font-medium">Name<input value={selected.field.name} onChange={(event) => patchField({ name: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2" /></label>
                      <label className="block text-xs font-medium">Default<input value={selected.field.defaultValue ?? ""} onChange={(event) => patchField({ defaultValue: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2" /></label>
                      <label className="block text-xs font-medium">Tooltip<input value={selected.field.tooltip ?? ""} onChange={(event) => patchField({ tooltip: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2" /></label>
                      <label className="block text-xs font-medium">Max length<input type="number" value={selected.field.maxLength ?? 0} onChange={(event) => patchField({ maxLength: Number(event.target.value) || undefined })} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2" /></label>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(selected.field.required)} onChange={(event) => patchField({ required: event.target.checked })} className="accent-brand" /> Required flag</label>
                      {selected.field.type === "dropdown" && <label className="block text-xs font-medium">Options (comma separated)<input value={(selected.field.options ?? []).join(", ")} onChange={(event) => patchField({ options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2" /></label>}
                    </>
                  )}
                  <Button size="sm" variant="secondary" onClick={removeSelected}><Trash2 className="h-4 w-4" /> Delete object</Button>
                </div>
              )}
            </Card>

            {isFill && (
              <Card className="p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Form fields · {fields.length}</p>
                {fields.length === 0 && <p className="text-sm text-muted">No AcroForm fields were found in this PDF.</p>}
                <div className="max-h-80 space-y-3 overflow-y-auto">
                  {fields.map((field) => (
                    <label key={field.name} className="block text-xs font-medium">
                      {field.name} <span className="font-normal text-subtle">({field.type})</span>
                      <input value={values[field.name] ?? field.value} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2" />
                    </label>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={flatten} onChange={(event) => setFlatten(event.target.checked)} className="accent-brand" /> Flatten fields into static text</label>
              </Card>
            )}

            {isSign && (
              <Card className="p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Signatures</p>
                <Button className="w-full" size="sm" onClick={() => setSignOpen(true)}><PenTool className="h-4 w-4" /> Create signature</Button>
                {saved.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{saved.map((item) => <button key={item.dataUrl} type="button" aria-label={item.name} onClick={() => { setPendingImage(item.dataUrl); setActive("signature"); }} className="rounded-lg border border-line bg-white p-1"><span className="mx-auto block h-12 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${item.dataUrl})` }} /></button>)}</div>}
                <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => { setSaved([]); try { localStorage.removeItem("onno-signatures"); } catch { /* optional */ } }}>Clear saved signatures</Button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { commit([...overlays, { id: newId(), kind: "text", page, x: 0.1, y: 0.9, w: 0.3, h: 0.05, text: new Date().toLocaleDateString(), size: 12, color }]); }}>Date stamp</Button>
                  <Button size="sm" variant="secondary" onClick={() => { commit([...overlays, { id: newId(), kind: "text", page, x: 0.1, y: 0.84, w: 0.3, h: 0.05, text: "Name", size: 12, color }]); }}>Name field</Button>
                </div>
              </Card>
            )}

            {isEdit && (
              <>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Insert</p>
                  <label className="block text-xs font-medium">Image<input type="file" accept="image/*" aria-label="Image to place" onChange={(event) => { const f = event.target.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => { setPendingImage(String(reader.result)); setActive("image"); }; reader.readAsDataURL(f); }} className="mt-1 block w-full text-xs" /></label>
                  <label className="mt-3 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={rasterize} onChange={(event) => setRasterize(event.target.checked)} className="accent-brand" /> Rasterize redacted pages (actually removes covered text; page becomes an image)</label>
                  <p className="mt-2 text-xs text-subtle">Whiteout only covers text visually. Select “Redact” and enable rasterize for real removal.</p>
                </Card>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Page actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setOps((o) => ({ ...o, rotate: { ...o.rotate, [page]: ((o.rotate?.[page] ?? 0) + 90) % 360 } })); setMessage(`Page ${page} will rotate on export.`); }}><RotateCw className="h-4 w-4" /> Rotate</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setOps((o) => ({ ...o, remove: [...(o.remove ?? []), page] })); setMessage(`Page ${page} will be removed on export.`); }}><Trash2 className="h-4 w-4" /> Delete</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setOps((o) => ({ ...o, addBlank: (o.addBlank ?? 0) + 1 })); setMessage("A blank page will be added on export."); }}><FilePlus2 className="h-4 w-4" /> Add page</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setOps((o) => ({ ...o, reorder: [pages, ...Array.from({ length: pages - 1 }, (_, i) => i + 1)] })); setMessage("Pages will be reversed on export."); }}>Reverse</Button>
                  </div>
                </Card>
              </>
            )}

            {toolId === "request-signatures" && (
              <Card className="p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Signers · {signers.length}/5</p>
                {signers.map((signer, index) => (
                  <button key={signer.id} type="button" onClick={() => setSignerIndex(index)} className={cn("mb-2 flex w-full items-center gap-2 rounded-lg border p-2 text-left text-xs", index === signerIndex ? "border-brand bg-brand-soft" : "border-line")}>
                    <span className="h-4 w-4 rounded-full" style={{ background: signer.color }} />
                    <input value={signer.name} aria-label={`Signer ${index + 1} name`} onChange={(event) => setSigners((list) => list.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} className="min-w-0 flex-1 bg-transparent" />
                  </button>
                ))}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" disabled={signers.length >= 5} onClick={() => { setSigners((list) => [...list, { id: newId(), name: `Signer ${list.length + 1}`, color: signerColors[list.length % signerColors.length] }]); }}>Add signer</Button>
                  <Button size="sm" variant="ghost" disabled={signers.length <= 1} onClick={() => { setSigners((list) => list.slice(0, -1)); setSignerIndex(0); }}>Remove</Button>
                </div>
                <p className="mt-3 text-xs text-subtle">This app cannot send requests or track signatures. Export and share the PDF yourself.</p>
              </Card>
            )}
            <p className="text-xs leading-relaxed text-subtle">{tool.note}</p>
          </aside>
        </div>
      )}

      <Dialog open={signOpen} onClose={() => setSignOpen(false)} title="Create a signature">
        <SignaturePad onSave={saveSignature} />
      </Dialog>
      <div aria-live="polite" className="sr-only">{busy ? "Exporting PDF" : ""}</div>
    </div>
  );
}

function OverlayView({ item, selected, onPointerDown, onResize }: {
  item: Overlay;
  selected: boolean;
  onPointerDown?: (event: ReactPointerEvent) => void;
  onResize?: (event: ReactPointerEvent) => void;
}) {
  const style = { left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.w * 100}%`, height: `${item.h * 100}%` };
  if (item.kind === "draw" && item.points?.length) {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <polyline points={item.points.map((p) => `${p.x * 100}%,${p.y * 100}%`).join(" ")} fill="none" stroke={item.color} strokeWidth={item.width ?? 2} />
      </svg>
    );
  }
  return (
    <div
      data-overlay="true"
      style={style}
      onPointerDown={onPointerDown}
      className={cn("absolute cursor-move", selected && "outline-2 outline-brand")}
    >
      {item.kind === "text" && <div className="truncate leading-tight" style={{ fontSize: item.size ?? 14, color: item.color, fontWeight: item.bold ? 700 : 400, fontStyle: item.italic ? "italic" : "normal", fontFamily: item.font === "bengali" ? "var(--font-bengali), sans-serif" : undefined }}>{item.text}</div>}
      {(item.kind === "image" || item.kind === "signature") && item.dataUrl && <span className="block h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${item.dataUrl})` }} />}
      {item.kind === "rect" && <div className="h-full w-full border-2" style={{ borderColor: item.color }} />}
      {item.kind === "ellipse" && <div className="h-full w-full rounded-[50%] border-2" style={{ borderColor: item.color }} />}
      {item.kind === "line" && <div className="h-0.5 w-full origin-top-left -rotate-12" style={{ background: item.color }} />}
      {item.kind === "arrow" && <div className="flex h-full items-center"><div className="h-0.5 flex-1" style={{ background: item.color }} /><ArrowRight className="h-4 w-4" style={{ color: item.color }} /></div>}
      {(item.kind === "whiteout" || item.kind === "redact") && <div className="h-full w-full bg-white ring-1 ring-black/10" />}
      {item.kind === "field" && <div className="h-full w-full rounded border border-dashed text-[10px]" style={{ borderColor: item.color ?? "#6d5efc", color: item.color ?? "#6d5efc" }}>{item.field?.name ?? "field"}</div>}
      {selected && onResize && <button type="button" aria-label="Resize object" onPointerDown={onResize} className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border-2 border-white bg-brand" />}
    </div>
  );
}
