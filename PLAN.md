# PLAN — Onno Convert

## Phase 0 — environment
- [x] ponytail ruleset in `AGENTS.md` + OpenCode plugin entry
- [x] context-optimizer portable skills in `.opencode/skills/` + `.contextignore`
- [x] graphify skill registered for OpenCode in `.opencode/` (graph built after scaffold)
- [x] `AGENTS.md`, `PLAN.md`, git repo
- [x] Bun install, typecheck, and production build
- [x] Type definitions added for Bun APIs used by the asset/worker build script
- [ ] Lint (no `lint` script is configured in `package.json`)

## Phase 1 — browser-only tools
Scaffold:
- [x] Next 16 + TS strict + Tailwind 4 + Bun
- [x] brand shell: header, footer, dark/light, logo, pastel tokens

Core:
- [x] `registry.ts` single source of truth + `convert()` interface
- [x] generic Web Worker + runner (run / cancel / progress)
- [x] home: tabs, search (`/` focus), 4/2-col grid, tool cards
- [x] tool route: dropzone, queue, per-file progress, single + ZIP download, errors

Converters:
- [x] Registered image pairs for PNG/JPG/WebP/AVIF/HEIC/GIF/SVG/TIFF; quality, resize, and EXIF removal
- [x] Image → PDF (multi-file reorder, page size, margins)
- [x] PDF → PNG/JPG/WebP (DPI, ZIP)
- [x] PDF → text; text → PDF; HTML → PDF (print)
- [x] Merge / split / rotate / compress-lite / reorder
- [x] CSV ↔ Excel, Excel → PDF-lite
- [x] Audio: mp3/wav/ogg/flac/m4a, mp4→mp3, trim (ffmpeg.wasm)
- [x] Video: mov/mkv/avi/webm→mp4, mp4→webm, compress (ffmpeg.wasm)
- [x] EPUB → text / PDF-lite

Quality:
- [x] real fixtures + Chromium Playwright suite
- [x] all 57 registry entries (49 live tools and 8 server UI routes)
- [x] Corrupt PDF error, cancellation without stale output, and multi-file flows
- [x] Per-file warning above 200 MiB (implementation inspected; no 200 MiB file was uploaded)
- [x] Keyboard/focus and screen-reader status improvements; Lighthouse home scores 100 mobile and desktop
- [x] Vercel config checked (`vercel.json`); production build passes (remote deploy not run)

## Phase 2 — voice & OCR
- [x] Whisper STT (English/Bengali) → TXT/SRT
- [x] OCR (Bengali+English images → TXT)
- [x] voice recorder → MP3/WAV

## Phase 3 — server-grade (needs approval + proposal)
- [ ] PDF→DOCX/XLSX/PPTX, Office→PDF, DWG, DjVu, MOBI
- [ ] marked "Server" in UI; proposal with cost/tradeoffs first

## Verification status
`bun run test` builds production assets and passed 64 Chromium 159 checks: all 57 registry entries (49 live, 8 server UI routes), OCR of English and Bengali image text, English TXT/SRT and Bengali TXT speech transcription, and voice recording to MP3/WAV, plus image quality, PDF image JPG/WebP output, cancellation, reorder-default retention, and corrupt-PDF handling. Outputs were downloaded and validated with signatures, dimensions, EXIF removal, PDF page counts/rotation/order, workbook/CSV content, media duration, real FLEURS speech content, and OCR text from a PNG fixture. Voice recording used Chromium's fake microphone device. HTML-to-PDF's print call was intercepted; its print preview blocks uploaded scripts and has no downloadable blob.

