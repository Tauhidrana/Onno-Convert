import type { Category, Field } from "./types";

export type ColorName =
  | "rose"
  | "blue"
  | "amber"
  | "emerald"
  | "violet"
  | "cyan"
  | "orange"
  | "slate";

export type IconName =
  | "image"
  | "images"
  | "file-image"
  | "file-text"
  | "file-type"
  | "file-code"
  | "file-spreadsheet"
  | "table"
  | "music"
  | "video"
  | "book"
  | "merge"
  | "split"
  | "rotate"
  | "shrink"
  | "reorder"
  | "printer"
  | "server"
  | "presentation"
  | "mic"
  | "scissors";

export interface Tool {
  id: string;
  from: string;
  to: string;
  /** Target extension or internal action, passed to the converter as opts.__action. */
  action: string;
  category: Category;
  label: string;
  hint: string;
  icon: IconName;
  color: ColorName;
  accept: string;
  multiple?: boolean;
  /** Combine every queued file into one output (merge, image to PDF). */
  combine?: boolean;
  /** Run in the generic Web Worker. Default false = main thread. */
  worker?: boolean;
  /** Phase 3, not built. */
  server?: boolean;
  /** Print-based flow, no downloadable blob. */
  print?: boolean;
  options?: Field[];
  note?: string;
  load?: () => Promise<import("./types").ConverterModule>;
}

const IMAGE = "image/png,image/jpeg,image/webp,image/avif,image/heic,image/gif,image/svg+xml,image/tiff,image/bmp";

const quality: Field = {
  key: "quality",
  label: "Quality",
  type: "range",
  default: 0.85,
  min: 0.4,
  max: 1,
  step: 0.05,
  help: "Lossy formats only (JPG, WebP, AVIF).",
};
const maxWidth: Field = {
  key: "maxWidth",
  label: "Max width (px)",
  type: "number",
  default: 0,
  min: 0,
  max: 20000,
  step: 100,
  help: "0 = keep original size.",
};
const pages: Field = {
  key: "pages",
  label: "Pages",
  type: "text",
  default: "",
  placeholder: "all, or 1-3,5",
};

function imagePair(from: string, to: string, label: string, icon: IconName = "image"): Tool {
  const ext = to === "jpeg" ? "jpg" : to;
  return {
    id: `${from}-to-${to}`,
    from,
    to,
    action: ext,
    category: "image",
    label,
    hint: `${from.toUpperCase()} → ${ext.toUpperCase()}`,
    note:
      from === "gif"
        ? "Animated GIFs use the first frame. Metadata (EXIF/GPS) is removed."
        : from === "tiff"
          ? "Multi-page TIFFs use the first image. Metadata (EXIF/GPS) is removed."
          : "Metadata (EXIF/GPS) is removed and the image is re-encoded.",
    icon,
    color: "blue",
    accept: from === "heic" ? ".heic,image/heic" : from === "svg" ? ".svg,image/svg+xml" : from === "tiff" ? ".tif,.tiff,image/tiff" : `.${from}`,
    worker: !["heic", "svg"].includes(from),
    options: [quality, maxWidth],
  };
}

