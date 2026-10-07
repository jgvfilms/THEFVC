// Pro and Studio already pay monthly, so they don't also pay a per-payment
// platform fee. "pro_plus" is the schema's older name for Studio.
const FEE_FREE_TIERS = new Set(["pro", "studio", "pro_plus"]);
const PLATFORM_FEE_RATE = 0.05;

export interface FeePayer {
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
}

/**
 * Platform fee in cents for a payment made by `payer`.
 * A lapsed subscription (canceled or never activated) pays the standard fee.
 * `subscription_status` also carries Connect onboarding state ("onboarding"),
 * so the check excludes lapsed states rather than requiring "active".
 */
export function platformFeeCents(amountCents: number, payer: FeePayer): number {
  const tier = payer.subscriptionTier ?? "free";
  const status = payer.subscriptionStatus ?? "inactive";
  if (FEE_FREE_TIERS.has(tier) && status !== "canceled" && status !== "inactive") {
    return 0;
  }
  return Math.round(amountCents * PLATFORM_FEE_RATE);
}
