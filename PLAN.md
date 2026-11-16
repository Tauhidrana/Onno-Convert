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
- [ ] Image: png/jpg/webp/avif/heic/gif/svg/tiff → raster; quality, resize, strip EXIF
- [ ] Image → PDF (reorder, page size, margins)
- [ ] PDF → PNG/JPG/WebP (DPI, ZIP)
- [ ] PDF → text; text → PDF; HTML → PDF (print)
- [ ] merge / split / rotate / compress-lite / reorder
- [ ] CSV ↔ Excel, Excel → PDF-lite
- [ ] Audio: mp3/wav/ogg/flac/m4a, mp4→mp3, trim (ffmpeg.wasm)
- [ ] Video: mov/mkv/avi/webm→mp4, mp4→webm, compress (ffmpeg.wasm)
- [ ] EPUB → text / PDF-lite

Quality:
- [x] real fixtures + Chromium Playwright suite
- [x] real-file test of every registry entry (46 live tools and 8 server UI routes)
- [ ] 200 MB warn, corrupt input, cancel, multi-file
- [ ] a11y pass, Lighthouse ≥ 90 home
- [ ] Vercel deploy config + steps

## Phase 2 — voice & OCR (not started)
- [ ] Whisper STT (bn/en) → txt/srt
- [ ] OCR (ben+eng)
- [ ] voice recorder

## Phase 3 — server-grade (needs approval + proposal)
- [ ] PDF→DOCX/XLSX/PPTX, Office→PDF, DWG, DjVu, MOBI
- [ ] marked "Server" in UI; proposal with cost/tradeoffs first

## Verification status
`bun run test` builds production assets and ran all 54 registry entries in Chromium 159. Client-side outputs were downloaded and checked for signatures plus image dimensions, PDF page counts, workbook/CSV content, and media duration. HTML-to-PDF's print call was intercepted; its documented flow has no downloadable blob.

| Tool | Status |
|---|---|
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

Phase 2 speech-to-text, OCR, and voice recorder are not registry entries and remain unimplemented.

## Next step
Audit remaining Phase 1 requirements against the verified registry and close only confirmed gaps.

## Handoff notes
- `bun run test` passes: production build plus 54 Chromium checks; `bun run typecheck` passed before the final test run and the build typecheck passed again.
- `bun run lint` cannot run because no lint script exists; no linter was added.
- Chromium 159 returns PNG for the AVIF canvas encode request; the lazy `@jsquash/avif` fallback passed both AVIF output tests.
- VP9 encoding in the bundled FFmpeg WASM core trapped with out-of-bounds memory; MP4-to-WebM now uses the verified VP8+Vorbis profile.
- E2E creates slug-named fixtures under ignored `test-fixtures/out/`; generated video/audio inputs are synthetic and local.
- The prior `test-fixtures/sample.mp4` is malformed and unused. The prior `sample.webm` identifies as Big Buck Bunny and is unused; neither is included in the test suite.
