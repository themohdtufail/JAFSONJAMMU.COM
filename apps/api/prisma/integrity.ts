import "reflect-metadata";
import { PrismaService } from "../src/common/prisma.service";
import { IntegrityService } from "../src/admin/integrity.service";
try { process.loadEnvFile(); } catch {}

/** Read-only. Prints each consistency check and exits 1 if any fails: `pnpm --filter @jafson/api integrity` (use DATABASE_URL of the database to check). */
async function main() {
  const prisma = new PrismaService(); const r = await new IntegrityService(prisma).run();
  for (const c of r.checks) { console.log(`${c.ok ? "✓" : "✗"} ${c.name} (${c.checked} checked)`); for (const p of c.problems) console.log(`    - ${p}`); }
  console.log(r.ok ? "\nAll checks passed" : "\nSome checks failed"); await prisma.$disconnect(); process.exit(r.ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
