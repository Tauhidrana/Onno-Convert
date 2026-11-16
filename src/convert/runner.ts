import { toolById } from "./registry";
import type { ConvertOptions, ConverterModule, OutputFile } from "./types";

export interface RunHandle {
  promise: Promise<OutputFile[]>;
  cancel: () => void;
}

let jobSeq = 0;

export function runTool(
  toolId: string,
  files: File[],
  opts: ConvertOptions,
  onProgress: (progress: number) => void,
): RunHandle {
  const tool = toolById.get(toolId);
  if (!tool?.load) {
    return { promise: Promise.reject(new Error("Unknown tool.")), cancel: () => {} };
  }

  if (!tool.worker) {
    let cancelled = false;
    let converter: ConverterModule | null = null;
    const promise = tool.load().then(async (loaded) => {
      converter = loaded;
      if (cancelled) throw new Error("Cancelled.");
      return loaded.convert(files, { ...opts, __action: tool.action }, (p) => {
        if (!cancelled) onProgress(p);
      });
    });
    return {
      promise,
      cancel: () => {
        cancelled = true;
        void converter?.cancel?.();
      },
    };
  }

  const jobId = `job-${++jobSeq}`;
  // Prebuilt by scripts/copy-assets.ts: Turbopack does not start a worker
  // created from a bundled `new URL(...)` module in dev.
  const worker = new Worker("/worker/worker.js", { type: "module" });
  let cancelWorker: () => void = () => {};

  const promise = new Promise<OutputFile[]>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ jobId: string; type: string; progress?: number; files?: OutputFile[]; message?: string }>) => {
      const data = event.data;
      if (data.jobId !== jobId) return;
      if (data.type === "progress") onProgress(data.progress ?? 0);
      else if (data.type === "done") resolve(data.files ?? []);
      else if (data.type === "error") reject(new Error(data.message ?? "Conversion failed."));
    };
    worker.onerror = () => reject(new Error("The conversion worker crashed. The file may be too large for this browser."));
    cancelWorker = () => {
      worker.terminate();
      reject(new Error("Cancelled."));
    };
    worker.postMessage({ jobId, toolId, files, opts });
  }).finally(() => worker.terminate());

  return { promise, cancel: () => cancelWorker() };
}

export async function runPrint(toolId: string, files: File[], opts: ConvertOptions) {
  const tool = toolById.get(toolId);
  if (!tool?.load) throw new Error("Unknown tool.");
  const converter = await tool.load();
  if (!converter.print) throw new Error("This tool has no print flow.");
  await converter.print(files, opts);
}
