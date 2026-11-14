import { createRequire } from "node:module";
import type { DatabaseSync as DB } from "node:sqlite";
import { billOsEventSchema, type BillOsEvent } from "@jafson/validation";

/**
 * Durable local outbox (spec 4.2 and 4.5). Every Bill OS event is written here BEFORE any network call, so a sale is never lost when the
 * connection is down or the app closes. The original event_id is used for every retry, so the server can recognise repeats.
 *
 * States: PENDING (will be sent), SYNCED (server applied it or already had it), REJECTED (server quarantined it: needs a person, stays visible).
 */
// Loaded through require so bundlers and test runners that do not know the built-in `node:sqlite` leave it alone.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export type Status = "PENDING" | "SYNCED" | "REJECTED";
export interface Row { seq: number; eventId: string; payload: string; status: Status; attempts: number; nextAttemptAt: number; lastError: string | null; createdAt: number }

/** Exponential backoff with jitter: base, 2x, 4x ... capped. */
export const backoffMs = (attempts: number, o: { base?: number; max?: number; jitter?: number; rand?: () => number } = {}) => {
  const base = o.base ?? 2_000, max = o.max ?? 15 * 60_000, j = o.jitter ?? 0.2, rand = o.rand ?? Math.random;
  const raw = Math.min(max, base * 2 ** Math.max(0, attempts - 1));
  return Math.round(raw * (1 - j + rand() * j * 2));
};

export class Outbox {
  private db: DB;
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS outbox_due ON outbox (status, next_attempt_at, seq);`);
  }
  close() { this.db.close(); }

  /** Validates and stores an event. Enqueuing the same event_id again does nothing, so the POS can safely retry its own call. */
  enqueue(event: unknown, now = Date.now()): { eventId: string; stored: boolean } {
    const e: BillOsEvent = billOsEventSchema.parse(event);
    const r = this.db.prepare("INSERT OR IGNORE INTO outbox (event_id, payload, created_at) VALUES (?, ?, ?)").run(e.event_id, JSON.stringify(e), now);
    return { eventId: e.event_id, stored: Number(r.changes) === 1 };
  }

  /** Oldest first, so events reach the server in the order they happened. */
  due(now = Date.now(), limit = 50): Row[] {
    return (this.db.prepare("SELECT seq, event_id AS eventId, payload, status, attempts, next_attempt_at AS nextAttemptAt, last_error AS lastError, created_at AS createdAt FROM outbox WHERE status = 'PENDING' AND next_attempt_at <= ? ORDER BY seq LIMIT ?").all(now, limit) as unknown) as Row[];
  }
  markSynced(eventId: string) { this.db.prepare("UPDATE outbox SET status='SYNCED', last_error=NULL WHERE event_id=?").run(eventId); }
  markRejected(eventId: string, reason: string) { this.db.prepare("UPDATE outbox SET status='REJECTED', last_error=? WHERE event_id=?").run(reason.slice(0, 500), eventId); }
  markRetry(eventId: string, error: string, now = Date.now(), opts?: Parameters<typeof backoffMs>[1]) {
    const r = this.db.prepare("SELECT attempts FROM outbox WHERE event_id=?").get(eventId) as { attempts: number } | undefined; const attempts = (r?.attempts ?? 0) + 1;
    this.db.prepare("UPDATE outbox SET attempts=?, next_attempt_at=?, last_error=? WHERE event_id=?").run(attempts, now + backoffMs(attempts, opts), error.slice(0, 500), eventId);
  }
  /** After staff resolve a rejected event on the server (e.g. map the SKU), send it again under the same event_id. */
  requeue(eventId: string) { this.db.prepare("UPDATE outbox SET status='PENDING', next_attempt_at=0, last_error=NULL WHERE event_id=? AND status='REJECTED'").run(eventId); }

  list(status?: Status): Row[] { return (this.db.prepare(`SELECT seq, event_id AS eventId, payload, status, attempts, next_attempt_at AS nextAttemptAt, last_error AS lastError, created_at AS createdAt FROM outbox ${status ? "WHERE status = ?" : ""} ORDER BY seq`).all(...(status ? [status] : [])) as unknown) as Row[]; }
  /** What the showroom screen should show: anything not synced is visible here. */
  stats() {
    const g = (s: Status) => Number((this.db.prepare("SELECT count(*) AS n FROM outbox WHERE status=?").get(s) as { n: number }).n);
    const oldest = this.db.prepare("SELECT min(created_at) AS t FROM outbox WHERE status='PENDING'").get() as { t: number | null };
    return { pending: g("PENDING"), synced: g("SYNCED"), rejected: g("REJECTED"), oldestPendingAt: oldest.t };
  }
}
