import { describe, it, expect } from "vitest";
import { platformFeeCents } from "../../server/lib/platform-fee";

describe("platformFeeCents", () => {
  it("charges 5% on the free tier", () => {
    expect(platformFeeCents(170000, { subscriptionTier: "free", subscriptionStatus: "inactive" })).toBe(8500);
    expect(platformFeeCents(170000, { subscriptionTier: null, subscriptionStatus: null })).toBe(8500);
  });

  it("waives the fee for active Pro and Studio members", () => {
    for (const tier of ["pro", "studio", "pro_plus"]) {
      expect(platformFeeCents(170000, { subscriptionTier: tier, subscriptionStatus: "active" })).toBe(0);
    }
  });

  it("keeps the waiver while a subscriber is onboarding to Connect", () => {
    expect(platformFeeCents(170000, { subscriptionTier: "pro", subscriptionStatus: "onboarding" })).toBe(0);
  });

  it("charges the fee again once a subscription lapses", () => {
    expect(platformFeeCents(170000, { subscriptionTier: "pro", subscriptionStatus: "canceled" })).toBe(8500);
    expect(platformFeeCents(170000, { subscriptionTier: "studio", subscriptionStatus: "inactive" })).toBe(8500);
  });
});
