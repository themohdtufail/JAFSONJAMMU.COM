// Back-office password change in a real browser, on a throwaway staff account. Needs API and back-office running and the dev owner account.
// Run: node tests/e2e/password.mjs
import { chromium } from "playwright";
const API = process.env.API_URL ?? "http://localhost:4000/v1", A = process.env.ADMIN_URL ?? "http://localhost:3001";
const owner = { email: process.env.ADMIN_EMAIL ?? "owner@jafson.local", password: process.env.ADMIN_PASSWORD ?? "dev-owner-password-123" };
const email = `pw-${Date.now()}@example.test`, first = "first-secret-phrase-1", second = "river-lantern-copper-field-9";
let n = 0; const ok = (m) => console.log(`✓ ${++n}. ${m}`); const must = (c, m) => { if (!c) throw new Error(m); };
const call = async (p, body, tok) => { const r = await fetch(API + p, { method: "POST", headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
const tok = (await call("/admin/auth/login", owner)).json.data.token;
must((await call("/admin/staff", { email, name: "Password Test", password: first, role: "STAFF" }, tok)).status < 300, "throwaway account created"); ok("throwaway staff account created");
const b = await chromium.launch();
try {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${A}/login`); await p.fill("input[type=email]", email); await p.fill("input[type=password]", first); await p.click("button.btn"); await p.waitForSelector(".top, .side", { state: "attached" }); ok("signed in (phone-sized screen)");
  await p.goto(`${A}/security`); await p.waitForSelector("text=Password"); const card = p.locator(".card", { has: p.locator("h2:text-is('Password')") });
  const [cur, nw, again] = await card.locator("input[type=password]").all(); await cur.fill(first); await nw.fill(second); await again.fill(second.slice(0, -1) + "8");
  must(await card.locator("text=They don't match").isVisible(), "mismatch is explained"); must(await card.locator("button:has-text('Change password')").isDisabled(), "button disabled while they differ"); ok("a mismatch is explained with lengths, and the button stays off");
  await again.fill(second + " "); must(await card.locator("text=space at the start or end").isVisible(), "trailing space is called out"); ok("a stray space is called out");
  await again.fill(second); must(await card.locator("text=The two match.").isVisible(), "match confirmed"); must(await card.locator("button:has-text('Change password')").isEnabled(), "button enabled"); ok("a match is confirmed and the button turns on");
  await card.locator("text=Show what I type").click(); must((await card.locator("input[type=text]").count()) === 3, "fields show text"); await card.locator("text=Show what I type").click(); ok("show/hide works");
  await card.locator("button:has-text('Change password')").click(); await p.waitForSelector("text=Password changed"); ok("password changed from the screen");
  must((await call("/admin/auth/login", { email, password: first })).status === 401, "old password rejected"); must((await call("/admin/auth/login", { email, password: second })).status === 200, "new password accepted"); ok("old password rejected, new password accepted");
  must(errors.length === 0, errors.join(" | ")); ok("no JavaScript errors");
} catch (e) { console.error("✗ FAILED at step", n + 1, "-", e.message.split("\n")[0]); process.exitCode = 1; } finally { await b.close(); }
