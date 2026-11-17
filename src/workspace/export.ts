import type { PDFDocument, PDFPage, PDFFont } from "pdf-lib";
import "regenerator-runtime/runtime";
import { rasterizeWithBoxes } from "./pdf-doc";
import type { Overlay } from "./model";

type Lib = typeof import("pdf-lib");
type Fontkit = (document: PDFDocument) => void;
let libPromise: Promise<Lib> | null = null;
function lib(): Promise<Lib> {
  libPromise ??= import("pdf-lib");
  return libPromise;
}

export interface PageOps {
  remove?: number[];
  rotate?: Record<number, number>;
  reorder?: number[];
  addBlank?: number;
}

function hexColor(value: string | undefined, pdf: Lib) {
  const hex = (value ?? "#141416").replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.padEnd(6, "0");
  return pdf.rgb(
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  );
}

/** Maps normalised top-left coordinates to unrotated PDF user space (CropBox-aware). */
export function mapPoint(page: PDFPage, x: number, y: number) {
  const crop = page.getCropBox();
  const rotation = page.getRotation().angle;
  const w = crop.width;
  const h = crop.height;
  let cx: number;
  let cy: number;
  if (rotation === 90) { cx = y * w; cy = h - x * h; }
  else if (rotation === 180) { cx = w - x * w; cy = h - y * h; }
  else if (rotation === 270) { cx = w - y * w; cy = x * h; }
  else { cx = x * w; cy = y * h; }
  return { x: crop.x + cx, y: crop.y + (h - cy), width: w, height: h };
}

function rectFor(page: PDFPage, o: Overlay) {
  const a = mapPoint(page, o.x, o.y);
  const b = mapPoint(page, o.x + o.w, o.y + o.h);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x) || 1, height: Math.abs(b.y - a.y) || 1 };
}

async function loadFont(pdf: PDFDocument, fontkit: Fontkit, kind: "sans" | "bengali", bold: boolean, italic: boolean, standard: Lib["StandardFonts"]): Promise<PDFFont> {
  if (kind === "bengali") {
    const response = await fetch("/fonts/NotoSansBengali.ttf");
    if (!response.ok) throw new Error("The Bengali font could not be loaded.");
    return pdf.embedFont(await response.arrayBuffer(), { subset: true });
  }
  const name = bold && italic ? standard.HelveticaBoldOblique : bold ? standard.HelveticaBold : italic ? standard.HelveticaOblique : standard.Helvetica;
  return pdf.embedFont(name);
}

async function drawOverlay(pdf: PDFDocument, page: PDFPage, o: Overlay, fontkit: Fontkit, standard: Lib["StandardFonts"], rasterized: boolean) {
  const color = hexColor(o.color, (await lib()));
  const r = rasterized
    ? { x: o.x * page.getWidth(), y: page.getHeight() - (o.y + o.h) * page.getHeight(), width: o.w * page.getWidth(), height: o.h * page.getHeight() }
    : rectFor(page, o);

  if (o.kind === "text" && o.text) {
    const font = await loadFont(pdf, fontkit, o.font ?? "sans", Boolean(o.bold), Boolean(o.italic), standard);
    const size = o.size ?? 14;
    const at = rasterized ? { x: r.x, y: page.getHeight() - o.y * page.getHeight() - size } : mapPoint(page, o.x, o.y);
    page.drawText(o.text, { x: at.x, y: at.y - size, size, font, color });
    return;
  }
  if (o.kind === "image" || o.kind === "signature") {
    if (!o.dataUrl) return;
    const bytes = Uint8Array.from(atob(o.dataUrl.split(",")[1] ?? ""), (char) => char.charCodeAt(0));
    const image = o.dataUrl.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    page.drawImage(image, r);
    return;
  }
  if (o.kind === "draw" && o.points?.length) {
    const points = o.points.map((point) => {
      const at = mapPoint(page, point.x, point.y);
      return { x: at.x, y: at.y };
    });
    for (let i = 1; i < points.length; i++) {
      page.drawLine({ start: points[i - 1], end: points[i], thickness: o.width ?? 2, color });
    }
    return;
  }
  if (o.kind === "rect" || o.kind === "whiteout" || o.kind === "redact") {
    page.drawRectangle({ ...r, borderColor: color, borderWidth: o.width ?? 2, color: o.kind === "whiteout" ? (await lib()).rgb(1, 1, 1) : undefined });
    return;
  }
  if (o.kind === "ellipse") {
    page.drawEllipse({ x: r.x + r.width / 2, y: r.y + r.height / 2, xScale: r.width / 2, yScale: r.height / 2, borderColor: color, borderWidth: o.width ?? 2 });
    return;
  }
  if (o.kind === "line" || o.kind === "arrow") {
    const start = mapPoint(page, o.x, o.y + o.h);
    const end = mapPoint(page, o.x + o.w, o.y);
    page.drawLine({ start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y }, thickness: o.width ?? 2, color });
    if (o.kind === "arrow") {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const size = 10 + (o.width ?? 2) * 2;
      for (const offset of [2.6, -2.6]) {
        page.drawLine({
          start: { x: end.x, y: end.y },
          end: { x: end.x - size * Math.cos(angle + offset), y: end.y - size * Math.sin(angle + offset) },
          thickness: o.width ?? 2,
          color,
        });
      }
    }
  }
}

