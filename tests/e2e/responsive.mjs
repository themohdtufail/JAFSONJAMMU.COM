// Measures how the shop and back-office fit every common screen: sideways overflow, content cut off at the edge, tiny tap targets, unreadable text.
// Needs API, storefront (3000) and back-office (3001) running. Run: node tests/e2e/responsive.mjs [screenshot-dir]
import { chromium } from "playwright";
const W = process.env.WEB_URL ?? "http://localhost:3000", A = process.env.ADMIN_URL ?? "http://localhost:3001"; const shots = process.argv[2];
const email = process.env.ADMIN_EMAIL ?? "owner@jafson.local", password = process.env.ADMIN_PASSWORD ?? "dev-owner-password-123";
const SCREENS = [["phone-small", 320, 568], ["phone", 375, 667], ["phone-large", 414, 896], ["phone-landscape", 667, 375], ["tablet", 768, 1024], ["tablet-landscape", 1024, 768], ["laptop", 1366, 768], ["desktop", 1920, 1080], ["wide", 2560, 1440]];
const shopPages = ["/", "/collections/men", "/collections/kids", "/products/__FIRST__", "/checkout", "/track", "/wishlist", "/account", "/returns", "/size-guide", "/pages/about", "/pages/faq", "/pages/shipping", "/pages/contact", "/pages/privacy", "/pages/terms"];
const adminPages = ["/", "/orders", "/orders/__ORDER__", "/inventory", "/products", "/returns", "/customers", "/promotions", "/messages", "/reports", "/gst", "/store-ops", "/audit", "/security", "/staff"];
const slug = (await (await fetch("http://localhost:4000/v1/products")).json()).data[0].slug;
const login = await (await fetch("http://localhost:4000/v1/admin/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
const order = (await (await fetch("http://localhost:4000/v1/admin/orders?limit=1", { headers: { authorization: `Bearer ${login.data.token}` } })).json()).data;
const orderNo = (order.items ?? order)[0]?.number ?? "JF100001";

const probe = () => {
  const vw = window.innerWidth, out = { overflowX: document.documentElement.scrollWidth - vw, cut: [], tiny: [], small: [] };
  const parked = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const st = getComputedStyle(p); if (st.position === "fixed" && p.getBoundingClientRect().left >= vw - 1) return true; } return false; }; // panels waiting off-screen on purpose (closed bag drawer)
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const insideScroller = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth) return true; if (o === "hidden" && p.getBoundingClientRect().right <= vw + 1) return true; } return false; };
  for (const e of document.querySelectorAll("body *")) {
    if (!vis(e) || parked(e)) continue; const r = e.getBoundingClientRect();
    if (r.right > vw + 2 && !insideScroller(e) && out.cut.length < 6) out.cut.push(`${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : ""} +${Math.round(r.right - vw)}px`);
    if (vw <= 1024 && (e.matches("a[href],button,select,input:not([type=hidden]),summary,[role=button]")) && !insideScroller(e) && (r.height < 32 || r.width < 32) && !e.closest(".sr, [aria-hidden=true]") && out.tiny.length < 6) { const t = (e.getAttribute("aria-label") || e.textContent || e.name || "").trim().slice(0, 24); if (!(e.tagName === "A" && e.closest("p, li, small, td, dd, footer span") && r.height >= 20 && e.textContent.trim().length > 12)) out.tiny.push(`${e.tagName.toLowerCase()} "${t}" ${Math.round(r.width)}x${Math.round(r.height)}`); }
    if (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2) && parseFloat(getComputedStyle(e).fontSize) < 12 && out.small.length < 4) out.small.push(`${e.tagName.toLowerCase()} ${getComputedStyle(e).fontSize} "${e.textContent.trim().slice(0, 20)}"`);
  }
  return out;
};
const b = await chromium.launch(); const problems = []; let checks = 0;
const run = async (page, base, paths, tag, sz) => {
  for (const p0 of paths) {
    const p = p0.replace("__FIRST__", slug).replace("__ORDER__", orderNo); await page.goto(base + p, { waitUntil: "domcontentloaded" }); await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(350);
    const r = await page.evaluate(probe); checks++; const bad = [];
    if (r.overflowX > 1) bad.push(`page scrolls sideways by ${r.overflowX}px`); if (r.cut.length) bad.push(`cut off: ${r.cut.join(", ")}`); if (r.tiny.length) bad.push(`small tap targets: ${r.tiny.join("; ")}`); if (r.small.length) bad.push(`tiny text: ${r.small.join("; ")}`);
    if (bad.length) problems.push(`${tag} ${sz[0]} (${sz[1]}px) ${p}\n      ${bad.join("\n      ")}`);
  }
};
try {
  for (const sz of SCREENS) {
    const [, w, h] = sz; const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 1024, isMobile: w <= 1024 }); const p = await ctx.newPage();
    await run(p, W, shopPages, "shop", sz); await ctx.close();
    const a = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 1024 }); const ap = await a.newPage();
    await ap.goto(`${A}/login`); await ap.fill("input[type=email]", email); await ap.fill("input[type=password]", password); await ap.click("button.btn"); await ap.waitForURL((u) => !u.pathname.startsWith("/login")); await ap.waitForTimeout(500);
    await run(ap, A, adminPages, "admin", sz); if (shots && (w === 320 || w === 768 || w === 2560)) { await ap.goto(A + "/orders"); await ap.waitForTimeout(600); await ap.screenshot({ path: `${shots}/admin-orders-${w}.png` }); } await a.close();
  }
} finally { await b.close(); }
console.log(problems.length ? problems.join("\n") : "no problems"); console.log(`\n${checks} page-and-screen checks, ${problems.length} with problems`); process.exitCode = problems.length ? 1 : 0;
