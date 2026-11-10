import { CanActivate, ExecutionContext, Injectable, Inject, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "./prisma.service";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "./http";
import { cfg } from "./config";

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

@Injectable() export class UserGuard implements CanActivate {
  canActivate(c: ExecutionContext) { if (!c.switchToHttp().getRequest().userId) throw new AppError("UNAUTHORIZED", "Sign in required", 401); return true; }
}
export type Role = "STAFF" | "MANAGER" | "OWNER";
const RANK: Record<string, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };
/** Minimum role for a route. Default for admin routes is STAFF. */
export const MinRole = (r: Role) => SetMetadata("minRole", r);
/** Routes a signed-in staff member may call before finishing two-step login setup. */
export const AllowWithoutMfa = () => SetMetadata("allowNoMfa", true);
export const mfaRequiredFor = (role: string) => cfg().requireAdminMfa && role !== "STAFF";

/** Staff JWT (re-checked against the DB so deactivation is immediate) or the legacy service key (treated as OWNER). */
@Injectable() export class AdminGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector, @Inject(PrismaService) private prisma: PrismaService) {}
  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest();
    const need = this.reflector.getAllAndOverride<Role>("minRole", [c.getHandler(), c.getClass()]) ?? "STAFF";
    const key = String(req.headers["x-admin-key"] ?? ""); const want = cfg().adminKey;
    if (key && want && same(key, want)) { req.actor = { id: "key", name: "admin-key", role: "OWNER" }; return true; }
    if (!req.staff) throw new AppError("UNAUTHORIZED", "Staff sign-in required", 401);
    const u = await this.prisma.staffUser.findUnique({ where: { id: req.staff.id } });
    if (!u || !u.isActive) throw new AppError("UNAUTHORIZED", "Staff sign-in required", 401);
    const noMfaOk = this.reflector.getAllAndOverride<boolean>("allowNoMfa", [c.getHandler(), c.getClass()]);
    if (!noMfaOk && mfaRequiredFor(u.role) && !req.staff.mfa) throw new AppError("MFA_REQUIRED", "Two-step login is required. Finish setting it up to continue.", 403);
    if ((RANK[u.role] ?? 0) < RANK[need]!) throw new AppError("FORBIDDEN", `This action needs ${need.toLowerCase()} access`, 403);
    req.actor = { id: u.id, name: u.name, role: u.role }; return true;
  }
}
@Injectable() export class BillOsGuard implements CanActivate {
  canActivate(c: ExecutionContext) {
    const h = String(c.switchToHttp().getRequest().headers.authorization ?? ""); const want = cfg().billOsKey;
    if (!want || !h.startsWith("Bearer ") || !same(h.slice(7), want)) throw new AppError("UNAUTHORIZED", "Invalid integration credentials", 401); return true;
  }
}

/** Any valid, active staff token (used by the two-step login setup endpoints before MFA is complete). */
@Injectable() export class StaffTokenGuard implements CanActivate {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}
  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest();
    if (!req.staff) throw new AppError("UNAUTHORIZED", "Staff sign-in required", 401);
    const u = await this.prisma.staffUser.findUnique({ where: { id: req.staff.id } });
    if (!u || !u.isActive) throw new AppError("UNAUTHORIZED", "Staff sign-in required", 401);
    req.actor = { id: u.id, name: u.name, role: u.role }; return true;
  }
}
