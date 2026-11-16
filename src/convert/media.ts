import { extOf, outputName } from "@/lib/utils";
import type { ConvertOptions, ConverterModule } from "./types";

type FFmpegModule = typeof import("@ffmpeg/ffmpeg");
type FFmpegInstance = InstanceType<FFmpegModule["FFmpeg"]>;

/** Served from /public so Turbopack never parses the package worker pattern. */
async function ffmpegModule(): Promise<FFmpegModule> {
  const url = "/ffmpeg/sdk/index.js";
  return (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as FFmpegModule;
}

let engine: FFmpegInstance | null = null;
let loading: Promise<FFmpegInstance> | null = null;
let progressHandler: ((progress: number) => void) | null = null;

async function getEngine(onProgress: (progress: number) => void) {
  if (engine) return engine;
  onProgress(0.03);
  loading ??= (async () => {
    const { FFmpeg } = await ffmpegModule();
    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      if (Number.isFinite(progress)) progressHandler?.(Math.min(0.98, Math.max(0.02, progress)));
    });
    await ffmpeg.load({
      coreURL: "/ffmpeg/ffmpeg-core.js",
      wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      classWorkerURL: "/ffmpeg/sdk/worker.js",
    });
    engine = ffmpeg;
    return ffmpeg;
  })();
  try {
    return await loading;
  } catch {
    loading = null;
    throw new Error("The media engine failed to load. Check your connection, then try again.");
  }
}

const CODEC: Record<string, string[]> = {
  mp3: ["-vn", "-c:a", "libmp3lame", "-q:a", "2"],
  wav: ["-vn", "-c:a", "pcm_s16le"],
  mp4: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"],
  webm: ["-c:v", "libvpx", "-crf", "32", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "5", "-c:a", "libvorbis", "-q:a", "4"],
};

export const convert: ConverterModule["convert"] = async (files, opts, onProgress) => {
  const file = files[0];
  const action = String(opts.__action);
  const sourceExt = extOf(file.name) || "bin";
  const { fetchFile } = await import("@ffmpeg/util");
  const ffmpeg = await getEngine(onProgress);

  let target = action;
  let args: string[] = [];
  if (action === "trim") {
    const start = Math.max(0, Number(opts.start) || 0);
    const end = Number(opts.end) || 0;
    if (end <= start) throw new Error("End time must be greater than start time.");
    target = String(opts.format) === "wav" ? "wav" : "mp3";
    args = ["-ss", String(start), "-to", String(end), ...CODEC[target]];
  } else if (action === "compress-video") {
    target = "mp4";
    const crf = String(Math.min(34, Math.max(18, Number(opts.crf) || 28)));
    args = ["-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"];
  } else {
    args = CODEC[target] ?? [];
    if (!args.length) throw new Error(`Unsupported media target: ${target}`);
  }

  const input = `input.${sourceExt}`;
  const outputFile = `output.${target}`;
  progressHandler = onProgress;

  try {
    onProgress(0.05);
    await ffmpeg.writeFile(input, await fetchFile(file));
    await ffmpeg.exec(["-i", input, ...args, outputFile]);
    const data = (await ffmpeg.readFile(outputFile)) as Uint8Array;
    if (!data?.length) throw new Error("The engine produced an empty file. The input may be corrupt or unsupported.");
    onProgress(1);
    const type =
      target === "mp3" ? "audio/mpeg" : target === "wav" ? "audio/wav" : target === "webm" ? "video/webm" : "video/mp4";
    return [{ blob: new Blob([data as BlobPart], { type }), name: outputName(file.name, target) }];
  } finally {
    progressHandler = null;
    try {
      await ffmpeg.deleteFile(input);
      await ffmpeg.deleteFile(outputFile);
    } catch {
      // Files may not exist if the run failed early.
    }
  }
};

export async function cancel() {
  if (engine) {
    engine.terminate();
    engine = null;
  }
  loading = null;
  progressHandler = null;
}
