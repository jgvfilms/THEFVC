/**
 * MCP (Model Context Protocol) endpoint + token management.
 *
 * A member mints a personal access token in the app, pastes it into their own
 * AI client, and that client can then read/update *their* profile and page
 * through the tools below. Identity comes only from the token — no tool takes
 * a user id — and every tool is registered only if the token holds its scope.
 *
 * Stateless transport: a fresh McpServer per request, so nothing is held in
 * memory and the endpoint is safe behind more than one process.
 */

import type { Express, Response } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { storage } from "./storage";
import { requireAuth, type AuthedRequest } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import {
  MCP_SCOPES,
  authenticateMcpToken,
  issueMcpToken,
  parseScopes,
  type McpPrincipal,
  type McpScope,
} from "./lib/mcp-tokens";
import { protectedResourceMetadataUrl } from "./oauth-routes";
import { PROFILE_THEME_IDS, pageConfigSchema, parsePageConfig } from "@shared/page-config";
import { AVAILABILITY_VALUES } from "./lib/profile-update";
import type { Credit, McpToken } from "@shared/schema";

const MAX_TOKENS_PER_USER = 10;

const CREDIT_FORMATS = ["feature", "short", "music_video", "commercial", "web", "documentary"] as const;

const httpsUrl = z.string().url().max(500).refine((u) => u.startsWith("https://"), "must be an https URL");

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(MCP_SCOPES)).min(1),
  expiresInDays: z.number().int().min(1).max(365).nullish(),
});

// Only these profile fields are writable over MCP. Subscription, Stripe and
// visibility fields are deliberately absent.
const profileUpdateShape = {
  displayName: z.string().trim().min(1).max(100).optional(),
  role: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  bio: z.string().trim().max(2000).optional(),
  availability: z.enum(AVAILABILITY_VALUES).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  dayRate: z.number().int().min(0).max(1_000_000).optional(),
  reelUrl: httpsUrl.optional(),
  imdbUrl: httpsUrl.optional(),
  websiteUrl: httpsUrl.optional(),
};

const pageUpdateShape = {
  themePreset: z.enum(PROFILE_THEME_IDS).optional(),
  sections: pageConfigSchema.shape.sections.optional(),
  headline: pageConfigSchema.shape.headline,
  customLinks: pageConfigSchema.shape.customLinks.optional(),
};

function tokenView(t: McpToken) {
  return {
    id: t.id,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    scopes: parseScopes(t.scopes),
    lastUsedAt: t.lastUsedAt,
    expiresAt: t.expiresAt,
    revokedAt: t.revokedAt,
    createdAt: t.createdAt,
  };
}

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

