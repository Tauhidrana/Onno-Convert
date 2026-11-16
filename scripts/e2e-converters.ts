import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { chromium, type Page } from "playwright";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { tools } from "../src/convert/registry";
import type { Tool } from "../src/convert/registry";

const root = resolve(import.meta.dir, "..");
const fixtureDir = join(root, "test-fixtures");
const outputDir = join(fixtureDir, "out");
const port = Number(process.env.E2E_PORT || 3187);
const externalUrl = process.env.E2E_BASE_URL;
const baseUrl = externalUrl || `http://127.0.0.1:${port}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForServer(server: ReturnType<typeof spawn>) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Next.js exited before becoming ready (${server.exitCode}).`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Next.js did not become ready at ${baseUrl}. Run bun run build first.`);
}

async function writeStaticFixtures() {
  await mkdir(outputDir, { recursive: true });

  for (const tool of tools.filter((item) => !item.server)) {
    let ext = tool.from === "image" ? "jpg" : tool.from;
    if (tool.from === "audio") ext = "wav";
    if (tool.from === "video") ext = "mp4";

    const source =
      tool.from === "html"
        ? null
        : tool.from === "webp"
          ? null
        : tool.id === "text-to-pdf"
          ? null
          : tool.id === "mp3-to-wav" ||
              tool.id === "m4a-to-mp3" ||
              tool.id === "ogg-to-mp3" ||
              tool.id === "flac-to-mp3" ||
              tool.id === "mov-to-mp4" ||
              tool.id === "mkv-to-mp4" ||
              tool.id === "avi-to-mp4" ||
              tool.id === "webm-to-mp4" ||
              tool.id === "mp4-to-webm" ||
              tool.id === "mp4-to-mp3" ||
              tool.id === "compress-video"
            ? null
            : join(fixtureDir, `sample.${ext}`);

    if (source) await copyFile(source, join(outputDir, `${tool.id}.${ext}`));
  }

  await writeFile(
    join(outputDir, "text-to-pdf.txt"),
    "Onno Convert\n\nA real text fixture for the PDF converter.\nSecond line.\n",
  );
  await writeFile(
    join(outputDir, "html-to-pdf.html"),
    "<!doctype html><html><body><h1>Onno Convert fixture</h1><p>HTML print output.</p></body></html>",
  );

  await copyFile(join(fixtureDir, "sample.png"), join(outputDir, "image-to-pdf-second.png"));
  await copyFile(join(fixtureDir, "sample-text.pdf"), join(outputDir, "merge-pdf-second.pdf"));
}

async function generateWebpFixture(page: Page) {
  const png = Buffer.from(await Bun.file(join(fixtureDir, "sample.png")).arrayBuffer()).toString("base64");
  const bytes = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for WebP fixtures.");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolveBlob, rejectBlob) => {
      canvas.toBlob((result) => (result ? resolveBlob(result) : rejectBlob(new Error("WebP fixture encoding failed."))), "image/webp");
    });
    if (blob.type !== "image/webp") throw new Error("Chromium cannot encode the WebP test fixture.");
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, png);
  const fixture = join(outputDir, "webp-to-jpg.webp");
  await writeFile(fixture, new Uint8Array(bytes));
  await copyFile(fixture, join(outputDir, "webp-to-png.webp"));
}

async function generateMediaFixtures(page: Page) {
  const webm = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable for media fixtures.");
    const videoStream = canvas.captureStream(12);
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const destination = audio.createMediaStreamDestination();
    gain.gain.value = 0.1;
    oscillator.frequency.value = 440;
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start();
    await audio.resume();
    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    const mimeType = "video/webm;codecs=vp8,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error("Chromium cannot create the WebM fixture.");
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolveStop) => {
      recorder.onstop = () => resolveStop();
    });
    recorder.start();
    const started = performance.now();
    while (performance.now() - started < 1500) {
      const t = performance.now() - started;
      ctx.fillStyle = `rgb(${Math.round(t % 255)}, 100, 180)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "white";
      ctx.fillText("Onno fixture", 12, 48);
      await new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame(undefined)));
    }
    recorder.stop();
    oscillator.stop();
    await stopped;
    await audio.close();
    return Array.from(new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer()));
  });

  await writeFile(join(outputDir, "webm-to-mp4.webm"), new Uint8Array(webm));
  const wav = await Bun.file(join(fixtureDir, "sample.wav")).arrayBuffer();
  const generated = await page.evaluate(
    async ({ webmBytes, wavBase64 }) => {
      const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
      const ffmpegUrl = "/ffmpeg/sdk/index.js";
      const { FFmpeg } = (await import(
        /* webpackIgnore: true */
        /* turbopackIgnore: true */
        ffmpegUrl
      )) as typeof import("@ffmpeg/ffmpeg");
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
        classWorkerURL: "/ffmpeg/sdk/worker.js",
      });
      await ffmpeg.writeFile("source.wav", fromBase64(wavBase64));
      await ffmpeg.writeFile("source.webm", new Uint8Array(webmBytes));
      const files: Record<string, number[]> = {};
      const errors: Record<string, string> = {};

      const recipes: [string, string, string[]][] = [
        ["mp3-to-wav.mp3", "source.wav", ["-vn", "-c:a", "libmp3lame", "-q:a", "4"]],
        ["m4a-to-mp3.m4a", "source.wav", ["-vn", "-c:a", "aac", "-b:a", "96k"]],
        ["ogg-to-mp3.ogg", "source.wav", ["-vn", "-c:a", "libvorbis", "-q:a", "4"]],
        ["flac-to-mp3.flac", "source.wav", ["-vn", "-c:a", "flac"]],
        [
          "mp4-to-mp3.mp4",
          "source.webm",
          ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"],
        ],
        [
          "mp4-to-webm.mp4",
          "source.webm",
          ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"],
        ],
        [
          "compress-video.mp4",
          "source.webm",
          ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"],
        ],
        [
          "mov-to-mp4.mov",
          "source.webm",
          ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-f", "mov"],
        ],
        [
          "mkv-to-mp4.mkv",
          "source.webm",
          ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-f", "matroska"],
        ],
        [
          "avi-to-mp4.avi",
          "source.webm",
          ["-c:v", "mpeg4", "-q:v", "8", "-c:a", "libmp3lame", "-q:a", "4", "-f", "avi"],
        ],
      ];

      try {
        for (const [filename, input, args] of recipes) {
          const output = `out-${filename}`;
          try {
            const code = await ffmpeg.exec(["-y", "-i", input, ...args, output]);
            if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
            const bytes = await ffmpeg.readFile(output);
            if (typeof bytes === "string") throw new Error("ffmpeg returned text instead of binary data");
            files[filename] = Array.from(bytes);
            await ffmpeg.deleteFile(output);
          } catch (error) {
            errors[filename] = error instanceof Error ? error.message : String(error);
          }
        }
      } finally {
        await ffmpeg.terminate();
      }
      return { files, errors };
    },
    {
      webmBytes: webm,
      wavBase64: Buffer.from(wav).toString("base64"),
    },
  );

  for (const [filename, bytes] of Object.entries(generated.files)) {
    await writeFile(join(outputDir, filename), new Uint8Array(bytes));
  }
  for (const [filename, error] of Object.entries(generated.errors)) {
    console.error(`FIXTURE ERROR ${filename}: ${error}`);
  }
}

