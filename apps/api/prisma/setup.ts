import { execFileSync, execSync } from "node:child_process";
import { join } from "node:path";
try { process.loadEnvFile(); } catch {}

// Schema via Prisma; invariants Prisma can't express (CHECKs, triggers, sequences) via psql. Idempotent.
execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
execFileSync("psql", [process.env.DATABASE_URL!, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(__dirname, "constraints.sql")], { stdio: "inherit" });
console.log("database ready");