export const tools: Tool[] = [
  // Image
  {
    id: "image-to-text",
    from: "image",
    to: "txt",
    action: "ocr",
    category: "image",
    label: "Image to Text (OCR)",
    hint: "Bengali and English",
    icon: "file-text",
    color: "blue",
    accept: IMAGE,
    note: "OCR runs on this device. English and Bengali language data download on first use and are cached by your browser. Scanned PDFs are not supported.",
  },
  imagePair("png", "jpg", "PNG to JPG"),
  imagePair("jpg", "png", "JPG to PNG"),
  imagePair("png", "webp", "PNG to WebP"),
  imagePair("jpg", "webp", "JPG to WebP"),
  imagePair("webp", "jpg", "WebP to JPG"),
  imagePair("webp", "png", "WebP to PNG"),
  imagePair("heic", "jpg", "HEIC to JPG"),
  imagePair("heic", "png", "HEIC to PNG"),
  imagePair("avif", "jpg", "AVIF to JPG"),
  imagePair("avif", "png", "AVIF to PNG"),
  imagePair("png", "avif", "PNG to AVIF"),
  imagePair("jpg", "avif", "JPG to AVIF"),
  imagePair("svg", "png", "SVG to PNG"),
  imagePair("svg", "jpg", "SVG to JPG"),
  imagePair("tiff", "jpg", "TIFF to JPG"),
  imagePair("tiff", "png", "TIFF to PNG"),
  imagePair("gif", "png", "GIF to PNG", "images"),
  imagePair("gif", "jpg", "GIF to JPG", "images"),

  // PDF
  {
    id: "image-to-pdf",
    from: "image",
    to: "pdf",
    action: "image-pdf",
    category: "pdf",
    label: "Image to PDF",
    hint: "PNG, JPG, WebP, AVIF, HEIC, GIF, SVG, TIFF, BMP",
    icon: "file-text",
    color: "rose",
    accept: IMAGE,
    multiple: true,
    combine: true,
    worker: false,
    options: [
      {
        key: "pageSize",
        label: "Page size",
        type: "select",
        default: "a4",
        options: [
          { value: "a4", label: "A4" },
          { value: "letter", label: "Letter" },
          { value: "fit", label: "Fit to image" },
        ],
      },
      { key: "margin", label: "Margin (pt)", type: "number", default: 24, min: 0, max: 120, step: 4 },
      {
        key: "orientation",
        label: "Orientation",
        type: "select",
        default: "auto",
        options: [
          { value: "auto", label: "Auto" },
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ],
      },
    ],
    note: "Files are combined into one PDF in the order shown. Reorder with the arrows.",
  },
  {
    id: "pdf-to-image",
    from: "pdf",
    to: "image",
    action: "images",
    category: "pdf",
    label: "PDF to Images",
    hint: "PNG, JPG, WebP · ZIP",
    icon: "images",
    color: "rose",
    accept: ".pdf,application/pdf",
    options: [
      {
        key: "format",
        label: "Image format",
        type: "select",
        default: "png",
        options: [
          { value: "png", label: "PNG" },
          { value: "jpg", label: "JPG" },
          { value: "webp", label: "WebP" },
        ],
      },
      { key: "dpi", label: "Resolution (DPI)", type: "number", default: 150, min: 72, max: 400, step: 10 },
      pages,
    ],
    note: "Rendering happens in your browser. Large PDFs and high DPI need memory; keep under ~100 pages at 150 DPI.",
  },
  {
    id: "pdf-to-text",
    from: "pdf",
    to: "txt",
    action: "text",
    category: "pdf",
    label: "PDF to Text",
    hint: "Extract text layer",
    icon: "file-text",
    color: "rose",
    accept: ".pdf,application/pdf",
    options: [pages],
    note: "Text only. Layout, columns, images and scanned pages are lost. Scanned PDFs need OCR (Phase 2).",
  },
  {
    id: "text-to-pdf",
    from: "txt",
    to: "pdf",
    action: "text-pdf",
    category: "pdf",
    label: "Text to PDF",
    hint: "TXT, MD, CSV",
    icon: "file-text",
    color: "rose",
    accept: ".txt,.md,.csv,text/plain",
    worker: true,
    options: [
      {
        key: "pageSize",
        label: "Page size",
        type: "select",
        default: "a4",
        options: [
          { value: "a4", label: "A4" },
          { value: "letter", label: "Letter" },
        ],
      },
      { key: "fontSize", label: "Font size", type: "number", default: 11, min: 7, max: 20, step: 1 },
    ],
    note: "Latin characters only — the built-in PDF font cannot render Bangla or other non-Latin scripts.",
  },
  {
    id: "html-to-pdf",
    from: "html",
    to: "pdf",
    action: "print",
    category: "pdf",
    label: "HTML to PDF",
    hint: "Print-based",
    icon: "printer",
    color: "rose",
    accept: ".html,.htm,text/html",
    print: true,
    note: "Uses your browser's print dialog. Choose “Save as PDF”. External CSS/images must be reachable by the browser.",
  },
  {
    id: "merge-pdf",
    from: "pdf",
    to: "pdf",
    action: "merge",
    category: "pdf",
    label: "Merge PDF",
    hint: "Combine PDFs",
    icon: "merge",
    color: "rose",
    accept: ".pdf,application/pdf",
    multiple: true,
    combine: true,
    worker: true,
    note: "Order follows the queue. Encrypted PDFs are rejected.",
  },
  {
    id: "split-pdf",
    from: "pdf",
    to: "pdf",
    action: "split",
    category: "pdf",
    label: "Split PDF",
    hint: "By page ranges",
    icon: "split",
    color: "rose",
    accept: ".pdf,application/pdf",
    worker: true,
    options: [{ key: "ranges", label: "Ranges", type: "text", default: "1-1", placeholder: "1-3,4,7-9" }],
    note: "Each range becomes its own PDF. Example: 1-3,4,7-9 → three files.",
  },
  {
    id: "rotate-pdf",
    from: "pdf",
    to: "pdf",
    action: "rotate",
    category: "pdf",
    label: "Rotate PDF",
    hint: "90°, 180°, 270°",
    icon: "rotate",
    color: "rose",
    accept: ".pdf,application/pdf",
    worker: true,
    options: [
      {
        key: "angle",
        label: "Angle",
        type: "select",
        default: "90",
        options: [
          { value: "90", label: "90° clockwise" },
          { value: "180", label: "180°" },
          { value: "270", label: "270° clockwise" },
        ],
      },
      pages,
    ],
  },
  {
    id: "compress-pdf",
    from: "pdf",
    to: "pdf",
    action: "compress",
    category: "pdf",
    label: "Compress PDF",
    hint: "Light re-save",
    icon: "shrink",
    color: "rose",
    accept: ".pdf,application/pdf",
    worker: true,
    note: "Light compression only: rewrites objects and drops unused data. Images are not re-encoded, so gains can be small.",
  },
  {
    id: "reorder-pdf",
    from: "pdf",
    to: "pdf",
    action: "reorder",
    category: "pdf",
    label: "Reorder PDF",
    hint: "New page order",
    icon: "reorder",
    color: "rose",
    accept: ".pdf,application/pdf",
    worker: true,
    options: [{ key: "order", label: "Page order", type: "text", default: "", placeholder: "3,1,2" }],
    note: "Leave blank to keep all pages in order. Enter page numbers to reorder; omitted pages are dropped.",
  },

  // Data
  {
    id: "csv-to-xlsx",
    from: "csv",
    to: "xlsx",
    action: "xlsx",
    category: "data",
    label: "CSV to Excel",
    hint: "CSV → XLSX",
    icon: "file-spreadsheet",
    color: "emerald",
    accept: ".csv,text/csv",
    worker: true,
    note: "UTF-8 assumed. Values stay as text; Excel may show leading zeros correctly only if formatted after import.",
  },
  {
    id: "xlsx-to-csv",
    from: "xlsx",
    to: "csv",
    action: "csv",
    category: "data",
    label: "Excel to CSV",
    hint: "XLSX → CSV",
    icon: "table",
    color: "emerald",
    accept: ".xlsx,.xls,.xlsm",
    worker: true,
    note: "One CSV per sheet, zipped when there is more than one.",
  },
  {
    id: "xlsx-to-pdf",
    from: "xlsx",
    to: "pdf",
    action: "xlsx-pdf",
    category: "data",
    label: "Excel to PDF",
    hint: "Basic table layout",
    icon: "file-text",
    color: "emerald",
    accept: ".xlsx,.xls,.xlsm",
    options: [
      {
        key: "orientation",
        label: "Orientation",
        type: "select",
        default: "landscape",
        options: [
          { value: "landscape", label: "Landscape" },
          { value: "portrait", label: "Portrait" },
        ],
      },
    ],
    note: "Fidelity is limited: first sheet only, values as text, no formulas, charts, colours or merged cells.",
  },

  // Audio
  {
    id: "speech-to-text",
    from: "audio",
    to: "txt",
    action: "transcribe",
    category: "audio",
    label: "Speech to Text",
    hint: "Whisper · English and Bengali",
    icon: "file-text",
    color: "violet",
    accept: ".mp3,.wav,.m4a,.ogg,.oga,.flac,.webm,audio/*",
    options: [
      {
        key: "language",
        label: "Language",
        type: "select",
        default: "english",
        options: [
          { value: "english", label: "English" },
          { value: "bengali", label: "Bengali" },
        ],
      },
      {
        key: "format",
        label: "Output",
        type: "select",
        default: "txt",
        options: [
          { value: "txt", label: "TXT" },
          { value: "srt", label: "SRT subtitles" },
        ],
      },
    ],
    note: "The multilingual Whisper model downloads about 70 MB on first use and is cached by your browser. Bengali may be romanized instead of written in Bengali script.",
  },
  {
    id: "mp3-to-wav",
    from: "mp3",
    to: "wav",
    action: "wav",
    category: "audio",
    label: "MP3 to WAV",
    hint: "Lossless audio",
    icon: "music",
    color: "violet",
    accept: ".mp3,audio/mpeg",
    note: "ffmpeg.wasm downloads ~31 MB on first use. Large files are slow; keep under ~200 MB.",
  },
  {
    id: "wav-to-mp3",
    from: "wav",
    to: "mp3",
    action: "mp3",
    category: "audio",
    label: "WAV to MP3",
    hint: "Compress audio",
    icon: "music",
    color: "violet",
    accept: ".wav,audio/wav",
    note: "ffmpeg.wasm downloads ~31 MB on first use. Large files are slow; keep under ~200 MB.",
  },
  {
    id: "m4a-to-mp3",
    from: "m4a",
    to: "mp3",
    action: "mp3",
    category: "audio",
    label: "M4A to MP3",
    hint: "AAC → MP3",
    icon: "music",
    color: "violet",
    accept: ".m4a,audio/mp4",
  },
  {
    id: "ogg-to-mp3",
    from: "ogg",
    to: "mp3",
    action: "mp3",
    category: "audio",
    label: "OGG to MP3",
    hint: "Vorbis → MP3",
    icon: "music",
    color: "violet",
    accept: ".ogg,.oga,audio/ogg",
  },
  {
    id: "flac-to-mp3",
    from: "flac",
    to: "mp3",
    action: "mp3",
    category: "audio",
    label: "FLAC to MP3",
    hint: "Lossless → MP3",
    icon: "music",
    color: "violet",
    accept: ".flac,audio/flac",
  },
  {
    id: "mp4-to-mp3",
    from: "mp4",
    to: "mp3",
    action: "mp3",
    category: "audio",
    label: "MP4 to MP3",
    hint: "Extract audio",
    icon: "music",
    color: "violet",
    accept: ".mp4,.m4v,video/mp4",
  },
  {
    id: "trim-audio",
    from: "audio",
    to: "mp3",
    action: "trim",
    category: "audio",
    label: "Trim Audio",
    hint: "Cut a time range",
    icon: "scissors",
    color: "violet",
    accept: "audio/*,video/mp4",
    options: [
      { key: "start", label: "Start (seconds)", type: "number", default: 0, min: 0, step: 1 },
      { key: "end", label: "End (seconds)", type: "number", default: 30, min: 1, step: 1 },
      {
        key: "format",
        label: "Output",
        type: "select",
        default: "mp3",
        options: [
          { value: "mp3", label: "MP3" },
          { value: "wav", label: "WAV" },
        ],
      },
    ],
    note: "End must be after start. The cut is re-encoded, so it is frame-accurate.",
  },

  // Video
  {
    id: "mov-to-mp4",
    from: "mov",
    to: "mp4",
    action: "mp4",
    category: "video",
    label: "MOV to MP4",
    hint: "H.264",
    icon: "video",
    color: "orange",
    accept: ".mov,video/quicktime",
    note: "ffmpeg.wasm is CPU-bound and memory-limited. A 200 MB video can take minutes and may exhaust the tab.",
  },
  {
    id: "mkv-to-mp4",
    from: "mkv",
    to: "mp4",
    action: "mp4",
    category: "video",
    label: "MKV to MP4",
    hint: "H.264",
    icon: "video",
    color: "orange",
    accept: ".mkv,video/x-matroska",
  },
  {
    id: "avi-to-mp4",
    from: "avi",
    to: "mp4",
    action: "mp4",
    category: "video",
    label: "AVI to MP4",
    hint: "H.264",
    icon: "video",
    color: "orange",
    accept: ".avi,video/x-msvideo",
  },
  {
    id: "webm-to-mp4",
    from: "webm",
    to: "mp4",
    action: "mp4",
    category: "video",
    label: "WebM to MP4",
    hint: "H.264",
    icon: "video",
    color: "orange",
    accept: ".webm,video/webm",
  },
  {
    id: "mp4-to-webm",
    from: "mp4",
    to: "webm",
    action: "webm",
    category: "video",
    label: "MP4 to WebM",
    hint: "VP8 + Vorbis",
    icon: "video",
    color: "orange",
    accept: ".mp4,.m4v,video/mp4",
    note: "VP8 encoding is faster in wasm; large clips may run out of memory.",
  },
  {
    id: "compress-video",
    from: "video",
    to: "mp4",
    action: "compress-video",
    category: "video",
    label: "Compress Video",
    hint: "Smaller MP4",
    icon: "shrink",
    color: "orange",
    accept: "video/*",
    options: [{ key: "crf", label: "CRF (higher = smaller)", type: "range", default: 28, min: 18, max: 34, step: 1 }],
    note: "Re-encodes to H.264. Audio is kept as AAC 128k.",
  },

  // Ebook
  {
    id: "epub-to-pdf",
    from: "epub",
    to: "pdf",
    action: "epub-pdf",
    category: "ebook",
    label: "EPUB to PDF",
    hint: "Text-only layout",
    icon: "book",
    color: "cyan",
    accept: ".epub,application/epub+zip",
    note: "Text-only PDF: no images, CSS or cover page. Good enough to read, not a faithful copy.",
  },
  {
    id: "epub-to-text",
    from: "epub",
    to: "txt",
    action: "epub-text",
    category: "ebook",
    label: "EPUB to Text",
    hint: "Plain text",
    icon: "book",
    color: "cyan",
    accept: ".epub,application/epub+zip",
    worker: true,
  },

  // Phase 3 (server, not built)
  { id: "pdf-to-docx", from: "pdf", to: "docx", action: "server", category: "document", label: "PDF to Word", hint: "Server · Phase 3", icon: "server", color: "slate", accept: ".pdf,application/pdf", server: true },
  { id: "pdf-to-xlsx", from: "pdf", to: "xlsx", action: "server", category: "document", label: "PDF to Excel", hint: "Server · Phase 3", icon: "server", color: "slate", accept: ".pdf,application/pdf", server: true },
  { id: "pdf-to-pptx", from: "pdf", to: "pptx", action: "server", category: "document", label: "PDF to PowerPoint", hint: "Server · Phase 3", icon: "presentation", color: "slate", accept: ".pdf,application/pdf", server: true },
  { id: "docx-to-pdf", from: "docx", to: "pdf", action: "server", category: "document", label: "Word to PDF", hint: "Server · Phase 3", icon: "server", color: "slate", accept: ".docx", server: true },
  { id: "pptx-to-pdf", from: "pptx", to: "pdf", action: "server", category: "document", label: "PowerPoint to PDF", hint: "Server · Phase 3", icon: "presentation", color: "slate", accept: ".pptx", server: true },
  { id: "djvu-to-pdf", from: "djvu", to: "pdf", action: "server", category: "ebook", label: "DjVu to PDF", hint: "Server · Phase 3", icon: "server", color: "slate", accept: ".djvu", server: true },
  { id: "mobi-to-epub", from: "mobi", to: "epub", action: "server", category: "ebook", label: "MOBI to EPUB", hint: "Server · Phase 3", icon: "server", color: "slate", accept: ".mobi", server: true },
  { id: "dwg-to-pdf", from: "dwg", to: "pdf", action: "server", category: "document", label: "DWG to PDF", hint: "Server · Phase 3", icon: "server", color: "slate", accept: ".dwg,.dxf", server: true },
];

