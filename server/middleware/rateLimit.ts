import type { Request, Response, NextFunction } from "express";
import { db } from "../storage";
import { blockedIps } from "@shared/schema";
import { eq, and, gt, or, lt, isNull } from "drizzle-orm";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * In-memory rate limit store with file-backed persistence.
 * Keyed by `${ip}:${identifier}`. Stores { count, resetTime }.
 * Data is loaded from disk on startup and periodically flushed to survive restarts.
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// PRD-024: Configurable via RATE_LIMIT_DIR so this can be pointed at the same
// mounted persistent volume as DATABASE_PATH on hosts with an ephemeral
// filesystem (e.g. Railway). Previously hardcoded to process.cwd()/data,
// which is NOT the volume mount path — persistence silently stopped
// surviving redeploys despite this file's own comment claiming otherwise.
const RATE_LIMIT_DIR = process.env.RATE_LIMIT_DIR || join(process.cwd(), "data");
const RATE_LIMIT_FILE = join(RATE_LIMIT_DIR, ".rate-limits.json");

// Ensure the directory exists
try {
  mkdirSync(RATE_LIMIT_DIR, { recursive: true });
} catch {}

// Load persisted rate limit data on startup
const rateLimitStore = new Map<string, RateLimitEntry>();
if (existsSync(RATE_LIMIT_FILE)) {
  try {
    const data = JSON.parse(readFileSync(RATE_LIMIT_FILE, "utf8")) as Record<string, RateLimitEntry>;
    for (const [key, value] of Object.entries(data)) {
      // Only load entries that haven't expired yet
      if (value.resetTime > Date.now()) {
        rateLimitStore.set(key, value);
      }
    }
  } catch {
    // Corrupted file — start fresh
  }
}

// Flush to disk every 60 seconds
setInterval(() => {
  try {
    if (rateLimitStore.size === 0) {
      // Remove file if no active entries
      writeFileSync(RATE_LIMIT_FILE, "{}");
      return;
    }
    const data: Record<string, RateLimitEntry> = {};
    const now = Date.now();
    for (const [key, value] of rateLimitStore) {
      // Skip expired entries when persisting
      if (value.resetTime > now) {
        data[key] = value;
      }
    }
    writeFileSync(RATE_LIMIT_FILE, JSON.stringify(data));
  } catch {
    // best-effort — don't crash the server
  }
}, 60_000);

/**
 * Rate limiting middleware.
 * Limits each IP to `max` requests per `windowMs` for a given route group.
 * Automatically blocks IPs that exceed the threshold and records them
 * in the blocked_ips table.
 *
 * The resulting block is scoped to `opts.scope` when given — it only
 * affects other rateLimit() instances registered with that same scope,
 * not the whole API. Omitting `scope` blocks every route (the historical
 * behavior), so use it deliberately for route groups where "locked out of
 * this" should reasonably mean "locked out of everything" (e.g. payments).
 *
 * Usage: app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, identifier: "login", scope: "auth" }))
 */
export interface RateLimitOptions {
  windowMs: number;   // time window in ms
  max: number;        // max requests per window
  identifier?: string; // route group identifier for the key
  skipSuccessful?: boolean; // don't count successful (2xx) responses
  scope?: string;      // if set, an auto-triggered block only applies to rateLimit() calls sharing this scope
  blockDurationMs?: number; // how long an auto-triggered block lasts (default 1 hour)
}

const DEFAULT_BLOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Multiplier applied to every `max`, read per-request from
 * RATE_LIMIT_MAX_MULTIPLIER (default 1 = production behavior, unchanged).
 *
 * An integration suite legitimately makes far more auth calls than any real
 * user — routes.test.ts alone logs in 13+ times as per-test setup, against a
 * production limit of 10 per window — so without this, tests trip the limiter
 * partway through a run and later tests fail for reasons unrelated to what
 * they're asserting. Read at request time rather than closed over at
 * factory time so a test can raise or restore it around a specific case
 * (e.g. the block-scoping test, which needs the real strict limit to fire).
 */
