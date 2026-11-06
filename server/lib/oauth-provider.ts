/**
 * OAuth 2.1 authorization server for MCP connectors (claude.ai and friends).
 *
 * The MCP SDK's `mcpAuthRouter` owns the protocol surface (metadata, dynamic
 * client registration, /authorize, /token, /revoke, PKCE checks). This file is
 * the storage-and-policy half it delegates to:
 *
 *  - Clients are public (PKCE, no secret) and self-registered, so their name is
 *    untrusted; the consent page shows the redirect host next to it.
 *  - /authorize parks the request and sends the browser to the consent page.
 *    Nothing is granted until a logged-in member approves there.
 *  - Access tokens are ordinary `mcp_tokens` rows (kind `oauth_access`, tied to a grant), so
 *    /mcp needs no second auth path and members revoke them from the same list.
 *  - Refresh tokens rotate on every use and die with the access token they
 *    were issued alongside.
 */

import { randomBytes } from "node:crypto";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { storage } from "../storage";
import { MCP_SCOPES, authenticateMcpToken, hashMcpToken, issueMcpToken, type McpScope } from "./mcp-tokens";

export const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;

const isLoopback = (u: URL) => u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";

/** https anywhere, or http only to loopback (native/CLI clients). */
export function isAllowedRedirectUri(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.hash) return false;
    return u.protocol === "https:" || (u.protocol === "http:" && isLoopback(u));
  } catch {
    return false;
  }
}

const clientsStore: OAuthRegisteredClientsStore = {
  getClient(clientId) {
    const row = storage.getOAuthClient(clientId);
    return row ? (JSON.parse(row.clientJson) as OAuthClientInformationFull) : undefined;
  },
  registerClient(client) {
    const full = client as OAuthClientInformationFull;
    if (!full.redirect_uris.length || !full.redirect_uris.every((u) => isAllowedRedirectUri(String(u)))) {
      throw new InvalidClientMetadataError("redirect_uris must be https (or http on localhost) with no fragment");
    }
    storage.saveOAuthClient(full.client_id, JSON.stringify(full));
    return full;
  },
};

// A client that asks for no scopes gets read access only; write access has to be
// requested by name and then approved on the consent page.
const READ_SCOPES: McpScope[] = ["profile:read", "credits:read"];

export function parseGrantedScopes(requested: string[] | undefined): McpScope[] {
  const wanted = requested?.length ? requested : READ_SCOPES;
  return MCP_SCOPES.filter((s) => wanted.includes(s));
}

const newSecret = (prefix: string) => prefix + randomBytes(32).toString("base64url");

