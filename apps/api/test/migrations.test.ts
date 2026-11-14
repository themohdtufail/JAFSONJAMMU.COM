import { execFileSync, execSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const ADMIN = "postgresql://jafson:jafson@localhost:5432/postgres";
const url = (db: string) => `postgresql://jafson:jafson@localhost:5432/${db}`;
const psql = (db: string, sql: string) => execFileSync("psql", [db.startsWith("postgresql") ? db : url(db), "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" }).trim();
const dbs: string[] = [];
const fresh = (n: string) => { const d = `${n}_${Date.now()}`; dbs.push(d); psql(ADMIN, `CREATE DATABASE ${d}`); return d; };
afterAll(() => { for (const d of dbs) try { psql(ADMIN, `DROP DATABASE IF EXISTS ${d}`); } catch { /* best effort */ } });

describe("migrations", () => {
  it("schema.prisma and the migration history agree (a schema change needs a migration)", () => {
    const shadow = fresh("shadow");
    // exit code 2 means there is a difference; execSync throws on any non-zero code
    expect(() => execSync(`npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url ${url(shadow)} --exit-code`, { stdio: "pipe" })).not.toThrow();
  });

  it("an empty database is built entirely from the migrations, including the integrity rules", () => {
    const d = fresh("mig_empty"); const env = { ...process.env, DATABASE_URL: url(d) };
    execSync("npx tsx prisma/setup.ts", { env, stdio: "pipe" });
    expect(psql(d, `SELECT count(*) FROM pg_trigger WHERE tgname IN ('inventory_movements_immutable','audit_log_immutable','invoices_immutable','order_items_frozen','orders_need_pickup_confirmation')`)).toBe("5");
    expect(psql(d, `SELECT count(*) FROM pg_constraint WHERE conname IN ('inventory_balances_never_negative','order_total_adds_up')`)).toBe("2");
    expect(psql(d, `SELECT count(*) FROM pg_class WHERE relkind='S' AND relname IN ('order_number_seq','return_ref_seq','product_sku_seq')`)).toBe("3");
    execSync("npx tsx prisma/setup.ts", { env, stdio: "pipe" }); // running it again is a no-op
  });

  it("a database made earlier with `db push` is baselined without touching its data", () => {
    const d = fresh("mig_legacy"); const env = { ...process.env, DATABASE_URL: url(d) };
    execSync("npx prisma db push --skip-generate", { env, stdio: "pipe" });
    psql(d, `INSERT INTO "Category" (id, slug, name, collection, "sortOrder") VALUES (gen_random_uuid(), 'legacy-cat', 'Legacy', 'men', 0)`);
    execSync("npx tsx prisma/setup.ts", { env, stdio: "pipe" });
    expect(psql(d, `SELECT name FROM "Category" WHERE slug='legacy-cat'`)).toBe("Legacy");
    expect(psql(d, `SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL`)).toBe("2");
    expect(psql(d, `SELECT count(*) FROM pg_trigger WHERE tgname = 'audit_log_immutable'`)).toBe("1");
  });
});
