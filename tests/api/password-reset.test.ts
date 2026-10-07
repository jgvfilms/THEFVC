/**
 * Password reset round trip, end to end through the endpoints the
 * /auth "Forgot password?" form and the /reset-password page call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestServer } from "../server";
import { storage, db } from "../../server/storage";
import { hashPassword } from "../../server/middleware/auth";
import { passwordResets } from "@shared/schema";

describe("Password reset", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;

  const email = "reset.me@example.test";
  const oldPassword = "old-password-123";
  const newPassword = "new-password-456";

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const login = (password: string) => post("/api/auth/login", { email, password });
  const latestToken = () => {
    const rows = db.select().from(passwordResets).all();
    return rows[rows.length - 1]?.token;
  };

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    for (const t of ["password_resets", "email_queue", "security_audit_log", "sessions", "profiles", "users"]) {
      try { db.run(`DELETE FROM ${t}`); } catch { /* table may not exist */ }
    }
    storage.createUser({ handle: "resetme", email, passwordHash: hashPassword(oldPassword) });
  });

  it("request answers identically for known and unknown emails", async () => {
    const known = await post("/api/auth/password-reset/request", { email: "Reset.Me@example.test" });
    const unknown = await post("/api/auth/password-reset/request", { email: "nobody@example.test" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    // Only the real account got a token.
    expect(db.select().from(passwordResets).all()).toHaveLength(1);
  });

  it("request rejects a missing email", async () => {
    const res = await post("/api/auth/password-reset/request", {});
    expect(res.status).toBe(400);
  });

  it("confirm sets the new password and the token works only once", async () => {
    await post("/api/auth/password-reset/request", { email });
    const token = latestToken();
    expect(token).toBeTruthy();

    const res = await post("/api/auth/password-reset/confirm", { token, password: newPassword });
    expect(res.status).toBe(200);

    expect((await login(newPassword)).status).toBe(200);
    expect((await login(oldPassword)).status).toBe(401);

    const reuse = await post("/api/auth/password-reset/confirm", { token, password: "another-password-789" });
    expect(reuse.status).toBe(400);
    expect((await reuse.json()).error).toBe("Invalid or expired token");
  });

  it("confirm rejects an unknown token", async () => {
    const res = await post("/api/auth/password-reset/confirm", { token: "not-a-real-token", password: newPassword });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid or expired token");
    expect((await login(oldPassword)).status).toBe(200);
  });
});
