/**
 * Finishing Connect onboarding must be decided by Stripe, never by the client.
 * POST /api/stripe/onboarding-complete used to set subscription_status to
 * "active" for anyone who called it.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { storage, db } from "../../server/storage";
import { hashPassword, generateToken } from "../../server/middleware/auth";
import { stripe } from "../../server/lib/stripe";
import { encryptSensitive } from "../../server/lib/encryption";
import { createTestServer } from "../server";

let baseUrl: string;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ baseUrl, close } = await createTestServer());
});
afterAll(async () => {
  vi.restoreAllMocks();
  await close();
});
beforeEach(() => {
  for (const table of ["security_audit_log", "profiles", "sessions", "users"]) {
    try {
      db.run(`DELETE FROM ${table}`);
    } catch {
      /* table absent */
    }
  }
});

function member(status: string | null, connect = true) {
  const user = storage.createUser({
    handle: "conn", email: "conn@example.com", passwordHash: hashPassword("TestPass123!"),
    isAdmin: false, accessStatus: "active", invitedBy: null,
  });
  storage.createProfile({ userId: user.id, displayName: "Conn", role: "Director" });
  storage.updateProfileSubscription(user.id, {
    ...(connect ? { stripeConnectAccountId: encryptSensitive("acct_test_1") } : {}),
    ...(status ? { subscriptionStatus: status } : {}),
  });
  const session = generateToken();
  storage.createSession({ userId: user.id, token: session, expiresAt: new Date(Date.now() + 86400000) });
  return { user, session };
}

const complete = (session: string) =>
  fetch(`${baseUrl}/api/stripe/onboarding-complete`, { method: "POST", headers: { Authorization: `Bearer ${session}` } });

const flags = (userId: number) => {
  const p = storage.getProfile(userId)!;
  return { charges: !!p.connectChargesEnabled, payouts: !!p.connectPayoutsEnabled, status: p.subscriptionStatus };
};

describe("POST /api/stripe/onboarding-complete", () => {
  it("does nothing for a member who never started onboarding", async () => {
    const { user, session } = member(null, false);
    expect((await complete(session)).status).toBe(400);
    expect(flags(user.id)).toMatchObject({ charges: false, payouts: false });
  });

  it("stays not-ready while Stripe says the account is incomplete", async () => {
    const { user, session } = member("inactive");
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue({ charges_enabled: true, payouts_enabled: false } as any);
    expect((await (await complete(session)).json()).onboardingComplete).toBe(false);
    expect(flags(user.id)).toMatchObject({ charges: true, payouts: false });
  });

  it("is ready only when Stripe confirms charges and payouts", async () => {
    const { user, session } = member("inactive");
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue({ charges_enabled: true, payouts_enabled: true } as any);
    expect((await (await complete(session)).json()).onboardingComplete).toBe(true);
    expect(flags(user.id)).toMatchObject({ charges: true, payouts: true });
  });

  it("never touches the subscription status", async () => {
    const { user, session } = member("active");
    vi.spyOn(stripe.accounts, "retrieve").mockResolvedValue({ charges_enabled: true, payouts_enabled: true } as any);
    await complete(session);
    expect(flags(user.id).status).toBe("active");
  });
});
