import { baseName, outputName } from "@/lib/utils";
import type { ConvertOptions, ConverterModule, OutputFile } from "./types";

function safeSheetName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "sheet";
}

async function xlsxToPdf(file: File, opts: ConvertOptions, onProgress: (p: number) => void) {
  const XLSX = await import("xlsx");
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("This workbook has no sheets.");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  if (!rows.length) throw new Error("The first sheet is empty.");
  onProgress(0.4);
  const doc = new jsPDF({ orientation: String(opts.orientation) === "portrait" ? "portrait" : "landscape", unit: "pt", format: "a4" });
  autoTable(doc, {
    head: [rows[0]],
    body: rows.slice(1),
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [109, 94, 252] },
    margin: { top: 28, left: 24, right: 24, bottom: 24 },
  });
  onProgress(0.9);
  return [{ blob: doc.output("blob"), name: outputName(file.name, "pdf") }];
}

export const convert: ConverterModule["convert"] = async (files, opts, onProgress) => {
  const file = files[0];
  const action = String(opts.__action);

  if (action === "xlsx-pdf") return xlsxToPdf(file, opts, onProgress);

  const XLSX = await import("xlsx");

  if (action === "xlsx") {
    const text = await file.text();
    const workbook = XLSX.read(text, { type: "string", raw: true });
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    onProgress(1);
    return [{ blob: new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name: outputName(file.name, "xlsx") }];
  }

  if (action === "csv") {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const out: OutputFile[] = [];
    workbook.SheetNames.forEach((name, i) => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
      const filename =
        workbook.SheetNames.length === 1
          ? outputName(file.name, "csv")
          : `${baseName(file.name)}-${safeSheetName(name)}.converted.csv`;
      out.push({ blob: new Blob([csv], { type: "text/csv;charset=utf-8" }), name: filename });
      onProgress((i + 1) / workbook.SheetNames.length);
    });
    if (!out.length) throw new Error("This workbook has no sheets.");
    return out;
  }

  throw new Error(`Unknown data action: ${action}`);
};
