// Browser check that the Content-Security-Policy blocks nothing the sites legitimately use. Needs API, storefront and back-office running.
// Run: node tests/e2e/csp.mjs
import { chromium } from "playwright";
const W = process.env.WEB_URL ?? "http://localhost:3000", A = process.env.ADMIN_URL ?? "http://localhost:3001";
const email = process.env.ADMIN_EMAIL ?? "owner@jafson.local", password = process.env.ADMIN_PASSWORD ?? "dev-owner-password-123";
const b = await chromium.launch(); const bad = []; let pages = 0;
const watch = async (p, tag) => { await p.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => (window.__csp = [...(window.__csp ?? []), `${e.violatedDirective} ${e.blockedURI}`])); }); p.on("console", (m) => { if (/Content.Security.Policy/i.test(m.text())) bad.push(`${tag}: ${m.text().slice(0, 160)}`); }); };
const check = async (p, tag) => { pages++; const v = await p.evaluate(() => window.__csp ?? []); for (const x of v) bad.push(`${tag}: ${x}`); };
try {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); await watch(p, "shop");
  await p.goto(W); await p.waitForTimeout(800); await check(p, "shop /");
  await p.goto(`${W}/collections/men`); await p.waitForSelector(".card:not(:has(.badge.dark))"); await check(p, "shop /collections/men");
  await p.click(".card:not(:has(.badge.dark)) >> nth=0"); await p.waitForURL("**/products/**"); await p.waitForSelector(".sizes button:not(.off)"); await p.click(".sizes button:not(.off) >> nth=0"); await p.click(".actions .btn.primary"); await p.waitForSelector(".drawer.on .line"); await check(p, "shop product and bag");
  await p.goto(`${W}/checkout`); await p.waitForSelector(".sum .row"); await check(p, "shop /checkout");
  await p.evaluate(() => new Promise((res) => { const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = s.onerror = () => res(null); document.head.appendChild(s); })); await check(p, "shop razorpay script"); // blocked by the network is fine; blocked by our policy is not
  await p.goto(`${W}/track`); await p.waitForTimeout(500); await check(p, "shop /track");
  const a = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); await watch(a, "admin");
  await a.goto(`${A}/login`); await a.fill("input[type=email]", email); await a.fill("input[type=password]", password); await a.click("button.btn"); await a.waitForSelector(".side");
  for (const u of ["/", "/orders", "/products", "/promotions", "/messages", "/reports", "/gst", "/store-ops"]) { await a.goto(A + u); await a.waitForTimeout(600); await check(a, `admin ${u}`); }
} finally { await b.close(); }
if (bad.length) { console.log(bad.join("\n")); console.log(`\n${bad.length} policy violation(s)`); process.exitCode = 1; } else console.log(`✓ ${pages} pages and flows, no Content-Security-Policy violations`);
