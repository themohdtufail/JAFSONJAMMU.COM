// WCAG 2.1 A/AA scan (axe-core) of the storefront and the back-office. Needs API, storefront (3000) and back-office (3001) running.
// Run: node tests/e2e/a11y.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const W = process.env.WEB_URL ?? "http://localhost:3000", A = process.env.ADMIN_URL ?? "http://localhost:3001";
const email = process.env.ADMIN_EMAIL ?? "owner@jafson.local", password = process.env.ADMIN_PASSWORD ?? "dev-owner-password-123";
const shop = ["/", "/collections/men", "/collections/kids", "/checkout", "/track", "/wishlist", "/returns", "/size-guide", "/shipping", "/faqs", "/about", "/privacy", "/terms", "/contact"];
const back = ["/", "/orders", "/inventory", "/products", "/returns", "/customers", "/promotions", "/messages", "/reports", "/gst", "/store-ops", "/audit", "/security"];
const b = await chromium.launch(); let bad = 0;
const scan = async (p, url, label) => {
  await p.goto(url); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(500);
  await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }));
  for (const v of r.violations) { bad++; console.log(`✗ ${label} ${v.id} (${v.impact}) ${v.nodes.length}x: ${v.nodes[0].target.join(" ")}`); }
  if (!r.violations.length) console.log(`✓ ${label}`);
};
try {
  for (const [vp, w, h] of [["desktop", 1280, 900], ["mobile", 390, 844]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    for (const u of shop) await scan(p, W + u, `shop ${vp} ${u}`);
  }
  const a = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await a.goto(`${A}/login`); await a.fill("input[type=email]", email); await a.fill("input[type=password]", password); await a.click("button.btn"); await a.waitForSelector(".side");
  for (const u of back) await scan(a, A + u, `admin ${u}`);
} finally { await b.close(); }
console.log(bad ? `\n${bad} accessibility problem(s)` : "\nNo accessibility problems found"); process.exitCode = bad ? 1 : 0;
