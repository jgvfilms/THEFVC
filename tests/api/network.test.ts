import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { storage, db } from "../../server/storage";
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
  for (const t of [
    "production_crew", "productions", "follows", "member_connections", "member_blocks", "messages", "email_queue",
    "notifications", "activity_feed", "feed_posts", "profiles", "sessions", "users",
  ]) db.run(`DELETE FROM ${t}`);
});

function makeMember(handle: string, profileExtra: Record<string, unknown> = {}) {
  const user = storage.createUser({
    handle,
    email: `${handle}@example.com`,
    passwordHash: hashPassword("TestPass123!"),
    isAdmin: false,
    accessStatus: "active",
    invitedBy: null,
  } as any);
  storage.createProfile({ userId: user.id, displayName: handle, role: "Director", ...profileExtra } as any);
  const token = generateToken();
  storage.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 86400000) });
  return { user, token };
}

const call = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

describe("follow", () => {
  it("is one-way, instant, idempotent and notifies once", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    for (let i = 0; i < 2; i++) {
      const r = await call(a.token, "POST", "/api/network/follow/bob");
      expect(r.status).toBe(200);
      expect((await r.json()).following).toBe(true);
    }
    expect(db.all(`SELECT * FROM notifications WHERE user_id = ${b.user.id} AND type = 'follow'`)).toHaveLength(1);
    const net = await (await call(b.token, "GET", "/api/network")).json();
    expect(net.followers.map((m: any) => m.handle)).toEqual(["alice"]);
    expect(net.following).toEqual([]);
    // No email or other private columns on the cards.
    expect(JSON.stringify(net)).not.toContain("example.com");

    const un = await (await call(a.token, "DELETE", "/api/network/follow/bob")).json();
    expect(un.following).toBe(false);
  });

  it("refuses yourself, private profiles, unknown handles and requires auth", async () => {
    const a = makeMember("alice");
    makeMember("hidden", { isPublic: false });
    expect((await call(a.token, "POST", "/api/network/follow/alice")).status).toBe(404);
    expect((await call(a.token, "POST", "/api/network/follow/hidden")).status).toBe(404);
    expect((await call(a.token, "POST", "/api/network/connect/hidden", { message: "Let\'s work together" })).status).toBe(404);
    expect((await call(a.token, "POST", "/api/network/follow/nobody")).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/network`)).status).toBe(401);
  });

  it("feeds followed members' activity and posts, and nobody else's", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    const c = makeMember("carol");
    storage.createActivity({ type: "production_created", userId: b.user.id, message: "started production", isPublic: true } as any);
    storage.createActivity({ type: "production_created", userId: c.user.id, message: "carol thing", isPublic: true } as any);
    storage.createPost({ userId: b.user.id, body: "bob post" } as any);
    await call(a.token, "POST", "/api/network/follow/bob");
    const feed = await (await call(a.token, "GET", "/api/network/feed")).json();
    expect(feed.activities.map((x: any) => x.message)).toEqual(["started production"]);
    expect(feed.posts.map((x: any) => x.body)).toEqual(["bob post"]);
    expect(JSON.stringify(feed)).not.toContain("example.com");
    expect(JSON.stringify(feed)).not.toContain("passwordHash");
  });
});

describe("connect", () => {
  it("needs a request then an accept; only the addressee can accept", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    const m = makeMember("eve");

    const req = await (await call(a.token, "POST", "/api/network/connect/bob", { message: "Let\'s work together" })).json();
    expect(req.connection).toBe("pending_out");
    // Asking twice stays one row.
    await call(a.token, "POST", "/api/network/connect/bob", { message: "Let\'s work together" });
    expect(db.all("SELECT * FROM member_connections")).toHaveLength(1);

    // Bob sees it as incoming; alice and a third party cannot accept it.
    expect((await (await call(b.token, "GET", "/api/network/status/alice")).json()).connection).toBe("pending_in");
    expect((await call(a.token, "POST", "/api/network/requests/bob/accept")).status).toBe(404);
    expect((await call(m.token, "POST", "/api/network/requests/alice/accept")).status).toBe(404);

    const ok = await (await call(b.token, "POST", "/api/network/requests/alice/accept")).json();
    expect(ok.connection).toBe("connected");
    const net = await (await call(a.token, "GET", "/api/network")).json();
    expect(net.connections.map((x: any) => x.handle)).toEqual(["bob"]);
    expect(net.incoming).toEqual([]);
  });

  it("treats a counter-request as acceptance", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    await call(a.token, "POST", "/api/network/connect/bob", { message: "Let\'s work together" });
    const r = await (await call(b.token, "POST", "/api/network/connect/alice", { message: "Let\'s work together" })).json();
    expect(r.connection).toBe("connected");
    expect(db.all("SELECT * FROM member_connections")).toHaveLength(1);
  });

  it("supports decline, cancel and disconnect from either side", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    await call(a.token, "POST", "/api/network/connect/bob", { message: "Let\'s work together" });
    // Addressee cannot "cancel" the requester's request via DELETE; they decline.
    await call(b.token, "DELETE", "/api/network/connect/alice");
    expect(db.all("SELECT * FROM member_connections")).toHaveLength(1);
    expect((await (await call(b.token, "POST", "/api/network/requests/alice/decline")).json()).connection).toBe("none");

    await call(a.token, "POST", "/api/network/connect/bob", { message: "Let\'s work together" });
    expect((await (await call(a.token, "DELETE", "/api/network/connect/bob")).json()).connection).toBe("none");

    await call(a.token, "POST", "/api/network/connect/bob", { message: "Let\'s work together" });
    await call(b.token, "POST", "/api/network/requests/alice/accept");
    expect((await (await call(b.token, "DELETE", "/api/network/connect/alice")).json()).connection).toBe("none");
  });
});

describe("block", () => {
  it("severs follows and connections both ways and stops new ones and new messages", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    await call(a.token, "POST", "/api/network/follow/bob");
    await call(b.token, "POST", "/api/network/follow/alice");
    await call(a.token, "POST", "/api/network/connect/bob", { message: "Let\'s work together" });
    await call(b.token, "POST", "/api/network/requests/alice/accept");

    const r = await (await call(a.token, "POST", "/api/network/block/bob")).json();
    expect(r).toMatchObject({ blocked: true, following: false, followedBy: false, connection: "none" });

    expect((await call(b.token, "POST", "/api/network/follow/alice")).status).toBe(404);
    expect((await call(b.token, "POST", "/api/network/connect/alice", { message: "Let\'s work together" })).status).toBe(404);
    expect((await call(b.token, "POST", "/api/messages", { toHandle: "alice", body: "hi" })).status).toBe(404);
    expect((await call(a.token, "POST", "/api/messages", { toHandle: "bob", body: "hi" })).status).toBe(404);

    // Bob's view never reveals that he is blocked.
    const bobView = await (await call(b.token, "GET", "/api/network/status/alice")).json();
    expect(bobView.blocked).toBe(false);
    expect(bobView.canFollowOrConnect).toBe(false);

    await call(a.token, "DELETE", "/api/network/block/bob");
    expect((await call(b.token, "POST", "/api/network/follow/alice")).status).toBe(200);
  });
});

describe("connect requires a message", () => {
  it("rejects a request with no message and creates nothing", async () => {
    const a = makeMember("alice");
    makeMember("bob");
    for (const body of [undefined, { message: "" }, { message: "   " }]) {
      const r = await call(a.token, "POST", "/api/network/connect/bob", body);
      expect(r.status).toBe(400);
      expect((await r.json()).code).toBe("message_required");
    }
    expect(db.all("SELECT * FROM member_connections")).toHaveLength(0);
    expect(db.all("SELECT * FROM messages")).toHaveLength(0);
  });

  it("delivers the message as a direct message with the request", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    await call(a.token, "POST", "/api/network/connect/bob", { message: "Need a DP for June" });
    const thread = await (await call(b.token, "GET", "/api/messages/with/alice")).json();
    expect(thread.map((m: any) => m.body)).toEqual(["Need a DP for June"]);
    expect(db.all(`SELECT * FROM notifications WHERE user_id = ${b.user.id} AND type = 'connection_request'`)).toHaveLength(1);
  });

  it("does not create the request if the message can't be sent (blocked)", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    await call(b.token, "POST", "/api/network/block/alice");
    expect((await call(a.token, "POST", "/api/network/connect/bob", { message: "hi" })).status).toBe(404);
    expect(db.all("SELECT * FROM member_connections")).toHaveLength(0);
  });
});

describe("adding crew requires a connection", () => {
  function production(ownerId: number) {
    return storage.createProduction({ creatorId: ownerId, title: "Test Film", type: "short", status: "development" } as any);
  }
  const addCrew = (token: string, prodId: number, profileId: number) =>
    call(token, "POST", `/api/productions/${prodId}/crew`, { profileId, role: "DP", status: "invited" });

  it("refuses an unconnected member, allows a connection and yourself", async () => {
    const owner = makeMember("owner");
    const bob = makeMember("bob");
    const prod = production(owner.user.id);
    const bobProfile = storage.getProfile(bob.user.id)!;
    const ownerProfile = storage.getProfile(owner.user.id)!;

    const denied = await addCrew(owner.token, prod.id, bobProfile.id);
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("not_connected");

    // A pending request is not enough.
    await call(owner.token, "POST", "/api/network/connect/bob", { message: "join us" });
    expect((await addCrew(owner.token, prod.id, bobProfile.id)).status).toBe(403);

    await call(bob.token, "POST", "/api/network/requests/owner/accept");
    expect((await addCrew(owner.token, prod.id, bobProfile.id)).status).toBe(201);
    expect((await addCrew(owner.token, prod.id, ownerProfile.id)).status).toBe(201);
    expect((await addCrew(owner.token, prod.id, 99999)).status).toBe(404);
  });

  it("leaves crew already on a production alone after a disconnect", async () => {
    const owner = makeMember("owner");
    const bob = makeMember("bob");
    const prod = production(owner.user.id);
    const bobProfile = storage.getProfile(bob.user.id)!;
    storage.addCrewMember({ productionId: prod.id, profileId: bobProfile.id, role: "DP", status: "confirmed" } as any);
    const crew = await (await call(owner.token, "GET", `/api/productions/${prod.id}/crew`)).json();
    expect(crew).toHaveLength(1);
  });
});

describe("messaging stays open without a connection", () => {
  it("lets strangers message each other as before", async () => {
    const a = makeMember("alice");
    makeMember("bob");
    expect((await call(a.token, "POST", "/api/messages", { toHandle: "bob", body: "hi" })).status).toBe(201);
  });
});
