import { defineConfig } from "drizzle-kit";

// Must stay in sync with server/migrate.ts, which is what the running
// app actually connects to. Both fall back to the same relative default.
const dbPath = process.env.DATABASE_PATH || "./data.db";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
