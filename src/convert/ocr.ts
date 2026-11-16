import { outputName } from "@/lib/utils";
import type { ConvertOptions, ConverterModule, OutputFile } from "./types";

type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

const workerPath = "/tesseract/worker.min.js";
const corePath = "/tesseract/core";
const langPath = "https://tessdata.projectnaptha.com/4.0.0";
let activeWorker: OcrWorker | null = null;
let cancelled = false;

export const convert: ConverterModule["convert"] = async (files, _opts: ConvertOptions, onProgress) => {
  const file = files[0];
  if (!file) throw new Error("Choose an image to recognize.");

  cancelled = false;
  const { createWorker, OEM } = await import("tesseract.js");
  if (cancelled) throw new Error("Cancelled.");
  const worker = await createWorker(["eng", "ben"], OEM.LSTM_ONLY, {
    workerPath,
    corePath,
    langPath,
    cacheMethod: "write",
    logger: (message) => onProgress(message.progress),
  });
  activeWorker = worker;

  if (cancelled) {
    activeWorker = null;
    await worker.terminate();
    throw new Error("Cancelled.");
  }

  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    const recognized = text.trim();
    if (!recognized) throw new Error("No readable text was found in this image.");

    const output: OutputFile = {
      blob: new Blob([`${recognized}\n`], { type: "text/plain;charset=utf-8" }),
      name: outputName(file.name, "txt"),
    };
    onProgress(1);
    return [output];
  } finally {
    if (activeWorker === worker) activeWorker = null;
    await worker.terminate();
  }
};

export async function cancel() {
  cancelled = true;
  const worker = activeWorker;
  activeWorker = null;
  await worker?.terminate();
}
