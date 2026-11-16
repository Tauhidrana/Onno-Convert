import { outputName } from "@/lib/utils";
import type { ConvertOptions, ConverterModule, OutputFile } from "./types";

type Canvas = OffscreenCanvas | HTMLCanvasElement;

const hasOffscreen = () => typeof OffscreenCanvas !== "undefined";

function makeCanvas(width: number, height: number): Canvas {
  if (hasOffscreen()) return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function context(canvas: Canvas) {
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
  return ctx;
}

function extOfName(name: string) {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

async function decodeSvg(file: File): Promise<Canvas> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("This SVG could not be rendered. Inline scripts and external references are blocked."));
      img.src = url;
    });
    const width = img.naturalWidth || 1024;
    const height = img.naturalHeight || 1024;
    const canvas = makeCanvas(width, height);
    context(canvas).drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeHeic(file: File): Promise<Canvas> {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/png" });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return drawBitmap(blob);
}

async function decodeTiff(file: File): Promise<Canvas> {
  const { default: UTIF } = await import("utif");
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error("No image found in this TIFF.");
  UTIF.decodeImage(buffer, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const width = ifds[0].width;
  const height = ifds[0].height;
  const canvas = makeCanvas(width, height);
  context(canvas).putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
}

async function drawBitmap(blob: Blob): Promise<Canvas> {
  const bitmap = await createImageBitmap(blob);
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  context(canvas).drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export async function decodeImage(file: File): Promise<Canvas> {
  const ext = extOfName(file.name);
  if (ext === "svg" || file.type === "image/svg+xml") return decodeSvg(file);
  if (ext === "heic" || ext === "heif" || file.type === "image/heic") return decodeHeic(file);
  if (ext === "tif" || ext === "tiff") return decodeTiff(file);
  try {
    return await drawBitmap(file);
  } catch {
    throw new Error("This image could not be decoded. The file may be corrupt or use an unsupported variant.");
  }
}

function resize(canvas: Canvas, maxWidth: number): Canvas {
  if (!maxWidth || canvas.width <= maxWidth) return canvas;
  const scale = maxWidth / canvas.width;
  const out = makeCanvas(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
  const ctx = context(out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas as CanvasImageSource, 0, 0, out.width, out.height);
  return out;
}

export function flatten(canvas: Canvas): Canvas {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = context(out);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas as CanvasImageSource, 0, 0);
  return out;
}

export function canvasToBlob(canvas: Canvas, type: string, quality?: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed."))), type, quality),
  );
}

async function encode(canvas: Canvas, ext: string, quality: number): Promise<Blob> {
  if (ext === "jpg" || ext === "jpeg") return canvasToBlob(flatten(canvas), "image/jpeg", quality);
  if (ext === "png") return canvasToBlob(canvas, "image/png");
  if (ext === "webp") return canvasToBlob(canvas, "image/webp", quality);
  if (ext === "avif") {
    const blob = await canvasToBlob(canvas, "image/avif", quality);
    if (blob.type !== "image/avif") {
      throw new Error("This browser cannot encode AVIF. Use Chrome or Edge, or convert to WebP instead.");
    }
    return blob;
  }
  if (ext === "gif") {
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
    const data = new Uint8Array(context(canvas).getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    const palette = quantize(data, 256);
    const indexed = applyPalette(data, palette);
    const gif = GIFEncoder();
    gif.writeFrame(indexed, canvas.width, canvas.height, { palette });
    gif.finish();
    return new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
  }
  if (ext === "tif" || ext === "tiff") {
    const { default: UTIF } = await import("utif");
    const data = context(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    const buffer = UTIF.encodeImage(data.buffer, canvas.width, canvas.height);
    return new Blob([buffer], { type: "image/tiff" });
  }
  throw new Error(`Unsupported output format: ${ext}`);
}

export const convert: ConverterModule["convert"] = async (files, opts, onProgress) => {
  const file = files[0];
  if (!file) throw new Error("No file provided.");
  const ext = String(opts.__action);
  const quality = Math.min(1, Math.max(0.05, Number(opts.quality) || 0.85));
  const maxWidth = Number(opts.maxWidth) || 0;

  onProgress(0.1);
  const decoded = await decodeImage(file);
  onProgress(0.55);
  const output = resize(decoded, maxWidth);
  const blob = await encode(output, ext, quality);
  onProgress(1);

  const out: OutputFile = { blob, name: outputName(file.name, ext === "jpeg" ? "jpg" : ext) };
  return [out];
};
