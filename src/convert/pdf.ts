import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { baseName, extOf, outputName } from "@/lib/utils";
import { canvasToBlob } from "./image";
import { openPdf, parsePageSpec } from "./pdfjs";
import type { ConvertOptions, ConverterModule, OutputFile } from "./types";

const SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

function parsePages(spec: string | undefined, total: number): number[] {
  const text = String(spec ?? "").trim();
  if (!text) return Array.from({ length: total }, (_, i) => i);
  const out: number[] = [];
  for (const part of text.split(",")) {
    const [a, b] = part.split("-").map((s) => Number(s.trim()));
    if (!Number.isInteger(a) || a < 1 || a > total) throw new Error(`Page ${a} is out of range (1–${total}).`);
    const end = b === undefined ? a : b;
    if (!Number.isInteger(end) || end < a || end > total) throw new Error(`Range “${part.trim()}” is invalid.`);
    for (let n = a; n <= end; n++) out.push(n - 1);
  }
  return [...new Set(out)];
}

function parseRanges(spec: string, total: number): { label: string; pages: number[] }[] {
  const text = spec.trim();
  if (!text) throw new Error("Enter at least one page range, e.g. 1-3,4.");
  return text.split(",").map((part) => {
    const trimmed = part.trim();
    const pages = parsePages(trimmed, total);
    return { label: trimmed.replace(/[^\d-]/g, ""), pages };
  });
}

async function load(file: File) {
  try {
    return await PDFDocument.load(await file.arrayBuffer());
  } catch {
    throw new Error(`“${file.name}” could not be read. Password-protected or corrupt PDFs are not supported.`);
  }
}

async function save(doc: PDFDocument) {
  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

async function embedImage(doc: PDFDocument, file: File) {
  const ext = extOf(file.name);
  if (ext === "jpg" || ext === "jpeg") return doc.embedJpg(await file.arrayBuffer());
  if (ext === "png") return doc.embedPng(await file.arrayBuffer());
  const { decodeImage, flatten, canvasToBlob } = await import("./image");
  const canvas = flatten(await decodeImage(file));
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  return doc.embedJpg(await blob.arrayBuffer());
}

async function imageToPdf(files: File[], opts: ConvertOptions, onProgress: (p: number) => void) {
  const doc = await PDFDocument.create();
  const margin = Number(opts.margin) || 0;
  const pageSize = String(opts.pageSize);
  const orientation = String(opts.orientation);
  for (let i = 0; i < files.length; i++) {
    const image = await embedImage(doc, files[i]);
    const iw = image.width;
    const ih = image.height;
    let [pw, ph] = SIZES[pageSize] ?? [iw + margin * 2, ih + margin * 2];
    const wantLandscape = orientation === "landscape" || (orientation === "auto" && iw > ih);
    if (wantLandscape) [pw, ph] = [Math.max(pw, ph), Math.min(pw, ph)];
    else if (orientation === "portrait" || orientation === "auto") [pw, ph] = [Math.min(pw, ph), Math.max(pw, ph)];
    const page = doc.addPage([pw, ph]);
    const scale = Math.min((pw - margin * 2) / iw, (ph - margin * 2) / ih);
    page.drawImage(image, {
      x: (pw - iw * scale) / 2,
      y: (ph - ih * scale) / 2,
      width: iw * scale,
      height: ih * scale,
    });
    onProgress((i + 1) / files.length);
  }
  return [{ blob: await save(doc), name: outputName(files[0].name, "pdf") }];
}

async function textToPdf(file: File, opts: ConvertOptions) {
  const text = await file.text();
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const size = Number(opts.fontSize) || 11;
  const [pw, ph] = SIZES[String(opts.pageSize)] ?? SIZES.a4;
  const margin = 56;
  const maxWidth = pw - margin * 2;
  const lineHeight = size * 1.45;
  let page = doc.addPage([pw, ph]);
  let y = ph - margin;

  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      y -= lineHeight;
      if (y < margin) {
        page = doc.addPage([pw, ph]);
        y = ph - margin;
      }
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (helvetica.widthOfTextAtSize(next, size) > maxWidth && line) {
        page.drawText(line, { x: margin, y, size, font: helvetica });
        y -= lineHeight;
        if (y < margin) {
          page = doc.addPage([pw, ph]);
          y = ph - margin;
        }
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      page.drawText(line, { x: margin, y, size, font: helvetica });
      y -= lineHeight;
    }
    if (y < margin) {
      page = doc.addPage([pw, ph]);
      y = ph - margin;
    }
  }
  return [{ blob: await save(doc), name: outputName(file.name, "pdf") }];
}

