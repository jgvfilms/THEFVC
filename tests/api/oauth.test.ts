/**
 * OAuth for MCP connectors, end to end: register -> authorize (PKCE) ->
 * consent -> token -> /mcp, plus the ways it must refuse: code replay, wrong
 * verifier, widened scopes, refresh reuse, and a revoked connection.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
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
  for (const table of [
    "oauth_refresh_tokens", "oauth_codes", "oauth_grants", "oauth_pending", "oauth_clients",
    "mcp_tokens", "security_audit_log", "profiles", "sessions", "users",
  ]) {
    try {
      db.run(`DELETE FROM ${table}`);
    } catch {
      /* table absent in this bootstrap */
    }
  }
});

const REDIRECT = "https://claude.example/callback";

function makeMember(handle = "oauthy") {
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
  return { user, session: token };
}

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

async function register(redirect = REDIRECT) {
  const res = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Test AI",
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  return { res, body: await res.json() };
}

async function authorize(clientId: string, challenge: string, scope = "profile:read credits:read credits:write") {
  const url = new URL(`${baseUrl}/authorize`);
  url.search = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge,
    code_challenge_method: "S256", state: "xyz", scope,
  }).toString();
  const res = await fetch(url, { redirect: "manual" });
  return { res, location: res.headers.get("location") ?? "" };
}

const asMember = (session: string) => ({ Authorization: `Bearer ${session}`, "Content-Type": "application/json" });

const exchange = (params: Record<string, string>) =>
  fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });

/** Run the whole flow up to an authorization code. */
async function getCode(session: string, opts: { scopes?: string[] } = {}) {
  const { body: client } = await register();
  const { verifier, challenge } = pkce();
  const { location } = await authorize(client.client_id, challenge);
  const pendingId = location.split("/").pop()!;
  const decision = await fetch(`${baseUrl}/api/oauth/pending/${pendingId}/decision`, {
    method: "POST",
    headers: asMember(session),
    body: JSON.stringify({ approve: true, scopes: opts.scopes }),
  });
  const { redirectTo } = await decision.json();
  const code = new URL(redirectTo).searchParams.get("code")!;
  return { client, verifier, code, redirectTo };
}

const tokenParams = (client: any, code: string, verifier: string) => ({
  grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT,
});

const listTools = async (accessToken: string) => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const raw = await res.text();
  const data = JSON.parse(raw.startsWith("event:") ? raw.split("data: ")[1] : raw);
  return (data.result.tools as Array<{ name: string }>).map((t) => t.name).sort();
};

