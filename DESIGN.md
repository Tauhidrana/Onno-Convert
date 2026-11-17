# DESIGN — Onno Convert UI/UX

## Audit (before)
54 Chromium screenshots: `design-audit/before/<light|dark>-<390|768|1440>-<state>.png`.
States: home, image tool, PDF tool, audio tool, result, error, recorder, OCR, speech-to-text.
The floating "N" badge is the Next dev indicator, not product UI.

### Brutal critique — top 15 problems, worst first
1. **No primary action where the eye lands on mobile.** At 390px the Convert button lives below the options panel, off-screen after files are added (`light-390-result.png`). Users must hunt for the next step. Desktop puts it in a sidebar, separate from the queue and result.
2. **Done state is a footnote.** A thin green strip with a small Download button; no before/after size, no "convert another", no "use result in another tool", no sense of accomplishment. The flow just stops.
3. **Errors whisper.** The corrupt-PDF message is tiny red text under the file, while the rest of the page looks unchanged (`light-1440-error.png`). No recovery action, no retry, no explanation of what to do next.
4. **Home navigation is mislabeled.** Tabs say "Convert from PDF / Convert to PDF / Other formats" — these are not categories. There is no PDF/Image/Audio/Video/Document/Data/Ebook/Voice filter, so browsing 49 tools is a maze.
5. **Search is demoted.** A small right-hand input below the tabs, no autofocus, no `/`-palette, no fuzzy matching on "jpg", "mp3", "docx". The hero promises "anything" but discovery is manual.
6. **A wall of near-identical cards.** 18 image tools all show the same image glyph and a two-token hint. No format badges, no one-line descriptions, no favorites/recents; scanning is exhausting.
7. **Tool pages waste the viewport.** A 1440px screen shows a 510px working column and ~400px of dead space below. Layout never expands or centers the work meaningfully.
8. **Progress feedback is ambiguous.** A bar stays at 100% after success; no percentage, no stage label, no estimated state. "Converting…" alone never tells what is happening.
9. **Low-contrast small text.** Secondary copy uses `black/45` / `white/40` at 11–12px; hints, notes and accepted formats fail WCAG AA, especially in dark mode.
10. **Tap targets are too small.** Remove/reorder/download icons are ~26–30px; the spec is 44px. Mobile reorder arrows are nearly untappable (`dark-390-pdf-tool.png`).
11. **Dropzone copy is machine-readable, not human.** Raw accept lists (`.mp3 · .wav · ... · audio/*`) replace a clear sentence; no max-size note, no paste support, and the same generic box appears for every tool.
12. **Special tools look like generic uploads.** Recorder has no timer, level meter or playback; OCR and speech hide model size/speed behind dense gray paragraphs and bury the Bengali warning in a note.
13. **Header does nothing for discovery.** No search, no command palette, no compact mobile treatment; "All tools" is a plain text link competing with the logo.
14. **Inconsistent visual language.** Accent purple, black primary buttons and green success blocks fight each other; pastel tiles differ in weight; hover/focus/press states are barely perceptible.
15. **No personality or continuity.** No favorite/recent tools, no private-by-design explanation beyond one badge, no installable app affordance, no microinteractions; the product feels like a form, not a tool people return to.

### Redesign plan (short)
1. Tokens + Inter/Bengali fonts + one reusable UI kit (Button, Card, Tabs, Dropzone, FileRow, ProgressBar, Toast, Dialog, Tooltip, Skeleton, EmptyState, Kbd) in CSS variables, both themes AA.
2. Home: hero search with autofocus + `/` + Cmd/Ctrl+K palette, category chips (sticky), richer cards with format badges, recents/favorites, plain-language privacy strip.
3. Tool page: single four-state flow — empty, queued, converting, done — with drop-anywhere + paste, sticky action bar, real percentage/stage, retryable errors, size delta and next-tool shortcuts; remember options per tool.
4. Special tools: recorder timer/level/playback; OCR/speech selector hints and model progress; PDF/image visual order controls where they already exist.
5. Global: sticky compact header with search, focus rings, 44px targets, reduced motion, metadata/PWA already present; verify with the same screenshots, tests, Lighthouse.

No new heavy dependencies. No converter internals changed; the existing registry and runners stay intact.

## After (round 1 + one refinement)
54 matching screenshots: `design-audit/after/<light|dark>-<390|768|1440>-<state>.png`.

What improved: the primary action is now always visible (sticky bottom bar on mobile, fixed sidebar on desktop); done states show the size delta, download, "convert another", a next-tool link and editable/copyable text or media preview; failures get a prominent card with a fix and retry; the home has a hero search, category chips, format badges, favorites/recents and a plain-language privacy strip; the recorder has a timer, level meter and playback; PDF reorder/rotate/split show page thumbnails and the merge queue shows its order visually.

Refinement fixes after reviewing the first "after" set: friendly format labels for MIME-only accept lists (OCR/speech no longer show raw MIME strings), queued files read "Ready" instead of "Working", dropzone hierarchy (instruction before the choose button), shorter mobile search placeholder, and a non-wrapping before/after size line.

Remaining issues reviewed and accepted:
- The 49-card grid still repeats the same few icons; pastel tiles, badges and favorites keep it scannable, but per-tool artwork would be the next visual upgrade.
- OCR/speech model notes remain paragraph-length on desktop (all limits are visible by design).
- Options stay inline on mobile rather than in a bottom sheet; the sticky action bar removes the original "can't find Convert" failure.
- Bangla/English UI language toggle was skipped: the product copy is short and the Bengali font is already applied to user content.

Verified: 67/67 Chromium checks (`bun run test`), typecheck, lint, and Lighthouse 100/100/100/100 (performance, accessibility, best practices, SEO) for both mobile and desktop.