async function pdfToImages(file: File, opts: ConvertOptions, onProgress: (p: number) => void) {
  const doc = await openPdf(file);
  const pages = parsePageSpec(opts.pages, doc.numPages);
  const dpi = Math.min(400, Math.max(72, Number(opts.dpi) || 150));
  const format = String(opts.format) === "jpg" ? "jpg" : String(opts.format);
  const mime = format === "jpg" ? "image/jpeg" : `image/${format}`;
  const out: OutputFile[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = await doc.getPage(pages[i]);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
    out.push({
      blob: await canvasToBlob(canvas, mime, format === "png" ? undefined : 0.9),
      name: `${baseName(file.name)}-page-${pages[i]}.${format}`,
    });
    onProgress((i + 1) / pages.length);
  }
  return out;
}

async function pdfToText(file: File, opts: ConvertOptions, onProgress: (p: number) => void) {
  const doc = await openPdf(file);
  const pages = parsePageSpec(opts.pages, doc.numPages);
  const chunks: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = await doc.getPage(pages[i]);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      text += item.str ?? "";
      if (item.hasEOL) text += "\n";
    }
    chunks.push(text.trim());
    onProgress((i + 1) / pages.length);
  }
  return [{ blob: new Blob([chunks.join("\n\n")], { type: "text/plain;charset=utf-8" }), name: outputName(file.name, "txt") }];
}

export const convert: ConverterModule["convert"] = async (files, opts, onProgress) => {
  const action = String(opts.__action);
  const file = files[0];

  if (action === "image-pdf") return imageToPdf(files, opts, onProgress);
  if (action === "text-pdf") {
    try {
      return await textToPdf(file, opts);
    } catch (error) {
      if (error instanceof Error && /WinAnsi|encode/i.test(error.message)) {
        throw new Error("This text has characters the built-in PDF font cannot encode (e.g. Bangla, Arabic, CJK). Convert to TXT instead.");
      }
      throw error;
    }
  }
  if (action === "images") return pdfToImages(file, opts, onProgress);
  if (action === "text") return pdfToText(file, opts, onProgress);

  if (action === "merge") {
    const doc = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      const source = await load(files[i]);
      const copied = await doc.copyPages(source, source.getPageIndices());
      copied.forEach((p) => doc.addPage(p));
      onProgress((i + 1) / files.length);
    }
    return [{ blob: await save(doc), name: outputName(files[0].name, "pdf") }];
  }

  const source = await load(file);
  const total = source.getPageCount();
  onProgress(0.3);

  if (action === "split") {
    const ranges = parseRanges(String(opts.ranges), total);
    const out: OutputFile[] = [];
    for (const range of ranges) {
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(source, range.pages);
      copied.forEach((p) => doc.addPage(p));
      out.push({ blob: await save(doc), name: `${baseName(file.name)}-pages-${range.label}.pdf` });
    }
    return out;
  }

  if (action === "rotate") {
    const angle = Number(opts.angle) || 90;
    for (const index of parsePages(String(opts.pages), total)) {
      const page = source.getPage(index);
      page.setRotation(degrees((page.getRotation().angle + angle) % 360));
    }
    return [{ blob: await save(source), name: outputName(file.name, "pdf") }];
  }

  if (action === "reorder") {
    const order = String(opts.order ?? "").trim();
    if (!order) throw new Error("Enter a page order, e.g. 3,1,2.");
    const indexes = order.split(",").map((s) => {
      const n = Number(s.trim());
      if (!Number.isInteger(n) || n < 1 || n > total) throw new Error(`Page ${s.trim()} is out of range (1–${total}).`);
      return n - 1;
    });
    const doc = await PDFDocument.create();
    const copied = await doc.copyPages(source, indexes);
    copied.forEach((p) => doc.addPage(p));
    return [{ blob: await save(doc), name: outputName(file.name, "pdf") }];
  }

  if (action === "compress") {
    return [{ blob: await save(source), name: outputName(file.name, "pdf") }];
  }

  throw new Error(`Unknown PDF action: ${action}`);
};

export const print: NonNullable<ConverterModule["print"]> = async (files) => {
  const html = await files[0].text();
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "HTML print preview");
  frame.srcdoc = html;
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    setTimeout(resolve, 3000);
  });
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    throw new Error("The browser blocked the print frame.");
  }
  win.focus();
  win.print();
  // The print dialog is async; keep the frame alive long enough for "Save as PDF".
  setTimeout(() => frame.remove(), 120_000);
};
