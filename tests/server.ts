/**
 * Test server helper for THEFVC.IS (PRD-008: Testing & CI).
 *
 * Boots the real Express + HTTP server in-process on an ephemeral port,
 * using a fresh in-memory SQLite database so tests are fully isolated.
 *
 * Usage:
 *   import { createTestServer } from "../server";
 *   const { app, baseUrl, close } = await createTestServer();
 *   // ... run supertest or fetch requests against baseUrl
 *   await close();
 */
import express, { type Express } from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { registerRoutes } from "../server/routes";
import { securityHeaders } from "../server/middleware/securityHeaders";
import { sanitize } from "../server/middleware/sanitize";
import { rateLimit } from "../server/middleware/rateLimit";

// Ensure migrations run against the test DB
import "../server/migrate";

let serverInstance: ReturnType<ReturnType<typeof createServer>["listen"]> | null = null;

/**
 * Create and start a test server on a random ephemeral port.
 * Returns the Express app, the base URL, and a close() function.
 */
export async function createTestServer(): Promise<{
  app: Express;
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const app = express();

  // Same middleware stack as server/index.ts
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(securityHeaders);
  app.use(sanitize);
  // Relaxed rate limit for tests — we don't want 429s
  app.use(rateLimit({ windowMs: 60 * 1000, max: 10000, identifier: "test" }));

  // Register all API routes
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  // Start on ephemeral port
  await new Promise<void>((resolve) => {
    serverInstance = httpServer.listen(0, "127.0.0.1", resolve);
  });

  const port = (serverInstance!.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    app,
    baseUrl,
    close: async () => {
      if (serverInstance) {
        await new Promise<void>((resolve) => serverInstance!.close(() => resolve()));
        serverInstance = null;
      }
    },
  };
}

/**
 * Seed the test database with a known user + invite for auth tests.
 * Returns the invite token and credentials.
 */
export function getTestCredentials() {
  return {
    handle: "testuser",
    email: "test@example.com",
    password: "TestPass123!",
    displayName: "Test User",
    role: "Director",
  };
}
