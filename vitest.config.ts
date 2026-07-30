import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Vitest configuration for THEFVC.IS (PRD-008: Testing & CI).
 *
 * Two environments are supported:
 *  - "node"  → for server-side API integration tests (tests/api/)
 *  - "jsdom" → for client-side component unit tests (tests/unit/)
 *
 * The `environment` is set per-file via inline `describe`/`test` options or
 * via the `--environment` CLI flag. The default is "node" for broad compat.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: [
      "node_modules",
      "dist",
      "build",
      "tests/e2e/**", // Playwright handles E2E separately
    ],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "lcov"],
      exclude: [
        "node_modules/",
        "dist/",
        "tests/",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
      ],
    },
    // Run server tests with more time — SQLite + Express boot is not instant
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