function expectedExtension(tool: Tool): string {
  if (tool.action === "print") return "print";
  if (tool.action === "images" || tool.action === "csv") return "zip";
  if (tool.action === "image-pdf" || tool.action === "text-pdf" || tool.action === "xlsx-pdf" || tool.action === "epub-pdf") return "pdf";
  if (tool.action === "text" || tool.action === "epub-text") return "txt";
  if (["merge", "split", "rotate", "compress", "reorder"].includes(tool.action)) return "pdf";
  if (tool.action === "trim") return "mp3";
  if (tool.action === "compress-video") return "mp4";
  return tool.action;
}

async function imageDimensions(page: Page, bytes: Uint8Array, ext: string) {
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const base64 = Buffer.from(bytes).toString("base64");
  return page.evaluate(async ({ value, type }) => {
    const response = await fetch(`data:${type};base64,${value}`);
    const bitmap = await createImageBitmap(await response.blob());
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, { value: base64, type: mime });
}

async function audioDuration(page: Page, bytes: Uint8Array, ext: string) {
  const mime = ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : ext === "m4a" ? "audio/mp4" : `audio/${ext}`;
  const base64 = Buffer.from(bytes).toString("base64");
  return page.evaluate(async ({ value, type }) => {
    const response = await fetch(`data:${type};base64,${value}`);
    const audioContext = new AudioContext();
    const decoded = await audioContext.decodeAudioData(await response.arrayBuffer());
    await audioContext.close();
    return decoded.duration;
  }, { value: base64, type: mime });
}

async function videoDuration(page: Page, bytes: Uint8Array, ext: string) {
  const mime = ext === "webm" ? "video/webm" : "video/mp4";
  const base64 = Buffer.from(bytes).toString("base64");
  return page.evaluate(
    ({ value, type }) =>
      new Promise<number>((resolveDuration, reject) => {
        const video = document.createElement("video");
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(video.src);
          resolveDuration(video.duration);
        };
        video.onerror = () => reject(new Error("Chromium could not decode the video output."));
        video.src = URL.createObjectURL(
          new Blob([Uint8Array.from(atob(value), (char) => char.charCodeAt(0))], { type }),
        );
      }),
    { value: base64, type: mime },
  );
}

