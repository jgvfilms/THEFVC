/**
 * Regression test for PRD_024_HARDENING_VERIFICATION.md section 3.2:
 *
 * storage.ts's escapeLike() writes a literal backslash in front of `%`/`_`
 * to prevent wildcard injection, but a plain Drizzle like() call has no
 * ESCAPE clause attached, so SQLite treats that backslash as an ordinary
 * character rather than an escape — meaning a search for a role/city/skill
 * that legitimately contains a literal `%` or `_` silently returns zero
 * results instead of matching. Both searchProfiles() (used by
 * GET /api/profiles) and searchProfilesPaginated() (used by
 * GET /api/profiles/paginated) had this bug.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer } from "../server";
import { storage } from "../../server/storage";
import { hashPassword } from "../../server/middleware/auth";

describe("Search LIKE-escaping regression (PRD-024 section 3.2)", () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    baseUrl = server.baseUrl;

    // A role containing a literal '%' — the exact character escapeLike()
    // is supposed to make safe to search for, not accidentally unsearchable.
    const percentUser = storage.createUser({
      handle: "percentsearchuser",
      email: "percent-search@example.com",
      passwordHash: hashPassword("Pass123!"),
    });
    storage.createProfile({
      userId: percentUser.id,
      displayName: "Percent Test",
      role: "50% Off Editor",
      city: "Test City",
      avatarInitials: "PT",
      skills: JSON.stringify(["Color_Grading"]),
      isPublic: true,
      availability: "available",
    });

    // A distractor row that must NOT match a search for the literal '%'
    // string above — proves the escape isn't just matching everything.
    const distractorUser = storage.createUser({
      handle: "percentdistractor",
      email: "percent-distractor@example.com",
      passwordHash: hashPassword("Pass123!"),
    });
    storage.createProfile({
      userId: distractorUser.id,
      displayName: "Distractor",
      role: "50X Off Editor",
      city: "Test City",
      avatarInitials: "DT",
      skills: JSON.stringify(["Editing"]),
      isPublic: true,
      availability: "available",
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/profiles matches a role containing a literal '%'", async () => {
    const res = await fetch(`${baseUrl}/api/profiles?role=${encodeURIComponent("50%")}`);
    expect(res.status).toBe(200);
    const results = await res.json();
    const roles = results.map((p: any) => p.role);
    expect(roles).toContain("50% Off Editor");
    expect(roles).not.toContain("50X Off Editor");
  });

  it("GET /api/profiles/paginated matches a role containing a literal '%'", async () => {
    const res = await fetch(`${baseUrl}/api/profiles/paginated?role=${encodeURIComponent("50%")}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const roles = body.profiles.map((p: any) => p.role);
    expect(roles).toContain("50% Off Editor");
    expect(roles).not.toContain("50X Off Editor");
  });

  it("GET /api/profiles/paginated matches a skill containing a literal '_'", async () => {
    const res = await fetch(`${baseUrl}/api/profiles/paginated?skill=${encodeURIComponent("Color_Grading")}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const displayNames = body.profiles.map((p: any) => p.displayName);
    expect(displayNames).toContain("Percent Test");
  });
});
