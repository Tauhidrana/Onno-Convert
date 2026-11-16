import { spawn } from "node:child_process";
import { copyFile, mkdir, open, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { chromium, type Browser, type Page } from "playwright";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { availableTools, tools } from "../src/convert/registry";
import type { Tool } from "../src/convert/registry";
import { MAX_SAFE_BYTES } from "../src/convert/types";

const root = resolve(import.meta.dir, "..");
const fixtureDir = join(root, "test-fixtures");
const outputDir = join(fixtureDir, "out");
const port = Number(process.env.E2E_PORT || 3187);
const externalUrl = process.env.E2E_BASE_URL;
const baseUrl = externalUrl || `http://127.0.0.1:${port}`;
const exifMarker = Buffer.from("Exif\0\0", "binary");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function addExifSegment(jpeg: Buffer) {
  const tiff = Buffer.from([
    0x49, 0x49, 0x2a, 0, 8, 0, 0, 0,
    1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const payload = Buffer.concat([exifMarker, tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), length, payload, jpeg.subarray(2)]);
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

  for (const tool of availableTools) {
    let ext = tool.from === "image" ? "jpg" : tool.from;
    if (tool.from === "audio") ext = "wav";
    if (tool.from === "video") ext = "mp4";

    const source =
      tool.id === "speech-to-text"
        ? join(fixtureDir, "speech-en.wav")
        : tool.id === "voice-recorder"
          ? null
          : tool.id === "image-to-text"
            ? null
            : tool.from === "html"
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

    if (source) {
      const destination = join(outputDir, `${tool.id}.${ext}`);
      if (ext === "jpg") {
        const jpeg = addExifSegment(Buffer.from(await Bun.file(source).arrayBuffer()));
        assert(jpeg.includes(exifMarker), "The JPEG fixture must contain EXIF metadata.");
        await writeFile(destination, jpeg);
      } else {
        await copyFile(source, destination);
      }
    }
  }

  await writeFile(
    join(outputDir, "text-to-pdf.txt"),
    "Onno Convert\n\nA real text fixture for the PDF converter.\nSecond line.\n",
  );
  await writeFile(
    join(outputDir, "html-to-pdf.html"),
    "<!doctype html><html><body><h1>Onno Convert fixture</h1><p>HTML print output.</p><script>window.parent.__htmlScriptExecuted = true</script></body></html>",
  );

  await copyFile(join(fixtureDir, "speech-bn.wav"), join(outputDir, "speech-bn.wav"));
  await copyFile(join(fixtureDir, "sample.png"), join(outputDir, "image-to-pdf-second.png"));
  await copyFile(join(fixtureDir, "sample-text.pdf"), join(outputDir, "merge-pdf-second.pdf"));

  const reorderPdf = await PDFDocument.create();
  for (const [index, width] of [300, 400, 500].entries()) {
    const page = reorderPdf.addPage([width, 600]);
    page.drawText(`Page ${index + 1}`);
  }
  await writeFile(join(outputDir, "reorder-pdf.pdf"), await reorderPdf.save());
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

async function generateOcrFixture(page: Page) {
  const svg = Buffer.from(await Bun.file(join(fixtureDir, "ocr-text.svg")).arrayBuffer()).toString("base64");
  const bytes = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/svg+xml;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for OCR fixtures.");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolveBlob, rejectBlob) => {
      canvas.toBlob((result) => (result ? resolveBlob(result) : rejectBlob(new Error("OCR fixture encoding failed."))), "image/png");
    });
    if (blob.type !== "image/png") throw new Error("Chromium cannot create the OCR PNG fixture.");
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, svg);
  const fixture = join(outputDir, "image-to-text.png");
  await writeFile(fixture, new Uint8Array(bytes));
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
  if (tool.action === "transcribe") return "txt";
  if (tool.action === "ocr") return "txt";
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
  if (tool.id.startsWith("jpg-to-")) {
    assert(!Buffer.from(bytes).includes(exifMarker), "The converted image still contains EXIF metadata.");
  }
  if (ext === "png") {
    assert(Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Invalid PNG signature.");
    const dimensions = await imageDimensions(page, bytes, ext);
    assert(dimensions.width > 0 && dimensions.height > 0, "PNG dimensions are empty.");
  } else if (ext === "jpg") {
    assert(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff, "Invalid JPEG signature.");
    const dimensions = await imageDimensions(page, bytes, ext);
    assert(dimensions.width > 0 && dimensions.height > 0, "JPEG dimensions are empty.");
    if (tool.id === "png-to-jpg") assert(dimensions.width <= 100, "Max-width option was not applied.");
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
    const expected = tool.id === "image-to-pdf" ? 2 : tool.id === "merge-pdf" ? 4 : tool.id === "split-pdf" ? 2 : tool.id === "rotate-pdf" || tool.id === "compress-pdf" || tool.id === "reorder-pdf" ? 3 : 1;
    assert(count === expected, `PDF has ${count} page(s), expected ${expected}.`);
    if (tool.id === "image-to-pdf") {
      const { width, height } = pdf.getPage(0).getSize();
      assert(width > height, "Image-to-PDF did not honor automatic landscape orientation.");
    }
    if (tool.id === "rotate-pdf") {
      assert(pdf.getPage(0).getRotation().angle === 0, "Rotate PDF changed an unselected page.");
      assert(pdf.getPage(1).getRotation().angle === 180, "Rotate PDF did not apply the selected angle.");
    }
    if (tool.id === "reorder-pdf") {
      const widths = pdf.getPages().map((page) => page.getWidth());
      assert(widths.join(",") === "500,300,400", `Pages were not reordered: ${widths.join(",")}.`);
    }
  } else if (ext === "xlsx") {
    assert(bytes[0] === 0x50 && bytes[1] === 0x4b, "Invalid XLSX ZIP signature.");
    const workbook = XLSX.read(bytes, { type: "array" });
    assert(workbook.SheetNames.length > 0, "XLSX has no worksheets.");
    if (tool.id === "csv-to-xlsx") {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
      assert(JSON.stringify(rows).includes("pencil"), "XLSX output is missing expected CSV data.");
    }
  } else if (ext === "csv" || ext === "txt") {
    const text = new TextDecoder().decode(bytes);
    assert(text.length > 0, `${ext.toUpperCase()} output is empty.`);
    if (ext === "csv") assert(text.includes("pencil"), "CSV output is missing expected data.");
    if (tool.id === "pdf-to-text") assert(text.includes("Extractable text layer"), "PDF text output is missing expected content.");
    if (tool.id === "epub-to-text") assert(text.includes("Chapter One"), "EPUB text output is missing expected content.");
    if (tool.id === "speech-to-text") {
      assert(text.toLowerCase().includes("communication channels"), "English speech was not transcribed.");
    }
    if (tool.id === "image-to-text") {
      assert(text.includes("Onno Convert OCR"), `English image text was not recognized: ${text}`);
      assert(text.includes("বাংলা"), `Bengali image text was not recognized: ${text}`);
    }
  } else if (ext === "wav") {
    const data = Buffer.from(bytes);
    assert(data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WAVE", "Invalid WAV signature.");
    assert((await audioDuration(page, bytes, ext)) > 0, "WAV duration is empty.");
  } else if (ext === "mp3") {
    assert((Buffer.from(bytes).toString("ascii", 0, 3) === "ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0), "Invalid MP3 signature.");
    const duration = await audioDuration(page, bytes, ext);
    assert(duration > 0, "MP3 duration is empty.");
    if (tool.id === "trim-audio") assert(duration > 0.8 && duration < 1.2, `Trimmed audio duration was ${duration}s, expected about 1s.`);
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
  if (tool.status === "planned") {
    await page.getByText("Not available yet").waitFor();
    assert((await page.locator('input[type="file"]').count()) === 0, "Planned routes must not expose file inputs.");
    return "planned UI";
  }

  const ext = tool.from === "image" ? "jpg" : tool.from === "audio" ? "wav" : tool.from === "video" ? "mp4" : tool.from;
  const input = tool.id === "image-to-text" ? join(outputDir, "image-to-text.png") : join(outputDir, `${tool.id}.${ext}`);
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
  if (tool.id === "png-to-jpg") await page.getByLabel("Max width (px)").fill("100");
  if (tool.id === "split-pdf") await page.getByLabel("Ranges").fill("2-3");
  if (tool.id === "rotate-pdf") {
    await page.getByLabel("Angle").selectOption("180");
    await page.getByLabel("Pages").fill("2");
  }
  if (tool.id === "reorder-pdf") await page.getByLabel("Page order").fill("3,1,2");
  if (tool.id === "trim-audio") {
    await page.getByLabel("Start (seconds)").fill("0.5");
    await page.getByLabel("End (seconds)").fill("1.5");
  }
  if (tool.action === "print") {
    await page.getByRole("button", { name: "Open print dialog" }).click();
    await page.getByRole("status").getByText("Print dialog opened.").waitFor();
    const printFrame = page.frames().find((frame) => frame !== page.mainFrame());
    assert(printFrame, "HTML print frame was not created.");
    const called = await printFrame.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled);
    assert(called, "The HTML print flow did not invoke window.print().");
    const scriptExecuted = await page.evaluate(
      () => (window as Window & { __htmlScriptExecuted?: boolean }).__htmlScriptExecuted,
    );
    assert(!scriptExecuted, "HTML input scripts must not execute in the print preview.");
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

async function testPlannedToolDiscovery(browser: Browser) {
  const page = await browser.newPage();
  const planned = tools.filter((tool) => tool.status === "planned");
  assert(planned.length === 8, `Expected 8 planned tools, found ${planned.length}.`);
  try {
    await page.goto(baseUrl);
    for (const tool of planned) {
      assert(
        (await page.locator(`a[href="/convert/${tool.id}"]`).count()) === 0,
        `${tool.id} is visible in the home grid.`,
      );
    }

    const search = page.getByRole("searchbox", { name: "Search tools" });
    for (const tool of planned) {
      await search.fill(tool.id);
      await page.getByText("No tool matches that search.").waitFor();
      assert((await page.locator(`a[href="/convert/${tool.id}"]`).count()) === 0, `${tool.id} is searchable.`);
    }

    const response = await fetch(`${baseUrl}/sitemap.xml`);
    assert(response.ok, "Sitemap request failed.");
    const sitemap = await response.text();
    assert(sitemap.includes("/convert/png-to-jpg"), "Sitemap is missing an available tool.");
    for (const tool of planned) {
      assert(!sitemap.includes(`/convert/${tool.id}`), `${tool.id} is present in the sitemap.`);
    }
  } finally {
    await page.close();
  }
}

async function testImageQuality(browser: Browser) {
  const page = await browser.newPage();
  const tool = tools.find((item) => item.id === "jpg-to-webp");
  assert(tool, "Missing JPG-to-WebP tool.");
  try {
    await page.goto(`${baseUrl}/convert/${tool.id}`);
    await page.locator('input[type="file"]').setInputFiles(join(outputDir, `${tool.id}.jpg`));
    const quality = page.getByLabel("Quality");

    await quality.focus();
    await quality.press("Home");
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page.getByText(/\d+ files? ready/).waitFor();
    const lowQuality = await readDownload(page, tool);

    await quality.focus();
    await quality.press("End");
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page.getByText(/\d+ files? ready/).waitFor();
    const highQuality = await readDownload(page, tool);
    assert(
      lowQuality.bytes.length < highQuality.bytes.length,
      `Low-quality output (${lowQuality.bytes.length} bytes) was not smaller than high-quality output (${highQuality.bytes.length} bytes).`,
    );
  } finally {
    await page.close();
  }
}

async function testPdfImageFormats(browser: Browser) {
  const page = await browser.newPage();
  const tool = tools.find((item) => item.id === "pdf-to-image");
  assert(tool, "Missing PDF-to-Images tool.");
  try {
    await page.goto(`${baseUrl}/convert/${tool.id}`);
    await page.locator('input[type="file"]').setInputFiles(join(outputDir, `${tool.id}.pdf`));
    await page.getByLabel("Resolution (DPI)").fill("72");
    const ready = page.getByText(/\d+ files? ready/);

    for (const [index, format] of ["jpg", "webp"].entries()) {
      await page.getByLabel("Image format").selectOption(format);
      await page.getByRole("button", { name: "Convert", exact: true }).click();
      if (index > 0) await ready.waitFor({ state: "detached" });
      await ready.waitFor({ state: "visible" });
      const { filename, bytes } = await readDownload(page, tool);
      await validateDownload(page, tool, filename, bytes);
    }
  } finally {
    await page.close();
  }
}

async function testCancellation(browser: Browser) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      const arrayBuffer = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        return new Promise<ArrayBuffer>((resolve, reject) => {
          setTimeout(() => arrayBuffer.call(this).then(resolve, reject), 1200);
        });
      };
    });
    await page.goto(`${baseUrl}/convert/image-to-pdf`);
    await page.locator('input[type="file"]').setInputFiles(join(outputDir, "image-to-pdf.jpg"));
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Stopping…", exact: true }).waitFor();
    await page.getByRole("button", { name: "Stopping…", exact: true }).waitFor({ state: "detached", timeout: 10_000 });
    assert((await page.getByText(/\d+ files? ready/).count()) === 0, "Cancelled conversion produced downloadable output.");
    assert(await page.getByRole("button", { name: "Convert", exact: true }).isEnabled(), "Cancelled tool did not return to idle state.");
  } finally {
    await page.close();
  }
}

async function testReorderDefault(browser: Browser) {
  const page = await browser.newPage();
  const tool = tools.find((item) => item.id === "reorder-pdf");
  assert(tool, "Missing PDF reorder tool.");
  try {
    await page.goto(`${baseUrl}/convert/${tool.id}`);
    await page.locator('input[type="file"]').setInputFiles(join(outputDir, `${tool.id}.pdf`));
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page.getByText(/\d+ files? ready/).waitFor();
    const { bytes } = await readDownload(page, tool);
    const pdf = await PDFDocument.load(bytes);
    const widths = pdf.getPages().map((item) => item.getWidth());
    assert(widths.join(",") === "300,400,500", `Default order dropped or moved pages: ${widths.join(",")}.`);
  } finally {
    await page.close();
  }
}

async function testCorruptInput(browser: Browser) {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/convert/pdf-to-text`);
    await page.locator('input[type="file"]').setInputFiles({
      name: "corrupt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("not a PDF"),
    });
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const alert = page.locator("p[role=alert]").first();
    await alert.waitFor();
    assert((await alert.textContent())?.includes("could not be opened"), "Corrupt PDF did not show a useful error.");
    assert((await page.getByText(/\d+ files? ready/).count()) === 0, "Corrupt PDF produced downloadable output.");
  } finally {
    await page.close();
  }
}

async function testBengaliSpeech(page: Page) {
  const tool = tools.find((item) => item.id === "speech-to-text");
  assert(tool, "Missing speech-to-text tool.");
  await page.goto(`${baseUrl}/convert/${tool.id}`);
  await page.locator('input[type="file"]').setInputFiles(join(outputDir, "speech-bn.wav"));
  await page.getByLabel("Language").selectOption("bn");
  const modelSize = page.getByLabel("Model size");
  for (const size of ["tiny", "base", "small"]) {
    await modelSize.selectOption(size);
    assert((await modelSize.inputValue()) === size, `${size} model selection was not applied.`);
  }
  assert((await page.getByLabel("Language").inputValue()) === "bn", "Bangla language selection was not applied.");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const outcome = await Promise.race([
    page.getByText(/\d+ files? ready/).waitFor({ timeout: 180_000 }).then(() => "ready" as const),
    page.locator("p[role=alert]").first().waitFor({ timeout: 180_000 }).then(() => "error" as const),
  ]);
  if (outcome === "error") {
    const message = (await page.locator("p[role=alert]").allTextContents()).join(" ").trim();
    throw new Error(message || "Bengali speech transcription failed.");
  }
  const { filename, bytes } = await readDownload(page, tool);
  assert(filename.endsWith(".txt"), `Downloaded ${filename}, expected a TXT transcript.`);
  const text = new TextDecoder().decode(bytes);
  assert(text.trim().length > 0, "The Bengali fixture produced an empty transcript.");
  const classifyScript = (transcript: string) => {
    if (/[\u0980-\u09FF]/.test(transcript)) return "Bengali script";
    if (/[\u0900-\u097F]/.test(transcript)) return "Devanagari (not Bengali)";
    if (/[A-Za-z]/.test(transcript)) return "Latin/romanized";
    return "unclassified";
  };
  const forcedResult = classifyScript(text);

  await page.getByLabel("Language").selectOption("auto");
  const ready = page.getByText(/\d+ files? ready/);
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await ready.waitFor({ state: "detached" });
  await ready.waitFor({ timeout: 180_000 });
  const automatic = await readDownload(page, tool);
  const automaticText = new TextDecoder().decode(automatic.bytes);
  assert(automaticText.trim().length > 0, "Auto produced an empty Bengali transcript.");
  const automaticResult = classifyScript(automaticText);
  return `forced Bangla: ${forcedResult}; auto: ${automaticResult}; sample: ${automaticText}`;
}

async function testSpeechSrt(page: Page) {
  const tool = tools.find((item) => item.id === "speech-to-text");
  assert(tool, "Missing speech-to-text tool.");
  await page.goto(`${baseUrl}/convert/${tool.id}`);
  await page.locator('input[type="file"]').setInputFiles(join(outputDir, `${tool.id}.wav`));
  await page.getByLabel("Language").selectOption("en");
  await page.getByLabel("Output").selectOption("srt");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await page.getByText(/\d+ files? ready/).waitFor({ timeout: 180_000 });
  const { filename, bytes } = await readDownload(page, tool);
  assert(filename.endsWith(".srt"), `Downloaded ${filename}, expected an SRT subtitle file.`);
  const text = new TextDecoder().decode(bytes);
  const timestamp = text.match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
  assert(timestamp && timestamp[2] !== "00:00:00,000", "SRT timestamps are missing or have zero duration.");
  assert(text.toLowerCase().includes("communication channels"), "English SRT is missing the expected transcript.");
}

async function testVoiceRecorder(browser: Browser) {
  const tool = tools.find((item) => item.id === "voice-recorder");
  assert(tool, "Missing voice-recorder tool.");
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  try {
    for (const format of ["mp3", "wav"] as const) {
      await page.goto(`${baseUrl}/convert/${tool.id}`);
      await page.getByLabel("Output").selectOption(format);
      await page.getByRole("button", { name: "Start recording" }).click();
      await page.getByRole("button", { name: "Stop recording" }).waitFor();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Stop recording" }).click();
      await page.getByText(/voice-recording\.(webm|m4a|ogg)/).waitFor();
      await page.getByRole("button", { name: "Convert", exact: true }).click();
      const outcome = await Promise.race([
        page.getByText(/\d+ files? ready/).waitFor({ timeout: 180_000 }).then(() => "ready" as const),
        page.locator("p[role=alert]").first().waitFor({ timeout: 180_000 }).then(() => "error" as const),
      ]);
      if (outcome === "error") {
        const message = (await page.locator("p[role=alert]").allTextContents()).join(" ").trim();
        throw new Error(message || `Voice recording to ${format.toUpperCase()} failed.`);
      }

      const { filename, bytes } = await readDownload(page, tool);
      assert(filename.endsWith(`.${format}`), `Downloaded ${filename}, expected .${format}.`);
      if (format === "wav") {
        const data = Buffer.from(bytes);
        assert(data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WAVE", "Invalid voice recording WAV output.");
      } else {
        assert(
          Buffer.from(bytes).toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
          "Invalid voice recording MP3 output.",
        );
      }
      assert((await audioDuration(page, bytes, format)) > 0.5, `Voice recording ${format.toUpperCase()} output has no audio.`);
    }
  } finally {
    await context.close();
  }
}

async function testLargeFileWarning(browser: Browser) {
  const file = join(outputDir, "large-warning.jpg");
  const handle = await open(file, "w");
  try {
    await handle.truncate(MAX_SAFE_BYTES + 1);
  } finally {
    await handle.close();
  }

  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/convert/jpg-to-png`);
    await page.locator('input[type="file"]').setInputFiles(file);
    await page.getByText("Large — may run out of memory").waitFor();
    assert((await page.getByText("large-warning.jpg").count()) === 1, "The large file was not queued.");
    assert((await page.title()).includes("JPG"), "The converter page stopped responding after the large file was queued.");
  } finally {
    await page.close();
    await unlink(file);
  }
}

