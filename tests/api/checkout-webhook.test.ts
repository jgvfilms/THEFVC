/**
 * checkout.session.completed stores Stripe's amount_total as-is: both Stripe
 * and the payments column are integer cents. It used to divide by 100.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { storage, db } from "../../server/storage";
import { hashPassword } from "../../server/middleware/auth";
import { handleStripeWebhook } from "../../server/lib/stripe";

beforeEach(() => {
  for (const table of ["payments", "profiles", "sessions", "users"]) {
    try {
      db.run(`DELETE FROM ${table}`);
    } catch {
      /* table absent in this bootstrap */
    }
  }
});

describe("checkout.session.completed", () => {
  it("records the subscription payment in cents", async () => {
    const user = storage.createUser({
      handle: "payer",
      email: "payer@example.com",
      passwordHash: hashPassword("TestPass123!"),
      isAdmin: false,
      accessStatus: "active",
      invitedBy: null,
    });
    storage.createProfile({ userId: user.id, displayName: "Payer", role: "Director" });

    await handleStripeWebhook({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: "sub_test_1",
          customer: "cus_test_1",
          amount_total: 1999,
          currency: "usd",
          payment_intent: "pi_test_1",
          metadata: { userId: String(user.id), tierName: "pro" },
        },
      },
    } as any);

    const [payment] = storage.getPaymentsByUser(user.id);
    expect(payment.amount).toBe(1999);
  });
});