describe("discovery and registration", () => {
  it("advertises the authorization server and points /mcp 401s at it", async () => {
    const meta = await (await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)).json();
    expect(meta.authorization_endpoint).toMatch(/\/authorize$/);
    expect(meta.token_endpoint).toMatch(/\/token$/);
    expect(meta.registration_endpoint).toMatch(/\/register$/);
    expect(meta.code_challenge_methods_supported).toContain("S256");

    const res = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("registers https clients and refuses plain-http, non-loopback redirects", async () => {
    expect((await register()).res.status).toBe(201);
    expect((await register("http://evil.example/cb")).res.status).toBe(400);
    expect((await register("http://localhost:8123/cb")).res.status).toBe(201);
  });
});

describe("authorization flow", () => {
  it("authorize parks the request and sends the browser to the consent page", async () => {
    const { body: client } = await register();
    const { res, location } = await authorize(client.client_id, pkce().challenge);
    expect(res.status).toBe(302);
    expect(location).toMatch(/^\/app\/oauth\/consent\/[\w-]+$/);
  });

  it("consent endpoints require a login session", async () => {
    const res = await fetch(`${baseUrl}/api/oauth/pending/whatever`);
    expect(res.status).toBe(401);
  });

  it("shows the client and offered scopes, and denial redirects with access_denied", async () => {
    const { session } = makeMember();
    const { body: client } = await register();
    const { location } = await authorize(client.client_id, pkce().challenge);
    const id = location.split("/").pop()!;

    const view = await (await fetch(`${baseUrl}/api/oauth/pending/${id}`, { headers: asMember(session) })).json();
    expect(view.clientName).toBe("Test AI");
    expect(view.redirectHost).toBe("claude.example");
    expect(view.scopes.sort()).toEqual(["credits:read", "credits:write", "profile:read"]);

    const denied = await (await fetch(`${baseUrl}/api/oauth/pending/${id}/decision`, {
      method: "POST", headers: asMember(session), body: JSON.stringify({ approve: false }),
    })).json();
    const u = new URL(denied.redirectTo);
    expect(u.searchParams.get("error")).toBe("access_denied");
    expect(u.searchParams.get("state")).toBe("xyz");
    expect(u.searchParams.get("code")).toBeNull();

    // A decision is single use.
    const again = await fetch(`${baseUrl}/api/oauth/pending/${id}`, { headers: asMember(session) });
    expect(again.status).toBe(404);
  });

  it("issues tokens that work on /mcp with exactly the scopes the member ticked", async () => {
    const { session, user } = makeMember();
    const { client, verifier, code, redirectTo } = await getCode(session, { scopes: ["profile:read"] });
    expect(new URL(redirectTo).searchParams.get("state")).toBe("xyz");

    const res = await exchange(tokenParams(client, code, verifier));
    expect(res.status).toBe(200);
    const tokens = await res.json();
    expect(tokens.token_type.toLowerCase()).toBe("bearer");
    expect(tokens.scope).toBe("profile:read");
    expect(await listTools(tokens.access_token)).toEqual(["get_page_config", "get_profile"]);

    // Shows up as a revocable connection owned by this member.
    expect(storage.listMcpTokens(user.id).map((t) => t.name)).toContain("OAuth: Test AI");
  });

  it("cannot grant more than the client asked for", async () => {
    const { session } = makeMember();
    const { client, verifier, code } = await getCode(session, { scopes: ["profile:read", "page:write", "profile:write"] });
    const tokens = await (await exchange(tokenParams(client, code, verifier))).json();
    expect(tokens.scope.split(" ").sort()).toEqual(["profile:read"]);
  });

  it("refuses an authorization code used twice or with the wrong verifier", async () => {
    const { session } = makeMember();
    const a = await getCode(session);
    expect((await exchange(tokenParams(a.client, a.code, pkce().verifier))).status).toBe(400);

    const b = await getCode(session);
    expect((await exchange(tokenParams(b.client, b.code, b.verifier))).status).toBe(200);
    expect((await exchange(tokenParams(b.client, b.code, b.verifier))).status).toBe(400);
  });

  it("refuses a code presented by a different client", async () => {
    const { session } = makeMember();
    const a = await getCode(session);
    const { body: other } = await register();
    expect((await exchange(tokenParams(other, a.code, a.verifier))).status).toBe(400);
  });
});

describe("refresh and revocation", () => {
  it("rotates refresh tokens: each works once", async () => {
    const { session } = makeMember();
    const { client, verifier, code } = await getCode(session);
    const first = await (await exchange(tokenParams(client, code, verifier))).json();

    const refresh = (rt: string) => exchange({ grant_type: "refresh_token", refresh_token: rt, client_id: client.client_id });
    const second = await refresh(first.refresh_token);
    expect(second.status).toBe(200);
    const next = await second.json();
    expect(next.refresh_token).not.toBe(first.refresh_token);
    expect(await listTools(next.access_token)).toContain("get_profile");

    expect((await refresh(first.refresh_token)).status).toBe(400);
  });

  it("ends the grant when the member revokes the connection", async () => {
    const { session, user } = makeMember();
    const { client, verifier, code } = await getCode(session);
    const tokens = await (await exchange(tokenParams(client, code, verifier))).json();

    const row = storage.listMcpTokens(user.id).find((t) => t.name === "OAuth: Test AI")!;
    const del = await fetch(`${baseUrl}/api/mcp/tokens/${row.id}`, { method: "DELETE", headers: asMember(session) });
    expect(del.ok).toBe(true);

    const mcp = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${tokens.access_token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(mcp.status).toBe(401);
    const refreshed = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id });
    expect(refreshed.status).toBe(400);
  });

  it("logs the grant to the security log", async () => {
    const { session, user } = makeMember();
    await getCode(session);
    const log = db.all<{ action: string }>(`SELECT action FROM security_audit_log WHERE user_id = ${user.id}` as any);
    expect(JSON.stringify(log)).toContain("mcp_oauth_grant");
  });
});

