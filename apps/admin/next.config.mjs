const API = process.env.API_ORIGIN ?? "http://localhost:4000";
/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  async rewrites() { return [{ source: "/api/:path*", destination: `${API}/:path*` }]; },
  async headers() { return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "X-Frame-Options", value: "DENY" }, { key: "Referrer-Policy", value: "same-origin" }] }]; },
};
