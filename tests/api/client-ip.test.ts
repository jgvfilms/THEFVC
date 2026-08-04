/**
 * Regression tests for getClientIp()'s X-Forwarded-For handling.
 *
 * Found in production: with TRUSTED_PROXY_HOPS at its default of 1 but
 * Railway putting two proxy hops in front of the app, getClientIp()
 * returned Railway's *edge* address instead of the caller's. Railway's
 * edge fleet rotates, so rate-limit counts scattered across many edge IPs
 * and the limiter never fired — 22 consecutive bad logins across 7 edge
 * IPs never tripped a limit of 10. These tests pin the index arithmetic
 * that governs that behavior, in both the under- and over-trusting
 * directions, since both fail silently.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Request } from "express";

/**
 * getClientIp reads TRUSTED_PROXY_HOPS once at module load, so each case
 * sets the env var and then re-imports the module with a fresh registry.
 */
async function getClientIpWithHops(hops: string | undefined) {
  const prior = process.env.TRUSTED_PROXY_HOPS;
  if (hops === undefined) {
    delete process.env.TRUSTED_PROXY_HOPS;
  } else {
    process.env.TRUSTED_PROXY_HOPS = hops;
  }
  vi.resetModules();
  const mod = await import("../../server/middleware/rateLimit");
  return { getClientIp: mod.getClientIp, restore: () => {
    if (prior === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = prior;
  } };
}

function reqWith(xff: string | undefined, socketAddr = "10.0.0.1"): Request {
  return {
    headers: xff === undefined ? {} : { "x-forwarded-for": xff },
    socket: { remoteAddress: socketAddr },
  } as unknown as Request;
}

describe("getClientIp — X-Forwarded-For trust boundary", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("with hops=2 (Railway), resolves the real client, not the edge", async () => {
    const { getClientIp, restore: r } = await getClientIpWithHops("2");
    restore = r;
    // What the app actually receives on Railway: client first, edge appended.
    expect(getClientIp(reqWith("172.56.5.182, 152.233.47.66"))).toBe("172.56.5.182");
  });

  it("with hops=1 on a 2-hop chain, wrongly returns the proxy — the production bug", async () => {
    const { getClientIp, restore: r } = await getClientIpWithHops("1");
    restore = r;
    // Documents the broken behavior this value caused, so the distinction
    // isn't lost: it returns infrastructure, not the caller.
    expect(getClientIp(reqWith("172.56.5.182, 152.233.47.66"))).toBe("152.233.47.66");
  });

  it("with hops=2, ignores a client-supplied spoof ahead of the trusted suffix", async () => {
    const { getClientIp, restore: r } = await getClientIpWithHops("2");
    restore = r;
    // Caller sends their own XFF; proxies append client + edge after it.
    // The spoofed leading value must not be selected.
    const resolved = getClientIp(reqWith("198.51.100.99, 172.56.5.182, 152.233.47.66"));
    expect(resolved).not.toBe("198.51.100.99");
    expect(resolved).toBe("172.56.5.182");
  });

  it("falls back to the socket address when the chain is shorter than the trusted hop count", async () => {
    const { getClientIp, restore: r } = await getClientIpWithHops("3");
    restore = r;
    // index would go negative — must not read a client-supplied value.
    expect(getClientIp(reqWith("172.56.5.182", "10.0.0.7"))).toBe("10.0.0.7");
  });

  it("falls back to the socket address when no XFF header is present", async () => {
    const { getClientIp, restore: r } = await getClientIpWithHops("2");
    restore = r;
    expect(getClientIp(reqWith(undefined, "10.0.0.9"))).toBe("10.0.0.9");
  });
});
