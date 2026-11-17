import { getPdfjs } from "@/convert/pdfjs";

export async function pageCount(file: File) {
  const lib = await getPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const count = doc.numPages;
  void (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
  return count;
}

/** Renders a PDF page into a visible canvas. pdf.js and its worker stay lazy. */
export async function renderPage(file: File, pageNumber: number, canvas: HTMLCanvasElement, scale = 1.4) {
  const lib = await getPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (scale * 760) / base.width });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const size = { width: canvas.width, height: canvas.height };
  void (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
  return size;
}

/** Rasterises a page with white boxes painted over redactions (real content removal in export). */
export async function rasterizeWithBoxes(
  file: File,
  pageNumber: number,
  boxes: { x: number; y: number; w: number; h: number }[],
  scale = 2,
) {
  const lib = await getPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  context.fillStyle = "#ffffff";
  for (const box of boxes) {
    context.fillRect(box.x * canvas.width, box.y * canvas.height, box.w * canvas.width, box.h * canvas.height);
  }
  const dataUrl = canvas.toDataURL("image/png");
  void (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
  return dataUrl;
}
