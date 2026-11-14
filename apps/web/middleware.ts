import { NextResponse, type NextRequest } from "next/server";

/**
 * API calls go through this site's /api path, so the API only sees this server's address. Pass the real visitor IP along, signed with a shared secret
 * (INTERNAL_PROXY_SECRET) so the API trusts it and nobody else can fake it. Any copy of these headers sent by the browser is dropped first.
 * Behind Cloudflare set TRUST_CF_HEADER=1 to use CF-Connecting-IP; otherwise the last X-Forwarded-For entry (added by the nearest proxy) is used.
 */
export function middleware(req: NextRequest) {
  const h = new Headers(req.headers);
  h.delete("x-real-client-ip"); h.delete("x-internal-auth");
  const secret = process.env.INTERNAL_PROXY_SECRET;
  if (secret) {
    const cf = process.env.TRUST_CF_HEADER === "1" ? req.headers.get("cf-connecting-ip") : null;
    const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const ip = cf || xff[xff.length - 1] || "";
    if (ip) { h.set("x-real-client-ip", ip); h.set("x-internal-auth", secret); }
  }
  return NextResponse.next({ request: { headers: h } });
}
export const config = { matcher: "/api/:path*" };