async function prepare(file: File, ops: PageOps) {
  const pdfApi = await lib();
  const source = await pdfApi.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const order = ops.reorder?.length ? ops.reorder : source.getPages().map((_, i) => i + 1);
  const removed = new Set(ops.remove ?? []);
  const kept = order.filter((n) => !removed.has(n));
  let pdf: PDFDocument;
  let mapping: number[];
  if (ops.reorder?.length || ops.remove?.length) {
    pdf = await pdfApi.PDFDocument.create();
    const pages = await pdf.copyPages(source, kept.map((n) => n - 1));
    pages.forEach((page) => pdf.addPage(page));
    mapping = kept;
  } else {
    pdf = source;
    mapping = source.getPages().map((_, i) => i + 1);
  }
  for (const [pageNumber, angle] of Object.entries(ops.rotate ?? {})) {
    const index = mapping.indexOf(Number(pageNumber));
    if (index >= 0) pdf.getPage(index).setRotation(pdfApi.degrees(Number(angle)));
  }
  if (ops.addBlank) {
    const base = pdf.getPage(0);
    for (let i = 0; i < ops.addBlank; i++) pdf.addPage([base.getWidth(), base.getHeight()]);
  }
  return { pdf, mapping, pdfApi };
}

/** Applies overlay objects to a PDF. Redaction can cover visually or rasterise the page for real removal. */
export async function applyOverlays(file: File, overlays: Overlay[], ops: PageOps = {}, rasterizeRedact = false) {
  const { pdf, mapping, pdfApi } = await prepare(file, ops);
  const fontkit = ((await import("@pdf-lib/fontkit")) as unknown as { default: Fontkit }).default;
  pdf.registerFontkit(fontkit as unknown as Parameters<PDFDocument["registerFontkit"]>[0]);

  const rasterized = new Map<number, number>();
  if (rasterizeRedact) {
    const byPage = new Set(overlays.filter((o) => o.kind === "redact").map((o) => o.page));
    for (const original of byPage) {
      const dataUrl = await rasterizeWithBoxes(file, original, overlays.filter((o) => o.page === original && o.kind === "redact"));
      const bytes = Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (char) => char.charCodeAt(0));
      const image = await pdf.embedPng(bytes);
      const fresh = pdf.addPage([image.width, image.height]);
      fresh.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      const index = mapping.indexOf(original);
      pdf.removePage(index);
      pdf.insertPage(index, fresh);
      rasterized.set(original, index);
    }
  }

  const remap = mapping.map((original, index) => (rasterized.has(original) ? rasterized.get(original)! : index));
  for (const overlay of overlays) {
    if (overlay.kind === "redact" && rasterizeRedact) continue;
    if (overlay.kind === "field") continue;
    const sourceIndex = mapping.indexOf(overlay.page);
    if (sourceIndex < 0) continue;
    const page = pdf.getPage(remap[sourceIndex]);
    await drawOverlay(pdf, page, overlay, fontkit, pdfApi.StandardFonts, rasterized.has(overlay.page));
  }
  return pdf.save();
}

