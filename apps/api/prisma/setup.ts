import { execFileSync, execSync } from "node:child_process";
try { process.loadEnvFile(); } catch {}

/**
 * Applies the migration history in prisma/migrations (schema, then integrity rules). Safe to run on every start: applied migrations are skipped.
 * A database that was created earlier with `db push` has tables but no history; it is baselined once (existing data is left untouched),
 * then any newer migrations are applied.
 */
const url = process.env.DATABASE_URL!;
const q = (sql: string) => execFileSync("psql", [url, "-Atc", sql], { encoding: "utf8" }).trim();
const hasTables = q(`SELECT to_regclass('public."Product"') IS NOT NULL`) === "t";
const hasHistory = q(`SELECT to_regclass('public._prisma_migrations') IS NOT NULL`) === "t";
if (hasTables && !hasHistory) {
  console.log("Existing tables without migration history: recording the baseline as applied (no data is changed).");
  execSync("npx prisma migrate resolve --applied 20261114000001_baseline", { stdio: "inherit" });
  // The integrity rules are idempotent, so applying them to an older database is safe and brings it up to date.
}
execSync("npx prisma migrate deploy", { stdio: "inherit" });
console.log("database ready");
