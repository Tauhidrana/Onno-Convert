# Onno Convert

Onno Convert is a personal, browser-only file converter. Convert images, PDFs, documents, audio, video, and ebooks without uploading user files. By OnnoPoth.

## Run locally

```sh
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Static worker and WASM assets are copied from installed dependencies before the development server or production build starts.

## Check changes

```sh
bun run typecheck
bun run lint
bun run test
```

The test command builds the app and runs its Chromium end-to-end converter checks. Install the browser once with `bunx playwright install chromium` if it is not already available.

## PDF workspace and voice cleaner

The PDF Workspace tools (Edit, Sign, Form Builder, Fill Form, Request Signatures, Share) open interactive editors; all work happens in the browser. Edits are applied as overlays with pdf-lib, and existing PDF text cannot be edited in place. Whiteout covers text visually; choose rasterize redaction to actually remove it from the page (that page becomes an image). Signatures are visual only — not certificate-based digital signatures, and no legal claim is made. Request Signatures creates fillable placeholders; it cannot send, track or verify anything. Share uses the device's Web Share API where available, otherwise download, a mailto link or copying the filename.

Voice Noise Cleaner accepts audio or video files. Fast mode uses ffmpeg.wasm filters (highpass/lowpass/afftdn/optional loudnorm); AI mode uses `@shiguredo/rnnoise-wasm` in a prebuilt Worker after a one-time ~5 MB download. Both show before/after waveforms with A/B playback, intensity, progress and cancel, and output WAV or MP3.

The Bengali-capable PDF font (`public/fonts/NotoSansBengali.ttf`, SIL OFL) is committed so exported PDFs can embed Bengali text. The RNNoise worker and other generated WASM/worker assets are rebuilt from locked dependencies.

## Deploy to Vercel

Import the repository into Vercel and deploy with the project settings in `vercel.json`: Bun install, `bun run build`, and the Next.js framework preset. The build regenerates ignored worker/WASM assets from the locked dependencies; they do not need to be committed.

## Privacy and availability

User files stay in the browser and are not uploaded. Some tools download model or language data from their public providers on first use; those assets are browser-cached. Tools requiring a server are not implemented in this client-only release.
