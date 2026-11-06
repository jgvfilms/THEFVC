/**
 * Production payments over Stripe Connect. See lib/production-payments.ts for
 * the money model. Identity comes from the session; the payment's payee/payer
 * decide who may see or pay it, never a request parameter.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import { storage } from "./storage";
import { stripe } from "./lib/stripe-client";
import { syncConnectOnboarding } from "./lib/stripe";
import {
  PaymentError, createCheckoutUrl, createProductionPayment, handleConnectEvent,
  MAX_PAYMENT_CENTS, MIN_PAYMENT_CENTS,
} from "./lib/production-payments";

const createSchema = z.object({
  kind: z.enum(["receive", "pay_crew"]),
  amountCents: z.number().int().min(MIN_PAYMENT_CENTS).max(MAX_PAYMENT_CENTS),
  description: z.string().trim().min(1).max(200),
  crewProfileId: z.number().int().positive().optional(),
}).refine((v) => v.kind !== "pay_crew" || v.crewProfileId, { message: "Choose who to pay", path: ["crewProfileId"] });

const idParam = (v: unknown) => {
  const n = parseInt(Array.isArray(v) ? v[0] : String(v ?? ""), 10);
  return Number.isInteger(n) ? n : null;
};

const baseUrl = () => process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || "https://www.thefvc.is";

function fail(res: Response, err: unknown) {
  if (err instanceof PaymentError) return res.status(err.status).json({ error: err.message });
  console.error("[production-payments]", err);
  return res.status(500).json({ error: "Something went wrong with that payment." });
}

export function registerProductionPaymentRoutes(app: Express): void {
  app.use("/api/production-payments", rateLimit({ windowMs: 60 * 1000, max: 30, identifier: "production-payments" }));

  // Where the member stands with payouts. While onboarding is unfinished this asks
  // Stripe, so coming back from its hosted form shows the result without a webhook.
  app.get("/api/stripe/connect-status", requireAuth, async (req: AuthedRequest, res: Response) => {
    let profile = storage.getProfile(req.userId!);
    if (profile?.stripeConnectAccountId && !(profile.connectChargesEnabled && profile.connectPayoutsEnabled)) {
      try {
        await syncConnectOnboarding(req.userId!, profile.stripeConnectAccountId);
        profile = storage.getProfile(req.userId!);
      } catch (err) {
        console.error("[connect-status] Stripe check failed", err);
      }
    }
    res.json({
      started: !!profile?.stripeConnectAccountId,
      ready: !!(profile?.connectChargesEnabled && profile?.connectPayoutsEnabled),
    });
  });

  // Payments on a production, for its owner; a crew member sees only their own.
  app.get("/api/productions/:id/payments", requireAuth, (req: AuthedRequest, res: Response) => {
    const productionId = idParam(req.params.id);
    const production = productionId ? storage.getProduction(productionId) : undefined;
    if (!production) return res.status(404).json({ error: "Production not found" });
    const rows = storage.listProductionPayments(production.id);
    const mine = production.creatorId === req.userId ? rows : rows.filter((p) => p.payeeUserId === req.userId);
    if (mine.length === 0 && production.creatorId !== req.userId) return res.status(404).json({ error: "Production not found" });
    res.json(mine.map((p) => ({
      id: p.id, kind: p.kind, amountCents: p.amountCents, feeCents: p.feeCents, description: p.description,
      status: p.status, createdAt: p.createdAt, paidAt: p.paidAt,
      payee: storage.getProfile(p.payeeUserId)?.displayName ?? "Member",
      iAmPayee: p.payeeUserId === req.userId,
    })));
  });

  app.post("/api/productions/:id/payments", requireAuth, (req: AuthedRequest, res: Response) => {
    const productionId = idParam(req.params.id);
    const body = createSchema.safeParse(req.body);
    if (!productionId || !body.success) return res.status(400).json({ error: body.success ? "Invalid production" : body.error.issues[0]?.message ?? "Invalid request" });
    try {
      const p = createProductionPayment({ productionId, actingUserId: req.userId!, ...body.data });
      storage.createSecurityLog({
        userId: req.userId!, action: "production_payment_created", ipAddress: req.ip, userAgent: req.headers["user-agent"],
        success: true, details: JSON.stringify({ paymentId: p.id, kind: p.kind, amountCents: p.amountCents }),
      });
      res.status(201).json({ id: p.id, status: p.status, amountCents: p.amountCents, feeCents: p.feeCents });
    } catch (err) {
      fail(res, err);
    }
  });

  // The pay link. For pay_crew only the paying owner gets it; for receive, the
  // owner gets it to share with whoever is paying them.
  app.post("/api/production-payments/:id/checkout", requireAuth, async (req: AuthedRequest, res: Response) => {
    const id = idParam(req.params.id);
    const payment = id ? storage.getProductionPayment(id) : undefined;
    const production = payment ? storage.getProduction(payment.productionId) : undefined;
    if (!payment || !production || production.creatorId !== req.userId) return res.status(404).json({ error: "Payment not found" });
    if (payment.status !== "pending") return res.status(409).json({ error: `This payment is already ${payment.status}.` });
    try {
      const back = `${baseUrl()}/app/productions/${production.id}`;
      const url = await createCheckoutUrl(payment, { success: `${back}?payment=done`, cancel: `${back}?payment=canceled` });
      res.json({ url });
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/production-payments/:id", requireAuth, (req: AuthedRequest, res: Response) => {
    const id = idParam(req.params.id);
    const payment = id ? storage.getProductionPayment(id) : undefined;
    const production = payment ? storage.getProduction(payment.productionId) : undefined;
    if (!payment || !production || production.creatorId !== req.userId) return res.status(404).json({ error: "Payment not found" });
    if (!storage.cancelProductionPayment(payment.id)) return res.status(409).json({ error: "Only an unpaid request can be canceled." });
    res.json({ success: true });
  });

  // Events from members' connected accounts. A separate Stripe destination with
  // its own signing secret; fail closed if the secret isn't configured.
  app.post("/api/stripe/connect-webhook", async (req: Request, res: Response) => {
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    const sig = req.headers["stripe-signature"];
    const rawBody = (req as any).rawBody;
    if (!secret) return res.status(503).json({ error: "Connect webhook is not configured" });
    if (typeof sig !== "string" || !rawBody) return res.status(400).json({ error: "Missing signature or body" });
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (err: any) {
      console.error("Connect webhook signature verification failed:", err.message);
      return res.status(400).json({ error: "Invalid signature" });
    }
    try {
      await handleConnectEvent(event);
      res.json({ received: true });
    } catch (err) {
      console.error("[connect-webhook]", err);
      res.status(500).json({ error: "Handler failed" });
    }
  });
}
