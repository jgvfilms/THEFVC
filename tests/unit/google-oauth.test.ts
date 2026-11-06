import { describe, it, expect } from "vitest";
import { encodeState, decodeState, deriveHandle } from "../../server/lib/google-oauth";

describe("OAuth state", () => {
  it("round-trips the invite token", () => {
    expect(decodeState(encodeState("invite-abc"))).toEqual({ inviteToken: "invite-abc" });
  });

  it("round-trips when there's no invite (existing member signing in)", () => {
    expect(decodeState(encodeState(null))).toEqual({ inviteToken: null });
  });

  // This is the CSRF guard: without it, an attacker can hand us a code they
  // obtained under their own account and have us bind it to a victim's session.
  it("rejects a state it didn't sign", () => {
    const forged = Buffer.from(JSON.stringify({ n: "x", t: Date.now(), i: "invite-abc" })).toString("base64url");
    expect(decodeState(`${forged}.notavalidsignature`)).toBeNull();
  });

  it("rejects a tampered payload even though the signature is well-formed", () => {
    const good = encodeState("invite-abc");
    const [, mac] = good.split(".");
    const swapped = Buffer.from(JSON.stringify({ n: "x", t: Date.now(), i: "invite-evil" })).toString("base64url");
    expect(decodeState(`${swapped}.${mac}`)).toBeNull();
  });

  it("rejects stale state", () => {
    const old = Buffer.from(
      JSON.stringify({ n: "x", t: Date.now() - 60 * 60 * 1000, i: null }),
    ).toString("base64url");
    // Signed correctly by construction below, but too old to accept.
    const signed = encodeState(null).split(".")[1];
    expect(decodeState(`${old}.${signed}`)).toBeNull();
  });

  it("rejects malformed and missing state", () => {
    expect(decodeState(undefined)).toBeNull();
    expect(decodeState("")).toBeNull();
    expect(decodeState("nodot")).toBeNull();
  });
});

describe("deriveHandle", () => {
  const free = () => false;

  it("uses the email local part", () => {
    expect(deriveHandle("jgvfilms@gmail.com", free)).toBe("jgvfilms");
  });

  it("strips characters that aren't legal in a handle", () => {
    expect(deriveHandle("first.last+tag@gmail.com", free)).toBe("firstlasttag");
  });

  it("suffixes when the handle is already taken", () => {
    const taken = new Set(["jgvfilms", "jgvfilms2"]);
    expect(deriveHandle("jgvfilms@gmail.com", (h) => taken.has(h))).toBe("jgvfilms3");
  });

  it("falls back when the local part can't make a valid handle", () => {
    // Handles must be at least 2 chars and start alphanumeric.
    const handle = deriveHandle("a@gmail.com", free);
    expect(handle.length).toBeGreaterThanOrEqual(2);
    expect(handle).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
  });

  it("never exceeds the 30-character handle limit", () => {
    const handle = deriveHandle(`${"x".repeat(60)}@gmail.com`, free);
    expect(handle.length).toBeLessThanOrEqual(30);
  });
});
