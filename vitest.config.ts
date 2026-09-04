import { defineConfig } from "vitest/config";

// Standalone from vite.config.ts on purpose: tests exercise pure logic and
// should not boot the TanStack Start / router plugins.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
