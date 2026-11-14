const API = process.env.API_ORIGIN ?? "http://localhost:4000";
const prod = process.env.NODE_ENV === "production";

/**
 * Browser security headers. The policy allows only this site, Razorpay's checkout (script, frame, calls) and product photos over https.
 * 'unsafe-inline' for scripts and styles is required by Next.js's own inline bootstrap code; everything else is closed.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${prod ? "" : "'unsafe-eval' "}https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\")" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Browser calls /api/v1/... on the same origin; Next proxies to the NestJS API (no CORS, no hard-coded host in the client).
  async rewrites() { return [{ source: "/api/:path*", destination: `${API}/:path*` }]; },
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; },
};
export default nextConfig;
