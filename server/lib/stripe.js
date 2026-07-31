"use strict";
/**
 * PRD-019: Stripe Connect Production Integration
 *
 * Service layer for Stripe Connect account management,
 * payment processing, and webhook handling.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripe = void 0;
exports.createStripeConnectAccount = createStripeConnectAccount;
exports.createAccountLink = createAccountLink;
exports.createPaymentIntent = createPaymentIntent;
exports.getPayout = getPayout;
exports.handleStripeWebhook = handleStripeWebhook;
var stripe_1 = require("stripe");
var storage_1 = require("../storage");
exports.stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || "[REDACTED]", {
    apiVersion: "2023-10-16",
});
/**
 * Create a Stripe Connect Express account for a user.
 * Stores the account ID on the user's profile.
 */
function createStripeConnectAccount(userId, email) {
    return __awaiter(this, void 0, void 0, function () {
        var account;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.stripe.accounts.create({
                        type: "express",
                        email: email,
                        capabilities: {
                            card_payments: { requested: true },
                            transfers: { requested: true },
                        },
                    })];
                case 1:
                    account = _a.sent();
                    storage_1.storage.updateProfileSubscription(userId, {
                        stripeConnectAccountId: account.id,
                        subscriptionStatus: "onboarding",
                    });
                    return [2 /*return*/, account.id];
            }
        });
    });
}
/**
 * Generate a Stripe-hosted onboarding link for a connected account.
 * User completes identity verification and tax setup here.
 */
function createAccountLink(accountId, refreshUrl, returnUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var link;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.stripe.accountLinks.create({
                        account: accountId,
                        refresh_url: refreshUrl,
                        return_url: returnUrl,
                        type: "account_onboarding",
                    })];
                case 1:
                    link = _a.sent();
                    return [2 /*return*/, link.url];
            }
        });
    });
}
/**
 * Create a PaymentIntent for a charge to a connected account.
 * Used when a customer pays a crew member.
 */
function createPaymentIntent(amount, currency, connectedAccountId, description) {
    return __awaiter(this, void 0, void 0, function () {
        var paymentIntent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.stripe.paymentIntents.create({
                        amount: amount,
                        currency: currency,
                        description: description,
                        application_fee_amount: Math.round(amount * 0.05), // 5% platform fee
                    }, {
                        stripeAccount: connectedAccountId,
                    })];
                case 1:
                    paymentIntent = _a.sent();
                    return [2 /*return*/, paymentIntent.id];
            }
        });
    });
}
/**
 * Retrieve a payout for tracking purposes.
 */
function getPayout(payoutId, connectedAccountId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.stripe.payouts.retrieve(payoutId, {
                        stripeAccount: connectedAccountId,
                    })];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Handle Stripe webhook events.
 * Call this from the webhook endpoint to update payment statuses.
 */
