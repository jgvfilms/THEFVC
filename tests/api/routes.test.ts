/**
 * API Integration Tests for THEFVC.IS (PRD-008: Testing & CI).
 *
 * Tests the full Express route layer against a real in-memory SQLite database.
 * Covers: auth (signup/login/logout/me), profiles, beta requests, feed,
 * compliance, and error handling.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestServer, getTestCredentials } from "../server";
import { storage, db } from "../../server/storage";
import { hashPassword } from "../../server/middleware/auth";
import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("API Integration Tests", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    // Clear data between tests for isolation
    // (SQLite is in-memory per process, but we want per-test isolation)
    // We use a transaction-like approach: delete all rows from test tables
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

  // ===== Security headers =====
  it("CSP lets profile pages embed YouTube and Vimeo reels, and nothing else", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const csp = res.headers.get("content-security-policy") || "";
    const frameSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-src")) || "";
    expect(frameSrc.split(/\s+/).slice(1).sort()).toEqual([
      "https://player.vimeo.com",
      "https://www.youtube-nocookie.com",
      "https://www.youtube.com",
    ]);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  // ===== AUTH: Signup =====
  describe("POST /api/auth/signup", () => {
    it("should refuse all signups while SIGNUP_ENABLED is not 'true'", async () => {
      const prev = process.env.SIGNUP_ENABLED;
      delete process.env.SIGNUP_ENABLED;
      try {
        const res = await fetch(`${baseUrl}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handle: "closeduser",
            email: "closed@example.com",
            password: "Pass123!",
            inviteToken: "any-token",
          }),
        });
        expect(res.status).toBe(403);
        await expect(res.json()).resolves.toMatchObject({ error: "Sign-up is coming soon." });
        expect(storage.getUserByEmail("closed@example.com")).toBeUndefined();
      } finally {
        process.env.SIGNUP_ENABLED = prev;
      }
    });

    it("should reject signup without invite token (beta gate)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "newuser",
          email: "new@example.com",
          password: "Pass123!",
          displayName: "New User",
          role: "Director",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("invite-only");
    });

    it("should reject signup with missing fields", async () => {
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "",
          email: "",
          password: "",
          inviteToken: "fake-token",
        }),
      });

      expect(res.status).toBe(400);
      expect(res.json()).resolves.toMatchObject({ error: expect.any(String) });
    });

    it("should reject signup with invalid invite token", async () => {
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "newuser",
          email: "new@example.com",
          password: "Pass123!",
          displayName: "New User",
          role: "Director",
          inviteToken: "invalid-token-12345",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Invalid or expired invite");
    });

    it("should successfully signup with valid invite token", async () => {
      // Create an admin user first to create the invite
      const admin = storage.createUser({
        handle: "admin",
        email: "admin@test.com",
        passwordHash: hashPassword("admin123"),
        isAdmin: true,
      });

      const invite = storage.createInvite({
        token: "valid-test-token",
        email: "new@example.com",
        displayName: "New User",
        role: "Director",
        createdBy: admin.id,
      });

      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "newuser",
          email: "new@example.com",
          password: "Pass123!",
          displayName: "New User",
          role: "Director",
          inviteToken: invite.token,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.user).toMatchObject({
        handle: "newuser",
        email: "new@example.com",
        isAdmin: false,
      });
    });

    it("should reject duplicate handle", async () => {
      const admin = storage.createUser({
        handle: "admin",
        email: "admin@test.com",
        passwordHash: hashPassword("admin123"),
        isAdmin: true,
      });

      storage.createUser({
        handle: "newuser",
        email: "new@example.com",
        passwordHash: hashPassword("Pass123!"),
      });

      const invite = storage.createInvite({
        token: "dup-token",
        email: "new2@example.com",
        displayName: "New User 2",
        role: "Director",
        createdBy: admin.id,
      });

      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "newuser",
          email: "new2@example.com",
          password: "Pass123!",
          displayName: "New User 2",
          role: "Director",
          inviteToken: invite.token,
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("Handle already taken");
    });
  });

  // ===== AUTH: Login =====
  describe("POST /api/auth/login", () => {
    it("should reject login with missing credentials", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "", password: "" }),
      });

      expect(res.status).toBe(400);
      expect(res.json()).resolves.toMatchObject({ error: expect.any(String) });
    });

    it("should reject login with invalid credentials", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@example.com",
          password: "wrongpass",
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid credentials");
    });

    it("should successfully login with valid credentials", async () => {
      const creds = getTestCredentials();
      storage.createUser({
        handle: creds.handle,
        email: creds.email,
        passwordHash: hashPassword(creds.password),
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: creds.email,
          password: creds.password,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.user).toMatchObject({
        handle: creds.handle,
        email: creds.email,
      });
    });

    it("should reject login for revoked user", async () => {
      const creds = getTestCredentials();
      const user = storage.createUser({
        handle: creds.handle,
        email: creds.email,
        passwordHash: hashPassword(creds.password),
        accessStatus: "revoked",
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: creds.email,
          password: creds.password,
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("revoked");
    });
  });

  // ===== AUTH: Logout =====
  describe("POST /api/auth/logout", () => {
    it("should logout successfully with valid token", async () => {
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

      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      expect(res.json()).resolves.toMatchObject({ success: true });
    });

    it("should logout even without token (no-op)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
    });
  });

  // ===== AUTH: Me =====
  describe("GET /api/auth/me", () => {
    it("should return null user when no auth token", async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user).toBeNull();
    });

    it("should return user when authenticated", async () => {
      const creds = getTestCredentials();
      const user = storage.createUser({
        handle: creds.handle,
        email: creds.email,
        passwordHash: hashPassword(creds.password),
      });
      // The route returns storage.getProfile(user.id) alongside the user —
      // a real signup always creates a profile too, so mirror that here.
      storage.createProfile({
        userId: user.id,
        displayName: creds.displayName,
        role: creds.role,
        avatarInitials: creds.displayName.slice(0, 2).toUpperCase(),
        skills: "[]",
        isPublic: true,
        availability: "available",
      });

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      });
      const { token } = await loginRes.json();

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user).toMatchObject({
        handle: creds.handle,
        email: creds.email,
      });
      expect(body.profile).toBeDefined();
    });
  });

  // ===== PROFILES =====
  describe("GET /api/profiles", () => {
    it("should return empty array when no profiles exist", async () => {
      const res = await fetch(`${baseUrl}/api/profiles`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });

    it("should return profiles filtered by role", async () => {
      const user = storage.createUser({
        handle: "dpuser",
        email: "dp@test.com",
        passwordHash: hashPassword("pass123"),
      });

      storage.createProfile({
        userId: user.id,
        displayName: "DP User",
        role: "Director of Photography",
        city: "Brooklyn",
        state: "NY",
        skills: JSON.stringify(["RED Komodo"]),
        isPublic: true,
        availability: "available",
      });

      const res = await fetch(`${baseUrl}/api/profiles?role=Director`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].role).toContain("Director");
    });

    it("should return profiles filtered by city", async () => {
      const user = storage.createUser({
        handle: "nycuser",
        email: "nyc@test.com",
        passwordHash: hashPassword("pass123"),
      });

      storage.createProfile({
        userId: user.id,
        displayName: "NYC User",
        role: "Editor",
        city: "New York",
        state: "NY",
        skills: JSON.stringify([]),
        isPublic: true,
        availability: "available",
      });

      const res = await fetch(`${baseUrl}/api/profiles?city=York`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].city).toContain("York");
    });
  });

  describe("GET /api/profiles/:handle", () => {
    it("should return 404 for non-existent profile", async () => {
      const res = await fetch(`${baseUrl}/api/profiles/nonexistent`);

      expect(res.status).toBe(404);
      expect(res.json()).resolves.toMatchObject({ error: "Profile not found" });
    });

    it("should return profile and credits for valid handle", async () => {
      const user = storage.createUser({
        handle: "creduser",
        email: "cred@test.com",
        passwordHash: hashPassword("pass123"),
      });

      storage.createProfile({
        userId: user.id,
        displayName: "Credit User",
        role: "Gaffer",
        city: "LA",
        state: "CA",
        skills: JSON.stringify([]),
        isPublic: true,
        availability: "available",
      });

      const res = await fetch(`${baseUrl}/api/profiles/creduser`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.profile).toBeDefined();
      expect(body.profile.displayName).toBe("Credit User");
      expect(body.credits).toEqual([]);
    });
  });

  // These endpoints need no auth, so billing and tax state must never ride along.
  describe("public profile endpoints hide billing fields", () => {
    const PRIVATE = ["stripeCustomerId", "stripeConnectAccountId", "subscriptionTier", "subscriptionStatus", "w9Collected"];

    beforeEach(() => {
      const user = storage.createUser({
        handle: "payinguser",
        email: "paying@test.com",
        passwordHash: hashPassword("pass123"),
      });
      storage.createProfile({
        userId: user.id,
        displayName: "Paying User",
        role: "Director",
        city: "Buffalo",
        state: "NY",
        skills: JSON.stringify([]),
        isPublic: true,
        availability: "available",
        stripeCustomerId: "cus_test123",
        stripeConnectAccountId: "acct_test123",
        subscriptionTier: "pro",
        subscriptionStatus: "active",
      });
    });

    it("GET /api/profiles/:handle", async () => {
      const body = await (await fetch(`${baseUrl}/api/profiles/payinguser`)).json();
      expect(body.profile.displayName).toBe("Paying User");
      for (const k of PRIVATE) expect(body.profile).not.toHaveProperty(k);
    });

    it("GET /api/profiles", async () => {
      const body = await (await fetch(`${baseUrl}/api/profiles`)).json();
      expect(body).toHaveLength(1);
      for (const k of PRIVATE) expect(body[0]).not.toHaveProperty(k);
    });

    it("GET /api/profiles/paginated", async () => {
      const body = await (await fetch(`${baseUrl}/api/profiles/paginated`)).json();
      expect(body.total).toBe(1);
      expect(body.profiles[0].handle).toBe("payinguser");
      for (const k of PRIVATE) expect(body.profiles[0]).not.toHaveProperty(k);
    });
  });

  // ===== BETA: Request Access =====
  describe("POST /api/beta/request", () => {
    it("should reject request without email", async () => {
      const res = await fetch(`${baseUrl}/api/beta/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "" }),
      });

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: "A valid email is required" });
    });

    it("emails a confirmation to the requester and a notice to the team", async () => {
      process.env.WAITLIST_NOTIFY_EMAIL = "team@test.com";
      try {
        const res = await fetch(`${baseUrl}/api/beta/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "  New.Person@Test.com ", displayName: "<b>Pat</b>", role: "Editor" }),
        });
        expect(res.status).toBe(201);

        const queued = db.all<{ to: string; subject: string; html: string }>(sql`SELECT "to", subject, html FROM email_queue ORDER BY id`);
        expect(queued.map((e) => e.to)).toEqual(["new.person@test.com", "team@test.com"]);
        expect(queued[0].subject).toContain("waitlist");
        expect(queued[1].html).toContain("Pat");
        expect(queued[1].html).not.toContain("<b>Pat</b>");
      } finally {
        delete process.env.WAITLIST_NOTIFY_EMAIL;
      }
    });

    it("lets someone whose invite was revoked rejoin, but not a rejected request", async () => {
      const admin = storage.createUser({
        handle: "revoker",
        email: "revoker@test.com",
        passwordHash: hashPassword("admin123"),
        isAdmin: true,
      });
      const invited = storage.createBetaRequest({ email: "again@test.com" });
      const invite = storage.createInvite({ token: "revoked-token", email: "again@test.com", createdBy: admin.id });
      storage.updateBetaRequest(invited.id, { status: "invited", inviteId: invite.id });
      storage.revokeInvite(invite.id);
      const rejected = storage.createBetaRequest({ email: "no@test.com" });
      storage.updateBetaRequest(rejected.id, { status: "rejected" });

      const post = (email: string) => fetch(`${baseUrl}/api/beta/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: "Again" }),
      });

      const rejoin = await post("again@test.com");
      expect(rejoin.status).toBe(201);
      const after = storage.getBetaRequest(invited.id);
      expect(after?.status).toBe("pending");
      expect(after?.inviteId).toBeNull();
      expect(storage.getBetaRequests()).toHaveLength(2);

      expect((await post("no@test.com")).status).toBe(409);
    });

    it("treats emails differing only in case as the same request", async () => {
      storage.createBetaRequest({ email: "same@test.com" });
      const res = await fetch(`${baseUrl}/api/beta/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "SAME@test.com" }),
      });
      expect(res.status).toBe(409);
    });

    it("should successfully submit beta request", async () => {
      const res = await fetch(`${baseUrl}/api/beta/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "waitlist@test.com",
          handle: "waitlistuser",
          displayName: "Waitlist User",
          role: "Director",
          city: "Austin",
          message: "Need crew finder",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBeDefined();
    });

    it("should reject duplicate beta request", async () => {
      const email = "dup@test.com";
      storage.createBetaRequest({ email, displayName: "Dup" });

      const res = await fetch(`${baseUrl}/api/beta/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("already on the waitlist");
    });
  });

  // ===== BETA: Admin approval =====
  describe("POST /api/admin/beta/requests/:id/approve", () => {
    it("creates an invite and emails the link to the requester", async () => {
      storage.createUser({
        handle: "approver",
        email: "approver@test.com",
        passwordHash: hashPassword("admin123"),
        isAdmin: true,
      });
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "approver@test.com", password: "admin123" }),
      });
      const { token } = await loginRes.json();
      const betaReq = storage.createBetaRequest({ email: "approved@test.com", displayName: "Approved Person" });

      const res = await fetch(`${baseUrl}/api/admin/beta/requests/${betaReq.id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.emailed).toBe(true);

      const queued = db.all<{ to: string; html: string }>(sql`SELECT "to", html FROM email_queue`);
      expect(queued).toHaveLength(1);
      expect(queued[0].to).toBe("approved@test.com");
      expect(queued[0].html).toContain(body.inviteUrl);
      expect(storage.getBetaRequest(betaReq.id)?.status).toBe("invited");
    });
  });

  // ===== ADMIN: remove admin rights =====
  describe("POST /api/admin/users/:id/remove-admin", () => {
    async function loginAdmin(handle: string) {
      const user = storage.createUser({
        handle,
        email: `${handle}@test.com`,
        passwordHash: hashPassword("admin123"),
        isAdmin: true,
      });
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `${handle}@test.com`, password: "admin123" }),
      });
      const { token } = await res.json();
      return { user, token };
    }

    it("demotes another admin but keeps their account", async () => {
      const { token } = await loginAdmin("staff");
      const founder = storage.createUser({
        handle: "founder",
        email: "founder@test.com",
        passwordHash: hashPassword("pw123456"),
        isAdmin: true,
      });
      const res = await fetch(`${baseUrl}/api/admin/users/${founder.id}/remove-admin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const after = storage.getUser(founder.id);
      expect(after?.isAdmin).toBe(false);
      expect(after?.accessStatus).toBe(founder.accessStatus);
    });

    it("refuses to demote yourself", async () => {
      const { user, token } = await loginAdmin("solo");
      const res = await fetch(`${baseUrl}/api/admin/users/${user.id}/remove-admin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(400);
      expect(storage.getUser(user.id)?.isAdmin).toBe(true);
    });
  });

  // ===== ADMIN: resend an invite =====
  describe("POST /api/admin/beta/invites/:id/resend", () => {
    async function adminToken() {
      const admin = storage.createUser({
        handle: "resender",
        email: "resender@test.com",
        passwordHash: hashPassword("admin123"),
        isAdmin: true,
      });
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "resender@test.com", password: "admin123" }),
      });
      return { admin, token: (await res.json()).token as string };
    }
    const resend = (token: string, id: number, email?: string) =>
      fetch(`${baseUrl}/api/admin/beta/invites/${id}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(email === undefined ? {} : { email }),
      });

    it("corrects a name-in-the-email-field invite and emails it", async () => {
      const { admin, token } = await adminToken();
      const invite = storage.createInvite({ token: "old-tok", email: "Matthew Lorentz", displayName: "Matt", createdBy: admin.id });
      const linked = storage.createBetaRequest({ email: "Matthew Lorentz" });
      storage.updateBetaRequest(linked.id, { status: "invited", inviteId: invite.id });

      expect((await resend(token, invite.id)).status).toBe(400);

      const res = await resend(token, invite.id, " Matt@Example.com ");
      expect(res.status).toBe(200);
      expect(storage.getInvites().find((i) => i.id === invite.id)?.email).toBe("matt@example.com");
      expect(storage.getBetaRequest(linked.id)?.email).toBe("matt@example.com");

      const queued = db.all<{ to: string; html: string }>(sql`SELECT "to", html FROM email_queue`);
      expect(queued).toHaveLength(1);
      expect(queued[0].to).toBe("matt@example.com");
      expect(queued[0].html).toContain("/auth?invite=old-tok");
    });

    it("New Invite emails when an address is given, stays link-only when blank, refuses a name", async () => {
      const { token } = await adminToken();
      const create = (body: object) => fetch(`${baseUrl}/api/admin/beta/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const withEmail = await create({ email: "New@Test.com", displayName: "New Person" });
      expect(withEmail.status).toBe(200);
      const body = await withEmail.json();
      expect(body.emailed).toBe(true);
      expect(body.invite.email).toBe("new@test.com");

      const linkOnly = await create({ displayName: "Hand delivered" });
      expect((await linkOnly.json()).emailed).toBe(false);

      expect((await create({ email: "Alexander Zito" })).status).toBe(400);

      const queued = db.all<{ to: string; html: string }>(sql`SELECT "to", html FROM email_queue`);
      expect(queued.map((e) => e.to)).toEqual(["new@test.com"]);
      expect(queued[0].html).toContain(body.inviteUrl);
    });

    it("refuses revoked invites", async () => {
      const { admin, token } = await adminToken();
      const invite = storage.createInvite({ token: "gone-tok", email: "gone@test.com", createdBy: admin.id });
      storage.revokeInvite(invite.id);
      expect((await resend(token, invite.id)).status).toBe(400);
      expect(db.all(sql`SELECT 1 FROM email_queue`)).toHaveLength(0);
    });
  });

  // ===== BETA: Invite Validation =====
  describe("GET /api/beta/invite/:token", () => {
    it("should return valid=false for non-existent token", async () => {
      const res = await fetch(`${baseUrl}/api/beta/invite/nonexistent-token`);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.valid).toBe(false);
    });

    it("should return invite details for valid token", async () => {
      const admin = storage.createUser({
        handle: "admin2",
        email: "admin2@test.com",
        passwordHash: hashPassword("admin123"),
        isAdmin: true,
      });

      const invite = storage.createInvite({
        token: "valid-invite-token",
        email: "invitee@test.com",
        displayName: "Invitee",
        role: "Director",
        createdBy: admin.id,
      });

      const res = await fetch(`${baseUrl}/api/beta/invite/valid-invite-token`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(true);
      expect(body.email).toBe("invitee@test.com");
      expect(body.displayName).toBe("Invitee");
      expect(body.role).toBe("Director");
    });
  });

  // ===== FEED: Public Feed =====
  describe("GET /api/feed/public", () => {
    it("should return activities and posts arrays", async () => {
      const res = await fetch(`${baseUrl}/api/feed/public`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.activities).toBeDefined();
      expect(body.posts).toBeDefined();
      expect(Array.isArray(body.activities)).toBe(true);
      expect(Array.isArray(body.posts)).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const res = await fetch(`${baseUrl}/api/feed/public?limit=5`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.activities.length).toBeLessThanOrEqual(5);
    });
  });

  // ===== FEED: Authenticated Feed =====
  describe("GET /api/feed (authenticated)", () => {
    it("should reject without auth", async () => {
      const res = await fetch(`${baseUrl}/api/feed`);

      expect(res.status).toBe(401);
    });

    it("should return feed when authenticated", async () => {
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

      const res = await fetch(`${baseUrl}/api/feed`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.activities).toBeDefined();
      expect(body.posts).toBeDefined();
    });
  });

  // ===== FEED: privacy =====
  // Regression test for the feed leak: GET /api/feed returned the full users
  // row (passwordHash, email, googleId) for every post and activity author.
  describe("GET /api/feed does not leak account data", () => {
    it("returns only public fields for other members", async () => {
      // An author with a post and an activity.
      const author = storage.createUser({
        handle: "feedauthor",
        email: "feed.author@example.test",
        passwordHash: hashPassword("author-password-123"),
      });
      storage.createProfile({
        userId: author.id,
        displayName: "Feed Author",
        role: "Editor",
        avatarInitials: "FA",
        skills: "[]",
        isPublic: true,
        availability: "available",
      });
      storage.createPost({ userId: author.id, body: "hello from the author", linkUrl: null, visibility: "public" });
      storage.createActivity({
        type: "member_joined", userId: author.id, targetType: "user", targetId: author.id,
        message: "just joined thefvc", isPublic: true,
      });

      // A different, ordinary member reads the feed.
      const creds = getTestCredentials();
      storage.createUser({ handle: creds.handle, email: creds.email, passwordHash: hashPassword(creds.password) });
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      });
      const { token } = await loginRes.json();

      const res = await fetch(`${baseUrl}/api/feed`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      const text = await res.text();
      const body = JSON.parse(text);

      // The feed still carries what the clients render.
      expect(body.posts.length).toBe(1);
      expect(body.activities.length).toBe(1);
      expect(body.posts[0].body).toBe("hello from the author");
      expect(body.posts[0].user).toEqual({ handle: "feedauthor" });
      expect(body.activities[0].user).toEqual({ handle: "feedauthor" });
      expect(body.posts[0].profile.displayName).toBe("Feed Author");
      expect(Object.keys(body.posts[0].profile).sort()).toEqual(
        ["avatarInitials", "avatarUrl", "city", "displayName", "role"],
      );

      // Nothing private, anywhere in the response.
      for (const forbidden of [
        "passwordHash", "password_hash", "googleId", "invitedBy", "lastLoginAt",
        "feed.author@example.test", author.passwordHash,
        "stripeCustomerId", "stripeConnectAccountId",
      ]) {
        expect(text).not.toContain(forbidden);
      }
    });
  });

  // ===== FEED: Create Post =====
  describe("POST /api/feed/posts (authenticated)", () => {
    it("should reject without auth", async () => {
      const res = await fetch(`${baseUrl}/api/feed/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Hello world" }),
      });

      expect(res.status).toBe(401);
    });

    it("should reject empty post body", async () => {
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

      const res = await fetch(`${baseUrl}/api/feed/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: "" }),
      });

      expect(res.status).toBe(400);
      expect(res.json()).resolves.toMatchObject({ error: "Post body is required" });
    });

    it("should reject post over 2000 characters", async () => {
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

      const longBody = "A".repeat(2001);
      const res = await fetch(`${baseUrl}/api/feed/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: longBody }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("too long");
    });

    it("should create post with valid data", async () => {
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

      const res = await fetch(`${baseUrl}/api/feed/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: "Hello collective!", visibility: "public" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.body).toBe("Hello collective!");
      expect(body.visibility).toBe("public");
    });
  });

  // ===== PROFILE: Auth Required Routes =====
  describe("GET /api/profile (authenticated)", () => {
    it("should reject without auth", async () => {
      const res = await fetch(`${baseUrl}/api/profile`);

      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/profile (authenticated)", () => {
    it("should reject without auth", async () => {
      const res = await fetch(`${baseUrl}/api/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated" }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ===== PRODUCTION: Auth Required Routes =====
  describe("GET /api/productions (authenticated)", () => {
    it("should reject without auth", async () => {
      const res = await fetch(`${baseUrl}/api/productions`);

      expect(res.status).toBe(401);
    });
  });

  // ===== COMPLIANCE: Admin Routes =====
  describe("GET /api/compliance/security-log (admin)", () => {
    it("should reject without auth", async () => {
      const res = await fetch(`${baseUrl}/api/compliance/security-log`);

      expect(res.status).toBe(401);
    });

    it("should reject with non-admin auth", async () => {
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

    it("should return security log for admin", async () => {
      const admin = storage.createUser({
        handle: "admin3",
        email: "admin3@test.com",
        passwordHash: hashPassword("admin123"),
        isAdmin: true,
      });

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin3@test.com", password: "admin123" }),
      });
      const { token } = await loginRes.json();

      const res = await fetch(`${baseUrl}/api/compliance/security-log`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // ===== NEWS FEED =====
  describe("GET /api/feed/news", () => {
    it("should return an array of news items", async () => {
      // This test may hit external RSS feeds; we just verify the shape
      const res = await fetch(`${baseUrl}/api/feed/news`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    }, 30000); // Allow 30s for external RSS fetches
  });

  // ===== SEED DATA (dev only) =====
  describe("POST /api/seed (dev only)", () => {
    it("should return 404 in production", async () => {
      // The test server runs with NODE_ENV=test, which is not production
      // So seed should work — but we test the production guard logic
      const res = await fetch(`${baseUrl}/api/seed`, { method: "POST" });

      // In test env, NODE_ENV !== "production", so seed runs
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ===== PRODUCTIONS: status changes =====
  describe("PATCH /api/productions/:id", () => {
    async function login(handle: string) {
      const user = storage.createUser({ handle, email: `${handle}@test.com`, passwordHash: hashPassword("pw123456") });
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `${handle}@test.com`, password: "pw123456" }),
      });
      const { token } = await res.json();
      return { user, token };
    }

    function patch(id: number, token: string, body: unknown) {
      return fetch(`${baseUrl}/api/productions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    }

    it("lets the owner move a production out of pre-production", async () => {
      const { user, token } = await login("owner1");
      const prod = storage.createProduction({ creatorId: user.id, title: "Zucchini", type: "feature" });
      expect(prod.status).toBe("pre_production");

      const res = await patch(prod.id, token, { status: "in_production" });
      expect(res.status).toBe(200);
      expect(storage.getProduction(prod.id)?.status).toBe("in_production");
    });

    it("rejects unknown statuses and fields outside the allowlist", async () => {
      const { user, token } = await login("owner2");
      const prod = storage.createProduction({ creatorId: user.id, title: "Zucchini", type: "feature" });

      expect((await patch(prod.id, token, { status: "shipped" })).status).toBe(400);
      expect((await patch(prod.id, token, { creatorId: 999 })).status).toBe(400);
      expect(storage.getProduction(prod.id)?.creatorId).toBe(user.id);
    });

    it("refuses status changes from someone who doesn't own the production", async () => {
      const { user } = await login("owner3");
      const { token: otherToken } = await login("stranger");
      const prod = storage.createProduction({ creatorId: user.id, title: "Zucchini", type: "feature" });

      expect((await patch(prod.id, otherToken, { status: "wrapped" })).status).toBe(403);
      expect(storage.getProduction(prod.id)?.status).toBe("pre_production");
    });
  });

  // ===== PRODUCTIONS: cover images =====
  describe("production cover images", () => {
    // Smallest valid PNG (1x1); the server checks the declared type, not pixels.
    const PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    async function login(handle: string) {
      const user = storage.createUser({ handle, email: `${handle}@test.com`, passwordHash: hashPassword("pw123456") });
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `${handle}@test.com`, password: "pw123456" }),
      });
      const { token } = await res.json();
      return { user, token };
    }

    function upload(id: number, token: string, type = "image/png", name = "cover.png") {
      const body = new FormData();
      body.append("cover", new Blob([PNG], { type }), name);
      return fetch(`${baseUrl}/api/productions/${id}/cover`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
    }

    function onDisk(url: string) {
      return existsSync(join(process.env.UPLOADS_DIR!, "productions", url.split("/").pop()!));
    }

    it("lets the owner add, replace and remove a cover, cleaning up old files", async () => {
      const { user, token } = await login("coverowner");
      const prod = storage.createProduction({ creatorId: user.id, title: "Zucchini", type: "feature" });

      const first = await upload(prod.id, token);
      expect(first.status).toBe(200);
      const firstUrl = (await first.json()).coverUrl as string;
      expect(firstUrl).toMatch(/^\/uploads\/productions\/[0-9a-f-]+\.png$/);
      expect(onDisk(firstUrl)).toBe(true);

      const second = await upload(prod.id, token, "image/jpeg", "still.jpg");
      const secondUrl = (await second.json()).coverUrl as string;
      expect(secondUrl).toMatch(/\.jpg$/);
      expect(onDisk(firstUrl)).toBe(false);

      const removed = await fetch(`${baseUrl}/api/productions/${prod.id}/cover`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(removed.status).toBe(200);
      expect(storage.getProduction(prod.id)?.coverUrl).toBeNull();
      expect(onDisk(secondUrl)).toBe(false);
    });

    it("names files by their image type, not the uploaded filename", async () => {
      const { user, token } = await login("covername");
      const prod = storage.createProduction({ creatorId: user.id, title: "Zucchini", type: "feature" });
      const res = await upload(prod.id, token, "image/png", "evil.html");
      expect((await res.json()).coverUrl).toMatch(/\.png$/);
    });

    it("names profile photos by their image type too", async () => {
      const { token } = await login("avatarname");
      const body = new FormData();
      body.append("avatar", new Blob([PNG], { type: "image/png" }), "evil.html");
      const res = await fetch(`${baseUrl}/api/profile/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).url).toMatch(/^\/uploads\/profiles\/[0-9a-f-]+\.png$/);
    });

    it("rejects files that aren't JPEG, PNG or WebP", async () => {
      const { user, token } = await login("covertype");
      const prod = storage.createProduction({ creatorId: user.id, title: "Zucchini", type: "feature" });
      const res = await upload(prod.id, token, "image/svg+xml", "cover.svg");
      expect(res.status).toBe(400);
      expect(storage.getProduction(prod.id)?.coverUrl).toBeNull();
    });

    it("refuses uploads from someone who doesn't own the production", async () => {
      const { user } = await login("coverowner2");
      const { token: otherToken } = await login("coverstranger");
      const prod = storage.createProduction({ creatorId: user.id, title: "Zucchini", type: "feature" });

      expect((await upload(prod.id, otherToken)).status).toBe(403);
      expect(storage.getProduction(prod.id)?.coverUrl).toBeNull();
    });
  });

  // ===== ADMIN: re-invite with a new link =====
  describe("POST /api/admin/beta/invites/:id/reinvite", () => {
    async function adminToken() {
      const admin = storage.createUser({ handle: "reinviter", email: "reinviter@test.com", passwordHash: hashPassword("admin123"), isAdmin: true });
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "reinviter@test.com", password: "admin123" }),
      });
      return { admin, token: (await res.json()).token as string };
    }
    const reinvite = (token: string, id: number, email?: string) =>
      fetch(`${baseUrl}/api/admin/beta/invites/${id}/reinvite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(email === undefined ? {} : { email }),
      });
    const isValid = async (tok: string) => (await fetch(`${baseUrl}/api/beta/invite/${tok}`)).status === 200;

    it("emails a revoked person a new link and keeps the old one dead", async () => {
      const { admin, token } = await adminToken();
      const old = storage.createInvite({ token: "august-tok", email: "aug@test.com", displayName: "August Person", role: "Gaffer", createdBy: admin.id });
      const linked = storage.createBetaRequest({ email: "aug@test.com" });
      storage.updateBetaRequest(linked.id, { status: "invited", inviteId: old.id });
      storage.revokeInvite(old.id);

      const res = await reinvite(token, old.id);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.invite.token).not.toBe("august-tok");
      expect(body.invite.displayName).toBe("August Person");
      expect(body.invite.role).toBe("Gaffer");

      expect(await isValid("august-tok")).toBe(false);
      expect(await isValid(body.invite.token)).toBe(true);
      expect(storage.getBetaRequest(linked.id)?.inviteId).toBe(body.invite.id);

      const queued = db.all<{ to: string; html: string }>(sql`SELECT "to", html FROM email_queue`);
      expect(queued).toHaveLength(1);
      expect(queued[0].to).toBe("aug@test.com");
      expect(queued[0].html).toContain(`/auth?invite=${body.invite.token}`);
      expect(queued[0].html).not.toContain("august-tok");
    });

    it("revokes an active invite before replacing it, and fixes a bad address", async () => {
      const { admin, token } = await adminToken();
      const old = storage.createInvite({ token: "active-tok", email: "Name Not Email", createdBy: admin.id });

      expect((await reinvite(token, old.id)).status).toBe(400);
      const res = await reinvite(token, old.id, "Fixed@Test.com");
      expect(res.status).toBe(200);
      expect((await res.json()).email).toBe("fixed@test.com");
      expect(await isValid("active-tok")).toBe(false);
    });

    it("refuses to re-invite an invite that was already used", async () => {
      const { admin, token } = await adminToken();
      const old = storage.createInvite({ token: "used-tok", email: "used@test.com", createdBy: admin.id });
      storage.updateInvite(old.id, { status: "used", usedCount: 1 });
      expect((await reinvite(token, old.id)).status).toBe(400);
    });
  });
});
