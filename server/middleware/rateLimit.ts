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

const RATE_LIMIT_FILE = join(process.cwd(), "data", ".rate-limits.json");

// Ensure data directory exists
try {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
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
 * Usage: app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, identifier: "auth" }))
 */
export interface RateLimitOptions {
  windowMs: number;   // time window in ms
  max: number;        // max requests per window
  identifier?: string; // route group identifier for the key
  skipSuccessful?: boolean; // don't count successful (2xx) responses
}

export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max, identifier = "default", skipSuccessful = false } = opts;

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);

    // Check if IP is blocked
    const isBlocked = await isIpBlocked(ip);
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
      if (entry.count > max) {
        // Block the IP
        await blockIp(ip, "rate_limit_abuse");
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
 */
async function isIpBlocked(ip: string): Promise<boolean> {
  try {
    const result = await db
      .select()
      .from(blockedIps)
      .where(
        and(
          eq(blockedIps.ipAddress, ip),
          eq(blockedIps.isActive, true),
          or(isNull(blockedIps.expiresAt), gt(blockedIps.expiresAt, new Date()))
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
async function blockIp(ip: string, reason: string): Promise<void> {
  try {
    await db.insert(blockedIps).values({
      ipAddress: ip,
      reason,
      blockedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour default
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
