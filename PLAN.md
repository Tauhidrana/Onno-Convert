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
- [ ] fixtures + round-trip script
- [ ] real-file test of every converter (browser)
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
Code audit of `src/convert/registry.ts` found 46 client-side entries mapped to converter modules. No entry is marked "works" until independently exercised in Chromium with a real input and output validation.

| Tool | Status |
|---|---|
| `png-to-jpg` | untested |
| `jpg-to-png` | untested |
| `png-to-webp` | untested |
| `jpg-to-webp` | untested |
| `webp-to-jpg` | untested |
| `webp-to-png` | untested |
| `heic-to-jpg` | untested |
| `heic-to-png` | untested |
| `avif-to-jpg` | untested |
| `avif-to-png` | untested |
| `png-to-avif` | broken: Chromium 159 canvas AVIF probe returned `image/png`; no fallback yet |
| `jpg-to-avif` | broken: Chromium 159 canvas AVIF probe returned `image/png`; no fallback yet |
| `svg-to-png` | untested |
| `svg-to-jpg` | untested |
| `tiff-to-jpg` | untested |
| `tiff-to-png` | untested |
| `gif-to-png` | untested |
| `gif-to-jpg` | untested |
| `image-to-pdf` | untested |
| `pdf-to-image` | untested |
| `pdf-to-text` | untested |
| `text-to-pdf` | untested |
| `html-to-pdf` | untested (print flow; no downloadable blob) |
| `merge-pdf` | untested |
| `split-pdf` | untested |
| `rotate-pdf` | untested |
| `compress-pdf` | untested |
| `reorder-pdf` | untested |
| `csv-to-xlsx` | untested |
| `xlsx-to-csv` | untested |
| `xlsx-to-pdf` | untested |
| `mp3-to-wav` | untested |
| `wav-to-mp3` | untested |
| `m4a-to-mp3` | untested |
| `ogg-to-mp3` | untested |
| `flac-to-mp3` | untested |
| `mp4-to-mp3` | untested |
| `trim-audio` | untested |
| `mov-to-mp4` | untested |
| `mkv-to-mp4` | untested |
| `avi-to-mp4` | untested |
| `webm-to-mp4` | untested |
| `mp4-to-webm` | untested |
| `compress-video` | untested |
| `epub-to-pdf` | untested |
| `epub-to-text` | untested |
| `pdf-to-docx` | missing (intentional Phase 3 server tool) |
| `pdf-to-xlsx` | missing (intentional Phase 3 server tool) |
| `pdf-to-pptx` | missing (intentional Phase 3 server tool) |
| `docx-to-pdf` | missing (intentional Phase 3 server tool) |
| `pptx-to-pdf` | missing (intentional Phase 3 server tool) |
| `djvu-to-pdf` | missing (intentional Phase 3 server tool) |
| `mobi-to-epub` | missing (intentional Phase 3 server tool) |
| `dwg-to-pdf` | missing (intentional Phase 3 server tool) |

Phase 2 speech-to-text, OCR, and voice recorder are not registry entries and remain unimplemented.

## Next step
Add a Chromium Playwright run that converts and validates a real fixture for every live registry entry.

## Handoff notes
- `bun install`, `bun run typecheck`, and `bun run build` pass.
- `bun run lint` cannot run because no lint script exists; no linter was added.
- `bun run test` fails because `test/roundtrip.ts` is missing; not changed during the build-only milestone.
- `test-fixtures/` is untracked handoff work; `sample.mp4` is not decodable by the installed FFmpeg probe and needs replacement before video tools can be verified.
- Chromium 159 does not encode AVIF via `canvas.toBlob`; `@jsquash/avif` 2.1.1 is installed for the required lazy fallback.
