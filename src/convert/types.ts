export type Category = "pdf" | "image" | "document" | "data" | "audio" | "video" | "ebook";

export type ToolGroup = "from-pdf" | "to-pdf" | "other";

export type Field = {
  key: string;
  label: string;
  type: "select" | "number" | "range" | "checkbox" | "text";
  default: string | number | boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
};

export type ConvertOptions = Record<string, string | number | boolean>;

export type OutputFile = { blob: Blob; name: string };

export interface ConverterModule {
  convert(
    files: File[],
    opts: ConvertOptions,
    onProgress: (progress: number) => void,
  ): Promise<OutputFile[]>;
  /** Optional hard stop for engines that outlive a promise (ffmpeg). */
  cancel?(): void | Promise<void>;
  /** Print-based tools (HTML to PDF) have no blob result. */
  print?(files: File[], opts: ConvertOptions): Promise<void>;
}

export const MAX_SAFE_BYTES = 200 * 1024 * 1024;

export function groupOf(from: string, to: string): ToolGroup {
  if (from === "pdf") return "from-pdf";
  if (to === "pdf") return "to-pdf";
  return "other";
}
