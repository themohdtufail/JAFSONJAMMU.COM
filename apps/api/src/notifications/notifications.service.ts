import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService, Tx } from "../common/prisma.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";
import { emailProvider, smsProvider } from "./providers";
import { render, type Ctx, type Template } from "./templates";

const BACKOFF_MIN = [1, 5, 30, 120, 360]; // minutes before attempts 2..6; after the 6th failure the message is marked FAILED for a person to look at
const inr = (p: number) => "₹" + Math.round(p / 100).toLocaleString("en-IN");

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Notifications"); private timer?: NodeJS.Timeout; private busy = false;
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}
  onModuleInit() { if (process.env.NODE_ENV !== "test") this.timer = setInterval(() => this.dispatchDue().catch((e) => this.log.error(e)), 15_000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private ctx(o: { number: string; contactName: string; contactPhone: string; totalPaise: number; pickupCode: string | null }): Ctx {
    return { number: o.number, name: o.contactName, trackUrl: `${cfg().publicWebUrl}/order/${o.number}?phone=${o.contactPhone}`, totalRupees: inr(o.totalPaise), pickupCode: o.pickupCode };
  }

  /** Written in the same transaction as the order change, so a message exists if and only if the change committed. Repeats are ignored by the dedupe key. */
  async enqueue(tx: Tx | PrismaService, orderId: string, template: Template) {
    const o = await tx.order.findUnique({ where: { id: orderId } }); if (!o) return;
    const payload = this.ctx(o) as unknown as Prisma.InputJsonValue;
    const rows = [{ channel: "SMS", recipient: o.contactPhone }, ...(o.contactEmail ? [{ channel: "EMAIL", recipient: o.contactEmail }] : [])];
    await tx.notification.createMany({ data: rows.map((r) => ({ ...r, template, payload, dedupeKey: `${o.number}:${template}:${r.channel}` })), skipDuplicates: true });
  }

  /** Sends what is due. A message is leased for 2 minutes while being sent, so two workers never send the same one; failures back off, then give up visibly. */
  async dispatchDue(limit = 20) {
    if (this.busy) return { sent: 0, failed: 0 }; this.busy = true;
    try {
      const claimed = await this.prisma.$queryRaw<{ id: string; channel: string; recipient: string; template: string; payload: Ctx; attempts: number }[]>`
        UPDATE "Notification" SET "nextAttemptAt" = now() + interval '2 minutes' WHERE id IN (
          SELECT id FROM "Notification" WHERE status = 'PENDING' AND "nextAttemptAt" <= now() ORDER BY "createdAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
        RETURNING id, channel, recipient, template, payload, attempts`;
      let sent = 0, failed = 0;
      for (const n of claimed) {
        try {
          const r = render(n.template as Template, n.payload);
          if (n.channel === "SMS") await smsProvider().sendTemplate(n.recipient, n.template, r.vars, r.sms); else await emailProvider().send(n.recipient, r.subject, r.text, r.html);
          await this.prisma.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date(), attempts: n.attempts + 1, lastError: null } }); sent++;
        } catch (e) {
          const attempts = n.attempts + 1, give = attempts > BACKOFF_MIN.length;
          await this.prisma.notification.update({ where: { id: n.id }, data: { attempts, lastError: (e as Error).message.slice(0, 300), status: give ? "FAILED" : "PENDING", nextAttemptAt: new Date(Date.now() + (BACKOFF_MIN[attempts - 1] ?? 360) * 60_000) } });
          if (give) this.log.error(`Giving up on ${n.channel} ${n.template} to ${n.recipient.slice(0, 3)}***: ${(e as Error).message}`); failed++;
        }
      }
      return { sent, failed };
    } finally { this.busy = false; }
  }

  async list(status?: string) {
    const [rows, counts] = await Promise.all([
      this.prisma.notification.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.notification.groupBy({ by: ["status"], _count: true }),
    ]);
    return { counts: Object.fromEntries(counts.map((c) => [c.status, c._count])), providers: { sms: cfg().smsProvider, email: cfg().emailProvider }, items: rows.map((n) => ({ id: n.id, channel: n.channel, recipient: n.channel === "SMS" ? n.recipient.replace(/^(\d{2})\d{6}/, "$1******") : n.recipient.replace(/^(.).*(@.*)$/, "$1***$2"), template: n.template, status: n.status, attempts: n.attempts, lastError: n.lastError, createdAt: n.createdAt, sentAt: n.sentAt })) };
  }
  async retry(id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null } });
    if (r.count === 0) throw new AppError("NOT_FOUND", "No failed message with that id", 404); return { id, requeued: true };
  }
}
