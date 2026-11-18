import { execFileSync, execSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const ADMIN = "postgresql://jafson:jafson@localhost:5432/postgres", url = (d: string) => `postgresql://jafson:jafson@localhost:5432/${d}`;
const psql = (d: string, q: string) => execFileSync("psql", [url(d), "-Atc", q], { encoding: "utf8" }).trim();
const dbs: string[] = [];
const seeded = (extra: Record<string, string>) => {
  const d = `seed_${Date.now()}_${dbs.length}`; dbs.push(d); execFileSync("psql", [ADMIN, "-qc", `CREATE DATABASE ${d}`]);
  const env = { ...process.env, DATABASE_URL: url(d), ...extra }; execSync("npx tsx prisma/setup.ts", { env, stdio: "pipe" }); execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" }); return d;
};
afterAll(() => { for (const d of dbs) try { execFileSync("psql", [ADMIN, "-qc", `DROP DATABASE IF EXISTS ${d} WITH (FORCE)`]); } catch { /* best effort */ } });

describe("seeding", () => {
  it("development loads the demo catalogue", () => { expect(psql(seeded({ NODE_ENV: "development" }), `SELECT count(*) FROM "Product"`)).toBe("16"); });
  it("production never loads demo products by default, even with a leftover SEED_CATALOGUE=1", () => {
    const d = seeded({ NODE_ENV: "production", SEED_CATALOGUE: "1" }); expect(psql(d, `SELECT count(*) FROM "Product"`)).toBe("0"); expect(psql(d, `SELECT count(*) FROM "InventoryLocation"`)).toBe("1"); expect(Number(psql(d, `SELECT count(*) FROM "ServiceablePincode"`))).toBeGreaterThan(0);
  });
  it("production loads them only when ALLOW_DEMO_CATALOGUE=1 is set on purpose, and SEED_CATALOGUE=0 still wins", () => {
    expect(psql(seeded({ NODE_ENV: "production", ALLOW_DEMO_CATALOGUE: "1" }), `SELECT count(*) FROM "Product"`)).toBe("16");
    expect(psql(seeded({ NODE_ENV: "production", ALLOW_DEMO_CATALOGUE: "1", SEED_CATALOGUE: "0" }), `SELECT count(*) FROM "Product"`)).toBe("0");
  });
  it("re-running the seed never overwrites real data: an edited product, a changed owner password and extra products survive", () => {
    const d = seeded({ NODE_ENV: "development", ADMIN_BOOTSTRAP_EMAIL: "owner@example.test", ADMIN_BOOTSTRAP_PASSWORD: "first-password-123" });
    const hash = psql(d, `SELECT "passwordHash" FROM "StaffUser" WHERE email='owner@example.test'`); expect(hash.startsWith("$argon2id$")).toBe(true);
    psql(d, `UPDATE "Product" SET name='Edited by the owner' WHERE slug='tailored-navy-blazer'`); psql(d, `UPDATE "StaffUser" SET "passwordHash"='changed-by-owner' WHERE email='owner@example.test'`);
    execSync("npx tsx prisma/seed.ts", { env: { ...process.env, DATABASE_URL: url(d), NODE_ENV: "development", ADMIN_BOOTSTRAP_EMAIL: "owner@example.test", ADMIN_BOOTSTRAP_PASSWORD: "second-password-456" }, stdio: "pipe" });
    expect(psql(d, `SELECT name FROM "Product" WHERE slug='tailored-navy-blazer'`)).toBe("Edited by the owner"); expect(psql(d, `SELECT "passwordHash" FROM "StaffUser" WHERE email='owner@example.test'`)).toBe("changed-by-owner"); expect(psql(d, `SELECT count(*) FROM "Product"`)).toBe("16");
  });
});