async function validateFile(page: Page, tool: Tool, filename: string, bytes: Uint8Array) {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "png") {
    assert(Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Invalid PNG signature.");
    const dimensions = await imageDimensions(page, bytes, ext);
    assert(dimensions.width > 0 && dimensions.height > 0, "PNG dimensions are empty.");
  } else if (ext === "jpg") {
    assert(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff, "Invalid JPEG signature.");
    const dimensions = await imageDimensions(page, bytes, ext);
    assert(dimensions.width > 0 && dimensions.height > 0, "JPEG dimensions are empty.");
  } else if (ext === "webp") {
    assert(Buffer.from(bytes).toString("ascii", 0, 4) === "RIFF" && Buffer.from(bytes).toString("ascii", 8, 12) === "WEBP", "Invalid WebP signature.");
    const dimensions = await imageDimensions(page, bytes, ext);
    assert(dimensions.width > 0 && dimensions.height > 0, "WebP dimensions are empty.");
  } else if (ext === "avif") {
    const data = Buffer.from(bytes);
    const brand = data.toString("ascii", 8, 16);
    assert(data.toString("ascii", 4, 8) === "ftyp" && /avif|avis|mif1/.test(brand), "Invalid AVIF file signature.");
    const dimensions = await imageDimensions(page, bytes, ext);
    assert(dimensions.width > 0 && dimensions.height > 0, "AVIF dimensions are empty.");
  } else if (ext === "pdf") {
    assert(Buffer.from(bytes).toString("ascii", 0, 5) === "%PDF-", "Invalid PDF signature.");
    const pdf = await PDFDocument.load(bytes);
    const count = pdf.getPageCount();
    const expected = tool.id === "image-to-pdf" ? 2 : tool.id === "merge-pdf" ? 4 : tool.id === "split-pdf" || tool.id === "reorder-pdf" ? 1 : tool.id === "rotate-pdf" || tool.id === "compress-pdf" ? 3 : 1;
    assert(count === expected, `PDF has ${count} page(s), expected ${expected}.`);
  } else if (ext === "xlsx") {
    assert(bytes[0] === 0x50 && bytes[1] === 0x4b, "Invalid XLSX ZIP signature.");
    const workbook = XLSX.read(bytes, { type: "array" });
    assert(workbook.SheetNames.length > 0, "XLSX has no worksheets.");
  } else if (ext === "csv" || ext === "txt") {
    const text = new TextDecoder().decode(bytes);
    assert(text.length > 0, `${ext.toUpperCase()} output is empty.`);
    if (ext === "csv") assert(text.includes("pencil"), "CSV output is missing expected data.");
    if (tool.id === "pdf-to-text") assert(text.includes("Extractable text layer"), "PDF text output is missing expected content.");
    if (tool.id === "epub-to-text") assert(text.includes("Chapter One"), "EPUB text output is missing expected content.");
  } else if (ext === "wav") {
    const data = Buffer.from(bytes);
    assert(data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WAVE", "Invalid WAV signature.");
    assert((await audioDuration(page, bytes, ext)) > 0, "WAV duration is empty.");
  } else if (ext === "mp3") {
    assert((Buffer.from(bytes).toString("ascii", 0, 3) === "ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0), "Invalid MP3 signature.");
    assert((await audioDuration(page, bytes, ext)) > 0, "MP3 duration is empty.");
  } else if (ext === "mp4" || ext === "mov") {
    assert(Buffer.from(bytes).toString("ascii", 4, 8) === "ftyp", `Invalid ${ext.toUpperCase()} container signature.`);
    assert((await videoDuration(page, bytes, ext)) > 0, `${ext.toUpperCase()} duration is empty.`);
  } else if (ext === "webm" || ext === "mkv" || ext === "avi") {
    if (ext === "webm" || ext === "mkv") {
      assert(Buffer.from(bytes.subarray(0, 4)).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), `Invalid ${ext.toUpperCase()} EBML signature.`);
    } else {
      const data = Buffer.from(bytes);
      assert(data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "AVI ", "Invalid AVI signature.");
    }
    assert((await videoDuration(page, bytes, ext)) > 0, `${ext.toUpperCase()} duration is empty.`);
  } else {
    throw new Error(`No output validator for .${ext}.`);
  }
}

async function readDownload(page: Page, tool: Tool) {
  const button = tool.action === "images" || tool.action === "csv" ? "Download all (ZIP)" : "Download";
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const download = await event;
  const stream = await download.createReadStream();
  assert(stream, "The browser did not provide the downloaded file.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { filename: download.suggestedFilename(), bytes: new Uint8Array(Buffer.concat(chunks)) };
}

async function validateDownload(page: Page, tool: Tool, filename: string, bytes: Uint8Array) {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  if (ext !== expectedExtension(tool)) {
    throw new Error(`Downloaded .${ext}, expected .${expectedExtension(tool)}.`);
  }
  assert(bytes.length > 0, "Downloaded file is empty.");

  if (ext !== "zip") return validateFile(page, tool, filename, bytes);

  assert(bytes[0] === 0x50 && bytes[1] === 0x4b, "Invalid ZIP signature.");
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const expectedCount = tool.id === "pdf-to-image" ? 3 : 2;
  assert(entries.length === expectedCount, `ZIP contains ${entries.length} files, expected ${expectedCount}.`);
  const csvEntries: string[] = [];
  for (const entry of entries) {
    const data = new Uint8Array(await entry.async("uint8array"));
    if (tool.id === "pdf-to-image") await validateFile(page, tool, entry.name, data);
    else csvEntries.push(new TextDecoder().decode(data));
  }
  if (tool.id === "xlsx-to-csv") {
    const text = csvEntries.join("\n");
    assert(text.includes("pencil") && text.includes("second sheet"), "CSV files are missing expected workbook data.");
  }
}

async function testTool(page: Page, tool: Tool) {
  await page.goto(`${baseUrl}/convert/${tool.id}`);
  if (tool.server) {
    await page.getByText("This tool needs a server. Phase 3 — not built yet.").waitFor();
    return "server UI";
  }

  const ext = tool.from === "image" ? "jpg" : tool.from === "audio" ? "wav" : tool.from === "video" ? "mp4" : tool.from;
  const input = join(outputDir, `${tool.id}.${ext}`);
  const inputs = [input];
  if (tool.id === "image-to-pdf") inputs.push(join(outputDir, "image-to-pdf-second.png"));
  if (tool.id === "merge-pdf") inputs.push(join(outputDir, "merge-pdf-second.pdf"));

  if (tool.action === "print") {
    await page.addInitScript(() => {
      const target = window as Window & { __printCalled?: boolean };
      window.print = () => {
        target.__printCalled = true;
      };
    });
  }

  await page.locator('input[type="file"]').setInputFiles(inputs);
  if (tool.action === "print") {
    await page.getByRole("button", { name: "Open print dialog" }).click();
    await page.getByRole("status").getByText("Print dialog opened.").waitFor();
    const printFrame = page.frames().find((frame) => frame !== page.mainFrame());
    assert(printFrame, "HTML print frame was not created.");
    const called = await printFrame.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled);
    assert(called, "The HTML print flow did not invoke window.print().");
    return "print invoked";
  }

  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const outcome = await Promise.race([
    page.getByText(/\d+ files? ready/).waitFor({ timeout: 180_000 }).then(() => "ready" as const),
    page.locator("p[role=alert]").first().waitFor({ timeout: 180_000 }).then(() => "error" as const),
  ]);
  if (outcome === "error") {
    const message = (await page.locator("p[role=alert]").allTextContents()).join(" ").trim();
    throw new Error(message || "Conversion failed without an error message.");
  }
  const { filename, bytes } = await readDownload(page, tool);
  await validateDownload(page, tool, filename, bytes);
  return `${filename} (${bytes.length} bytes)`;
}

async function main() {
  await writeStaticFixtures();
  let server: ReturnType<typeof spawn> | undefined;
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    if (!externalUrl) {
      server = spawn(process.execPath, ["run", "start"], {
        cwd: root,
        env: { ...process.env, PORT: String(port) },
        stdio: "ignore",
      });
      await waitForServer(server);
    }

    const generator = await browser.newPage();
    await generator.goto(baseUrl);
    await generateWebpFixture(generator);
    await generateMediaFixtures(generator);
    await generator.close();

    const page = await browser.newPage();
    const failures: string[] = [];
    for (const tool of tools) {
      try {
        const result = await testTool(page, tool);
        console.log(`PASS ${tool.id}: ${result}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${tool.id}: ${message}`);
        console.error(`FAIL ${tool.id}: ${message}`);
      }
    }
    await page.close();
    console.log(`\n${tools.length - failures.length} passed; ${failures.length} failed.`);
    if (failures.length) throw new Error(failures.join("\n"));
  } finally {
    await browser.close();
    if (server) {
      server.kill("SIGTERM");
      await new Promise<void>((resolveExit) => {
        if (server?.exitCode !== null) return resolveExit();
        server?.once("exit", () => resolveExit());
        setTimeout(resolveExit, 3000);
      });
    }
  }
}

await main();
