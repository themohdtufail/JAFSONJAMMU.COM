import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { AppError } from "./http";

/** Fixed-window counters kept in Postgres, so a limit holds across API instances and restarts. */
@Injectable()
export class ThrottleService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /** Adds one to the counter for `key` (starting a new window when the last one ended) and returns the new count. */
  async hit(key: string, windowSec: number) {
    const [r] = await this.prisma.$queryRaw<{ count: number; secs: number }[]>`
      INSERT INTO "RateCounter" ("key", "count", "resetAt") VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateCounter"."resetAt" < now() THEN 1 ELSE "RateCounter"."count" + 1 END,
        "resetAt" = CASE WHEN "RateCounter"."resetAt" < now() THEN now() + make_interval(secs => ${windowSec}) ELSE "RateCounter"."resetAt" END
      RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetAt" - now()))))::int AS secs`;
    return { count: r!.count, retryAfter: r!.secs };
  }

  async peek(key: string) {
    const [r] = await this.prisma.$queryRaw<{ count: number; secs: number }[]>`
      SELECT "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetAt" - now()))))::int AS secs FROM "RateCounter" WHERE "key" = ${key} AND "resetAt" > now()`;
    return { count: r?.count ?? 0, retryAfter: r?.secs ?? 0 };
  }

  /** Throws 429 if `key` has already reached `limit` in its current window. */
  async assertBelow(key: string, limit: number) {
    const p = await this.peek(key);
    if (p.count >= limit) throw new AppError("RATE_LIMITED", `Too many attempts. Try again in ${Math.ceil(p.retryAfter / 60)} minutes.`, 429, { retryAfter: p.retryAfter });
  }
}
