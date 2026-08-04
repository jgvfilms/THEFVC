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
    // Throwaway secret so server/lib/encryption.ts (imported transitively by
    // every server test via server/migrate.ts) doesn't throw on a fresh
    // checkout. Never used for real data — see tests/db-setup.ts for the
    // rest of the self-bootstrapping (schema + per-file DATABASE_PATH).
    env: {
      ENCRYPTION_KEY: "0".repeat(64),
    },
    // tests/db-setup.ts must run first: it sets DATABASE_PATH and bootstraps
    // the schema before the test file's own imports (e.g. tests/server.ts ->
    // server/migrate.ts) run against it.
    setupFiles: ["./tests/db-setup.ts", "./tests/setup.ts"],
    // Test files each get their own SQLite DB (tests/db-setup.ts) and truncate
    // their tables in beforeEach, but that isolation relies on Vitest's default
    // per-file module isolation. Keep file execution serialized so behavior
    // stays deterministic rather than depending on worker-pool scheduling.
    fileParallelism: false,
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
