import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ADMIN = "postgresql://jafson:jafson@localhost:5432/postgres", url = (d: string) => `postgresql://jafson:jafson@localhost:5432/${d}`;
const psql = (u: string, sql: string) => execFileSync("psql", [u, "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" }).trim();
const dbs: string[] = [];
const mk = (n: string) => { const d = `${n}_${Date.now()}`; dbs.push(d); psql(ADMIN, `CREATE DATABASE ${d}`); return d; };
afterAll(() => { for (const d of dbs) try { psql(ADMIN, `DROP DATABASE IF EXISTS ${d}`); } catch { /* best effort */ } });
const sh = (script: string, env: Record<string, string>, ...args: string[]) => execFileSync("bash", [`../../deploy/${script}`, ...args], { env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

describe("backup and restore", () => {
  it("an encrypted backup restores into a new database with data, triggers and constraints intact", () => {
    const src = mk("bk_src"), dir = mkdtempSync(join(tmpdir(), "bk-")), env = { DATABASE_URL: url(src), BACKUP_PASSPHRASE: "test-passphrase-123" };
    execFileSync("npx", ["tsx", "prisma/setup.ts"], { env: { ...process.env, DATABASE_URL: url(src) }, stdio: "pipe" });
    psql(url(src), `INSERT INTO "Category" (id, slug, name, collection, "sortOrder") VALUES (gen_random_uuid(), 'bk-cat', 'Backup Category', 'men', 0)`);
    psql(url(src), `INSERT INTO "AuditLog" (id, actor, action, entity, "entityId", data) VALUES (gen_random_uuid(), 't', 'BK', 'T', '1', '{}')`);
    const file = sh("backup.sh", env, dir).trim();
    expect(readFileSync(file).subarray(0, 8).toString()).toBe("Salted__"); // encrypted, not plain SQL
    expect(readFileSync(file).includes("Backup Category")).toBe(false);
    const dst = mk("bk_dst");
    expect(sh("restore.sh", { TARGET_DATABASE_URL: url(dst), BACKUP_PASSPHRASE: "test-passphrase-123" }, file)).toContain("Restored");
    expect(psql(url(dst), `SELECT name FROM "Category" WHERE slug='bk-cat'`)).toBe("Backup Category");
    expect(psql(url(dst), `SELECT count(*) FROM pg_trigger WHERE tgname IN ('audit_log_immutable','invoices_immutable','inventory_movements_immutable')`)).toBe("3");
    expect(() => psql(url(dst), `UPDATE "AuditLog" SET actor='x'`)).toThrow();
    expect(psql(url(dst), `SELECT count(*) FROM pg_class WHERE relname='order_number_seq'`)).toBe("1");
  });

  it("refuses a wrong passphrase, a damaged file and a non-empty target", () => {
    const src = mk("bk_src2"), dir = mkdtempSync(join(tmpdir(), "bk-")); execFileSync("npx", ["tsx", "prisma/setup.ts"], { env: { ...process.env, DATABASE_URL: url(src) }, stdio: "pipe" });
    const file = sh("backup.sh", { DATABASE_URL: url(src), BACKUP_PASSPHRASE: "right-pass-123" }, dir).trim();
    expect(() => sh("restore.sh", { TARGET_DATABASE_URL: url(mk("bk_t1")), BACKUP_PASSPHRASE: "wrong-pass-123" }, file)).toThrow();
    expect(() => sh("restore.sh", { TARGET_DATABASE_URL: url(src), BACKUP_PASSPHRASE: "right-pass-123" }, file)).toThrow(/not empty/);
    const bad = join(dir, "bad.sql.gz.enc"); writeFileSync(bad, Buffer.concat([readFileSync(file), Buffer.from("x")])); writeFileSync(`${bad}.sha256`, readFileSync(`${file}.sha256`, "utf8").replace(/ .*/, `  bad.sql.gz.enc\n`));
    expect(() => sh("restore.sh", { TARGET_DATABASE_URL: url(mk("bk_t2")), BACKUP_PASSPHRASE: "right-pass-123" }, bad)).toThrow(/Checksum/);
  });
});
