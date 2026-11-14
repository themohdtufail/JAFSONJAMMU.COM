import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
try { process.loadEnvFile(); } catch {}

/**
 * Applies the migration history in prisma/migrations. Safe to run on every start: applied migrations are skipped.
 *
 * A database created earlier with `db push` has tables but no history. It is baselined once without touching any data:
 * we find how many migrations its current schema already matches (compared on a throwaway shadow database), run the re-runnable
 * SQL-only ones (folders holding an IDEMPOTENT file: triggers, CHECKs) so the rules are in place, record those migrations as applied,
 * and let `migrate deploy` apply the rest. If the schema matches no known state it stops and says so rather than guess.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\//.test(url)) { console.error("DATABASE_URL is not set (or is not a postgresql:// address). Set it in the service's environment settings. Nothing was changed."); process.exit(1); }
const psql = (sql: string) => execFileSync("psql", [url, "-Atc", sql], { encoding: "utf8" }).trim();
const migDir = join(__dirname, "migrations");
const names = readdirSync(migDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const hasTables = psql(`SELECT to_regclass('public."Product"') IS NOT NULL`) === "t";
const hasHistory = psql(`SELECT to_regclass('public._prisma_migrations') IS NOT NULL`) === "t";

if (hasTables && !hasHistory) {
  console.log("Existing tables without migration history: working out which migrations they already match (no data is changed).");
  const admin = new URL(url); admin.pathname = "/postgres"; const shadowName = `shadow_${Date.now()}`; const shadow = new URL(url); shadow.pathname = `/${shadowName}`;
  const tmp = mkdtempSync(join(tmpdir(), "mig-")); let matched = 0;
  execFileSync("psql", [admin.toString(), "-qc", `CREATE DATABASE ${shadowName}`]);
  try {
    for (let k = names.length; k >= 1 && !matched; k--) {
      rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true }); writeFileSync(join(tmp, "migration_lock.toml"), 'provider = "postgresql"\n');
      for (const n of names.slice(0, k)) cpSync(join(migDir, n), join(tmp, n), { recursive: true });
      try { execSync(`npx prisma migrate diff --from-url "${url}" --to-migrations "${tmp}" --shadow-database-url "${shadow}" --exit-code`, { stdio: "pipe" }); matched = k; } catch { /* differs at this depth: try fewer */ }
      execFileSync("psql", [shadow.toString(), "-qc", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"]);
    }
  } finally { execFileSync("psql", [admin.toString(), "-qc", `DROP DATABASE IF EXISTS ${shadowName}`]); rmSync(tmp, { recursive: true, force: true }); }
  if (!matched) { console.error("This database's tables do not match any known migration state. Not changing it. Compare it with prisma/schema.prisma and migrate by hand."); process.exit(1); }
  for (const n of names.slice(0, matched)) {
    if (existsSync(join(migDir, n, "IDEMPOTENT"))) execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(migDir, n, "migration.sql")], { stdio: "inherit" });
    execSync(`npx prisma migrate resolve --applied ${n}`, { stdio: "inherit" });
  }
}
execSync("npx prisma migrate deploy", { stdio: "inherit" });
console.log("database ready");
