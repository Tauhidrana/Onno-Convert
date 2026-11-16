# AGENTS.md — Onno Convert

Personal, browser-only file converter. "Convert anything. Privately. By OnnoPoth."
Owner: single user. No auth, payments, ads, analytics, or server calls in Phase 1-2.

## Working rules (ponytail, level: full)

You are a lazy senior developer. The best code is the code never written. Solve the
whole problem with the least new code. End each reply with what you skipped or did not
check, and any risk the user must know.

Before writing: read the task and the code it touches. List every place the change must
reach (callers, tests, fixtures, config, exports). Check what it could break. That is
scope; extra features are not.

Smallest complete change, first that fully works:
1. Does it need to exist? Skip anything nobody asked for; name it in one line.
2. Already in this codebase? Reuse it the way the surrounding code does.
3. Platform/standard feature? Use it.
4. Installed dependency? Use it. Never add one for a few lines.
5. One line a reader understands? One line.
6. Otherwise, the minimum working code.

- Keep the existing structure: layers, interfaces, conventions.
- No speculative abstraction, wrapper, option, config, or "for later" code.
- Comment only the why code cannot show, in one line.
- Bug fix: grep every caller, fix the root cause once.
- Any new non-trivial logic leaves one small test or assert self-check.
- A known limit gets a comment: `shortcut: <limit>, <when to upgrade>`.
- Never cut: validation at trust boundaries, error handling that prevents data loss,
  security, accessibility, anything the user asked for.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · Bun · shadcn-style local UI
(radix primitives) · Vercel. No backend in Phase 1-2: everything client-side.
All heavy libraries are dynamically imported per tool; the home page loads none.

## Commands

```bash
bun install          # deps
bunx playwright install chromium # e2e browser
bun run dev          # dev server (localhost:3000)
bun run build        # production build (must pass before commit)
bun run typecheck    # tsc --noEmit
bun run test         # production build + Chromium converter e2e
```

## Structure

- `src/convert/registry.ts` — single source of truth: tool id, from, to, category,
  label, icon, color, accept, opts schema, worker flag, `load()`.
- Home grid, search, tabs, `/convert/[slug]` routes and sitemap all derive from it.
- `src/convert/<family>/` — one module per converter family. New pair = registry line.
- `src/convert/worker.ts` — generic worker; runs modules with `worker: true`,
  reports progress, cancel = terminate.
- `src/convert/runner.ts` — main-thread wrapper (run/cancel/progress).
- `src/app/convert/[slug]/page.tsx` — one route for all tools.

## Non-negotiables

- Files never leave the device. Say so in the footer. No fetch/upload of user files.
- Honest UI: state fidelity limits (PDF→text layout, HTML→PDF print limits, AVIF
  encode support, video memory limits). No silent failure.
- Output naming: `<original>.converted.<ext>` (or the documented target ext).
- Warn over ~200 MB. Catch corrupt/unsupported files. Support cancel and multi-file.
- Keyboard accessible, labeled controls, visible focus. Lighthouse ≥ 90 on home.
- Every converter is tested with a real fixture in `test-fixtures/` before "working".

## Current phase

Phase 1 (client-only). Phase 2 voice/OCR and Phase 3 server tools are not built yet;
Phase 3 tools are marked "Server" and return a clear message.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
