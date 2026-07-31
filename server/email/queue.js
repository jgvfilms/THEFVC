"use strict";
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
exports.queueEmail = queueEmail;
exports.sendEmail = sendEmail;
exports.processEmailQueue = processEmailQueue;
exports.getEmailStats = getEmailStats;
var resend_1 = require("resend");
var storage_1 = require("../storage");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
// Initialize Resend client
var resend = new resend_1.Resend(process.env.RESEND_API_KEY || "");
var FROM_EMAIL = process.env.FROM_EMAIL || "noreply@thefvc.is";
/**
 * Queue an email for sending.
 * Inserts a row into the email_queue table with status 'pending'.
 * The background job processor will pick it up.
 */
function queueEmail(opts) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.db
                        .insert(schema_1.emailQueue)
                        .values({
                        to: opts.to,
                        from: FROM_EMAIL,
                        subject: opts.subject,
                        html: opts.html,
                        text: opts.text || undefined,
                        status: "pending",
                        provider: "resend",
                        scheduledAt: opts.scheduledAt || new Date(),
                        metadata: JSON.stringify(opts.metadata || {}),
                    })
                        .returning()
                        .get()];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * Send a single email via Resend.
 * Updates the email_queue row with the result.
 */
function sendEmail(id) {
    return __awaiter(this, void 0, void 0, function () {
        var email, result, err_1, errorMsg, newRetryCount;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, storage_1.db.select().from(schema_1.emailQueue).where((0, drizzle_orm_1.eq)(schema_1.emailQueue.id, id)).get()];
                case 1:
                    email = _b.sent();
                    if (!email)
                        return [2 /*return*/, false];
                    // Mark as sending
                    return [4 /*yield*/, storage_1.db
                            .update(schema_1.emailQueue)
                            .set({ status: "sending", retryCount: email.retryCount + 1 })
                            .where((0, drizzle_orm_1.eq)(schema_1.emailQueue.id, id))
                            .run()];
                case 2:
                    // Mark as sending
                    _b.sent();
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 6, , 11]);
                    return [4 /*yield*/, resend.emails.send({
                            from: email.from,
                            to: [email.to],
                            subject: email.subject,
                            html: email.html,
                            text: email.text || undefined,
                        })];
                case 4:
                    result = _b.sent();
                    if (result.error) {
                        throw new Error(result.error.message || "Resend API error");
                    }
                    return [4 /*yield*/, storage_1.db
                            .update(schema_1.emailQueue)
                            .set({
                            status: "sent",
                            sentAt: new Date(),
                            providerMessageId: ((_a = result.data) === null || _a === void 0 ? void 0 : _a.id) || null,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.emailQueue.id, id))
                            .run()];
                case 5:
                    _b.sent();
                    return [2 /*return*/, true];
                case 6:
                    err_1 = _b.sent();
                    errorMsg = err_1.message || "Unknown error";
                    newRetryCount = email.retryCount + 1;
                    if (!(newRetryCount >= email.maxRetries)) return [3 /*break*/, 8];
                    return [4 /*yield*/, storage_1.db
                            .update(schema_1.emailQueue)
                            .set({
                            status: "failed",
                            failedAt: new Date(),
                            error: errorMsg,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.emailQueue.id, id))
                            .run()];
                case 7:
                    _b.sent();
                    return [3 /*break*/, 10];
                case 8: return [4 /*yield*/, storage_1.db
                        .update(schema_1.emailQueue)
                        .set({
                        status: "pending",
                        error: errorMsg,
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.emailQueue.id, id))
                        .run()];
                case 9:
                    _b.sent();
                    _b.label = 10;
                case 10: return [2 /*return*/, false];
                case 11: return [2 /*return*/];
            }
        });
    });
}
/**
 * Process all pending emails that are scheduled to be sent.
 * Called by the background job scheduler.
 */
function processEmailQueue() {
    return __awaiter(this, void 0, void 0, function () {
        var pendingEmails, sent, failed, _i, pendingEmails_1, email, success;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.db
                        .select()
                        .from(schema_1.emailQueue)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.emailQueue.status, "pending"), (0, drizzle_orm_1.lte)(schema_1.emailQueue.scheduledAt, new Date())))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.emailQueue.createdAt))
                        .all()];
                case 1:
                    pendingEmails = _a.sent();
                    sent = 0;
                    failed = 0;
                    _i = 0, pendingEmails_1 = pendingEmails;
                    _a.label = 2;
                case 2:
                    if (!(_i < pendingEmails_1.length)) return [3 /*break*/, 5];
                    email = pendingEmails_1[_i];
                    return [4 /*yield*/, sendEmail(email.id)];
                case 3:
                    success = _a.sent();
                    if (success)
                        sent++;
                    else
                        failed++;
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, { sent: sent, failed: failed }];
            }
        });
    });
}
/**
 * Get email queue statistics.
 */
function getEmailStats() {
    return __awaiter(this, void 0, void 0, function () {
        var stats, result, _i, stats_1, row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.db
                        .select({
                        status: schema_1.emailQueue.status,
                        count: storage_1.db.$count(schema_1.emailQueue),
                    })
                        .from(schema_1.emailQueue)
                        .groupBy(schema_1.emailQueue.status)
                        .all()];
                case 1:
                    stats = _a.sent();
                    result = { pending: 0, sending: 0, sent: 0, failed: 0 };
                    for (_i = 0, stats_1 = stats; _i < stats_1.length; _i++) {
                        row = stats_1[_i];
                        if (row.status in result) {
                            result[row.status] = Number(row.count);
                        }
                    }
                    return [2 /*return*/, result];
            }
        });
    });
}
