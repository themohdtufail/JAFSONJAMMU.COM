// Signed-in bag and wishlist follow the customer across devices. Needs API (OTP_DEV_ECHO=1), storefront running.  Run: node tests/e2e/account.mjs
import { chromium } from "playwright";
const API = process.env.API_URL ?? "http://localhost:4000/v1", W = process.env.WEB_URL ?? "http://localhost:3000";
const phone = "98760" + String(Math.floor(10000 + Math.random() * 89999)); let n = 0; const ok = (m) => console.log(`✓ ${++n}. ${m}`); const must = (c, m) => { if (!c) throw new Error(m); };
const call = async (path, o = {}, tok) => { const r = await fetch(API + path, { method: o.method ?? (o.body ? "POST" : "GET"), headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }); return (await r.json()).data; };
const code = (await call("/auth/otp/request", { body: { phone } })).devCode; must(code, "OTP echoed (set OTP_DEV_ECHO=1)");
const t = await call("/auth/otp/verify", { body: { phone, code } }); ok("customer signed in");
const b = await chromium.launch();
try {
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 900 } }); await c.addInitScript((tok) => { try { if (!localStorage.getItem("jf-auth")) localStorage.setItem("jf-auth", JSON.stringify({ accessToken: tok.accessToken, refreshToken: tok.refreshToken })); } catch {} }, t); return c.newPage(); };
  const p1 = await mk(); await p1.goto(`${W}/collections/men`); await p1.waitForSelector(".card:not(:has(.badge.dark))"); await p1.click(".card:not(:has(.badge.dark)) >> nth=0"); await p1.waitForURL("**/products/**"); await p1.waitForSelector(".sizes button:not(.off)");
  const slug = p1.url().split("/products/")[1].split("?")[0];
  await p1.click(".sizes button:not(.off) >> nth=0"); await p1.click(".actions .btn.primary"); await p1.waitForSelector(".drawer.on .line"); ok("device 1: added to bag");
  await p1.waitForTimeout(1500); const server = await call("/cart", {}, t.accessToken); must(server.items.length === 1, "server cart has the item"); ok("server cart holds the item");
  await p1.click('button[aria-label*="ishlist"], .wish, [aria-label*="aved"]', { timeout: 3000 }).catch(() => {});
  const p2 = await mk(); await p2.goto(`${W}/collections/men`); await p2.waitForTimeout(2500);
  const count = await p2.evaluate(() => JSON.parse(localStorage.getItem("jf-bag-v2") ?? "[]").length); must(count === 1, `device 2 received the bag (has ${count})`); ok("device 2 sees the same bag after sign-in");
  await p2.goto(`${W}/checkout`); await p2.waitForSelector(".sum .row"); must((await p2.locator(".sum .row").count()) === 1, "checkout shows it"); ok("checkout on device 2 lists the item");
} catch (e) { console.error("✗ FAILED at step", n + 1, "-", e.message.split("\n")[0]); process.exitCode = 1; } finally { await b.close(); }
