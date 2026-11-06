import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // W1-04: the deadline engine and the state machine must stay at 100%.
      thresholds: { "src/deadlines.ts": { 100: true }, "src/state-machine.ts": { 100: true } },
    },
  },
});
