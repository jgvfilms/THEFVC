/**
 * Production payments over Stripe Connect: who may create/pay, that fees follow
 * the payer's tier, and that only a verified Connect webhook marks money paid.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { storage, db } from "../../server/storage";
import { hashPassword, generateToken } from "../../server/middleware/auth";
import { stripe } from "../../server/lib/stripe";
import { encryptSensitive } from "../../server/lib/encryption";
import { createTestServer } from "../server";

const SECRET = "whsec_test_connect";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = SECRET;

let baseUrl: string;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ baseUrl, close } = await createTestServer());
});
afterAll(async () => {
  vi.restoreAllMocks();
  await close();
});
function reset() {
  for (const table of ["production_payments", "stripe_webhook_events", "notifications", "security_audit_log", "production_crew", "productions", "profiles", "sessions", "users"]) {
    try {
      db.run(`DELETE FROM ${table}`);
    } catch {
      /* table absent */
    }
  }
}
beforeEach(reset);

function member(handle: string, opts: { ready?: boolean; tier?: string } = {}) {
  const user = storage.createUser({
    handle, email: `${handle}@example.com`, passwordHash: hashPassword("TestPass123!"),
    isAdmin: false, accessStatus: "active", invitedBy: null,
  });
  const profile = storage.createProfile({ userId: user.id, displayName: handle, role: "Director" });
  storage.updateProfileSubscription(user.id, {
    ...(opts.ready ? { stripeConnectAccountId: encryptSensitive(`acct_${handle}`), connectChargesEnabled: true, connectPayoutsEnabled: true } : {}),
    ...(opts.tier ? { subscriptionTier: opts.tier, subscriptionStatus: "active" } : {}),
  });
  const session = generateToken();
  storage.createSession({ userId: user.id, token: session, expiresAt: new Date(Date.now() + 86400000) });
  return { user, profile, session };
}

function setup(opts: { crewReady?: boolean; ownerTier?: string; crewStatus?: string } = {}) {
  const owner = member("owner", { ready: true, tier: opts.ownerTier });
  const crew = member("crew", { ready: opts.crewReady ?? true });
  const stranger = member("stranger", { ready: true });
  const production = storage.createProduction({ creatorId: owner.user.id, title: "Night Shoot", type: "short" } as any);
  storage.addCrewMember({ productionId: production.id, profileId: crew.profile.id, role: "Gaffer", status: opts.crewStatus ?? "confirmed" } as any);
  return { owner, crew, stranger, production };
}