function buildServer(principal: McpPrincipal, meta: { ip?: string; ua?: string }): McpServer {
  const server = new McpServer({ name: "thefvc", version: "1.0.0" });
  const can = (scope: McpScope) => principal.scopes.has(scope);

  // Writes leave a trail in the security log so a member can see what their
  // AI client changed.
  const audit = (action: string, details: Record<string, unknown>) =>
    storage.createSecurityLog({
      userId: principal.userId,
      action,
      ipAddress: meta.ip,
      userAgent: meta.ua,
      success: true,
      details: JSON.stringify({ tokenId: principal.tokenId, ...details }),
    });

  if (can("profile:read")) {
    server.registerTool(
      "get_profile",
      { description: "Get your FVC profile: name, role, location, bio, skills, rate, availability, links." },
      async () => {
        const p = storage.getProfile(principal.userId);
        if (!p) return fail("Profile not found");
        return text({
          displayName: p.displayName, role: p.role, city: p.city, state: p.state, bio: p.bio,
          availability: p.availability, skills: JSON.parse(p.skills || "[]"), dayRate: p.dayRate,
          reelUrl: p.reelUrl, imdbUrl: p.imdbUrl, websiteUrl: p.websiteUrl, themePreset: p.themePreset,
        });
      },
    );
    server.registerTool(
      "get_page_config",
      { description: "Get how your public profile page is customised: theme, section order/visibility, headline, custom links." },
      async () => {
        const p = storage.getProfile(principal.userId);
        if (!p) return fail("Profile not found");
        return text({ themePreset: p.themePreset, ...parsePageConfig(p.pageConfig) });
      },
    );
  }

  if (can("profile:write")) {
    server.registerTool(
      "update_profile",
      { description: "Update fields on your FVC profile. Only the fields you pass are changed.", inputSchema: profileUpdateShape },
      async (args) => {
        const { skills, ...rest } = args;
        const patch = { ...rest, ...(skills ? { skills: JSON.stringify(skills) } : {}) };
        if (Object.keys(patch).length === 0) return fail("No fields provided");
        if (!storage.updateProfile(principal.userId, patch)) return fail("Profile not found");
        audit("mcp_profile_update", { fields: Object.keys(patch) });
        return text(`Updated: ${Object.keys(patch).join(", ")}`);
      },
    );
  }

  if (can("credits:read")) {
    server.registerTool(
      "list_credits",
      { description: "List the credits on your filmography, newest first." },
      async () => {
        const p = storage.getProfile(principal.userId);
        if (!p) return fail("Profile not found");
        return text(storage.getCreditsByProfile(p.id).map((c) => ({
          id: c.id, productionTitle: c.productionTitle, role: c.role, year: c.year, format: c.format, verified: c.verified,
        })));
      },
    );
  }

  if (can("credits:write")) {
    server.registerTool(
      "add_credit",
      {
        description: "Add a credit to your filmography.",
        inputSchema: {
          productionTitle: z.string().trim().min(1).max(200),
          role: z.string().trim().min(1).max(100),
          year: z.number().int().min(1900).max(2100),
          format: z.enum(CREDIT_FORMATS).optional(),
        },
      },
      async (args) => {
        const p = storage.getProfile(principal.userId);
        if (!p) return fail("Profile not found");
        // verified is never settable here: it is a platform-granted badge.
        const credit = storage.createCredit({ ...args, profileId: p.id });
        audit("mcp_credit_add", { creditId: credit.id });
        return text({ id: credit.id });
      },
    );

    // Ownership is checked against the token's own profile, so an id that
    // belongs to someone else is indistinguishable from one that doesn't exist.
    // Verified credits are platform-granted and stay out of reach here.
    // Returns the credit, or the message to fail with.
    const ownCredit = (id: number): Credit | string => {
      const p = storage.getProfile(principal.userId);
      const credit = p ? storage.getCredit(id) : undefined;
      if (!p || !credit || credit.profileId !== p.id) return "Credit not found";
      if (credit.verified) return "Verified credits can't be changed here";
      return credit;
    };

    server.registerTool(
      "update_credit",
      {
        description: "Edit one of your credits (find its id with list_credits). Only the fields you pass are changed.",
        inputSchema: {
          id: z.number().int(),
          productionTitle: z.string().trim().min(1).max(200).optional(),
          role: z.string().trim().min(1).max(100).optional(),
          year: z.number().int().min(1900).max(2100).optional(),
          format: z.enum(CREDIT_FORMATS).optional(),
        },
      },
      async ({ id, ...patch }) => {
        const own = ownCredit(id);
        if (typeof own === "string") return fail(own);
        if (Object.keys(patch).length === 0) return fail("No fields provided");
        storage.updateCredit(id, patch);
        audit("mcp_credit_update", { creditId: id, fields: Object.keys(patch) });
        return text(`Updated credit ${id}: ${Object.keys(patch).join(", ")}`);
      },
    );

    server.registerTool(
      "delete_credit",
      {
        description: "Permanently delete one of your credits (find its id with list_credits). Cannot be undone.",
        inputSchema: { id: z.number().int() },
      },
      async ({ id }) => {
        const own = ownCredit(id);
        if (typeof own === "string") return fail(own);
        storage.deleteCredit(id);
        // Keep what was deleted: the credit itself is gone, so the log is the only record.
        const { productionTitle, role, year } = own;
        audit("mcp_credit_delete", { creditId: id, productionTitle, role, year });
        return text(`Deleted credit ${id}`);
      },
    );
  }

  if (can("page:write")) {
    server.registerTool(
      "update_page_config",
      {
        description: "Customise your public profile page: theme, which sections show and in what order, a headline, and custom links. Only the fields you pass are changed.",
        inputSchema: pageUpdateShape,
      },
      async (args) => {
        const p = storage.getProfile(principal.userId);
        if (!p) return fail("Profile not found");
        const { themePreset, ...cfg } = args;
        const next = pageConfigSchema.parse({ ...parsePageConfig(p.pageConfig), ...cfg });
        storage.updateProfile(principal.userId, {
          pageConfig: JSON.stringify(next),
          ...(themePreset ? { themePreset } : {}),
        });
        audit("mcp_page_update", { fields: Object.keys(args) });
        return text({ themePreset: themePreset ?? p.themePreset, ...next });
      },
    );
  }

  return server;
}

function bearer(req: AuthedRequest): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

const rpcError = (res: Response, status: number, message: string) =>
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });

export function registerMcpRoutes(app: Express): void {
  // ----- Token management: session auth only, so a token can't mint tokens -----
  app.get("/api/mcp/tokens", requireAuth, (req: AuthedRequest, res: Response) => {
    res.json(storage.listMcpTokens(req.userId!).map(tokenView));
  });

  app.post("/api/mcp/tokens", requireAuth, (req: AuthedRequest, res: Response) => {
    const parsed = createTokenSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    const live = storage.listMcpTokens(req.userId!).filter((t) => !t.revokedAt);
    if (live.length >= MAX_TOKENS_PER_USER) {
      return res.status(409).json({ error: `Token limit reached (${MAX_TOKENS_PER_USER}). Revoke one first.` });
    }
    const { name, scopes, expiresInDays } = parsed.data;
    const { token, row } = issueMcpToken({
      userId: req.userId!,
      name,
      scopes,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
    });
    // The plaintext is returned exactly once; only its hash is stored.
    res.status(201).json({ ...tokenView(row), token });
  });

  app.delete("/api/mcp/tokens/:id", requireAuth, (req: AuthedRequest, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || !storage.revokeMcpToken(id, req.userId!)) {
      return res.status(404).json({ error: "Token not found" });
    }
    res.json({ success: true });
  });

  // ----- The MCP endpoint -----
  app.use("/mcp", rateLimit({ windowMs: 60 * 1000, max: 120, identifier: "mcp" }));

  app.post("/mcp", async (req: AuthedRequest, res: Response) => {
    const principal = authenticateMcpToken(bearer(req));
    if (!principal) {
      // resource_metadata is how an OAuth-capable client (claude.ai) discovers where to sign in.
      res.setHeader("WWW-Authenticate", `Bearer realm="thefvc", resource_metadata="${protectedResourceMetadataUrl()}"`);
      return rpcError(res, 401, "Invalid or missing access token");
    }
    const server = buildServer(principal, { ip: req.ip, ua: req.headers["user-agent"] });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[mcp] request failed", err instanceof Error ? err.message : err);
      if (!res.headersSent) rpcError(res, 500, "Internal server error");
    }
  });

  // Stateless: no server-initiated stream and no session to delete.
  const notAllowed = (_req: AuthedRequest, res: Response) => rpcError(res, 405, "Method not allowed");
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);
}
