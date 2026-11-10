import { execFileSync, execSync } from "node:child_process";
const URL_ = "postgresql://jafson:jafson@localhost:5432/jafson_test";
export default function setup() {
  const admin = "postgresql://jafson:jafson@localhost:5432/postgres";
  try { execFileSync("psql", [admin, "-qc", "CREATE DATABASE jafson_test"], { stdio: "pipe" }); } catch { /* exists */ }
  execFileSync("psql", [URL_, "-qc", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"], { stdio: "pipe" });
  const env = { ...process.env, DATABASE_URL: URL_ };
  execSync("npx prisma db push --skip-generate", { env, stdio: "pipe" });
  execFileSync("psql", [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", "prisma/constraints.sql"], { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
