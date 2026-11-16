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

## Deploy to Vercel

Import the repository into Vercel and deploy with the project settings in `vercel.json`: Bun install, `bun run build`, and the Next.js framework preset. The build regenerates ignored worker/WASM assets from the locked dependencies; they do not need to be committed.

## Privacy and availability

User files stay in the browser and are not uploaded. Some tools download model or language data from their public providers on first use; those assets are browser-cached. Tools requiring a server are not implemented in this client-only release.
