import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "./http";
import { cfg } from "./config";

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

@Injectable() export class UserGuard implements CanActivate {
  canActivate(c: ExecutionContext) { if (!c.switchToHttp().getRequest().userId) throw new AppError("UNAUTHORIZED", "Sign in required", 401); return true; }
}
@Injectable() export class AdminGuard implements CanActivate {
  canActivate(c: ExecutionContext) {
    const k = String(c.switchToHttp().getRequest().headers["x-admin-key"] ?? ""); const want = cfg().adminKey;
    if (!want || !same(k, want)) throw new AppError("FORBIDDEN", "Admin access required", 403); return true;
  }
}
@Injectable() export class BillOsGuard implements CanActivate {
  canActivate(c: ExecutionContext) {
    const h = String(c.switchToHttp().getRequest().headers.authorization ?? ""); const want = cfg().billOsKey;
    if (!want || !h.startsWith("Bearer ") || !same(h.slice(7), want)) throw new AppError("UNAUTHORIZED", "Invalid integration credentials", 401); return true;
  }
}
