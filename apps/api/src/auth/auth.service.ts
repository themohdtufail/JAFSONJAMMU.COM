import { Inject, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHmac, randomBytes, randomInt, timingSafeEqual, createHash } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";

const hmac = (v: string) => createHmac("sha256", cfg().jwtSecret).update(v).digest("hex");
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

@Injectable()
export class AuthService {
  private log = new Logger("Auth");
  private jwt = new JwtService({ secret: cfg().jwtSecret });
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async requestOtp(phone: string) {
    const since = new Date(Date.now() - 3600_000);
    if ((await this.prisma.otpChallenge.count({ where: { phone, createdAt: { gte: since } } })) >= 5) throw new AppError("OTP_THROTTLED", "Too many codes requested. Try again later.", 429);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.prisma.otpChallenge.create({ data: { phone, codeHash: hmac(`${phone}:${code}`), expiresAt: new Date(Date.now() + 5 * 60_000) } });
    // No SMS provider is wired yet. The code is only echoed when OTP_DEV_ECHO=1 (development).
    if (!cfg().otpDevEcho) this.log.warn("SMS provider not configured: OTP generated but not delivered");
    return { sent: true, expiresInSeconds: 300, ...(cfg().otpDevEcho ? { devCode: code } : {}) };
  }

  async verifyOtp(phone: string, code: string) {
    const ch = await this.prisma.otpChallenge.findFirst({ where: { phone, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
    if (!ch || ch.attempts >= 5) throw new AppError("OTP_INVALID", "Code expired or invalid. Request a new one.", 400);
    const ok = (() => { const a = Buffer.from(ch.codeHash), b = Buffer.from(hmac(`${phone}:${code}`)); return a.length === b.length && timingSafeEqual(a, b); })();
    if (!ok) { await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } }); throw new AppError("OTP_INVALID", "Incorrect code", 400); }
    const used = await this.prisma.otpChallenge.updateMany({ where: { id: ch.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (used.count === 0) throw new AppError("OTP_INVALID", "Code already used", 400);
    const user = await this.prisma.user.upsert({ where: { phone }, update: {}, create: { phone } });
    if (user.status !== "ACTIVE") throw new AppError("ACCOUNT_UNAVAILABLE", "This account is not available", 403);
    // The phone is now verified: attach earlier guest orders placed with it so they appear in the account.
    await this.prisma.order.updateMany({ where: { userId: null, contactPhone: phone }, data: { userId: user.id } });
    return { ...(await this.issue(user.id)), user: this.pub(user) };
  }

  private async issue(userId: string) {
    const refresh = randomBytes(40).toString("hex");
    await this.prisma.refreshToken.create({ data: { userId, tokenHash: sha(refresh), expiresAt: new Date(Date.now() + 30 * 86400_000) } });
    return { accessToken: this.jwt.sign({ sub: userId }, { expiresIn: "1h" }), refreshToken: refresh, expiresIn: 3600 };
  }

  async refresh(token: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha(token) } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) throw new AppError("UNAUTHORIZED", "Session expired", 401);
    const rotated = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (rotated.count === 0) throw new AppError("UNAUTHORIZED", "Session expired", 401);
    return this.issue(row.userId);
  }

  async logout(token?: string) { if (token) await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha(token), revokedAt: null }, data: { revokedAt: new Date() } }); return { ok: true }; }

  pub(u: { id: string; phone: string; name: string | null; email: string | null }) { return { id: u.id, phone: u.phone, name: u.name, email: u.email }; }
  async me(id: string) { const u = await this.prisma.user.findUnique({ where: { id } }); if (!u || u.status !== "ACTIVE") throw new AppError("UNAUTHORIZED", "Sign in required", 401); return this.pub(u); }
  async updateMe(id: string, d: { name?: string; email?: string }) { return this.pub(await this.prisma.user.update({ where: { id }, data: d })); }

  async requestDeletion(id: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: "DELETION_REQUESTED", deletionRequestedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { requested: true, note: "Account will be erased after the statutory retention period." };
  }

  addresses(userId: string) { return this.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }); }
  async addAddress(userId: string, a: { fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; postalCode: string; isDefault?: boolean }) {
    const first = (await this.prisma.address.count({ where: { userId } })) === 0;
    return this.prisma.$transaction(async (tx) => {
      if (a.isDefault || first) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({ data: { ...a, userId, isDefault: a.isDefault || first } });
    });
  }
  async deleteAddress(userId: string, id: string) { const r = await this.prisma.address.deleteMany({ where: { id, userId } }); if (!r.count) throw new AppError("NOT_FOUND", "Address not found", 404); return { deleted: true }; }
}
