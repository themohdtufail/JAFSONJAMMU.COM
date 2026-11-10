import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cfg } from "../common/config";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer) { let bits = 0, v = 0, out = ""; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(v << (5 - bits)) & 31]; return out; }
export function base32Decode(s: string) { let bits = 0, v = 0; const out: number[] = []; for (const c of s.replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(c); if (i < 0) throw new Error("bad base32"); v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }

/** RFC 4226 HOTP / RFC 6238 TOTP (SHA-1, 30-second steps). */
export function hotp(secret: Buffer, counter: number, digits = 6) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(b).digest(); const o = h[19]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 10 ** digits).padStart(digits, "0");
}
export const timeStep = (ms = Date.now()) => Math.floor(ms / 30_000);
/** Returns the matching time step (accepting one step either side for clock drift) or null. */
export function verifyTotp(secretB32: string, code: string, ms = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  for (const w of [0, -1, 1]) { const st = timeStep(ms) + w; const a = Buffer.from(hotp(secret, st)), b = Buffer.from(code); if (a.length === b.length && timingSafeEqual(a, b)) return st; }
  return null;
}
export const newSecret = () => base32Encode(randomBytes(20));
export const otpauthUrl = (email: string, secret: string) => `otpauth://totp/${encodeURIComponent(`Jafson Back-office:${email}`)}?secret=${secret}&issuer=${encodeURIComponent("Jafson Back-office")}&algorithm=SHA1&digits=6&period=30`;

// The shared secret is stored encrypted (AES-256-GCM) so a database leak alone doesn't hand out second factors.
const key = () => createHash("sha256").update(cfg().mfaKey || `${cfg().jwtSecret}:mfa`).digest();
export function encryptSecret(plain: string) { const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key(), iv); const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64"); }
export function decryptSecret(enc: string) { const b = Buffer.from(enc, "base64"); const d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"); }
