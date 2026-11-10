// Copies brand fonts and logo files into every app's /public so they are served from our own origin.
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const app of ["web", "admin"]) {
  const pub = join(root, "..", "..", "apps", app, "public");
  mkdirSync(pub, { recursive: true });
  cpSync(join(root, "fonts"), join(pub, "fonts"), { recursive: true });
  cpSync(join(root, "brand"), join(pub, "brand"), { recursive: true });
  console.log(`synced brand files into apps/${app}/public`);
}
