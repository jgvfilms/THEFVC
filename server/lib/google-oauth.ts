/**
 * Google sign-in, implemented directly against Google's OAuth2 endpoints.
 *
 * No Passport: this app authenticates with a Bearer session token and has no
 * cookie session for Passport to attach to, so a strategy would be more
 * plumbing than the three requests below.
 *
 * The `state` parameter is an HMAC-signed blob rather than a server-side
 * record, for the same reason — there's no session to hang a nonce off. It
 * carries the invite token through the round trip and is what stops an
 * attacker from feeding us a code they obtained elsewhere (CSRF).
 */
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

// A signed state older than this is refused, which bounds how long a stolen
// authorize URL stays usable.
const STATE_TTL_MS = 10 * 60 * 1000;

export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Where Google sends the browser back. Must match the console entry exactly. */
export function googleRedirectUri(): string {
  const base = (process.env.PUBLIC_BASE_URL || "https://www.thefvc.is").replace(/\/$/, "");
  return `${base}/api/auth/google/callback`;
}

function stateSecret(): string {
  // Reuses the session signing key; both are "proof this server issued it".
  return process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || "";
}

function sign(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function encodeState(inviteToken?: string | null): string {
  const payload = Buffer.from(
    JSON.stringify({ n: randomBytes(8).toString("hex"), t: Date.now(), i: inviteToken || null }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the decoded state, or null if it's forged, malformed, or stale. */
export function decodeState(state: string | undefined): { inviteToken: string | null } | null {
  if (!state) return null;
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;

  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const { t, i } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof t !== "number" || Date.now() - t > STATE_TTL_MS) return null;
    return { inviteToken: i ?? null };
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Force the account chooser so a shared machine doesn't silently reuse
    // whichever Google account happens to be signed in.
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed: ${tokenRes.status}`);
  }
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new Error("Google token exchange returned no access_token");

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) throw new Error(`Google userinfo failed: ${userRes.status}`);

  const info = (await userRes.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return {
    sub: info.sub,
    email: String(info.email || "").trim().toLowerCase(),
    emailVerified: info.email_verified !== false,
    name: info.name,
    picture: info.picture,
  };
}

/**
 * Derive a free handle from the member's email, since Google doesn't give us
 * one. Falls back to a suffix when taken; members can change it later.
 */
export function deriveHandle(email: string, isTaken: (handle: string) => boolean): string {
  let base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 24);

  if (base.length < 2) base = `member${randomBytes(2).toString("hex")}`;

  if (!isTaken(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}${i}`.slice(0, 30);
    if (!isTaken(candidate)) return candidate;
  }
  return `${base.slice(0, 20)}${randomBytes(4).toString("hex")}`;
}
