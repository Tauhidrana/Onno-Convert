import { toolById } from "./registry";
import type { ConvertOptions, OutputFile } from "./types";

type Job = {
  jobId: string;
  toolId: string;
  files: File[];
  opts: ConvertOptions;
};

type Reply =
  | { jobId: string; type: "progress"; progress: number }
  | { jobId: string; type: "done"; files: OutputFile[] }
  | { jobId: string; type: "error"; message: string };

// Worker global without pulling lib.webworker (it conflicts with lib.dom types).
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<Job>) => void) | null;
  postMessage: (data: Reply) => void;
};

ctx.onmessage = async (event: MessageEvent<Job>) => {
  const { jobId, toolId, files, opts } = event.data;
  const tool = toolById.get(toolId);
  if (!tool?.load) {
    ctx.postMessage({ jobId, type: "error", message: "This tool is not available in the browser build." } satisfies Reply);
    return;
  }
  try {
    const converter = await tool.load();
    const filesOut = await converter.convert(files, { ...opts, __action: tool.action }, (progress) => {
      ctx.postMessage({ jobId, type: "progress", progress } satisfies Reply);
    });
    ctx.postMessage({ jobId, type: "done", files: filesOut } satisfies Reply);
  } catch (error) {
    ctx.postMessage({
      jobId,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    } satisfies Reply);
  }
};