function getMaxMultiplier(): number {
  const parsed = parseInt(process.env.RATE_LIMIT_MAX_MULTIPLIER || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max, identifier = "default", skipSuccessful = false, scope, blockDurationMs = DEFAULT_BLOCK_DURATION_MS } = opts;

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const effectiveMax = max * getMaxMultiplier();

    // Check if IP is blocked (scoped: a block only applies here if it has
    // no scope of its own — a global block — or its scope matches ours)
    const isBlocked = await isIpBlocked(ip, scope);
    if (isBlocked) {
      return res.status(403).json({ error: "Your IP has been blocked due to abuse." });
    }

    const key = `${ip}:${identifier}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    } else {
      entry.count++;
      if (entry.count > effectiveMax) {
        // Block the IP, scoped to this route group only (unless scope is
        // omitted, in which case this blocks every route, same as before).
        await blockIp(ip, "rate_limit_abuse", scope, blockDurationMs);
        rateLimitStore.delete(key);
        return res.status(429).json({
          error: "Rate limit exceeded. Your IP has been temporarily blocked.",
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        });
      }
    }

    // Track response for skipSuccessful
    if (skipSuccessful) {
      const originalSend = res.send.bind(res);
      res.send = ((body: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Decrement count for successful requests
          const current = rateLimitStore.get(key);
          if (current) current.count = Math.max(0, current.count - 1);
        }
        return originalSend(body);
      }) as any;
    }

    next();
  };
}

/**
 * Get the real client IP, respecting X-Forwarded-For — but only for the
 * number of trusted reverse-proxy hops this deployment actually has.
 *
 * X-Forwarded-For is client-suppliable. Trusting the leftmost value (the
 * previous behavior) let any requester spoof their IP for rate-limit and
 * IP-block purposes in both directions: rotate a fake IP each request to
 * dodge the limit, or forge a victim's real IP to get *them* auto-blocked.
 *
 * TRUSTED_PROXY_HOPS (default 1) should match the actual deployment
 * topology — 1 for a single nginx reverse proxy in front of the app, per
 * the deployment docs. Only the last N entries in the chain were appended
 * by proxies you control; anything before that came from the client.
 */
const TRUSTED_PROXY_HOPS = parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10);

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && TRUSTED_PROXY_HOPS > 0) {
    const chain = forwarded.split(",").map((ip) => ip.trim()).filter(Boolean);
    const index = chain.length - TRUSTED_PROXY_HOPS;
    if (index >= 0 && chain[index]) {
      return chain[index];
    }
  }
  return req.socket.remoteAddress || "unknown";
}

/**
 * Check if an IP is currently blocked in the database.
 *
 * A block with no scope (null) applies everywhere. A scoped block only
 * applies when the caller's own scope matches it — e.g. a block scoped to
 * "auth" doesn't affect requests to /api/profiles or /api/payments.
 */
async function isIpBlocked(ip: string, scope?: string): Promise<boolean> {
  try {
    const result = await db
      .select()
      .from(blockedIps)
      .where(
        and(
          eq(blockedIps.ipAddress, ip),
          eq(blockedIps.isActive, true),
          or(isNull(blockedIps.expiresAt), gt(blockedIps.expiresAt, new Date())),
          scope ? or(isNull(blockedIps.scope), eq(blockedIps.scope, scope)) : isNull(blockedIps.scope)
        )
      )
      .get();
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Block an IP address by inserting into the blocked_ips table.
 */
async function blockIp(ip: string, reason: string, scope?: string, durationMs: number = DEFAULT_BLOCK_DURATION_MS): Promise<void> {
  try {
    await db.insert(blockedIps).values({
      ipAddress: ip,
      reason,
      scope: scope ?? null,
      blockedAt: new Date(),
      expiresAt: new Date(Date.now() + durationMs),
      isActive: true,
    });
  } catch {
    // ignore duplicate key errors
  }
}

/**
 * Manually block an IP (admin action).
 */
export async function blockIpManual(ip: string, reason: string, durationHours?: number): Promise<void> {
  await db.insert(blockedIps).values({
    ipAddress: ip,
    reason,
    blockedAt: new Date(),
    expiresAt: durationHours ? new Date(Date.now() + durationHours * 3600 * 1000) : null,
    isActive: true,
  });
}

/**
 * Unblock an IP.
 */
export async function unblockIp(ip: string): Promise<void> {
  await db
    .update(blockedIps)
    .set({ isActive: false })
    .where(eq(blockedIps.ipAddress, ip));
}

/**
 * Clean up expired blocked IPs.
 */
export async function cleanupExpiredBlocks(): Promise<number> {
  return await db
    .update(blockedIps)
    .set({ isActive: false })
    .where(and(eq(blockedIps.isActive, true), lt(blockedIps.expiresAt, new Date())))
    .run().changes;
}
