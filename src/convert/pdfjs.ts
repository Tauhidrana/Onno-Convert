let pdfjs: Promise<typeof import("pdfjs-dist")> | null = null;

/** pdf.js is lazy: only tools that render or read PDFs pay for it. */
export function getPdfjs() {
  pdfjs ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
    return lib;
  });
  return pdfjs;
}

export function parsePageSpec(spec: string | number | boolean | undefined, total: number): number[] {
  const text = String(spec ?? "").trim();
  if (!text) return Array.from({ length: total }, (_, i) => i + 1);
  const out: number[] = [];
  for (const part of text.split(",")) {
    const [a, b] = part.split("-").map((s) => Number(s.trim()));
    if (!Number.isInteger(a) || a < 1 || a > total) throw new Error(`Page ${a} is out of range (1–${total}).`);
    const end = b === undefined ? a : b;
    if (!Number.isInteger(end) || end < a || end > total) throw new Error(`Range “${part.trim()}” is invalid.`);
    for (let n = a; n <= end; n++) out.push(n);
  }
  return [...new Set(out)];
}

export async function openPdf(file: File) {
  const lib = await getPdfjs();
  try {
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    return doc;
  } catch {
    throw new Error(`“${file.name}” could not be opened. Password-protected or corrupt PDFs are not supported.`);
  }
}
