import { extOf, outputName } from "@/lib/utils";
import { cancel as cancelFfmpeg, runFfmpeg } from "./media";
import type { ConverterModule } from "./types";

let activeWorker: Worker | null = null;

function monoAt48k(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const source = buffer.getChannelData(0);
  if (channels > 1) {
    const other = buffer.getChannelData(1);
    for (let i = 0; i < source.length; i++) source[i] = (source[i] + other[i]) / 2;
  }
  if (buffer.sampleRate === 48000) return source.slice();
  const length = Math.round(source.length * (48000 / buffer.sampleRate));
  const output = new Float32Array(length);
  const ratio = buffer.sampleRate / 48000;
  for (let i = 0; i < length; i++) {
    const at = i * ratio;
    const index = Math.floor(at);
    const next = Math.min(index + 1, source.length - 1);
    output[i] = source[index] + (source[next] - source[index]) * (at - index);
  }
  return output;
}

function wavBytes(samples: Float32Array) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + samples.length * 2, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(96000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    bytes.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return new Uint8Array(bytes);
}

async function denoiseAi(file: File, strength: number, onProgress: (progress: number) => void) {
  const context = new AudioContext();
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("This browser could not decode the audio for AI cleaning. Try the Fast engine.");
  } finally {
    void context.close();
  }
  onProgress(0.1);
  const samples = monoAt48k(buffer);
  const worker = new Worker("/workspace/rnnoise-worker.js");
  activeWorker = worker;
  try {
    const cleaned = await new Promise<Float32Array>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("The AI denoiser took too long. Try a shorter file or the Fast engine.")), 10 * 60 * 1000);
      worker.onerror = () => { clearTimeout(timeout); reject(new Error("The AI denoiser worker failed to start.")); };
      worker.onmessage = (event: MessageEvent<{ type: string; value?: number; samples?: Float32Array; message?: string }>) => {
        const data = event.data;
        if (data.type === "progress") onProgress(0.1 + (data.value ?? 0) * 0.8);
        if (data.type === "done" && data.samples) { clearTimeout(timeout); resolve(data.samples); }
        if (data.type === "error") { clearTimeout(timeout); reject(new Error(data.message ?? "AI denoising failed.")); }
      };
      worker.postMessage({ samples, strength }, [samples.buffer]);
    });
    onProgress(0.95);
    return wavBytes(cleaned);
  } finally {
    worker.terminate();
    if (activeWorker === worker) activeWorker = null;
  }
}

export const convert: ConverterModule["convert"] = async (files, opts, onProgress) => {
  const file = files[0];
  if (!file) throw new Error("Choose an audio or video file first.");
  const output = String(opts.output ?? "wav") === "mp3" ? "mp3" : "wav";
  const engine = String(opts.engine ?? "fast") === "ai" ? "ai" : "fast";
  const strength = Math.max(0, Math.min(1, Number(opts.strength ?? 0.5)));
  const preset = ["speech", "heavy", "light"].includes(String(opts.preset)) ? String(opts.preset) : "speech";
  const ext = extOf(file.name) || "bin";

  if (engine === "ai") {
    const wav = await denoiseAi(file, strength, onProgress);
    if (output === "wav") {
      onProgress(1);
      return [{ blob: new Blob([wav as BlobPart], { type: "audio/wav" }), name: outputName(file.name, "wav") }];
    }
    const wavFile = new File([wav as BlobPart], "denoised.wav", { type: "audio/wav" });
    const mp3 = await runFfmpeg(wavFile, "wav", ["-vn", "-c:a", "libmp3lame", "-q:a", "2"], "mp3", onProgress);
    return [{ blob: new Blob([mp3 as BlobPart], { type: "audio/mpeg" }), name: outputName(file.name, "mp3") }];
  }

  const baseDb = preset === "heavy" ? 24 : preset === "light" ? 6 : 12;
  const cutoff = preset === "light" ? 9000 : 7000;
  const nr = Math.round(baseDb * (0.5 + strength));
  const filter = `highpass=80,lowpass=${cutoff},afftdn=nr=${nr}${opts.loudnorm ? ",loudnorm" : ""}`;
  const args = ["-vn", "-af", filter, ...(output === "mp3" ? ["-c:a", "libmp3lame", "-q:a", "2"] : ["-c:a", "pcm_s16le"])];
  const data = await runFfmpeg(file, ext, args, output, onProgress);
  const type = output === "mp3" ? "audio/mpeg" : "audio/wav";
  return [{ blob: new Blob([data as BlobPart], { type }), name: outputName(file.name, output) }];
};

export async function cancel() {
  activeWorker?.terminate();
  activeWorker = null;
  await cancelFfmpeg();
}
