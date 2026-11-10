import { Logger } from "@nestjs/common";
import { cfg } from "./config";

/** Baseline response headers for an API that serves JSON only. */
export function securityHeaders(_req: any, res: any, next: () => void) {
  res.removeHeader("X-Powered-By");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (cfg().isProd) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

type Bucket = { name: string; limit: number };
const bucketFor = (method: string, path: string): Bucket | null => {
  const c = cfg();
  if (path.startsWith("/v1/webhooks/") || path.startsWith("/v1/integrations/") || path === "/v1/health") return null; // signed or credentialed machine traffic
  if (path.startsWith("/v1/auth/otp") || path.startsWith("/v1/admin/auth")) return { name: "auth", limit: c.rateLimitAuth };
  if (method === "POST" && (path.startsWith("/v1/checkout/orders") || path.startsWith("/v1/payments") || path.startsWith("/v1/returns"))) return { name: "orders", limit: c.rateLimitOrders };
  return { name: "default", limit: c.rateLimitDefault };
};

/** Fixed-window counter per client IP and bucket. Per-process; swap for Redis when running more than one API instance. */
export function rateLimiter() {
  const hits = new Map<string, { n: number; reset: number }>();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 60_000).unref();
  return (req: any, res: any, next: () => void) => {
    if (!cfg().rateLimit) return next();
    const path = String(req.originalUrl ?? req.url).split("?")[0]; const b = bucketFor(req.method, path);
    if (!b) return next();
    const key = `${req.ip}|${b.name}`, now = Date.now(); let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + 60_000 }; hits.set(key, h); }
    h.n++;
    res.setHeader("RateLimit-Limit", String(b.limit)); res.setHeader("RateLimit-Remaining", String(Math.max(0, b.limit - h.n)));
    if (h.n > b.limit) {
      const wait = Math.max(1, Math.ceil((h.reset - now) / 1000)); res.setHeader("Retry-After", String(wait));
      return res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: `Too many requests. Try again in ${wait} seconds.`, details: {} }, meta: { requestId: req.requestId } });
    }
    next();
  };
}

const log = new Logger("HTTP");
export function accessLog(req: any, res: any, next: () => void) {
  if (process.env.NODE_ENV === "test") return next();
  const t = Date.now();
  res.on("finish", () => { const p = String(req.originalUrl).split("?")[0]; if (p !== "/v1/health") log.log(`${req.method} ${p} ${res.statusCode} ${Date.now() - t}ms [${req.requestId}]`); });
  next();
}
