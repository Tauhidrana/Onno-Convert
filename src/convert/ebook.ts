import JSZip from "jszip";
import { outputName } from "@/lib/utils";
import type { ConverterModule } from "./types";

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attr(tag: string, name: string) {
  return new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1];
}

async function readEpub(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const container = await zip.file("META-INF/container.xml")?.async("text");
  if (!container) throw new Error("Not a valid EPUB: missing META-INF/container.xml.");
  const opfPath = attr(container, "full-path");
  if (!opfPath) throw new Error("Not a valid EPUB: no package document.");
  const opf = await zip.file(opfPath)?.async("text");
  if (!opf) throw new Error("Not a valid EPUB: package document not found.");

  const dir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest = new Map<string, string>();
  for (const match of opf.matchAll(/<item\b[^>]*>/g)) {
    const tag = match[0];
    const id = attr(tag, "id");
    const href = attr(tag, "href");
    const type = attr(tag, "media-type") ?? "";
    if (id && href && type.includes("html")) manifest.set(id, href);
  }

  const chapters = [...opf.matchAll(/<itemref\b[^>]*>/g)]
    .map((m) => attr(m[0], "idref"))
    .map((id) => (id ? manifest.get(id) : undefined))
    .filter((href): href is string => Boolean(href));

  if (!chapters.length) throw new Error("No readable chapters found in this EPUB.");

  const parts: string[] = [];
  for (const href of chapters) {
    const path = decodeURIComponent(dir + href);
    const entry = zip.file(path) ?? zip.file(path.split("/").pop() ?? path);
    if (!entry) continue;
    const text = htmlToText(await entry.async("text"));
    if (text) parts.push(text);
  }
  if (!parts.length) throw new Error("No text content found in this EPUB.");
  return parts.join("\n\n");
}

export const convert: ConverterModule["convert"] = async (files, opts, onProgress) => {
  const file = files[0];
  const action = String(opts.__action);
  const text = await readEpub(file);
  onProgress(0.6);

  if (action === "epub-text") {
    return [{ blob: new Blob([text], { type: "text/plain;charset=utf-8" }), name: outputName(file.name, "txt") }];
  }

  if (action === "epub-pdf") {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 56;
    const width = 595.28 - margin * 2;
    let y = margin;
    for (const paragraph of text.split(/\n{2,}/)) {
      const lines = doc.splitTextToSize(paragraph, width) as string[];
      for (const line of lines) {
        if (y > 785) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 14;
      }
      y += 8;
      if (y > 785) {
        doc.addPage();
        y = margin;
      }
    }
    onProgress(0.95);
    return [{ blob: doc.output("blob"), name: outputName(file.name, "pdf") }];
  }

  throw new Error(`Unknown ebook action: ${action}`);
};
