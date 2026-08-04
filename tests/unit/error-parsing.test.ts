/**
 * Regression test for the client error-parsing bug found while diagnosing
 * a live login failure: apiRequest's thrown Error has message
 * `${status}: ${body}` (see throwIfResNotOk in client/src/lib/queryClient.ts),
 * but callers were doing a plain JSON.parse(err.message), which always
 * threw on the "<status>: " prefix and silently fell back to a generic
 * message — meaning every failure (wrong password, rate-limited, IP
 * blocked, server error) looked identical to the user no matter what
 * actually went wrong.
 */
import { describe, it, expect } from "vitest";
import { parseApiErrorMessage } from "@/lib/queryClient";

describe("parseApiErrorMessage", () => {
  it("extracts the error field from a '<status>: <json>' Error", () => {
    const err = new Error('401: {"error":"Invalid credentials"}');
    expect(parseApiErrorMessage(err, "fallback")).toBe("Invalid credentials");
  });

  it("handles multi-digit status codes and extra JSON fields", () => {
    const err = new Error(
      '429: {"error":"Rate limit exceeded. Your IP has been temporarily blocked.","retryAfter":900}'
    );
    expect(parseApiErrorMessage(err, "fallback")).toBe(
      "Rate limit exceeded. Your IP has been temporarily blocked."
    );
  });

  it("extracts the IP-blocked message specifically (the bug that started this)", () => {
    const err = new Error('403: {"error":"Your IP has been blocked due to abuse."}');
    expect(parseApiErrorMessage(err, "fallback")).toBe("Your IP has been blocked due to abuse.");
  });

  it("falls back to the provided default when the body has no error field", () => {
    const err = new Error('500: {"message":"oops"}');
    expect(parseApiErrorMessage(err, "fallback")).toBe("fallback");
  });

  it("falls back when the body isn't JSON at all", () => {
    const err = new Error("502: Bad Gateway");
    expect(parseApiErrorMessage(err, "fallback")).toBe("fallback");
  });

  it("falls back for non-Error values", () => {
    expect(parseApiErrorMessage("not an error", "fallback")).toBe("fallback");
    expect(parseApiErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
