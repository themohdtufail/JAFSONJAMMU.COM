import { randomUUID } from "node:crypto";
import { cfg } from "./config";

/**
 * Sends unexpected (5xx) errors to Sentry over its public envelope API when SENTRY_DSN is set; otherwise does nothing.
 * Only the error, its stack, the route pattern and the request id are sent: no bodies, headers, query strings, phone numbers or tokens.
 * At most 30 reports a minute leave the process, so an outage cannot flood the account.
 */
let windowStart = 0, sent = 0;
const scrub = (s: string) => s.replace(/\b[6-9]\d{9}\b/g, "[phone]").replace(/Bearer\s+[\w.-]+/gi, "Bearer [token]").replace(/postgres(ql)?:\/\/[^\s'"]+/gi, "postgres://[redacted]");

export function parseDsn(dsn: string) { try { const u = new URL(dsn); const project = u.pathname.replace(/^\//, ""); return u.username && project ? { key: u.username, host: u.host, protocol: u.protocol, project } : null; } catch { return null; } }

export async function reportError(err: unknown, ctx: { requestId?: string; method?: string; route?: string } = {}) {
  const d = parseDsn(cfg().sentryDsn); if (!d) return false;
  const now = Date.now(); if (now - windowStart > 60_000) { windowStart = now; sent = 0; } if (++sent > 30) return false;
  const e = err instanceof Error ? err : new Error(String(err)); const id = randomUUID().replace(/-/g, "");
  const event = { event_id: id, timestamp: now / 1000, platform: "node", level: "error", environment: cfg().isProd ? "production" : "development", server_name: undefined,
    exception: { values: [{ type: e.name, value: scrub(e.message).slice(0, 500), stacktrace: { frames: (e.stack ?? "").split("\n").slice(1, 30).reverse().map((l) => ({ filename: scrub(l.trim()).replace(/^at\s+/, "") })) } }] },
    tags: { route: ctx.route ?? "unknown", method: ctx.method ?? "", request_id: ctx.requestId ?? "" } };
  const body = [JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
  const url = `${process.env.SENTRY_ENVELOPE_BASE ?? `${d.protocol}//${d.host}`}/api/${d.project}/envelope/`;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${d.key}, sentry_client=jafson-api/1.0` }, body, signal: ctl.signal }); clearTimeout(t);
    return r.ok;
  } catch { return false; } // reporting must never break the request that failed
}
