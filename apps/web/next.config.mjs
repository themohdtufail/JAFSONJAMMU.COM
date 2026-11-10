const API = process.env.API_ORIGIN ?? "http://localhost:4000";
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Browser calls /api/v1/... on the same origin; Next proxies to the NestJS API (no CORS, no hard-coded host in the client).
  async rewrites() { return [{ source: "/api/:path*", destination: `${API}/:path*` }]; },
};
export default nextConfig;
