// Renders the brand-kit application templates (packaging, social) to PNG: node scripts/render-applications.mjs <out-dir>
import { chromium } from "playwright";
import { mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "applications"); const out = process.argv[2] ?? "brand-applications";
mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 1 });
for (const f of readdirSync(root).filter((x) => x.endsWith(".html"))) {
  await p.goto(pathToFileURL(join(root, f)).href); await p.waitForLoadState("networkidle"); await p.evaluate(() => document.fonts.ready);
  const box = await p.locator("#art").boundingBox(); await p.setViewportSize({ width: Math.ceil(box.width) + 40, height: Math.ceil(box.height) + 40 });
  await p.locator("#art").screenshot({ path: join(out, f.replace(".html", ".png")) }); console.log("rendered", f);
}
await b.close();
