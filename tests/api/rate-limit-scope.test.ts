/**
 * Regression test: an auth rate-limit block (login/signup/password-reset)
 * must only affect those auth endpoints, not the whole API. Before this
 * fix, exceeding the login limit called blockIp() with no scope, and
 * isIpBlocked() was checked unscoped at the top of every rateLimit()
 * instance in the app — including the ones guarding payments, and every
 * other route via routes.ts. A user locked out of logging in was locked
 * out of the entire site, not just auth.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer } from "../server";

describe("Rate-limit block scoping (auth endpoints only)", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;
  let priorMultiplier: string | undefined;

  beforeAll(async () => {
    // tests/server.ts relaxes rate limits for the suite at large; this test
    // is specifically about the limiter firing, so put the real production
    // limits back for its duration (and restore after, so we don't leak the
    // strict value into any other test file sharing this worker process).
    priorMultiplier = process.env.RATE_LIMIT_MAX_MULTIPLIER;
    process.env.RATE_LIMIT_MAX_MULTIPLIER = "1";

    server = await createTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
    if (priorMultiplier === undefined) {
      delete process.env.RATE_LIMIT_MAX_MULTIPLIER;
    } else {
      process.env.RATE_LIMIT_MAX_MULTIPLIER = priorMultiplier;
    }
  });

  it("blocks the auth endpoints after exceeding the login limit, but leaves the rest of the API reachable", async () => {
    // Login's limit is max 10 requests per window — the 11th request
    // triggers the auto-block (see server/routes.ts's rateLimit() call).
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);

    // Now blocked: a further login attempt gets 403 (blocked), not another 401.
    const blockedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
    });
    expect(blockedLogin.status).toBe(403);
    const blockedBody = await blockedLogin.json();
    expect(blockedBody.error).toContain("blocked");

    // Signup shares the "auth" scope — also blocked, by design.
    const blockedSignup = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "x", email: "x@example.com", password: "x", inviteToken: "fake" }),
    });
    expect(blockedSignup.status).toBe(403);

    // But routes outside the "auth" scope are unaffected — this is the actual
    // bug being guarded against: browsing public profiles must still work for
    // someone who just got locked out of logging in.
    // (Deliberately not asserting on /api/health here — its disk check shells
    // out to `df -BG`, which is GNU-only and fails on macOS, so it would make
    // this test fail for a reason unrelated to rate-limit scoping.)
    const profiles = await fetch(`${baseUrl}/api/profiles`);
    expect(profiles.status).toBe(200);

    const publicFeed = await fetch(`${baseUrl}/api/feed/public`);
    expect(publicFeed.status).toBe(200);
  });
});
