/**
 * Payments tied to a production, settled through the payee's own Stripe Connect
 * account (a direct charge). The payee is the merchant of record, so a dispute
 * or refund is theirs, and FVC only collects the platform fee.
 *
 * Stripe is the source of truth for whether money moved: a row is marked paid
 * only from a verified Connect webhook, never from a client call.
 */
import type Stripe from "stripe";
import { storage } from "../storage";
import { stripe } from "./stripe-client";
import { platformFeeCents, type FeePayer } from "./platform-fee";
import type { ProductionPayment } from "@shared/schema";

export const MIN_PAYMENT_CENTS = 100; // $1
export const MAX_PAYMENT_CENTS = 10_000_000; // $100,000

export class PaymentError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface CreateRequest {
  productionId: number;
  actingUserId: number;
  kind: "receive" | "pay_crew";
  amountCents: number;
  description: string;
  crewProfileId?: number; // pay_crew only
}

export function createProductionPayment(req: CreateRequest): ProductionPayment {
  const production = storage.getProduction(req.productionId);
  if (!production) throw new PaymentError(404, "Production not found");
  // Only the owner moves a production's money.
  if (production.creatorId !== req.actingUserId) throw new PaymentError(403, "Not authorized");
  if (!Number.isInteger(req.amountCents) || req.amountCents < MIN_PAYMENT_CENTS || req.amountCents > MAX_PAYMENT_CENTS) {
    throw new PaymentError(400, "Amount must be between $1 and $100,000.");
  }

  let payeeUserId = production.creatorId;
  let payerUserId: number | null = null;
  let payer: FeePayer = { subscriptionTier: null, subscriptionStatus: null };

  if (req.kind === "pay_crew") {
    const member = storage.getCrewByProduction(production.id).find((c) => c.profileId === req.crewProfileId);
    if (!member?.profile) throw new PaymentError(404, "That person is not on this production's crew.");
    if (member.status !== "confirmed") throw new PaymentError(409, "They need to confirm they're on this production first.");
    if (member.profile.userId === production.creatorId) throw new PaymentError(400, "You can't pay yourself.");
    payeeUserId = member.profile.userId;
    payerUserId = production.creatorId;
    const ownerProfile = storage.getProfile(production.creatorId);
    payer = { subscriptionTier: ownerProfile?.subscriptionTier ?? null, subscriptionStatus: ownerProfile?.subscriptionStatus ?? null };
  }

  const payee = storage.getProfile(payeeUserId);
  if (!payee?.stripeConnectAccountId || !payee.connectChargesEnabled || !payee.connectPayoutsEnabled) {
    throw new PaymentError(409, req.kind === "pay_crew"
      ? "This person hasn't finished setting up payouts yet."
      : "Finish setting up payouts before requesting payment.");
  }

  return storage.createProductionPayment({
    productionId: production.id,
    kind: req.kind,
    payeeUserId,
    payerUserId,
    amountCents: req.amountCents,
    feeCents: platformFeeCents(req.amountCents, payer),
    description: req.description,
  });
}

/**
 * A fresh Checkout Session on the payee's account. Sessions expire after 24h, so
 * one is made per request rather than stored; the URL is an unauthenticated pay
 * link and is returned only to whoever is allowed to pay.
 */
export async function createCheckoutUrl(payment: ProductionPayment, urls: { success: string; cancel: string }): Promise<string> {
  const payee = storage.getProfile(payment.payeeUserId);
  const accountId = payee?.stripeConnectAccountId;
  if (!accountId || !payee.connectChargesEnabled) throw new PaymentError(409, "The payee can't accept payments right now.");
  const production = storage.getProduction(payment.productionId);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: payment.currency,
          unit_amount: payment.amountCents,
          product_data: { name: payment.description.slice(0, 120), description: production ? `Production: ${production.title}`.slice(0, 200) : undefined },
        },
      }],
      payment_intent_data: {
        ...(payment.feeCents > 0 ? { application_fee_amount: payment.feeCents } : {}),
        metadata: { productionPaymentId: String(payment.id) },
      },
      metadata: { productionPaymentId: String(payment.id) },
      success_url: urls.success,
      cancel_url: urls.cancel,
    },
    { stripeAccount: accountId },
  );
  storage.setProductionPaymentSession(payment.id, session.id);
  if (!session.url) throw new PaymentError(502, "Stripe didn't return a payment link.");
  return session.url;
}

/** Handle one verified event from the Connect webhook endpoint. */
export async function handleConnectEvent(event: Stripe.Event): Promise<void> {
  if (!storage.claimWebhookEvent(event.id, event.type)) return;
  try {
    await routeConnectEvent(event);
    storage.markWebhookEventProcessed(event.id);
  } catch (err: any) {
    storage.markWebhookEventProcessed(event.id, String(err?.message || err));
    throw err;
  }
}

async function routeConnectEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const profile = storage.getProfileByStripeAccountId(account.id);
      if (profile) {
        storage.updateProfileSubscription(profile.userId, {
          connectChargesEnabled: !!account.charges_enabled,
          connectPayoutsEnabled: !!account.payouts_enabled,
        });
      }
      return;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = parseInt(session.metadata?.productionPaymentId ?? "", 10);
      if (!Number.isInteger(id)) return; // not one of ours
      const payment = storage.getProductionPayment(id);
      if (!payment || session.payment_status !== "paid") return;
      // The session must be the one we made, on the payee's own account, for the
      // amount we recorded. Anything else is ignored rather than trusted.
      const payee = storage.getProfile(payment.payeeUserId);
      if (!event.account || event.account !== payee?.stripeConnectAccountId) return;
      if (session.amount_total !== payment.amountCents || session.currency !== payment.currency) return;
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
      if (storage.markProductionPaymentPaid(id, pi)) {
        storage.createNotification({
          userId: payment.payeeUserId,
          type: "payment",
          title: "You received a payment",
          message: payment.description.slice(0, 140),
          linkUrl: `/app/productions/${payment.productionId}`,
          metadata: JSON.stringify({ productionPaymentId: id }),
        } as any);
      }
      return;
    }
    default:
      return; // payout.* and the rest are visible in the member's own Stripe Express dashboard
  }
}
