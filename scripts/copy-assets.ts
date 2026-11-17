// Copies the static wasm/worker assets that must be served from /public.
import { cpSync, mkdirSync, rmSync } from "node:fs";

// These ignored directories contain only copied and build-generated assets.
for (const path of ["public/ffmpeg", "public/pdf", "public/worker", "public/tesseract", "public/rnnoise"]) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}
mkdirSync("public/ffmpeg/pkg", { recursive: true });
mkdirSync("public/ffmpeg/sdk", { recursive: true });

cpSync("node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js", "public/ffmpeg/ffmpeg-core.js");
cpSync("node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm", "public/ffmpeg/ffmpeg-core.wasm");
for (const f of ["worker.js", "const.js", "errors.js", "types.js"]) {
  cpSync(`node_modules/@ffmpeg/ffmpeg/dist/esm/${f}`, `public/ffmpeg/pkg/${f}`);
}
// The FFmpeg class is loaded as a browser module, not bundled: Turbopack cannot
// resolve its `new Worker(new URL(classWorkerURL, import.meta.url))` pattern.
for (const f of ["index.js", "classes.js", "const.js", "errors.js", "types.js", "utils.js", "worker.js", "empty.mjs"]) {
  cpSync(`node_modules/@ffmpeg/ffmpeg/dist/esm/${f}`, `public/ffmpeg/sdk/${f}`);
}
cpSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf/pdf.worker.min.mjs");
mkdirSync("public/tesseract/core", { recursive: true });
cpSync("node_modules/tesseract.js/dist/worker.min.js", "public/tesseract/worker.min.js");
for (const file of [
  "tesseract-core.wasm.js",
  "tesseract-core.wasm",
  "tesseract-core-simd.wasm.js",
  "tesseract-core-simd.wasm",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-relaxedsimd.js",
  "tesseract-core-relaxedsimd.wasm.js",
  "tesseract-core-relaxedsimd.wasm",
  "tesseract-core-relaxedsimd-lstm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm",
]) {
  cpSync(`node_modules/tesseract.js-core/${file}`, `public/tesseract/core/${file}`);
}
mkdirSync("public/rnnoise", { recursive: true });
cpSync("node_modules/@shiguredo/rnnoise-wasm/dist/rnnoise.js", "public/rnnoise/rnnoise.js");
console.log("static assets copied");

// The conversion worker is bundled by bun, not Turbopack (see runner.ts).
const result = await Bun.build({
  entrypoints: ["src/convert/worker.ts", "src/convert/avif-encoder.ts"],
  outdir: "public/worker",
  splitting: true,
  format: "esm",
  target: "browser",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
cpSync("node_modules/@jsquash/avif/codec/enc/avif_enc.wasm", "public/worker/avif_enc.wasm");
console.log("conversion worker built");

const denoiseWorker = await Bun.build({
  entrypoints: ["src/workspace/rnnoise-worker.ts"],
  outdir: "public/workspace",
  format: "esm",
  target: "browser",
});
if (!denoiseWorker.success) {
  for (const log of denoiseWorker.logs) console.error(log);
  process.exit(1);
}
console.log("RNNoise worker built");
