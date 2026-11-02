/**
 * PATCH /api/profile.
 *
 * The body used to be passed straight to the database, so a member could
 * upgrade their own subscription by adding a key; and saving a profile whose
 * video links were stored as objects threw a 500 after the write.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { storage, db } from "../../server/storage";
import { sqlite } from "../../server/migrate";
import { hashPassword, generateToken } from "../../server/middleware/auth";
import { createTestServer } from "../server";

let baseUrl: string;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ baseUrl, close } = await createTestServer());
});
afterAll(async () => {
  await close();
});

beforeEach(() => {
  for (const table of ["activity_feed", "credits", "profiles", "sessions", "users"]) {
    try {
      db.run(`DELETE FROM ${table}`);
    } catch {
      /* table absent in this bootstrap */
    }
  }
});

function makeMember(handle = "patchy") {
  const user = storage.createUser({
    handle,
    email: `${handle}@example.com`,
    passwordHash: hashPassword("TestPass123!"),
    isAdmin: false,
    accessStatus: "active",
    invitedBy: null,
  });
  storage.createProfile({ userId: user.id, displayName: handle, role: "Director" });
  const token = generateToken();
  storage.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 86400000) });
  return { user, token };
}

const patch = (token: string, body: unknown) =>
  fetch(`${baseUrl}/api/profile`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/profile", () => {
  it("ignores fields the server owns", async () => {
    const { user, token } = makeMember();
    const res = await patch(token, {
      bio: "hello",
      subscriptionTier: "pro_plus",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_fake",
      stripeConnectAccountId: "acct_fake",
      w9Collected: true,
      avatarUrl: "https://evil.example/x.png",
      userId: 999,
    });
    expect(res.status).toBe(200);
    const p = storage.getProfile(user.id)!;
    expect(p.bio).toBe("hello");
    expect(p.subscriptionTier).toBe("free");
    expect(p.subscriptionStatus).toBe("inactive");
    expect(p.stripeCustomerId).toBeNull();
    expect(p.stripeConnectAccountId).toBeNull();
    expect(p.w9Collected).toBeFalsy();
    expect(p.avatarUrl).toBeNull();
    expect(p.userId).toBe(user.id);
  });

  it("rejects non-http(s) links", async () => {
    const { user, token } = makeMember();
    for (const key of ["reelUrl", "imdbUrl", "websiteUrl"]) {
      expect((await patch(token, { [key]: "javascript:alert(1)" })).status).toBe(400);
    }
    expect(storage.getProfile(user.id)!.reelUrl).toBeNull();
  });

  it("rejects malformed JSON-column values and bad enums", async () => {
    const { token } = makeMember();
    expect((await patch(token, { skills: "not json" })).status).toBe(400);
    expect((await patch(token, { socialLinks: JSON.stringify(["x"]) })).status).toBe(400);
    expect((await patch(token, { availability: "whenever" })).status).toBe(400);
  });

  it("accepts what the profile editor sends", async () => {
    const { user, token } = makeMember();
    const res = await patch(token, {
      displayName: "New Name", role: "DP", city: "Austin", state: "TX", bio: "b", dayRate: 800,
      availability: "booked", themePreset: "darkroom", reelUrl: "https://vimeo.com/1", imdbUrl: "", websiteUrl: "",
      skills: JSON.stringify(["RED"]), socialLinks: JSON.stringify({ instagram: "https://instagram.com/x" }),
    });
    expect(res.status).toBe(200);
    const p = storage.getProfile(user.id)!;
    expect(p.displayName).toBe("New Name");
    expect(p.dayRate).toBe(800);
    expect(p.availability).toBe("booked");
  });

  it("saves object-shaped video links without a 500 and records one activity per new video", async () => {
    const { token } = makeMember();
    const first = [{ provider: "youtube", url: "https://www.youtube.com/watch?v=abc", title: "Reel" }];
    expect((await patch(token, { videoLinks: JSON.stringify(first) })).status).toBe(200);
    const second = [...first, { provider: "vimeo", url: "https://vimeo.com/123", title: "Short" }];
    expect((await patch(token, { videoLinks: JSON.stringify(second) })).status).toBe(200);

    const rows = sqlite.prepare("SELECT metadata FROM activity_feed WHERE type = 'video_shared' ORDER BY id").all() as Array<{ metadata: string }>;
    expect(rows.map((r) => JSON.parse(r.metadata).url)).toEqual(["https://www.youtube.com/watch?v=abc", "https://vimeo.com/123"]);
  });

  it("still handles legacy bare-URL video entries", async () => {
    const { token } = makeMember();
    expect((await patch(token, { videoLinks: JSON.stringify(["https://vimeo.com/9"]) })).status).toBe(200);
  });
});