function handleStripeWebhook(event) {
    return __awaiter(this, void 0, void 0, function () {
        var intent_1, allPayments, payment, intent_2, allPayments, payment, payout, payout, account, profile, session, subscriptionId, customerId, userId, subscription, customerId, profile, status_1, subscription, customerId, profile;
        var _a, _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (event.type) {
                case "payment_intent.succeeded": {
                    intent_1 = event.data.object;
                    allPayments = storage_1.storage.getAllPayments(100000);
                    payment = allPayments.find(function (p) { return p.stripePaymentIntentId === intent_1.id; });
                    if (payment) {
                        storage_1.storage.updatePaymentStatus(payment.id, "succeeded");
                    }
                    break;
                }
                case "payment_intent.payment_failed": {
                    intent_2 = event.data.object;
                    allPayments = storage_1.storage.getAllPayments(100000);
                    payment = allPayments.find(function (p) { return p.stripePaymentIntentId === intent_2.id; });
                    if (payment) {
                        storage_1.storage.updatePaymentStatus(payment.id, "failed");
                    }
                    break;
                }
                case "payout.paid": {
                    payout = event.data.object;
                    // Log payout success
                    storage_1.storage.createSecurityLog({
                        userId: 0,
                        action: "payout_paid",
                        ipAddress: "",
                        userAgent: "",
                        details: JSON.stringify({ payoutId: payout.id, amount: payout.amount, currency: payout.currency }),
                    });
                    break;
                }
                case "payout.failed": {
                    payout = event.data.object;
                    storage_1.storage.createSecurityLog({
                        userId: 0,
                        action: "payout_failed",
                        ipAddress: "",
                        userAgent: "",
                        details: JSON.stringify({ payoutId: payout.id, amount: payout.amount, failureCode: payout.failure_code }),
                    });
                    break;
                }
                case "account.updated": {
                    account = event.data.object;
                    profile = storage_1.storage.getProfileByStripeAccountId(account.id);
                    if (profile) {
                        storage_1.storage.updateProfileSubscription(profile.userId, {
                            subscriptionStatus: account.charges_enabled && account.payouts_enabled ? "active" : "onboarding",
                        });
                    }
                    break;
                }
                case "checkout.session.completed": {
                    session = event.data.object;
                    // Handle subscription checkout completion
                    if (session.mode === "subscription" && session.subscription) {
                        subscriptionId = typeof session.subscription === "string"
                            ? session.subscription
                            : session.subscription.id;
                        customerId = session.customer;
                        userId = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.userId;
                        if (userId) {
                            // Create a payment record for the subscription
                            storage_1.storage.createPayment({
                                userId: parseInt(userId),
                                amount: Math.round((session.amount_total || 0) / 100), // Convert cents to dollars
                                currency: session.currency || "usd",
                                status: "succeeded",
                                stripeChargeId: session.payment_intent ? (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id) : null,
                                stripePaymentIntentId: session.payment_intent ? (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id) : null,
                                stripeSubscriptionId: subscriptionId,
                                description: "Subscription: ".concat(((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.tierName) || "subscription"),
                            });
                            // Update profile subscription status
                            storage_1.storage.updateProfileSubscription(parseInt(userId), {
                                stripeCustomerId: typeof customerId === "string" ? customerId : customerId === null || customerId === void 0 ? void 0 : customerId.id,
                                subscriptionStatus: "active",
                                subscriptionTier: ((_c = session.metadata) === null || _c === void 0 ? void 0 : _c.tierName) || undefined,
                            });
                            storage_1.storage.createSecurityLog({
                                userId: parseInt(userId),
                                action: "subscription_activated",
                                ipAddress: "",
                                userAgent: "",
                                details: JSON.stringify({ subscriptionId: subscriptionId, tierName: (_d = session.metadata) === null || _d === void 0 ? void 0 : _d.tierName }),
                            });
                        }
                    }
                    break;
                }
                case "customer.subscription.updated": {
                    subscription = event.data.object;
                    customerId = typeof subscription.customer === "string"
                        ? subscription.customer
                        : (_e = subscription.customer) === null || _e === void 0 ? void 0 : _e.id;
                    if (customerId) {
                        profile = storage_1.storage.getProfileByStripeCustomerId(customerId);
                        if (profile) {
                            status_1 = subscription.status === "active" ? "active"
                                : subscription.status === "canceled" || subscription.status === "unpaid" ? "canceled"
                                    : subscription.status === "past_due" ? "past_due"
                                        : "inactive";
                            storage_1.storage.updateProfileSubscription(profile.userId, {
                                subscriptionStatus: status_1,
                            });
                            storage_1.storage.createSecurityLog({
                                userId: profile.userId,
                                action: "subscription_status_changed",
                                ipAddress: "",
                                userAgent: "",
                                details: JSON.stringify({ subscriptionId: subscription.id, status: subscription.status }),
                            });
                        }
                    }
                    break;
                }
                case "customer.subscription.deleted": {
                    subscription = event.data.object;
                    customerId = typeof subscription.customer === "string"
                        ? subscription.customer
                        : (_f = subscription.customer) === null || _f === void 0 ? void 0 : _f.id;
                    if (customerId) {
                        profile = storage_1.storage.getProfileByStripeCustomerId(customerId);
                        if (profile) {
                            storage_1.storage.updateProfileSubscription(profile.userId, {
                                subscriptionStatus: "canceled",
                            });
                            storage_1.storage.createSecurityLog({
                                userId: profile.userId,
                                action: "subscription_canceled",
                                ipAddress: "",
                                userAgent: "",
                                details: JSON.stringify({ subscriptionId: subscription.id }),
                            });
                        }
                    }
                    break;
                }
                default:
                    // Unexpected event type, do nothing
                    break;
            }
            return [2 /*return*/];
        });
    });
}