async function addField(pdf: PDFDocument, page: PDFPage, o: Overlay) {
  const spec = o.field!;
  const form = pdf.getForm();
  const r = rectFor(page, o);
  const size = o.size ?? 11;
  const base = { x: r.x, y: r.y, width: r.width, height: r.height, borderWidth: 0.5, font: undefined };
  let field: import("pdf-lib").PDFField;
  if (spec.type === "checkbox") {
    const checkbox = form.createCheckBox(spec.name);
    checkbox.addToPage(page, base);
    if (spec.value) checkbox.check();
    field = checkbox;
  } else if (spec.type === "radio") {
    const radio = form.createRadioGroup(spec.name);
    radio.addOptionToPage(spec.options?.[0] ?? "Option", page, base);
    if (spec.value) radio.select(spec.value);
    field = radio;
  } else if (spec.type === "dropdown") {
    const dropdown = form.createDropdown(spec.name);
    dropdown.addToPage(page, base);
    if (spec.options?.length) dropdown.setOptions(spec.options);
    if (spec.value) dropdown.select(spec.value);
    field = dropdown;
  } else {
    const text = form.createTextField(spec.name);
    text.addToPage(page, base);
    if (spec.type === "multiline") text.enableMultiline();
    text.setText(spec.value ?? spec.defaultValue ?? (spec.type === "signature" ? "  /s/ " : ""));
    if (spec.maxLength) text.setMaxLength(spec.maxLength);
    text.setFontSize(Math.min(size, Math.max(6, r.height * 0.55)));
    field = text;
  }
  if (spec.required) field.acroField.setFlag(1 << 1);
  if (spec.tooltip) {
    const { PDFName, PDFHexString } = await import("pdf-lib");
    (field.acroField as unknown as { set: (key: unknown, value: unknown) => void }).set(PDFName.of("TU"), PDFHexString.fromText(spec.tooltip));
  }
}

/** Creates real AcroForm fields; the signature placeholder is a text field, not a digital signature widget. */
export async function buildForm(file: File, overlays: Overlay[], ops: PageOps = {}) {
  const { pdf, mapping } = await prepare(file, ops);
  for (const overlay of overlays) {
    if (overlay.kind !== "field" || !overlay.field) continue;
    const index = mapping.indexOf(overlay.page);
    if (index < 0) continue;
    await addField(pdf, pdf.getPage(index), overlay);
  }
  return pdf.save();
}

export interface FormFieldInfo { name: string; type: string; value: string; options: string[] }

export async function listFormFields(file: File): Promise<FormFieldInfo[]> {
  const pdfApi = await lib();
  const pdf = await pdfApi.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  return pdf.getForm().getFields().map((field) => {
    let value = "";
    let options: string[] = [];
    try { value = (field as import("pdf-lib").PDFTextField).getText() ?? ""; } catch { /* not a text field */ }
    try { options = (field as import("pdf-lib").PDFDropdown).getOptions() ?? []; } catch { /* not a dropdown */ }
    return { name: field.getName(), type: field.constructor.name.replace("PDF", "").replace("Field", ""), value, options };
  });
}

export async function fillForm(file: File, values: Record<string, string>, flatten: boolean) {
  const pdfApi = await lib();
  const pdf = await pdfApi.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const form = pdf.getForm();
  for (const [name, value] of Object.entries(values)) {
    try {
      const text = form.getTextField(name);
      if (value) text.setText(value);
      else text.setText("");
    } catch { /* checkbox or choice field */ }
    try {
      const check = form.getCheckBox(name);
      if (value) check.check(); else check.uncheck();
    } catch { /* not a checkbox */ }
    try { const dropdown = form.getDropdown(name); if (value) dropdown.select(value); } catch { /* not a dropdown */ }
    try { const radio = form.getRadioGroup(name); if (value) radio.select(value); } catch { /* not a radio group */ }
  }
  if (flatten) form.flatten();
  return pdf.save();
}
