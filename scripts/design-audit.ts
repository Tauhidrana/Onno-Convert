// Screenshots the same states/themes/viewports before and after the redesign.
// Run: bun scripts/design-audit.ts before|after
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";

const root = resolve(import.meta.dir, "..");
const phase = process.argv[2] ?? "before";
const out = join(root, "design-audit", phase);
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const fixture = join(root, "test-fixtures");

async function go(page: Page, path: string) {
  await page.goto(`${base}${path}`);
  await page.waitForTimeout(500); // dev hydration before interacting
}

async function setup(name: string, page: Page) {
  if (name === "home") return go(page, "/");
  const slug =
    name === "image-tool" ? "png-to-jpg" : name === "pdf-tool" ? "merge-pdf" : name === "audio-tool" ? "wav-to-mp3" : name === "result" ? "png-to-jpg" : name === "error" ? "pdf-to-text" : name === "recorder" ? "voice-recorder" : name === "ocr" ? "image-to-text" : "speech-to-text";
  await go(page, `/convert/${slug}`);
  if (name === "pdf-tool") await page.locator('input[type="file"]').setInputFiles(join(fixture, "sample.pdf"));
  if (name === "audio-tool") await page.locator('input[type="file"]').setInputFiles(join(fixture, "sample.wav"));
  if (name === "result") {
    await page.locator('input[type="file"]').setInputFiles(join(fixture, "sample.png"));
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page.getByText(/\d+ files? ready/).waitFor({ timeout: 60_000 });
  }
  if (name === "error") {
    await page.locator('input[type="file"]').setInputFiles({
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("this is not a pdf"),
    });
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page.locator("p[role=alert]").filter({ hasText: /could not be opened/i }).first().waitFor({ timeout: 60_000 });
  }
}

const states = ["home", "image-tool", "pdf-tool", "audio-tool", "result", "error", "recorder", "ocr", "speech"];
const sizes = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const errors: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    for (const size of sizes) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        colorScheme: theme,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(`${theme}-${size.name}: ${error.message}`));
      for (const state of states) {
        await setup(state, page);
        await page.screenshot({ path: join(out, `${theme}-${size.name}-${state}.png`) });
      }
      await context.close();
    }
  }
  console.log(`54 screenshots in ${out}`);
  if (errors.length) console.log("page errors:", errors.slice(0, 10).join(" | "));
} finally {
  await browser.close();
}
