// Page-load measurements on a throttled connection (default: "slow 4G", 4x slower CPU). Needs API and storefront running.
// Run: node tests/e2e/perf.mjs [baseUrl]   (env NET=slow4g|fast4g|3g|wifi  CPU=4)
import { chromium } from "playwright";
const W = process.argv[2] ?? process.env.WEB_URL ?? "http://localhost:3000";
const PROFILES = { slow4g: { down: 1.6e6 / 8, up: 0.75e6 / 8, rtt: 150 }, fast4g: { down: 9e6 / 8, up: 4.5e6 / 8, rtt: 60 }, "3g": { down: 0.4e6 / 8, up: 0.4e6 / 8, rtt: 400 }, wifi: { down: 30e6 / 8, up: 15e6 / 8, rtt: 20 } };
const net = PROFILES[process.env.NET ?? "slow4g"]; const cpu = Number(process.env.CPU ?? 4);
const slug = (await (await fetch(`http://localhost:4000/v1/products`)).json()).data[0].slug;
const pages = [["home", "/"], ["collection", "/collections/men"], ["product", `/products/${slug}`], ["checkout", "/checkout"]];
const b = await chromium.launch(); const rows = [];
for (const [name, path] of pages) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: net.down, uploadThroughput: net.up, latency: net.rtt }); await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  let bytes = 0, reqs = 0, imgBytes = 0, jsBytes = 0, big = []; const types = new Map();
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, { type: e.type, url: e.response.url }));
  cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength; reqs++; const t = types.get(e.requestId); if (t?.type === "Image") imgBytes += e.encodedDataLength; if (t?.type === "Script") jsBytes += e.encodedDataLength; if (e.encodedDataLength > 150_000 && t) big.push(`${Math.round(e.encodedDataLength / 1024)}kB ${t.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60)}`); });
  await p.addInitScript(() => { window.__lcp = 0; window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
  const t0 = Date.now(); await p.goto(W + path, { waitUntil: "load", timeout: 120000 }); const loadMs = Date.now() - t0; await p.waitForTimeout(1500);
  const m = await p.evaluate(() => ({ fcp: (performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0, lcp: window.__lcp, cls: window.__cls, ttfb: performance.getEntriesByType("navigation")[0].responseStart }));
  rows.push({ page: name, ttfb: Math.round(m.ttfb), fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), cls: +m.cls.toFixed(3), load: loadMs, kb: Math.round(bytes / 1024), imgKb: Math.round(imgBytes / 1024), jsKb: Math.round(jsBytes / 1024), reqs, big });
  await ctx.close();
}
await b.close();
console.log(`${W}  network=${process.env.NET ?? "slow4g"}  cpu=${cpu}x slower  (phone 390px)\n`);
console.log("page        TTFB    FCP    LCP    CLS   load   total   images    JS   requests");
for (const r of rows) console.log(`${r.page.padEnd(11)}${String(r.ttfb).padStart(5)}ms${String(r.fcp).padStart(6)}ms${String(r.lcp).padStart(6)}ms${String(r.cls).padStart(7)}${String(r.load).padStart(6)}ms${String(r.kb).padStart(6)}kB${String(r.imgKb).padStart(7)}kB${String(r.jsKb).padStart(5)}kB${String(r.reqs).padStart(6)}`);
console.log("\nlargest transfers:"); for (const r of rows) for (const x of r.big.slice(0, 4)) console.log(`  ${r.page}: ${x}`);