| Tool | Status |
|---|---|
| `image-to-text` | works (English and Bengali text in PNG fixture) |
| `voice-recorder` | works (Chromium fake-mic recording; MP3/WAV signatures and durations) |
| `png-to-jpg` | works |
| `jpg-to-png` | works |
| `png-to-webp` | works |
| `jpg-to-webp` | works |
| `webp-to-jpg` | works |
| `webp-to-png` | works |
| `heic-to-jpg` | works |
| `heic-to-png` | works |
| `avif-to-jpg` | works |
| `avif-to-png` | works |
| `png-to-avif` | works (lazy WASM fallback; Chromium canvas encoder unsupported) |
| `jpg-to-avif` | works (lazy WASM fallback; Chromium canvas encoder unsupported) |
| `svg-to-png` | works |
| `svg-to-jpg` | works |
| `tiff-to-jpg` | works |
| `tiff-to-png` | works |
| `gif-to-png` | works |
| `gif-to-jpg` | works |
| `image-to-pdf` | works |
| `pdf-to-image` | works (3 pages in ZIP) |
| `pdf-to-text` | works |
| `text-to-pdf` | works |
| `html-to-pdf` | works (print invoked; no downloadable blob) |
| `merge-pdf` | works (4 pages) |
| `split-pdf` | works |
| `rotate-pdf` | works (3 pages) |
| `compress-pdf` | works (3 pages) |
| `reorder-pdf` | works |
| `csv-to-xlsx` | works |
| `xlsx-to-csv` | works (2 CSV files in ZIP) |
| `xlsx-to-pdf` | works |
| `mp3-to-wav` | works |
| `wav-to-mp3` | works |
| `m4a-to-mp3` | works |
| `ogg-to-mp3` | works |
| `flac-to-mp3` | works |
| `mp4-to-mp3` | works |
| `speech-to-text` | works (English TXT/SRT and Bengali TXT; Bengali may be Romanized) |
| `trim-audio` | works |
| `mov-to-mp4` | works |
| `mkv-to-mp4` | works |
| `avi-to-mp4` | works |
| `webm-to-mp4` | works |
| `mp4-to-webm` | works (VP8 + Vorbis) |
| `compress-video` | works |
| `epub-to-pdf` | works |
| `epub-to-text` | works |
| `pdf-to-docx` | missing (intentional Phase 3 server tool; UI verified) |
| `pdf-to-xlsx` | missing (intentional Phase 3 server tool; UI verified) |
| `pdf-to-pptx` | missing (intentional Phase 3 server tool; UI verified) |
| `docx-to-pdf` | missing (intentional Phase 3 server tool; UI verified) |
| `pptx-to-pdf` | missing (intentional Phase 3 server tool; UI verified) |
| `djvu-to-pdf` | missing (intentional Phase 3 server tool; UI verified) |
| `mobi-to-epub` | missing (intentional Phase 3 server tool; UI verified) |
| `dwg-to-pdf` | missing (intentional Phase 3 server tool; UI verified) |

Phase 2 is complete. Phase 3 server tools remain unbuilt pending approval.

## Audit notes
- The registry exposes 18 selected image pairs, not every possible source/target combination. SVG and HEIC are input-only; GIF and TIFF output encoders are not exposed as tools.
- Animated GIF conversion and multi-page TIFF conversion use the first frame/page.
- Main-thread converters suppress output after cancellation but may finish their current async operation before returning to idle; Web Worker tasks terminate immediately, and FFmpeg cancellation terminates its engine.
- `reorder-pdf` now preserves the full original order when the page-order field is blank; explicit orders still allow omitted pages to be dropped.
- The 200 MiB warning threshold is present in the UI but was not exercised with a file that large.
- The static asset build clears ignored generated directories before copying; repeated builds no longer retain duplicate FFmpeg/PDF/AVIF/Tesseract assets.
- Whisper base is loaded only on first use, then cached by the browser; its quantized files total about 70 MiB. Language is selected explicitly because Transformers.js currently defaults to English rather than detecting Whisper languages. The Bengali fixture is transcribed as Romanized text rather than Bengali script.
- Bengali and English E2E speech clips are from Google FLEURS under CC BY 4.0; see `test-fixtures/ATTRIBUTION.txt`.
- Speech audio decoding and Whisper inference run in the page; inference is CPU-intensive and cancellation cannot interrupt a model call already in progress.
- OCR runs in a local Tesseract worker. Its worker/core assets are served by the app; English and Bengali trained data download from Tesseract's data host on first use and are browser-cached. Images are never uploaded. Cancellation during worker/language initialization waits for initialization to finish before the result is discarded.
- Voice recording uses `MediaRecorder` and requires a secure origin plus microphone permission. MP3/WAV output was tested with Chromium's fake microphone, not physical devices or Safari; FFmpeg re-encodes locally.

## Next step
Prepare the Phase 3 proposal and Vercel deployment steps; do not build server tools without approval.

## Handoff notes
- `bun run test` passes: production build plus 64 Chromium checks; standalone `bun run typecheck` passed.
- Lighthouse 13.6.0 reports 100 mobile and desktop for performance, accessibility, best practices, and SEO.
- Clean generated public assets total about 85 MiB (Tesseract core 43 MiB, FFmpeg 31 MiB, worker 10 MiB, PDF worker 1 MiB); no conflict-suffixed duplicates remain.
- `bun run lint` cannot run because no lint script exists; no linter was added.
- Chromium 159 returns PNG for the AVIF canvas encode request; the lazy `@jsquash/avif` fallback passed both AVIF output tests.
- VP9 encoding in the bundled FFmpeg WASM core trapped with out-of-bounds memory; MP4-to-WebM now uses the verified VP8+Vorbis profile.
- `bun run test` now passes 64 Chromium checks including English/Bengali Tesseract OCR, English/Bengali Whisper TXT, English SRT timestamps, and MP3/WAV voice recording via Chromium's fake microphone. Whisper Bengali output may be Romanized.
- E2E creates slug-named fixtures under ignored `test-fixtures/out/`; generated video/audio inputs and EXIF-bearing JPEGs are synthetic and local.
- The prior `test-fixtures/sample.mp4` is malformed and unused. The prior `sample.webm` identifies as Big Buck Bunny and is unused; neither is included in the test suite.
