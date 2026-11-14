import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "./security";

const req = (headers: Record<string, string>, ip = "10.0.0.9") => ({ headers, ip });
afterEach(() => { delete process.env.INTERNAL_PROXY_SECRET; });

describe("clientIp", () => {
  it("uses the connection address when no proxy secret is configured, ignoring a spoofed header", () => {
    expect(clientIp(req({ "x-real-client-ip": "1.2.3.4", "x-internal-auth": "anything" }))).toBe("10.0.0.9");
  });
  it("trusts the forwarded address only when the shared secret matches", () => {
    process.env.INTERNAL_PROXY_SECRET = "s3cret-s3cret";
    expect(clientIp(req({ "x-real-client-ip": "1.2.3.4", "x-internal-auth": "s3cret-s3cret" }))).toBe("1.2.3.4");
    expect(clientIp(req({ "x-real-client-ip": "1.2.3.4", "x-internal-auth": "wrong-wrong-w" }))).toBe("10.0.0.9");
    expect(clientIp(req({ "x-real-client-ip": "1.2.3.4" }))).toBe("10.0.0.9");
    expect(clientIp(req({ "x-internal-auth": "s3cret-s3cret" }))).toBe("10.0.0.9");
  });
});
