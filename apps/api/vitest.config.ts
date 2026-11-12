import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      // Read the D1 migrations in Node and hand them to the Workers runtime as a test-only binding;
      // test/apply-migrations.ts applies them to the local D1 before the tests run.
      const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Matches CLIENT_ID in test/auth.test.ts. Not a real Google client.
            GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
