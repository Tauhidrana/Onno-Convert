"use client";

import Image from "next/image";
import { GripVertical, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { openPdf } from "@/convert/pdfjs";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Visual page order/selection for PDF tools. Text fields remain the source of truth. */
export function PdfPageGrid({
  file,
  toolId,
  order,
  onChange,
}: {
  file: File | null;
  toolId: string;
  order: string;
  onChange: (key: string, value: string) => void;
}) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [selection, setSelection] = useState<number[]>([]);
  const [drag, setDrag] = useState<number | null>(null);

  const listed = order.trim() ? order.split(",").map((part) => Number(part.trim())).filter(Number.isInteger) : thumbs.map((_, i) => i + 1);
  const total = thumbs.length;

  useEffect(() => {
    if (!file || file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return;
    let alive = true;
    void (async () => {
      try {
        const doc = await openPdf(file);
        const images: string[] = [];
        for (let number = 1; number <= Math.min(doc.numPages, 24); number++) {
          const page = await doc.getPage(number);
          const base = page.getViewport({ scale: 1 });
          const scale = 110 / base.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) break;
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          images.push(canvas.toDataURL("image/jpeg", 0.7));
          if (!alive) return;
        }
        if (alive) {
          setThumbs(images);
          setSelection(images.map((_, i) => i + 1));
        }
      } catch {
        if (alive) setThumbs([]);
      }
    })();
    return () => { alive = false; };
  }, [file]);

  if (!file || !total) return null;

  function commit(next: number[]) {
    setSelection(next);
    onChange("Page order", next.join(",") === thumbs.map((_, i) => i + 1).join(",") ? "" : next.join(","));
  }

  function toggle(page: number) {
    const next = selection.includes(page) ? selection.filter((item) => item !== page) : [...selection, page].sort((a, b) => a - b);
    setSelection(next);
    onChange("Pages", next.join(",") === thumbs.map((_, i) => i + 1).join(",") ? "" : next.join(","));
  }

  return (
    <div className="border-b border-line pb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Pages · {total}</p>
        {toolId === "reorder-pdf" && <Button size="sm" variant="ghost" onClick={() => commit(thumbs.map((_, i) => i + 1))}>Restore order</Button>}
      </div>
      <ul className="flex flex-wrap gap-2">
        {listed.map((page, index) => (
          <li
            key={`${page}-${index}`}
            draggable={toolId === "reorder-pdf"}
            onDragStart={() => setDrag(index)}
            onDragOver={(event) => { if (toolId === "reorder-pdf") event.preventDefault(); }}
            onDrop={(event) => {
              event.preventDefault();
              if (drag === null || drag === index) return;
              const next = [...listed];
              const [moved] = next.splice(drag, 1);
              next.splice(index, 0, moved);
              setDrag(null);
              commit(next);
            }}
            className="w-[110px] rounded-lg border border-line bg-surface-2 p-1.5 text-center"
          >
            {thumbs[page - 1] ? (
              <Image src={thumbs[page - 1]} alt={`Page ${page}`} width={100} height={130} unoptimized className="mx-auto aspect-[1/1.3] w-full rounded object-contain" />
            ) : <div className="onno-skeleton aspect-[1/1.3] w-full rounded" />}
            <div className="mt-1 flex items-center justify-center gap-1 text-xs text-muted">
              {toolId === "reorder-pdf" && <GripVertical className="h-3 w-3" aria-hidden="true" />}
              <span>{index + 1} · page {page}</span>
            </div>
            {toolId === "reorder-pdf" && (
              <div className="mt-1 flex justify-center gap-1">
                <button type="button" aria-label={`Remove page ${page}`} onClick={() => commit(listed.filter((_, i) => i !== index))} className="flex h-8 w-8 items-center justify-center rounded text-danger hover:bg-danger/10"><Trash2 className="h-3 w-3" /></button>
              </div>
            )}
            {toolId === "rotate-pdf" && (
              <button
                type="button"
                aria-label={`Select page ${page}`}
                aria-pressed={selection.includes(page)}
                onClick={() => toggle(page)}
                className={cn("mt-1 flex h-8 w-full items-center justify-center gap-1 rounded text-xs", selection.includes(page) ? "bg-brand-soft text-[var(--accent-text)]" : "text-muted hover:bg-surface")}
              >
                <RotateCw className="h-3 w-3" /> {selection.includes(page) ? "Selected" : "Select"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {toolId === "split-pdf" && <p className="mt-2 text-xs text-muted">Use Ranges below to choose where each split ends.</p>}
    </div>
  );
}