const imageModule = () => import("./image");
const pdfModule = () => import("./pdf");
const dataModule = () => import("./data");
const mediaModule = () => import("./media");
const speechModule = () => import("./speech");
const ocrModule = () => import("./ocr");
const ebookModule = () => import("./ebook");

for (const tool of tools) {
  if (tool.server) continue;
  if (tool.id === "image-to-text") tool.load = ocrModule;
  else if (tool.category === "image") tool.load = imageModule;
  else if (tool.category === "pdf") tool.load = pdfModule;
  else if (tool.category === "data") tool.load = dataModule;
  else if (tool.id === "speech-to-text") tool.load = speechModule;
  else if (tool.category === "audio" || tool.category === "video") tool.load = mediaModule;
  else if (tool.category === "ebook") tool.load = ebookModule;
}

export const toolById = new Map(tools.map((t) => [t.id, t]));

export const categoryMeta: Record<Category, { label: string; color: ColorName }> = {
  pdf: { label: "PDF", color: "rose" },
  image: { label: "Image", color: "blue" },
  document: { label: "Document", color: "slate" },
  data: { label: "Data", color: "emerald" },
  audio: { label: "Audio", color: "violet" },
  video: { label: "Video", color: "orange" },
  ebook: { label: "Ebook", color: "cyan" },
};

export const liveTools = tools.filter((t) => !t.server);
