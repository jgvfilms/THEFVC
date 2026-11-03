/**
 * OAuth wiring for MCP connectors: the SDK's standard endpoints (metadata,
 * /register, /authorize, /token, /revoke) plus the two calls the in-app
 * consent page makes. The protocol lives in lib/oauth-provider.ts.
 */

import type { Express, Response } from "express";
import { z } from "zod";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireAuth, type AuthedRequest } from "./middleware/auth";
import { storage } from "./storage";
import { MCP_SCOPES } from "./lib/mcp-tokens";
import { createAuthorizationCode, oauthProvider, parseGrantedScopes, type PendingParams } from "./lib/oauth-provider";

// The issuer must match the host clients actually reach (www, not the apex
// that redirects to it), so it comes from config, not from the request.
export function publicBaseUrl(): URL {
  return new URL(process.env.PUBLIC_BASE_URL || "http://localhost:3000");
}

export const mcpResourceUrl = () => new URL("/mcp", publicBaseUrl());
export const protectedResourceMetadataUrl = () => getOAuthProtectedResourceMetadataUrl(mcpResourceUrl());

const decisionSchema = z.object({
  approve: z.boolean(),
  scopes: z.array(z.enum(MCP_SCOPES)).optional(),
});

function loadPending(id: unknown, res: Response) {
  const row = typeof id === "string" ? storage.getOAuthPending(id) : undefined;
  if (!row || row.expiresAt < new Date()) {
    if (row) storage.deleteOAuthPending(row.id);
    res.status(404).json({ error: "This authorization request has expired. Start again from your AI app." });
    return null;
  }
  const client = storage.getOAuthClient(row.clientId);
  if (!client) {
    res.status(404).json({ error: "Unknown client" });
    return null;
  }
  return { row, client: JSON.parse(client.clientJson), params: JSON.parse(row.params) as PendingParams };
}

export function registerOAuthRoutes(app: Express) {
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: publicBaseUrl(),
      resourceServerUrl: mcpResourceUrl(),
      scopesSupported: [...MCP_SCOPES],
      resourceName: "THEFVC.IS",
    }),
  );

  // What the consent page shows. Read identity from the session, never the URL.
  app.get("/api/oauth/pending/:id", requireAuth, (req: AuthedRequest, res: Response) => {
    const p = loadPending(req.params.id, res);
    if (!p) return;
    res.json({
      clientName: p.client.client_name || "An AI app",
      redirectHost: new URL(p.params.redirectUri).host,
      scopes: parseGrantedScopes(p.params.scopes),
    });
  });

  app.post("/api/oauth/pending/:id/decision", requireAuth, (req: AuthedRequest, res: Response) => {
    const body = decisionSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid decision" });
    const p = loadPending(req.params.id, res);
    if (!p) return;

    // Single use, whatever the answer.
    storage.deleteOAuthPending(p.row.id);

    const redirect = new URL(p.params.redirectUri);
    if (p.params.state) redirect.searchParams.set("state", p.params.state);

    if (!body.data.approve) {
      redirect.searchParams.set("error", "access_denied");
      return res.json({ redirectTo: redirect.toString() });
    }

    // The member may grant less than was asked for, never more.
    const offered = parseGrantedScopes(p.params.scopes);
    const granted = (body.data.scopes ?? offered).filter((s) => offered.includes(s));
    if (granted.length === 0) return res.status(400).json({ error: "Select at least one permission to approve." });

    redirect.searchParams.set(
      "code",
      createAuthorizationCode({
        clientId: p.row.clientId,
        userId: req.userId!,
        scopes: granted,
        codeChallenge: p.params.codeChallenge,
        redirectUri: p.params.redirectUri,
      }),
    );
    storage.createSecurityLog({
      userId: req.userId!,
      action: "mcp_oauth_grant",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
      details: JSON.stringify({ client: p.client.client_name, clientId: p.row.clientId, scopes: granted }),
    });
    res.json({ redirectTo: redirect.toString() });
  });
}