describe("Connections list", () => {
  const list = async (session: string) =>
    (await (await fetch(`${baseUrl}/api/mcp/tokens`, { headers: asMember(session) })).json()) as Array<{ kind: string; id: number; name: string; scopes: string[] }>;

  it("shows one row per connected app, however many times it has refreshed", async () => {
    const { session } = makeMember();
    const { client, verifier, code } = await getCode(session);
    let tokens = await (await exchange(tokenParams(client, code, verifier))).json();
    for (let i = 0; i < 3; i++) {
      tokens = await (await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id })).json();
    }
    const rows = await list(session);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "app", name: "Test AI" });
    expect(rows[0].scopes.sort()).toEqual(["credits:read", "credits:write", "profile:read"]);
  });

  it("keeps listing the app after its hourly access token expires, and Disconnect still ends it", async () => {
    const { session, user } = makeMember();
    const { client, verifier, code } = await getCode(session);
    const tokens = await (await exchange(tokenParams(client, code, verifier))).json();
    db.run(`UPDATE mcp_tokens SET expires_at = ${Math.floor(Date.now() / 1000) - 60} WHERE user_id = ${user.id}`);

    const [app] = await list(session);
    expect(app.kind).toBe("app");
    expect((await fetch(`${baseUrl}/api/mcp/tokens/${app.id}`, { method: "DELETE", headers: asMember(session) })).ok).toBe(true);
    expect(await list(session)).toHaveLength(0);
    const refreshed = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id });
    expect(refreshed.status).toBe(400);
  });

  it("doesn't count connected apps against the personal-token limit", async () => {
    const { session, user } = makeMember();
    const { client, verifier, code } = await getCode(session);
    await exchange(tokenParams(client, code, verifier));
    // Simulate many hourly rotations having left expired access-token rows behind.
    for (let i = 0; i < 12; i++) {
      db.run(`INSERT INTO mcp_tokens (user_id, name, token_hash, token_prefix, scopes, expires_at, created_at)
              VALUES (${user.id}, 'OAuth: Test AI', 'stale-${i}', 'fvc_mcp_', '[]', ${Math.floor(Date.now() / 1000) - 3600}, ${Math.floor(Date.now() / 1000)})`);
    }
    const res = await fetch(`${baseUrl}/api/mcp/tokens`, {
      method: "POST", headers: asMember(session), body: JSON.stringify({ name: "mine", scopes: ["profile:read"] }),
    });
    expect(res.status).toBe(201);
    expect((await list(session)).map((r) => r.kind).sort()).toEqual(["app", "token"]);
  });
});


