/**
 * MCP foundation tests.
 *
 * The properties that matter: a token only ever acts as its owner, only holds
 * the scopes it was minted with, stops working the moment it's revoked, and
 * can't write fields (subscription, verified badge, non-https links) that a
 * member shouldn't control.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { storage, db } from "../../server/storage";
import { hashPassword, generateToken } from "../../server/middleware/auth";
import { issueMcpToken, type McpScope } from "../../server/lib/mcp-tokens";
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
  for (const table of ["mcp_tokens", "credits", "security_audit_log", "profiles", "sessions", "users"]) {
    try {
      db.run(`DELETE FROM ${table}`);
    } catch {
      /* table absent in this bootstrap */
    }
  }
});

function makeMember(handle: string) {
  const user = storage.createUser({
    handle,
    email: `${handle}@example.com`,
    passwordHash: hashPassword("TestPass123!"),
    isAdmin: false,
    accessStatus: "active",
    invitedBy: null,
  });
  const profile = storage.createProfile({ userId: user.id, displayName: handle, role: "Director" });
  const sessionToken = generateToken();
  storage.createSession({ userId: user.id, token: sessionToken, expiresAt: new Date(Date.now() + 86400000) });
  return { user, profile, sessionToken };
}

async function connect(token: string) {
  const client = new Client({ name: "test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

const callText = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
  return { text: r.content[0].text, isError: !!r.isError };
};

const ALL: McpScope[] = ["profile:read", "profile:write", "credits:read", "credits:write", "page:write"];

describe("MCP auth", () => {
  it("rejects missing, malformed and unknown tokens", async () => {
    for (const headers of [{}, { Authorization: "Bearer nope" }, { Authorization: "Bearer fvc_mcp_unknown" }]) {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(res.status).toBe(401);
    }
  });

  it("does not accept a login session token", async () => {
    const { sessionToken } = makeMember("sess");
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects revoked and expired tokens", async () => {
    const { user } = makeMember("gone");
    const revoked = issueMcpToken({ userId: user.id, name: "r", scopes: ALL });
    storage.revokeMcpToken(revoked.row.id, user.id);
    const expired = issueMcpToken({ userId: user.id, name: "e", scopes: ALL, expiresAt: new Date(Date.now() - 1000) });
    for (const t of [revoked.token, expired.token]) {
      await expect(connect(t)).rejects.toThrow();
    }
  });

  it("stores only a hash of the token", () => {
    const { user } = makeMember("hash");
    const { token, row } = issueMcpToken({ userId: user.id, name: "h", scopes: ALL });
    expect(row.tokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });
});

describe("MCP tools", () => {
  it("only exposes tools the token's scopes allow", async () => {
    const { user } = makeMember("scoped");
    const { token } = issueMcpToken({ userId: user.id, name: "ro", scopes: ["profile:read"] });
    const client = await connect(token);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_page_config", "get_profile"]);
    await client.close();
  });

  it("acts only as the token's owner", async () => {
    const a = makeMember("alice");
    const b = makeMember("bob");
    const { token } = issueMcpToken({ userId: a.user.id, name: "a", scopes: ALL });
    const client = await connect(token);
    await callText(client, "update_profile", { bio: "Alice's new bio" });
    expect(storage.getProfile(a.user.id)!.bio).toBe("Alice's new bio");
    expect(storage.getProfile(b.user.id)!.bio).toBeNull();
    await client.close();
  });

  it("update_profile leaves subscription fields untouched and logs the change", async () => {
    const { user } = makeMember("fields");
    const { token } = issueMcpToken({ userId: user.id, name: "f", scopes: ALL });
    const client = await connect(token);
    // Unknown keys are stripped by the tool's schema, not written through.
    await callText(client, "update_profile", { bio: "hi", subscriptionTier: "pro_plus" });
    const p = storage.getProfile(user.id)!;
    expect(p.bio).toBe("hi");
    expect(p.subscriptionTier).toBe("free");
    expect(storage.getSecurityLogsByUser(user.id).some((l) => l.action === "mcp_profile_update")).toBe(true);
    await client.close();
  });

  it("rejects non-https links", async () => {
    const { user } = makeMember("links");
    const { token } = issueMcpToken({ userId: user.id, name: "l", scopes: ALL });
    const client = await connect(token);
    const r = await callText(client, "update_page_config", { customLinks: [{ label: "x", url: "javascript:alert(1)" }] });
    expect(r.isError).toBe(true);
    expect(storage.getProfile(user.id)!.pageConfig).toBeNull();
    await client.close();
  });

  it("round-trips page customisation", async () => {
    const { user } = makeMember("page");
    const { token } = issueMcpToken({ userId: user.id, name: "p", scopes: ALL });
    const client = await connect(token);
    await callText(client, "update_page_config", {
      themePreset: "darkroom",
      headline: "Cinematographer",
      sections: [{ id: "filmography", visible: true }, { id: "work", visible: false }],
      customLinks: [{ label: "Booking", url: "https://example.com/book" }],
    });
    const got = JSON.parse((await callText(client, "get_page_config")).text);
    expect(got.themePreset).toBe("darkroom");
    expect(got.sections[0].id).toBe("filmography");
    expect(got.customLinks).toHaveLength(1);
    await client.close();
  });

  it("add_credit creates an unverified credit on the owner's profile", async () => {
    const { user, profile } = makeMember("cred");
    const { token } = issueMcpToken({ userId: user.id, name: "c", scopes: ALL });
    const client = await connect(token);
    await callText(client, "add_credit", { productionTitle: "Night Shift", role: "DP", year: 2024, verified: true });
    const credits = storage.getCreditsByProfile(profile.id);
    expect(credits).toHaveLength(1);
    expect(credits[0].verified).toBeFalsy();
    await client.close();
  });

  describe("update_credit / delete_credit", () => {
    const setup = async (scopes: McpScope[] = ALL) => {
      const { user, profile } = makeMember("editor");
      const credit = storage.createCredit({ profileId: profile.id, productionTitle: "Zucchini", role: "Director", year: 2027, format: "feature" });
      const { token } = issueMcpToken({ userId: user.id, name: "e", scopes });
      return { user, profile, credit, client: await connect(token) };
    };

    it("edits only the fields passed", async () => {
      const { credit, client } = await setup();
      const r = await callText(client, "update_credit", { id: credit.id, format: "short" });
      expect(r.isError).toBe(false);
      expect(storage.getCredit(credit.id)).toMatchObject({ productionTitle: "Zucchini", role: "Director", year: 2027, format: "short" });
      expect((await callText(client, "update_credit", { id: credit.id })).isError).toBe(true);
      await client.close();
    });

    it("deletes the credit and keeps what it was in the audit log", async () => {
      const { user, credit, client } = await setup();
      expect((await callText(client, "delete_credit", { id: credit.id })).isError).toBe(false);
      expect(storage.getCredit(credit.id)).toBeUndefined();
      const rows = db.all<{ details: string }>(`SELECT details FROM security_audit_log WHERE user_id = ${user.id} AND action = 'mcp_credit_delete'` as any);
      expect(JSON.stringify(rows)).toContain("Zucchini");
      await client.close();
    });

    it("can't touch another member's credit, and can't tell it exists", async () => {
      const { client } = await setup();
      const other = makeMember("other");
      const theirs = storage.createCredit({ profileId: other.profile.id, productionTitle: "Theirs", role: "DP", year: 2020 });
      for (const [name, args] of [["update_credit", { id: theirs.id, role: "Hacked" }], ["delete_credit", { id: theirs.id }], ["delete_credit", { id: 999999 }]] as const) {
        const r = await callText(client, name, args as any);
        expect(r).toEqual({ text: "Credit not found", isError: true });
      }
      expect(storage.getCredit(theirs.id)).toMatchObject({ role: "DP" });
      await client.close();
    });

    it("refuses to change or delete a verified credit", async () => {
      const { profile, client } = await setup();
      const v = storage.createCredit({ profileId: profile.id, productionTitle: "Verified One", role: "DP", year: 2019, verified: true });
      expect((await callText(client, "update_credit", { id: v.id, role: "Director" })).isError).toBe(true);
      expect((await callText(client, "delete_credit", { id: v.id })).isError).toBe(true);
      expect(storage.getCredit(v.id)).toMatchObject({ role: "DP", verified: true });
      await client.close();
    });

    it("needs the credits:write scope", async () => {
      const { client } = await setup(["credits:read"]);
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toContain("list_credits");
      expect(names).not.toContain("update_credit");
      expect(names).not.toContain("delete_credit");
      await client.close();
    });
  });
});

describe("token management API", () => {
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

  it("returns the plaintext once, then only a prefix", async () => {
    const { sessionToken } = makeMember("mint");
    const created = await fetch(`${baseUrl}/api/mcp/tokens`, {
      method: "POST", headers: auth(sessionToken), body: JSON.stringify({ name: "Claude Desktop", scopes: ["profile:read"] }),
    });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.token).toMatch(/^fvc_mcp_/);
    const list = await (await fetch(`${baseUrl}/api/mcp/tokens`, { headers: auth(sessionToken) })).json();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(body.token);
  });

  it("requires a login session — an MCP token can't mint tokens", async () => {
    const { user } = makeMember("nomint");
    const { token } = issueMcpToken({ userId: user.id, name: "t", scopes: ALL });
    const res = await fetch(`${baseUrl}/api/mcp/tokens`, {
      method: "POST", headers: auth(token), body: JSON.stringify({ name: "x", scopes: ["profile:read"] }),
    });
    expect(res.status).toBe(401);
  });

  it("revocation takes effect and can't touch another member's token", async () => {
    const a = makeMember("rev-a");
    const b = makeMember("rev-b");
    const { token, row } = issueMcpToken({ userId: a.user.id, name: "a", scopes: ALL });

    const other = await fetch(`${baseUrl}/api/mcp/tokens/${row.id}`, { method: "DELETE", headers: auth(b.sessionToken) });
    expect(other.status).toBe(404);
    await (await connect(token)).close(); // still works

    const own = await fetch(`${baseUrl}/api/mcp/tokens/${row.id}`, { method: "DELETE", headers: auth(a.sessionToken) });
    expect(own.status).toBe(200);
    await expect(connect(token)).rejects.toThrow();
  });
});

describe("profile PATCH pageConfig", () => {
  const patch = (t: string, pageConfig: string) =>
    fetch(`${baseUrl}/api/profile`, {
      method: "PATCH", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ pageConfig }),
    });

  it("rejects invalid or unsafe config but accepts a valid one", async () => {
    const { user, sessionToken } = makeMember("patcher");
    expect((await patch(sessionToken, "not json")).status).toBe(400);
    const unsafe = JSON.stringify({ sections: [], headline: null, customLinks: [{ label: "x", url: "javascript:alert(1)" }] });
    expect((await patch(sessionToken, unsafe)).status).toBe(400);
    expect(storage.getProfile(user.id)!.pageConfig).toBeNull();

    const ok = JSON.stringify({ sections: [{ id: "work", visible: false }], headline: "Hi", customLinks: [] });
    expect((await patch(sessionToken, ok)).status).toBe(200);
    expect(storage.getProfile(user.id)!.pageConfig).toBe(ok);
  });
});
