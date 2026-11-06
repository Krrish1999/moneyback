// Stopgap (QA, 2026-11-06): root `pnpm test` runs `pnpm -r --if-present test`, which would also start Playwright
// (build + browser) inside the unit-test run. Root `pnpm e2e` calls this same `test` script, so we skip only when
// invoked through the recursive `--if-present` unit run. Remove once the root `test` script excludes
// @moneyback/e2e (requested from product-manager in team/handoffs/qa-engineer.md).
import { spawnSync } from "node:child_process";

if (process.env.npm_config_if_present === "true" && !process.env.E2E_FORCE) {
  console.log("@moneyback/e2e: skipped in the unit-test run; use `pnpm e2e` for Playwright.");
  process.exit(0);
}
const r = spawnSync("playwright", ["test", ...process.argv.slice(2)], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