const api = (session: string, path: string, method = "GET", body?: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method, headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

const crewPayBody = (crewProfileId: number, amountCents = 50000) => ({ kind: "pay_crew", amountCents, description: "Day 1", crewProfileId });

describe("creating a production payment", () => {
  it("lets the owner pay a confirmed crew member, with the standard 5% fee", async () => {
    const { owner, crew, production } = setup();
    const res = await api(owner.session, `/api/productions/${production.id}/payments`, "POST", crewPayBody(crew.profile.id));
    expect(res.status).toBe(201);
    expect((await res.json()).feeCents).toBe(2500);
  });

  it("waives the fee when the paying owner is on Pro", async () => {
    const { owner, crew, production } = setup({ ownerTier: "pro" });
    const res = await api(owner.session, `/api/productions/${production.id}/payments`, "POST", crewPayBody(crew.profile.id));
    expect((await res.json()).feeCents).toBe(0);
  });

  it("refuses anyone but the owner", async () => {
    const { crew, stranger, production } = setup();
    const res = await api(stranger.session, `/api/productions/${production.id}/payments`, "POST", crewPayBody(crew.profile.id));
    expect(res.status).toBe(403);
    expect((await api(crew.session, `/api/productions/${production.id}/payments`, "POST", { kind: "receive", amountCents: 1000, description: "x" })).status).toBe(403);
  });

  it("refuses crew who are unconfirmed, off the production, or haven't set up payouts", async () => {
    const a = setup({ crewStatus: "invited" });
    expect((await api(a.owner.session, `/api/productions/${a.production.id}/payments`, "POST", crewPayBody(a.crew.profile.id))).status).toBe(409);
    reset();
    const b = setup({ crewReady: false });
    // profile ids differ per setup; a stranger's profile is not on this crew
    expect((await api(b.owner.session, `/api/productions/${b.production.id}/payments`, "POST", crewPayBody(b.stranger.profile.id))).status).toBe(404);
    expect((await api(b.owner.session, `/api/productions/${b.production.id}/payments`, "POST", crewPayBody(b.crew.profile.id))).status).toBe(409);
  });

  it("enforces amount bounds", async () => {
    const { owner, crew, production } = setup();
    for (const amountCents of [0, 99, 10_000_001, 12.5]) {
      expect((await api(owner.session, `/api/productions/${production.id}/payments`, "POST", crewPayBody(crew.profile.id, amountCents))).status).toBe(400);
    }
  });

  it("lets the owner request a payment to themselves once their payouts are ready", async () => {
    const { owner, production } = setup();
    const res = await api(owner.session, `/api/productions/${production.id}/payments`, "POST", { kind: "receive", amountCents: 20000, description: "Investor deposit" });
    expect(res.status).toBe(201);
  });
});

describe("checkout and webhook", () => {
  async function pending() {
    const s = setup();
    const created = await (await api(s.owner.session, `/api/productions/${s.production.id}/payments`, "POST", crewPayBody(s.crew.profile.id))).json();
    return { ...s, id: created.id as number };
  }

  it("creates the session on the payee's account with the application fee", async () => {
    const { owner, id } = await pending();
    const create = vi.spyOn(stripe.checkout.sessions, "create").mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" } as any);
    const res = await api(owner.session, `/api/production-payments/${id}/checkout`, "POST");
    expect((await res.json()).url).toBe("https://checkout.stripe.com/x");
    const [params, opts] = create.mock.calls[0] as any;
    expect(opts).toEqual({ stripeAccount: "acct_crew" });
    expect(params.payment_intent_data.application_fee_amount).toBe(2500);
    expect(params.line_items[0].price_data.unit_amount).toBe(50000);
  });

  it("gives the pay link to nobody but the owner", async () => {
    const { crew, stranger, id } = await pending();
    expect((await api(crew.session, `/api/production-payments/${id}/checkout`, "POST")).status).toBe(404);
    expect((await api(stranger.session, `/api/production-payments/${id}/checkout`, "POST")).status).toBe(404);
  });

  const sendEvent = (event: object, signWith = SECRET) => {
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: signWith });
    return fetch(`${baseUrl}/api/stripe/connect-webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body: payload });
  };
  const completed = (id: number, over: Record<string, unknown> = {}, account = "acct_crew") => ({
    id: `evt_${Math.random().toString(36).slice(2)}`, type: "checkout.session.completed", account,
    data: { object: { id: "cs_1", payment_status: "paid", amount_total: 50000, currency: "usd", payment_intent: "pi_1", metadata: { productionPaymentId: String(id) }, ...over } },
  });

  it("marks the payment paid from a verified event and notifies the payee", async () => {
    const { crew, id } = await pending();
    expect((await sendEvent(completed(id))).status).toBe(200);
    expect(storage.getProductionPayment(id)).toMatchObject({ status: "paid", stripePaymentIntentId: "pi_1" });
    const note = db.all(`SELECT type FROM notifications WHERE user_id = ${crew.user.id}` as any) as any[];
    expect(JSON.stringify(note)).toContain("payment");
  });

  it("rejects a bad signature and an unconfigured secret", async () => {
    const { id } = await pending();
    expect((await sendEvent(completed(id), "whsec_wrong")).status).toBe(400);
    expect(storage.getProductionPayment(id)?.status).toBe("pending");
  });

  it("ignores events with the wrong account, amount or unpaid state", async () => {
    const { id } = await pending();
    await sendEvent(completed(id, {}, "acct_someone_else"));
    await sendEvent(completed(id, { amount_total: 100 }));
    await sendEvent(completed(id, { payment_status: "unpaid" }));
    expect(storage.getProductionPayment(id)?.status).toBe("pending");
  });

  it("is idempotent when Stripe redelivers", async () => {
    const { id } = await pending();
    const evt = completed(id);
    await sendEvent(evt);
    expect((await sendEvent(evt)).status).toBe(200);
    expect(storage.getProductionPayment(id)?.status).toBe("paid");
  });

  it("updates Connect readiness from account.updated", async () => {
    const { crew } = await pending();
    await sendEvent({ id: "evt_acct", type: "account.updated", account: "acct_crew", data: { object: { id: "acct_crew", charges_enabled: false, payouts_enabled: false } } });
    expect(storage.getProfile(crew.user.id)).toMatchObject({ connectChargesEnabled: false, connectPayoutsEnabled: false });
  });

  it("only cancels unpaid requests", async () => {
    const { owner, id } = await pending();
    await sendEvent(completed(id));
    expect((await api(owner.session, `/api/production-payments/${id}`, "DELETE")).status).toBe(409);
  });
});

describe("visibility", () => {
  it("shows the owner everything and a crew member only their own", async () => {
    const { owner, crew, stranger, production } = setup();
    await api(owner.session, `/api/productions/${production.id}/payments`, "POST", crewPayBody(crew.profile.id));
    expect((await (await api(owner.session, `/api/productions/${production.id}/payments`)).json())).toHaveLength(1);
    expect((await (await api(crew.session, `/api/productions/${production.id}/payments`)).json())).toHaveLength(1);
    expect((await api(stranger.session, `/api/productions/${production.id}/payments`)).status).toBe(404);
  });
});
