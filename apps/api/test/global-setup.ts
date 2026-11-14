import { execFileSync, execSync } from "node:child_process";
const URL_ = "postgresql://jafson:jafson@localhost:5432/jafson_test";
export default function setup() {
  const admin = "postgresql://jafson:jafson@localhost:5432/postgres";
  try { execFileSync("psql", [admin, "-qc", "CREATE DATABASE jafson_test"], { stdio: "pipe" }); } catch { /* exists */ }
  execFileSync("psql", [URL_, "-qc", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"], { stdio: "pipe" });
  const env = { ...process.env, DATABASE_URL: URL_ };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" }); // the tests run on the real migration history
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
