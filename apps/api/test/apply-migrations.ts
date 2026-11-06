import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Runs before every test file. applyD1Migrations only applies migrations not yet recorded, so this is idempotent.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
