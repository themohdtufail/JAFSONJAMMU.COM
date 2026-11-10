import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hotp, newSecret, verifyTotp } from "./totp";

describe("TOTP", () => {
  const rfc = Buffer.from("12345678901234567890"); // RFC 6238 appendix B test secret
  it("matches the RFC 6238 SHA-1 test vectors", () => {
    expect(hotp(rfc, Math.floor(59 / 30), 8)).toBe("94287082"); expect(hotp(rfc, Math.floor(1111111109 / 30), 8)).toBe("07081804"); expect(hotp(rfc, Math.floor(2000000000 / 30), 8)).toBe("69279037");
  });
  it("round-trips base32", () => { const s = newSecret(); expect(base32Encode(base32Decode(s))).toBe(s); expect(base32Encode(rfc)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"); });
  it("accepts the current and adjacent steps only, and rejects wrong codes", () => {
    const s = base32Encode(rfc), t = 1_700_000_000_000, st = Math.floor(t / 30_000);
    expect(verifyTotp(s, hotp(rfc, st), t)).toBe(st); expect(verifyTotp(s, hotp(rfc, st - 1), t)).toBe(st - 1); expect(verifyTotp(s, hotp(rfc, st + 1), t)).toBe(st + 1);
    expect(verifyTotp(s, hotp(rfc, st - 2), t)).toBeNull(); expect(verifyTotp(s, "000000", t)).toBeNull(); expect(verifyTotp(s, "12345", t)).toBeNull(); expect(verifyTotp(s, "abcdef", t)).toBeNull();
  });
  it("encrypts secrets at rest and detects tampering", () => {
    const s = newSecret(), e = encryptSecret(s); expect(e).not.toContain(s); expect(decryptSecret(e)).toBe(s);
    const bad = Buffer.from(e, "base64"); bad[bad.length - 1] ^= 1; expect(() => decryptSecret(bad.toString("base64"))).toThrow();
  });
});
