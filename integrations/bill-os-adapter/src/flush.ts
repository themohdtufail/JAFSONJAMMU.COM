import type { Outbox, Row } from "./outbox";
import type { SendResult } from "./client";

export interface FlushReport { sent: number; synced: number; rejected: number; retried: number; error?: string }

/**
 * Sends everything that is due. The server answers per event: APPLIED or DUPLICATE both mean "it has this event" (safe to mark synced),
 * QUARANTINED means a person must look at it (marked REJECTED, kept visible). A network or server failure leaves events PENDING and schedules a retry with backoff.
 */
export async function flush(outbox: Outbox, send: (events: unknown[]) => Promise<{ results: SendResult[] }>, o: { now?: number; batchSize?: number } = {}): Promise<FlushReport> {
  const now = o.now ?? Date.now(); const rows: Row[] = outbox.due(now, o.batchSize ?? 50); const rep: FlushReport = { sent: rows.length, synced: 0, rejected: 0, retried: 0 };
  if (!rows.length) return rep;
  try {
    const { results } = await send(rows.map((r) => JSON.parse(r.payload)));
    for (const r of rows) {
      const res = results.find((x) => x.eventId === r.eventId);
      if (!res) { outbox.markRetry(r.eventId, "no result returned for this event", now); rep.retried++; }
      else if (res.status === "APPLIED" || res.status === "DUPLICATE") { outbox.markSynced(r.eventId); rep.synced++; }
      else if (res.status === "QUARANTINED") { outbox.markRejected(r.eventId, `${res.reason ?? "QUARANTINED"}: ${res.detail ?? ""}`); rep.rejected++; }
      else { outbox.markRetry(r.eventId, `unexpected status ${res.status}`, now); rep.retried++; }
    }
  } catch (e) {
    rep.error = (e as Error).message;
    for (const r of rows) { outbox.markRetry(r.eventId, rep.error, now); rep.retried++; }
  }
  return rep;
}
