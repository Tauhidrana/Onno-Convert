// Copies the static wasm/worker assets that must be served from /public.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("public/ffmpeg/pkg", { recursive: true });
mkdirSync("public/ffmpeg/sdk", { recursive: true });
mkdirSync("public/pdf", { recursive: true });

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
console.log("static assets copied");

// The conversion worker is bundled by bun, not Turbopack (see runner.ts).
const result = await Bun.build({
  entrypoints: ["src/convert/worker.ts"],
  outdir: "public/worker",
  splitting: true,
  format: "esm",
  target: "browser",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log("conversion worker built");
