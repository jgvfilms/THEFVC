/**
 * Self-bootstrapping test database setup for THEFVC.IS (PRD-008: Testing & CI).
 *
 * Runs as a Vitest setupFile — Vitest executes setupFiles before the test
 * file itself is imported, so this runs before any test file pulls in
 * `server/migrate.ts` (via `tests/server.ts`), which is the module that
 * opens `process.env.DATABASE_PATH` and requires `ENCRYPTION_KEY` to exist.
 *
 * Without this, a fresh checkout has neither:
 *  - ENCRYPTION_KEY: server/lib/encryption.ts throws at import time if unset.
 *  - A database schema: the base tables (users, profiles, productions, etc.)
 *    are created by `drizzle-kit push` and data.db is gitignored, so
 *    server/migrate.ts's idempotent ALTER/CREATE-IF-NOT-EXISTS calls fail
 *    against a brand-new/empty file with "no such table".
 *
 * This file fixes both, and also gives *each test file* its own SQLite
 * database (rather than one shared file). With `isolate: true` (Vitest's
 * default) every test file gets a fresh module registry, so this setup file
 * re-runs per file, and each run picks a fresh random DB path. That avoids
 * order-dependent failures from test files sharing fixture data (e.g. two
 * files both creating a user with the fixed "test@example.com" fixture
 * email) that mere serialization (--no-file-parallelism) doesn't fix.
 */
import Database from "better-sqlite3";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Fallback throwaway key — normally supplied via vitest.config.ts's test.env,
// but set here too so this file is self-sufficient if run standalone.
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = "0".repeat(64);
}

const dbPath = join(tmpdir(), `thefvc-test-${process.pid}-${randomUUID()}.db`);
process.env.DATABASE_PATH = dbPath;

// Bootstrap the base schema (the tables drizzle-kit push would normally
// create) before server/migrate.ts opens this file and tries to run its
// idempotent ALTER TABLE / CREATE TABLE IF NOT EXISTS statements against it.
const schemaSql = readFileSync(
  join(__dirname, "..", "migrations", "0000_abandoned_rhino.sql"),
  "utf8",
);
const bootstrapDb = new Database(dbPath);
bootstrapDb.exec(schemaSql);
bootstrapDb.close();

afterAll(() => {
  try {
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
  } catch {
    // Best-effort cleanup — not worth failing the run over a leftover temp file.
  }
});
