# PLAN — Onno Convert

## Phase 0 — environment
- [x] ponytail ruleset in `AGENTS.md` + OpenCode plugin entry
- [x] context-optimizer portable skills in `.opencode/skills/` + `.contextignore`
- [x] graphify skill registered for OpenCode in `.opencode/` (graph built after scaffold)
- [x] `AGENTS.md`, `PLAN.md`, git repo

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
