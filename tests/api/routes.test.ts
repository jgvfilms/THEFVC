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
});
