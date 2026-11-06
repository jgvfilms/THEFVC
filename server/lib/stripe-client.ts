/**
 * The Stripe client, isolated in its own module.
 *
 * This exists separately from lib/stripe.ts to break an import cycle:
 * lib/stripe.ts (webhook routing) needs lib/invoicing.ts, and lib/invoicing.ts
 * needs the client. Both import from here instead.
 *
 * Pin the API version. Stripe reshapes invoice parameters between versions —
 * `unit_amount` on invoiceitems has already moved on in later versions — so an
 * unpinned client can silently break line-item creation on a Stripe-side bump.
 * When you deliberately upgrade, re-test the send flow end to end.
 */

import Stripe from "stripe";

export const STRIPE_API_VERSION = "2023-10-16" as const;

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "[REDACTED]", {
  apiVersion: STRIPE_API_VERSION,
});

/** True when a usable secret key is configured. */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!key && key !== "[REDACTED]" && key.startsWith("sk_");
}