function issueTokens(opts: { userId: number; clientId: string; clientName: string; scopes: McpScope[]; grantId: number }): OAuthTokens {
  const { token, row } = issueMcpToken({
    userId: opts.userId,
    name: `OAuth: ${opts.clientName}`.slice(0, 60),
    scopes: opts.scopes,
    expiresAt: new Date(Date.now() + ACCESS_TTL_MS),
    oauthGrantId: opts.grantId,
  });
  const refresh = newSecret("fvc_rt_");
  storage.createOAuthRefresh({
    tokenHash: hashMcpToken(refresh),
    clientId: opts.clientId,
    userId: opts.userId,
    scopes: JSON.stringify(opts.scopes),
    accessTokenId: row.id,
    oauthGrantId: opts.grantId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: ACCESS_TTL_MS / 1000,
    refresh_token: refresh,
    scope: opts.scopes.join(" "),
  };
}

const clientLabel = (c: OAuthClientInformationFull) => (c.client_name || "AI connector").trim().slice(0, 40) || "AI connector";

export interface PendingParams {
  state?: string;
  scopes?: string[];
  codeChallenge: string;
  redirectUri: string;
}

export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    storage.purgeExpiredOAuth();
    const id = randomBytes(32).toString("base64url");
    const pending: PendingParams = {
      state: params.state,
      scopes: params.scopes,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
    };
    storage.createOAuthPending({
      id,
      clientId: client.client_id,
      params: JSON.stringify(pending),
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    });
    // The id rides in the path, not a query string: the SPA's return-to-after-
    // login helper keeps only the path.
    res.redirect(302, `/app/oauth/consent/${id}`);
  },

  async challengeForAuthorizationCode(_client, code) {
    const row = storage.peekOAuthCode(hashMcpToken(code));
    if (!row) throw new InvalidGrantError("Invalid authorization code");
    return row.codeChallenge;
  },

  async exchangeAuthorizationCode(client, code, _verifier, redirectUri) {
    const row = storage.consumeOAuthCode(hashMcpToken(code));
    if (!row || row.clientId !== client.client_id) throw new InvalidGrantError("Invalid or expired authorization code");
    if (redirectUri && redirectUri !== row.redirectUri) throw new InvalidGrantError("redirect_uri does not match the authorization request");
    const scopes = parseGrantedScopes(JSON.parse(row.scopes));
    const grant = storage.createOAuthGrant({ userId: row.userId, clientId: client.client_id, scopes: JSON.stringify(scopes) });
    return issueTokens({ userId: row.userId, clientId: client.client_id, clientName: clientLabel(client), scopes, grantId: grant.id });
  },

  async exchangeRefreshToken(client, refreshToken, scopes) {
    const hash = hashMcpToken(refreshToken);
    const existing = storage.getOAuthRefresh(hash);
    if (!existing || existing.clientId !== client.client_id) throw new InvalidGrantError("Invalid or expired refresh token");
    // A rotated-out token that is still inside its lifetime means two parties hold
    // the same secret, so one of them stole it: end the whole grant. A merely
    // expired token is just a stale client and must not take the grant with it.
    if (existing.revokedAt && existing.expiresAt >= new Date()) {
      if (existing.oauthGrantId) storage.revokeOAuthGrant(existing.oauthGrantId);
      throw new InvalidGrantError("Invalid or expired refresh token");
    }
    const row = storage.consumeOAuthRefresh(hash);
    if (!row) throw new InvalidGrantError("Invalid or expired refresh token");
    // Revoking the connector on the Connections page ends the grant, not just
    // the one-hour access token. Fail closed if the grant row is gone.
    const grant = row.oauthGrantId ? storage.getOAuthGrant(row.oauthGrantId) : undefined;
    if (!grant || grant.revokedAt) throw new InvalidGrantError("This connection was revoked");
    const granted = parseGrantedScopes(JSON.parse(row.scopes));
    // A refresh may narrow scopes, never widen them.
    const narrowed = scopes?.length ? granted.filter((s) => scopes.includes(s)) : granted;
    return issueTokens({ userId: row.userId, clientId: client.client_id, clientName: clientLabel(client), scopes: narrowed, grantId: grant.id });
  },

  async verifyAccessToken(token) {
    const principal = authenticateMcpToken(token);
    if (!principal) throw new InvalidTokenError("Invalid or expired token");
    return { token, clientId: "fvc", scopes: [...principal.scopes], extra: { userId: principal.userId } };
  },

  async revokeToken(client, request) {
    // Revocation is best-effort and silent for unknown tokens (RFC 7009).
    const hash = hashMcpToken(request.token);
    const refresh = storage.getOAuthRefresh(hash);
    if (refresh && refresh.clientId === client.client_id) {
      if (refresh.oauthGrantId) storage.revokeOAuthGrant(refresh.oauthGrantId);
      return;
    }
    // Only the issuing client may revoke, and only OAuth tokens (not personal ones).
    const access = storage.getMcpTokenByHash(hash);
    if (access?.kind === "oauth_access" && access.oauthGrantId && storage.getOAuthGrant(access.oauthGrantId)?.clientId === client.client_id) {
      storage.revokeOAuthGrant(access.oauthGrantId);
    }
  },
};

/** Issue the authorization code for an approved pending request. */
export function createAuthorizationCode(opts: {
  clientId: string;
  userId: number;
  scopes: McpScope[];
  codeChallenge: string;
  redirectUri: string;
}): string {
  const code = newSecret("fvc_ac_");
  storage.createOAuthCode({
    codeHash: hashMcpToken(code),
    clientId: opts.clientId,
    userId: opts.userId,
    scopes: JSON.stringify(opts.scopes),
    codeChallenge: opts.codeChallenge,
    redirectUri: opts.redirectUri,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}