async function testMobileLayouts(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    for (const [path, assertion] of [
      ["/", async () => assert((await page.locator('a[href^="/convert/"]').count()) > 0, "Home grid has no tool cards.")],
      ["/convert/png-to-jpg", async () => await page.getByRole("button", { name: "Convert", exact: true }).waitFor()],
      ["/convert/voice-recorder", async () => await page.getByRole("button", { name: "Start recording" }).waitFor()],
    ] as const) {
      await page.goto(`${baseUrl}${path}`);
      await assertion();
      const { viewportWidth, documentWidth } = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      assert(documentWidth <= viewportWidth, `${path} overflows horizontally at 390px (${documentWidth}px).`);
    }
  } finally {
    await page.close();
  }
}

async function main() {
  await writeStaticFixtures();
  let server: ReturnType<typeof spawn> | undefined;
  const browser = await chromium.launch({
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
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
    await generateOcrFixture(generator);
    await generateWebpFixture(generator);
    await generateMediaFixtures(generator);
    await generator.close();

    const page = await browser.newPage();
    const failures: string[] = [];
    let extraPasses = 0;
    for (const tool of tools) {
      if (tool.id === "voice-recorder") continue;
      try {
        const result = await testTool(page, tool);
        console.log(`PASS ${tool.id}: ${result}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${tool.id}: ${message}`);
        console.error(`FAIL ${tool.id}: ${message}`);
      }
    }
    try {
      const evidence = await testBengaliSpeech(page);
      extraPasses++;
      console.log(`PASS Bengali speech to text — ${evidence}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`Bengali speech to text: ${message}`);
      console.error(`FAIL Bengali speech to text: ${message}`);
    }
    try {
      await testSpeechSrt(page);
      extraPasses++;
      console.log("PASS English speech to SRT");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`English speech to SRT: ${message}`);
      console.error(`FAIL English speech to SRT: ${message}`);
    }
    try {
      await testVoiceRecorder(browser);
      console.log("PASS voice recorder MP3 and WAV");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`voice recorder: ${message}`);
      console.error(`FAIL voice recorder: ${message}`);
    }
    await page.close();

    for (const [name, check] of [
      ["planned tools stay out of discovery", () => testPlannedToolDiscovery(browser)],
      ["image quality option", () => testImageQuality(browser)],
      ["PDF image JPG/WebP options", () => testPdfImageFormats(browser)],
      ["cancellation", () => testCancellation(browser)],
      ["reorder default retains pages", () => testReorderDefault(browser)],
      ["corrupt input", () => testCorruptInput(browser)],
      [">200 MiB file warning", () => testLargeFileWarning(browser)],
      ["390px mobile layouts", () => testMobileLayouts(browser)],
    ] as const) {
      try {
        await check();
        extraPasses++;
        console.log(`PASS ${name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${name}: ${message}`);
        console.error(`FAIL ${name}: ${message}`);
      }
    }

    console.log(`\n${tools.length - failures.length + extraPasses} passed; ${failures.length} failed.`);
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
