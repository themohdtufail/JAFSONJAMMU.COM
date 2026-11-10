// Browser smoke test for the real journey: shop -> bag -> checkout (cash on delivery) -> track -> back-office sees and ships it.
// Needs the API (4000), storefront (3000) and back-office (3001) running with a seeded database and a staff account:
//   ADMIN_EMAIL / ADMIN_PASSWORD (defaults match the local dev seed). Run: node tests/e2e/smoke.mjs
import { chromium } from "playwright";
const W = process.env.WEB_URL ?? "http://localhost:3000", A = process.env.ADMIN_URL ?? "http://localhost:3001";
const email = process.env.ADMIN_EMAIL ?? "owner@jafson.local", password = process.env.ADMIN_PASSWORD ?? "dev-owner-password-123";
const phone = "98765" + String(Math.floor(10000 + Math.random() * 89999));
let step = 0; const ok = (m) => console.log(`✓ ${++step}. ${m}`);
const must = (c, m) => { if (!c) throw new Error(m); };

const b = await chromium.launch(); const errors = [];
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(W); must(await p.locator("h1").first().isVisible(), "home renders"); ok("home page loads");
  await p.goto(`${W}/collections/men`); await p.waitForSelector(".card"); must((await p.locator(".card").count()) > 3, "men collection lists products"); ok("collection lists products");
  await p.click(".card:not(:has(.badge.dark)) >> nth=0"); await p.waitForURL("**/products/**"); await p.waitForSelector(".sizes button:not(.off)");
  await p.click(".actions .btn.primary", { force: true }); must(await p.locator(".field-err").isVisible(), "size is required"); ok("adding without a size is blocked with a message");
  await p.click(".sizes button:not(.off) >> nth=0"); await p.click(".actions .btn.primary"); await p.waitForSelector(".drawer.on .line"); ok("added to bag");
  await p.click(".d-foot .btn"); await p.waitForURL("**/checkout");
  await p.fill("input[autocomplete=name]", "Smoke Test"); await p.fill("input[autocomplete=tel-national]", phone); await p.fill("input[autocomplete=address-line1]", "1 Test Road"); await p.fill("input[autocomplete=postal-code]", "110001"); await p.waitForTimeout(800);
  await p.click(".radios label:has-text('Cash on delivery')"); await p.click(".co .btn.big"); await p.waitForURL("**/order/**"); await p.waitForSelector(".steps");
  const number = p.url().match(/order\/(JF\d+)/)[1]; ok(`COD order ${number} placed`);
  await p.goto(`${W}/track`); await p.fill("input[placeholder=JF100001]", number); await p.fill("input[inputmode=tel]", phone); await p.click(".btn.big"); await p.waitForURL("**/order/**"); ok("order can be tracked with order number and phone");
  await p.goto(`${W}/track`); await p.fill("input[placeholder=JF100001]", number); await p.fill("input[inputmode=tel]", "9000000000"); await p.click(".btn.big"); await p.waitForSelector(".err-box"); ok("wrong phone number does not reveal the order");

  const a = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); a.on("pageerror", (e) => errors.push(e.message));
  await a.goto(`${A}/orders`); await a.waitForURL("**/login"); ok("back-office redirects to sign in when signed out");
  await a.fill("input[type=email]", email); await a.fill("input[type=password]", password); await a.click("button.btn");
  await a.waitForURL((u) => !u.pathname.startsWith("/login")); await a.waitForSelector(".side");
  if (a.url().includes("/security")) { console.log("  (account needs two-step login setup; stopping the admin part of the smoke test)"); }
  else {
    await a.goto(`${A}/orders`); await a.fill('input[aria-label="Search orders"]', number); await a.waitForSelector("tbody tr.click"); await a.click("tbody tr.click >> nth=0"); await a.waitForSelector(".detail"); ok("back-office finds the order");
    for (const t of ["Start picking", "Mark packed", "Dispatch"]) { await a.click(`.actions .btn >> text=${t}`); await a.waitForTimeout(700); }
    must((await a.locator(".phead .pill").first().innerText()).toUpperCase() === "DISPATCHED", "order dispatched"); ok("back-office moves the order to dispatched");
    await p.goto(`${W}/order/${number}?phone=${phone}`); await p.waitForSelector(".steps"); must((await p.locator(".steps li.done").count()) >= 4, "customer sees progress"); ok("customer sees the new status");
  }
  must(errors.length === 0, `JavaScript errors: ${errors.join(" | ")}`); ok("no JavaScript errors");
} catch (e) { console.error("✗ FAILED at step", step + 1, "-", e.message.split("\n")[0]); process.exitCode = 1; } finally { await b.close(); }
