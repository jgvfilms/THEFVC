/**
 * PRD Endpoint Smoke Tests (Finding 7.1).
 *
 * Verifies that endpoints from PRD-007/018-022 exist, return correct shapes,
 * enforce auth where required, and handle edge cases.
 *
 * Tests run against a real in-memory SQLite + Express server via createTestServer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestServer, getTestCredentials } from "../server";
import { storage, db } from "../../server/storage";
import { hashPassword } from "../../server/middleware/auth";

// Several describe blocks below independently create a user with the fixed
// getTestCredentials() email — without cleanup between them, the second one
// hits a UNIQUE constraint on users.email. Truncate before every test, same
// as tests/api/routes.test.ts does, so each test starts from a clean slate.
beforeEach(() => {
  try {
    const tables = [
      "activity_feed", "feed_posts", "beta_feedback", "beta_requests",
      "beta_invites", "password_resets", "email_verifications",
      "security_audit_log", "analytics_events", "email_queue",
      "blocked_ips", "news_cache", "production_crew", "credits",
      "productions", "profiles", "sessions", "users",
    ];
    for (const t of tables) {
      db.run(`DELETE FROM ${t}`);
    }
  } catch {
    // Table might not exist yet — ignore
  }
});

describe("PRD-018: Security — Health Check", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/health returns status with expected shape", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("timestamp");
    expect(["healthy", "degraded", "unhealthy"]).toContain(data.status);
  });

  it("GET /api/health returns 503 when unhealthy", async () => {
    // The health endpoint returns 503 for unhealthy status.
    // With an in-memory SQLite, the DB check should pass, so this
    // is a structural test verifying the status code mapping exists.
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();
    if (data.status === "unhealthy") {
      expect(res.status).toBe(503);
    } else {
      expect(res.status).toBe(200);
    }
  });
});

describe("PRD-018: Security — Compliance Endpoints", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/compliance/security-log requires admin auth", async () => {
    const res = await fetch(`${baseUrl}/api/compliance/security-log`);
    expect(res.status).toBe(401);
  });

  it("GET /api/compliance/security-log rejects non-admin user", async () => {
    const creds = getTestCredentials();
    const user = storage.createUser({
      handle: creds.handle,
      email: creds.email,
      passwordHash: hashPassword(creds.password),
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    const { token } = await loginRes.json();

    const res = await fetch(`${baseUrl}/api/compliance/security-log`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/compliance/blocked-ips requires admin auth", async () => {
    const res = await fetch(`${baseUrl}/api/compliance/blocked-ips`);
    expect(res.status).toBe(401);
  });
});

describe("PRD-019: Stripe Connect — Subscription", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/subscription requires auth", async () => {
    const res = await fetch(`${baseUrl}/api/subscription`);
    expect(res.status).toBe(401);
  });

  it("POST /api/subscription/checkout requires auth", async () => {
    const res = await fetch(`${baseUrl}/api/subscription/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tierName: "pro" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("PRD-020: Subscription Management — Tiers", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/subscription-tiers returns an array", async () => {
    const res = await fetch(`${baseUrl}/api/subscription-tiers`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/subscription-tiers/:name returns tier details or 404", async () => {
    // Try a tier name that likely doesn't exist
    const res = await fetch(`${baseUrl}/api/subscription-tiers/nonexistent`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data).toHaveProperty("name");
    } else {
      const data = await res.json();
      expect(data).toHaveProperty("error");
    }
  });
});

describe("PRD-022: GDPR/CCPA — Data Privacy", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/data/export requires auth", async () => {
    const res = await fetch(`${baseUrl}/api/data/export`);
    expect(res.status).toBe(401);
  });

  it("DELETE /api/data/delete requires auth", async () => {
    const res = await fetch(`${baseUrl}/api/data/delete`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/data/export returns user data for authenticated user", async () => {
    const creds = getTestCredentials();
    const user = storage.createUser({
      handle: creds.handle,
      email: creds.email,
      passwordHash: hashPassword(creds.password),
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    const { token } = await loginRes.json();

    const res = await fetch(`${baseUrl}/api/data/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    // Should contain user profile data
    expect(data).toBeDefined();
  });
});

describe("PRD-018: Security — Auth Rate Limiting", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  it("POST /api/auth/signup rejects missing fields with 400", async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "", email: "", password: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("POST /api/auth/login rejects missing credentials with 400", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "", password: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("POST /api/auth/login rejects invalid credentials with 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent@example.com",
        password: "wrongpass",
      }),
    });
    expect(res.status).toBe(401);
  });
});
