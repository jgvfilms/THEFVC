import { createHash, randomBytes } from "node:crypto";
import { storage } from "../storage";
import type { McpToken } from "@shared/schema";

export const MCP_SCOPES = [
  "profile:read",
  "profile:write",
  "credits:read",
  "credits:write",
  "page:write",
  "messages:read",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

const TOKEN_PREFIX = "fvc_mcp_";

// Tokens are 256 random bits, so a fast unsalted hash is enough: there is
// nothing to brute-force, and it lets us look a token up by hash in one query.
export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueMcpToken(opts: { userId: number; name: string; scopes: McpScope[]; expiresAt?: Date | null; oauthGrantId?: number }) {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const row = storage.createMcpToken({
    userId: opts.userId,
    name: opts.name,
    tokenHash: hashMcpToken(token),
    tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 4),
    scopes: JSON.stringify(opts.scopes),
    expiresAt: opts.expiresAt ?? null,
    kind: opts.oauthGrantId ? "oauth_access" : "personal",
    oauthGrantId: opts.oauthGrantId ?? null,
  });
  return { token, row };
}

export function parseScopes(raw: string): McpScope[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s): s is McpScope => MCP_SCOPES.includes(s)) : [];
  } catch {
    return [];
  }
}

export interface McpPrincipal {
  userId: number;
  tokenId: number;
  scopes: Set<McpScope>;
}

/** Resolve a presented bearer token to a principal, or null if unknown/revoked/expired. */
export function authenticateMcpToken(token: string | undefined): McpPrincipal | null {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const row: McpToken | undefined = storage.getMcpTokenByHash(hashMcpToken(token));
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  // Fail closed: an OAuth access token is only as good as its grant. A missing
  // grant row is treated as revoked, never as "no restriction".
  if (row.kind === "oauth_access") {
    const grant = row.oauthGrantId ? storage.getOAuthGrant(row.oauthGrantId) : undefined;
    if (!grant || grant.revokedAt) return null;
  }
  storage.touchMcpToken(row.id);
  return { userId: row.userId, tokenId: row.id, scopes: new Set(parseScopes(row.scopes)) };
}
