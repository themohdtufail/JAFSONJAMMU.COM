import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { PrismaService } from "../common/prisma.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";

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

  async login(email: string, password: string) {
    const key = email.toLowerCase(); const f = this.fails.get(key);
    if (f && f.n >= 5 && f.until > Date.now()) throw new AppError("LOGIN_THROTTLED", "Too many attempts. Try again in a few minutes.", 429);
    const u = await this.prisma.staffUser.findUnique({ where: { email: key } });
    const ok = u && u.isActive && (await verifyPassword(password, u.passwordHash));
    if (!ok) { this.fails.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60_000 }); throw new AppError("INVALID_CREDENTIALS", "Incorrect email or password", 401); }
    this.fails.delete(key);
    await this.prisma.staffUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    return { token: this.jwt.sign({ sub: u.id, role: u.role, aud: "admin" }, { expiresIn: "8h" }), user: this.pub(u) };
  }
  pub(u: { id: string; email: string; name: string; role: string; isActive: boolean; lastLoginAt?: Date | null }) { return { id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, lastLoginAt: u.lastLoginAt ?? null }; }
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
