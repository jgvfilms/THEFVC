/**
 * PRD-019: Stripe Connect Production Integration
 * 
 * Service layer for Stripe Connect account management,
 * payment processing, and webhook handling.
 */

import Stripe from "stripe";
import { storage } from "../storage";
import { encryptSensitive } from "./encryption";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "[REDACTED]", {
  apiVersion: "2023-10-16",
});

/**
 * Create a Stripe Connect Express account for a user.
 * Stores the account ID on the user's profile.
 */
export async function createStripeConnectAccount(userId: number, email: string): Promise<string> {
  const account = await stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  storage.updateProfileSubscription(userId, {
    stripeConnectAccountId: encryptSensitive(account.id),
    subscriptionStatus: "onboarding",
  });

  return account.id;
}

/**
 * Generate a Stripe-hosted onboarding link for a connected account.
 * User completes identity verification and tax setup here.
 */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return link.url;
}

/**
 * Create a PaymentIntent for a charge to a connected account.
 * Used when a customer pays a crew member.
 */
export async function createPaymentIntent(
  amount: number,
  currency: string,
  connectedAccountId: string,
  description?: string
): Promise<string> {
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency,
      description,
      application_fee_amount: Math.round(amount * 0.05), // 5% platform fee
    },
    {
      stripeAccount: connectedAccountId,
    }
  );

  return paymentIntent.id;
}

/**
 * Retrieve a payout for tracking purposes.
 */
export async function getPayout(payoutId: string, connectedAccountId: string) {
  return await stripe.payouts.retrieve(payoutId, {
    stripeAccount: connectedAccountId,
  });
}

/**
 * Handle Stripe webhook events.
 * Call this from the webhook endpoint to update payment statuses.
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      // Look up payment by Stripe PaymentIntent ID
      const allPayments = storage.getAllPayments(100000);
      const payment = allPayments.find((p) => p.stripePaymentIntentId === intent.id);
      if (payment) {
        storage.updatePaymentStatus(payment.id, "succeeded");
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const allPayments = storage.getAllPayments(100000);
      const payment = allPayments.find((p) => p.stripePaymentIntentId === intent.id);
      if (payment) {
        storage.updatePaymentStatus(payment.id, "failed");
      }
      break;
    }

    case "payout.paid": {
      const payout = event.data.object as Stripe.Payout;
      // Log payout success
      storage.createSecurityLog({
        userId: 0,
        action: "payout_paid",
        ipAddress: "",
        userAgent: "",
        details: JSON.stringify({ payoutId: payout.id, amount: payout.amount, currency: payout.currency }),
        requestId: null,
      });
      break;
    }

    case "payout.failed": {
      const payout = event.data.object as Stripe.Payout;
      storage.createSecurityLog({
        userId: 0,
        action: "payout_failed",
        ipAddress: "",
        userAgent: "",
        details: JSON.stringify({ payoutId: payout.id, amount: payout.amount, failureCode: payout.failure_code }),
        requestId: null,
      });
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      // Update profile flags based on account capabilities
      const profile = storage.getProfileByStripeAccountId(account.id);
      if (profile) {
        storage.updateProfileSubscription(profile.userId, {
          subscriptionStatus:
            account.charges_enabled && account.payouts_enabled ? "active" : "onboarding",
        });
      }
      break;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Handle subscription checkout completion
      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
        const customerId = session.customer;
        const userId = session.metadata?.userId;

        if (userId) {
          // Create a payment record for the subscription
          storage.createPayment({
            userId: parseInt(userId),
            amount: Math.round((session.amount_total || 0) / 100), // Convert cents to dollars
            currency: session.currency || "usd",
            status: "succeeded",
            stripeChargeId: session.payment_intent ? (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id) : null,
            stripePaymentIntentId: session.payment_intent ? (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id) : null,
            stripeSubscriptionId: subscriptionId,
            description: `Subscription: ${session.metadata?.tierName || "subscription"}`,
          });

          // Update profile subscription status
          storage.updateProfileSubscription(parseInt(userId), {
            stripeCustomerId: encryptSensitive(typeof customerId === "string" ? customerId : customerId?.id || ""),
            subscriptionStatus: "active",
            subscriptionTier: session.metadata?.tierName || undefined,
          });

          storage.createSecurityLog({
            userId: parseInt(userId),
            action: "subscription_activated",
            ipAddress: "",
            userAgent: "",
            details: JSON.stringify({ subscriptionId, tierName: session.metadata?.tierName }),
            requestId: null,
          });
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

      if (customerId) {
        const profile = storage.getProfileByStripeCustomerId(customerId);
        if (profile) {
          const status = subscription.status === "active" ? "active"
            : subscription.status === "canceled" || subscription.status === "unpaid" ? "canceled"
            : subscription.status === "past_due" ? "past_due"
            : "inactive";

          storage.updateProfileSubscription(profile.userId, {
            subscriptionStatus: status,
          });

          storage.createSecurityLog({
            userId: profile.userId,
            action: "subscription_status_changed",
            ipAddress: "",
            userAgent: "",
            details: JSON.stringify({ subscriptionId: subscription.id, status: subscription.status }),
            requestId: null,
          });
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

      if (customerId) {
        const profile = storage.getProfileByStripeCustomerId(customerId);
        if (profile) {
          storage.updateProfileSubscription(profile.userId, {
            subscriptionStatus: "canceled",
          });

          storage.createSecurityLog({
            userId: profile.userId,
            action: "subscription_canceled",
            ipAddress: "",
            userAgent: "",
            details: JSON.stringify({ subscriptionId: subscription.id }),
            requestId: null,
          });
        }
      }
      break;
    }

    default:
      // Unexpected event type, do nothing
      break;
  }
}
