import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
try { process.loadEnvFile(); } catch {}

/**
 * Creates the next migration from schema.prisma changes: `pnpm db:migration add_something`.
 * It compares the schema with the migration history on a throwaway shadow database, so nothing touches real data.
 * Hand-written SQL (triggers, CHECKs) goes in its own migration folder created the same way.
 */
const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]/gi, "_");
if (!name) { console.error("usage: pnpm db:migration <name>"); process.exit(1); }
const base = new URL(process.env.DATABASE_URL!); const shadowName = `shadow_${Date.now()}`;
const admin = new URL(base); admin.pathname = "/postgres";
const shadow = new URL(base); shadow.pathname = `/${shadowName}`;
execFileSync("psql", [admin.toString(), "-qc", `CREATE DATABASE ${shadowName}`]);
try {
  const sql = execSync(`npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "${shadow}" --script`, { encoding: "utf8" });
  if (/^-- This is an empty migration/m.test(sql)) { console.log("No schema changes."); process.exit(0); }
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14); const dir = join("prisma/migrations", `${stamp}_${name}`);
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "migration.sql"), sql); console.log(`Created ${dir} (${readdirSync("prisma/migrations").length - 1} migrations). Review it before committing.`);
} finally { execFileSync("psql", [admin.toString(), "-qc", `DROP DATABASE IF EXISTS ${shadowName}`]); }
