// Copies brand fonts and logo files into every app's /public so they are served from our own origin.
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const app of ["web", "admin"]) {
  const pub = join(root, "..", "..", "apps", app, "public");
  mkdirSync(pub, { recursive: true });
  cpSync(join(root, "fonts"), join(pub, "fonts"), { recursive: true });
  // The storefront uses the small pattern files (about 80 kB each); the full-size originals (500 to 780 kB) stay in the package only.
  const heavy = /pattern-(white|flame|charcoal)\.webp$/;
  cpSync(join(root, "brand"), join(pub, "brand"), { recursive: true, filter: (src) => app !== "web" || !heavy.test(src) });
  console.log(`synced brand files into apps/${app}/public`);
}