describe("Grant hardening", () => {
  const refreshWith = (client: any, rt: string) =>
    exchange({ grant_type: "refresh_token", refresh_token: rt, client_id: client.client_id });
  const callMcp = (accessToken: string) =>
    fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

  it("revokes the whole grant when an already-rotated refresh token is replayed", async () => {
    const { session } = makeMember();
    const { client, verifier, code } = await getCode(session);
    const first = await (await exchange(tokenParams(client, code, verifier))).json();
    const second = await (await refreshWith(client, first.refresh_token)).json();
    expect((await callMcp(second.access_token)).status).toBe(200);

    expect((await refreshWith(client, first.refresh_token)).status).toBe(400); // replay
    expect((await callMcp(second.access_token)).status).toBe(401);
    expect((await refreshWith(client, second.refresh_token)).status).toBe(400);
  });

  it("does not revoke the grant for a merely expired refresh token", async () => {
    const { session } = makeMember();
    const { client, verifier, code } = await getCode(session);
    const first = await (await exchange(tokenParams(client, code, verifier))).json();
    const second = await (await refreshWith(client, first.refresh_token)).json();
    // Age the *rotated-out* first token past its lifetime, then present it.
    db.run(`UPDATE oauth_refresh_tokens SET expires_at = ${Math.floor(Date.now() / 1000) - 60} WHERE revoked_at IS NOT NULL`);
    expect((await refreshWith(client, first.refresh_token)).status).toBe(400);
    expect((await callMcp(second.access_token)).status).toBe(200);
  });

  it("rejects an OAuth access token whose grant row is missing", async () => {
    const { session } = makeMember();
    const { client, verifier, code } = await getCode(session);
    const tokens = await (await exchange(tokenParams(client, code, verifier))).json();
    db.run("PRAGMA foreign_keys = OFF");
    db.run("DELETE FROM oauth_grants");
    db.run("PRAGMA foreign_keys = ON");
    expect((await callMcp(tokens.access_token)).status).toBe(401);
  });

  it("gives read-only scopes when the client asks for none", async () => {
    const { session } = makeMember();
    const { client, verifier, code } = await getCode(session);
    void client; void verifier; void code;
    const { parseGrantedScopes } = await import("../../server/lib/oauth-provider");
    expect(parseGrantedScopes(undefined)).toEqual(["profile:read", "credits:read"]);
  });

  it("treats a personal token named 'OAuth: x' as personal", async () => {
    const { session, user } = makeMember();
    const res = await fetch(`${baseUrl}/api/mcp/tokens`, {
      method: "POST", headers: asMember(session), body: JSON.stringify({ name: "OAuth: sneaky", scopes: ["profile:read"] }),
    });
    expect(res.status).toBe(201);
    const rows = (await (await fetch(`${baseUrl}/api/mcp/tokens`, { headers: asMember(session) })).json()) as Array<{ kind: string }>;
    expect(rows.map((r) => r.kind)).toEqual(["token"]);
    expect(storage.listMcpTokens(user.id)[0].kind).toBe("personal");
  });
});

describe("Upgrade of a pre-grant database", () => {
  it("backfills grants for existing OAuth rows and is idempotent", async () => {
    const { user } = makeMember("legacy");
    const now = Math.floor(Date.now() / 1000);
    // Rebuild the old shape: no grants, access/refresh rows only.
    db.run(`INSERT INTO mcp_tokens (id, user_id, name, token_hash, token_prefix, scopes, expires_at, created_at)
            VALUES (900, ${user.id}, 'OAuth: Old AI', 'legacy-h', 'fvc_mcp_', '["profile:read"]', ${now + 3600}, ${now})`);
    db.run(`INSERT INTO oauth_refresh_tokens (token_hash, client_id, user_id, scopes, access_token_id, expires_at)
            VALUES ('legacy-rt', 'client-1', ${user.id}, '["profile:read"]', 900, ${now + 86400})`);
    const { runMigrations } = await import("../../server/migrate");
    runMigrations();
    runMigrations();
    const grants = db.all<{ id: number; revoked_at: number | null }>("SELECT id, revoked_at FROM oauth_grants" as any) as any[];
    expect(grants).toHaveLength(1);
    expect(grants[0].revoked_at).toBeNull();
    const tok = storage.getMcpToken(900)!;
    expect(tok.kind).toBe("oauth_access");
    expect(tok.oauthGrantId).toBe(grants[0].id);
  });
});
