import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { PrismaService } from "../common/prisma.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";
import { mfaRequiredFor } from "../common/guards";
import { decryptSecret, encryptSecret, newSecret, otpauthUrl, timeStep, verifyTotp } from "./totp";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export async function hashPassword(pw: string) { const salt = randomBytes(16); return `${salt.toString("hex")}:${(await scrypt(pw, salt, 64)).toString("hex")}`; }
async function verifyPassword(pw: string, stored: string) {
  const [s, h] = stored.split(":"); if (!s || !h) return false;
  const a = Buffer.from(h, "hex"), b = await scrypt(pw, Buffer.from(s, "hex"), 64); return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class StaffService {
  private jwt = new JwtService({ secret: cfg().jwtSecret });
  private fails = new Map<string, { n: number; until: number }>(); // per-instance throttle; move to Redis when scaled out
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  private throttled(key: string) { const f = this.fails.get(key); if (f && f.n >= 5 && f.until > Date.now()) throw new AppError("LOGIN_THROTTLED", "Too many attempts. Try again in a few minutes.", 429); }
  private fail(key: string) { const f = this.fails.get(key); this.fails.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60_000 }); }
  private token(u: { id: string; role: string }, mfa: boolean) { return this.jwt.sign({ sub: u.id, role: u.role, aud: "admin", mfa }, { expiresIn: "8h" }); }

  async login(email: string, password: string) {
    const key = email.toLowerCase(); this.throttled(key);
    const u = await this.prisma.staffUser.findUnique({ where: { email: key } });
    const ok = u && u.isActive && (await verifyPassword(password, u.passwordHash));
    if (!ok) { this.fail(key); throw new AppError("INVALID_CREDENTIALS", "Incorrect email or password", 401); }
    this.fails.delete(key);
    await this.prisma.staffUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    if (u.mfaEnabledAt) return { mfaRequired: true as const, challenge: this.jwt.sign({ sub: u.id, aud: "admin-mfa" }, { expiresIn: "5m" }) };
    const needsSetup = mfaRequiredFor(u.role);
    return { token: this.token(u, !needsSetup), user: this.pub(u), mfaSetupRequired: needsSetup };
  }

  /** Second step of login: the password was already checked; this proves possession of the authenticator. Each code works once. */
  async verifyMfa(challenge: string, code: string) {
    let sub: string;
    try { const t = this.jwt.verify<{ sub: string; aud: string }>(challenge); if (t.aud !== "admin-mfa") throw new Error(); sub = t.sub; } catch { throw new AppError("INVALID_CHALLENGE", "Your sign-in expired. Start again.", 401); }
    const key = `mfa:${sub}`; this.throttled(key);
    const u = await this.prisma.staffUser.findUnique({ where: { id: sub } });
    if (!u || !u.isActive || !u.mfaEnabledAt || !u.mfaSecretEnc) throw new AppError("INVALID_CHALLENGE", "Your sign-in expired. Start again.", 401);
    const step = verifyTotp(decryptSecret(u.mfaSecretEnc), code);
    const fresh = step !== null && (await this.prisma.staffUser.updateMany({ where: { id: u.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaLastStep: step } })).count === 1;
    if (!fresh) { this.fail(key); throw new AppError("INVALID_CODE", "That code is incorrect or was already used. Wait for the next one.", 401); }
    this.fails.delete(key);
    return { token: this.token(u, true), user: this.pub(u) };
  }

  async setupMfa(id: string) {
    const u = await this.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    if (u.mfaEnabledAt) throw new AppError("MFA_ALREADY_ENABLED", "Two-step login is already on for this account.", 409);
    const secret = newSecret();
    await this.prisma.staffUser.update({ where: { id }, data: { mfaSecretEnc: encryptSecret(secret) } });
    return { secret, otpauthUrl: otpauthUrl(u.email, secret) };
  }

  async enableMfa(id: string, code: string) {
    const u = await this.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    if (u.mfaEnabledAt) throw new AppError("MFA_ALREADY_ENABLED", "Two-step login is already on for this account.", 409);
    if (!u.mfaSecretEnc) throw new AppError("MFA_NOT_STARTED", "Start setup first.", 409);
    const key = `mfa:${id}`; this.throttled(key);
    const step = verifyTotp(decryptSecret(u.mfaSecretEnc), code);
    if (step === null) { this.fail(key); throw new AppError("INVALID_CODE", "That code is incorrect. Check the time on your phone and try again.", 400); }
    await this.prisma.$transaction([
      this.prisma.staffUser.update({ where: { id }, data: { mfaEnabledAt: new Date(), mfaLastStep: step } }),
      this.prisma.auditLog.create({ data: { actor: u.name, action: "MFA_ENABLED", entity: "STAFF", entityId: id } }),
    ]);
    return { token: this.token(u, true), user: this.pub(u) };
  }

  async resetMfa(id: string, actor: string) {
    const u = await this.prisma.staffUser.update({ where: { id }, data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null } }).catch(() => null);
    if (!u) throw new AppError("NOT_FOUND", "Staff member not found", 404);
    await this.prisma.auditLog.create({ data: { actor, action: "MFA_RESET", entity: "STAFF", entityId: id } });
    return this.pub(u);
  }

  async profile(id: string) { const u = await this.prisma.staffUser.findUniqueOrThrow({ where: { id } }); return { ...this.pub(u), mfaEnabled: !!u.mfaEnabledAt, mfaRequired: mfaRequiredFor(u.role) }; }

  pub(u: { id: string; email: string; name: string; role: string; isActive: boolean; lastLoginAt?: Date | null; mfaEnabledAt?: Date | null }) { return { id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, lastLoginAt: u.lastLoginAt ?? null, mfaEnabled: !!u.mfaEnabledAt }; }
  async list() { return (await this.prisma.staffUser.findMany({ orderBy: { createdAt: "asc" } })).map((u) => this.pub(u)); }
  async create(d: { email: string; name: string; password: string; role: string }, actor: string) {
    const email = d.email.toLowerCase();
    if (await this.prisma.staffUser.findUnique({ where: { email } })) throw new AppError("EMAIL_TAKEN", "A staff account with that email exists", 409);
    const u = await this.prisma.staffUser.create({ data: { email, name: d.name, role: d.role, passwordHash: await hashPassword(d.password) } });
    await this.prisma.auditLog.create({ data: { actor, action: "STAFF_CREATE", entity: "STAFF", entityId: u.id, data: { email, role: d.role } } });
    return this.pub(u);
  }
  async setActive(id: string, isActive: boolean, actor: { id: string; name: string }) {
    if (id === actor.id && !isActive) throw new AppError("CANNOT_DEACTIVATE_SELF", "You can't deactivate your own account", 409);
    const u = await this.prisma.staffUser.update({ where: { id }, data: { isActive } }).catch(() => null);
    if (!u) throw new AppError("NOT_FOUND", "Staff member not found", 404);
    await this.prisma.auditLog.create({ data: { actor: actor.name, action: isActive ? "STAFF_ACTIVATE" : "STAFF_DEACTIVATE", entity: "STAFF", entityId: id } });
    return this.pub(u);
  }
}
