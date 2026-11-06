import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { storage, db } from "../../server/storage";
import { hashPassword, generateToken } from "../../server/middleware/auth";
import { MAX_MESSAGES_PER_DAY } from "../../server/message-routes";
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
  for (const t of ["messages", "email_queue", "notifications", "profiles", "sessions", "users"]) db.run(`DELETE FROM ${t}`);
});

function makeMember(handle: string, extra: Record<string, unknown> = {}) {
  const user = storage.createUser({
    handle,
    email: `${handle}@example.com`,
    passwordHash: hashPassword("TestPass123!"),
    isAdmin: false,
    accessStatus: "active",
    invitedBy: null,
    ...extra,
  } as any);
  storage.createProfile({ userId: user.id, displayName: handle, role: "Director" });
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

describe("member messaging", () => {
  it("delivers a message, notifies in app, and emails without the message text", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    const secret = "my secret rate is $900/day";
    const r = await call(a.token, "POST", "/api/messages", { toHandle: "bob", body: secret });
    expect(r.status).toBe(201);

    const notes = storage.getNotifications(b.user.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe("message");
    expect(JSON.stringify(notes[0])).not.toContain(secret);

    const mail = storage.getEmailQueue();
    expect(mail).toHaveLength(1);
    expect(mail[0].to).toBe("bob@example.com");
    expect(mail[0].html + (mail[0].text ?? "") + mail[0].subject).not.toContain(secret);
    expect(mail[0].subject).toContain("alice");
    // This SPA uses path routing; a "#/" link would land on the homepage.
    expect(mail[0].text).toMatch(/\/app\/messages$/m);
    expect(mail[0].text).not.toContain("#/");
  });

  it("skips the email when the recipient opted out, but still notifies in app", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob", { emailOnMessage: false });
    await call(a.token, "POST", "/api/messages", { toHandle: "bob", body: "hi" });
    expect(storage.getEmailQueue()).toHaveLength(0);
    expect(storage.getNotifications(b.user.id)).toHaveLength(1);
  });

  it("shows the thread to both members and marks it read only for the reader", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    await call(a.token, "POST", "/api/messages", { toHandle: "bob", body: "hello" });
    await call(b.token, "POST", "/api/messages", { toHandle: "alice", body: "hey back" });

    expect((await (await call(b.token, "GET", "/api/messages/unread-count")).json()).unread).toBe(1);
    const list = await (await call(b.token, "GET", "/api/messages")).json();
    expect(list[0]).toMatchObject({ handle: "alice", unread: 1 });

    const thread = await (await call(b.token, "GET", "/api/messages/with/alice")).json();
    expect(thread.map((m: any) => [m.mine, m.body])).toEqual([[false, "hello"], [true, "hey back"]]);
    expect((await (await call(b.token, "GET", "/api/messages/unread-count")).json()).unread).toBe(0);
    expect((await (await call(a.token, "GET", "/api/messages/unread-count")).json()).unread).toBe(1);
  });

  it("keeps a third member out of the conversation", async () => {
    const a = makeMember("alice");
    makeMember("bob");
    const c = makeMember("carol");
    await call(a.token, "POST", "/api/messages", { toHandle: "bob", body: "private" });
    const thread = await (await call(c.token, "GET", "/api/messages/with/alice")).json();
    expect(thread).toEqual([]);
    expect(await (await call(c.token, "GET", "/api/messages")).json()).toEqual([]);
  });

  it("rejects bad sends the same way for missing and inactive members", async () => {
    const a = makeMember("alice");
    makeMember("gone", { accessStatus: "revoked" });
    expect((await call(a.token, "POST", "/api/messages", { toHandle: "nobody", body: "x" })).status).toBe(404);
    expect((await call(a.token, "POST", "/api/messages", { toHandle: "gone", body: "x" })).status).toBe(404);
    expect((await call(a.token, "POST", "/api/messages", { toHandle: "alice", body: "x" })).status).toBe(400);
    expect((await call(a.token, "POST", "/api/messages", { toHandle: "gone", body: "  " })).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/messages`)).status).toBe(401);
  });

  it("caps messages per sender per day", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    const now = Date.now();
    for (let i = 0; i < MAX_MESSAGES_PER_DAY; i++) {
      db.run(`INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (${a.user.id}, ${b.user.id}, 'x', ${now})`);
    }
    expect((await call(a.token, "POST", "/api/messages", { toHandle: "bob", body: "one more" })).status).toBe(429);
  });

  it("refuses an AI token", async () => {
    const { issueMcpToken } = await import("../../server/lib/mcp-tokens");
    const a = makeMember("alice");
    makeMember("bob");
    const { token } = issueMcpToken({ userId: a.user.id, name: "ai", scopes: ["profile:read"] });
    expect((await call(token, "POST", "/api/messages", { toHandle: "bob", body: "from an AI" })).status).toBe(401);
  });
});
