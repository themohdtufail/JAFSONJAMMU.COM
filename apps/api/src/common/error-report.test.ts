import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseDsn, reportError } from "./error-report";

afterEach(() => { delete process.env.SENTRY_DSN; delete process.env.SENTRY_ENVELOPE_BASE; });
describe("error reporting", () => {
  it("parses a DSN and rejects junk", () => { expect(parseDsn("https://abc123@o1.ingest.sentry.io/4507")).toMatchObject({ key: "abc123", host: "o1.ingest.sentry.io", project: "4507" }); expect(parseDsn("nope")).toBeNull(); expect(parseDsn("https://host/4507")).toBeNull(); });
  it("does nothing without a DSN", async () => { expect(await reportError(new Error("x"))).toBe(false); });
  it("sends a scrubbed envelope with the key, and survives an unreachable server", async () => {
    let got: { url: string; auth: string; body: string } | null = null;
    const srv = createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { got = { url: req.url!, auth: String(req.headers["x-sentry-auth"]), body: b }; res.writeHead(200); res.end("{}"); }); });
    await new Promise<void>((r) => srv.listen(0, r)); process.env.SENTRY_DSN = "https://pubkey1@sentry.example/99"; process.env.SENTRY_ENVELOPE_BASE = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    expect(await reportError(new Error("failed for 9876543210 using Bearer abc.def.ghi at postgresql://u:pw@db:5432/x"), { requestId: "req-1", method: "POST", route: "/v1/orders/:number" })).toBe(true);
    srv.close(); expect(got!.url).toBe("/api/99/envelope/"); expect(got!.auth).toContain("sentry_key=pubkey1"); expect(got!.body).toContain("req-1"); expect(got!.body).toContain("/v1/orders/:number");
    for (const secret of ["9876543210", "abc.def.ghi", "u:pw"]) expect(got!.body).not.toContain(secret);
    process.env.SENTRY_ENVELOPE_BASE = "http://127.0.0.1:1"; expect(await reportError(new Error("again"))).toBe(false);
  });
});
