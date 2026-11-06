import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./migrations (wrangler.jsonc migrations_dir). Apply with `wrangler d1 migrations apply`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
