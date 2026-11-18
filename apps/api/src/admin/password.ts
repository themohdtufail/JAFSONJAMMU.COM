import { hash, verify } from "@node-rs/argon2";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
// Argon2id, OWASP-recommended minimum (19 MiB, 2 passes, 1 lane). Algorithm 2 = Argon2id.
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTS);
const isArgon = (s: string) => s.startsWith("$argon2id$");

/** Accepts current Argon2id hashes and the earlier scrypt format (`salt:hash`), which `needsRehash` flags for upgrade at the next login. */
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  if (isArgon(stored)) { try { return await verify(stored, pw); } catch { return false; } }
  const [s, h] = stored.split(":"); if (!s || !h) return false;
  const a = Buffer.from(h, "hex"), b = await scrypt(pw, Buffer.from(s, "hex"), 64); return a.length === b.length && timingSafeEqual(a, b);
}
export const needsRehash = (stored: string) => !isArgon(stored);

/** Burns the same time as a real check, so an unknown email takes as long to refuse as a wrong password. */
let dummy: Promise<string> | null = null;
export async function spendVerifyTime(pw: string) { dummy ??= hashPassword(randomBytes(8).toString("hex")); await verifyPassword(pw, await dummy); }

const COMMON = ["password", "passw0rd", "123456789012", "qwertyuiopas", "letmein12345", "welcome12345", "administrator", "jafsonjammu", "chameron1234"];
/** The rules for any password a person chooses. Returns a plain-language problem, or null when it is acceptable. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 200) return "That password is too long (200 characters at most).";
  if (new Set(pw).size < 5) return "That password is too repetitive. Mix more different characters.";
  const low = pw.toLowerCase(); const local = (email ?? "").split("@")[0]!.toLowerCase();
  if (local.length >= 4 && low.includes(local)) return "The password shouldn't contain your email name.";
  if (COMMON.some((c) => low.includes(c))) return "That password is too easy to guess.";
  return null;
}
