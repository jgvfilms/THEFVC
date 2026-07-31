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
exports.logSecurityEvent = logSecurityEvent;
exports.logAnalyticsEvent = logAnalyticsEvent;
exports.getSecurityLog = getSecurityLog;
exports.getAnalyticsEvents = getAnalyticsEvents;
exports.getAnalyticsSummary = getAnalyticsSummary;
var storage_1 = require("../storage");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * Log a security audit event.
 * Used for: login_success, login_failed, logout, password_change,
 * email_verification, account_locked, rate_limited, ip_blocked,
 * consent_given, consent_withdrawn
 */
function logSecurityEvent(opts) {
    return __awaiter(this, void 0, void 0, function () {
        var err_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, storage_1.db.insert(schema_1.securityAuditLog).values({
                            userId: opts.userId,
                            action: opts.action,
                            ipAddress: opts.ipAddress,
                            userAgent: opts.userAgent,
                            success: (_a = opts.success) !== null && _a !== void 0 ? _a : true,
                            details: JSON.stringify(opts.details || {}),
                        })];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    err_1 = _b.sent();
                    console.error("[analytics] Failed to log security event:", err_1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Log an analytics event.
 * Used for: page_view, profile_view, production_create, post_create,
 * search, export_data, consent_accept
 */
function logAnalyticsEvent(opts) {
    return __awaiter(this, void 0, void 0, function () {
        var err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, storage_1.db.insert(schema_1.analyticsEvents).values({
                            userId: opts.userId,
                            eventType: opts.eventType,
                            eventName: opts.eventName,
                            properties: JSON.stringify(opts.properties || {}),
                            ipAddress: opts.ipAddress,
                            userAgent: opts.userAgent,
                            sessionId: opts.sessionId,
                        })];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    err_2 = _a.sent();
                    console.error("[analytics] Failed to log analytics event:", err_2);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Get security audit log entries.
 */
function getSecurityLog(opts) {
    return __awaiter(this, void 0, void 0, function () {
        var query, conditions;
        return __generator(this, function (_a) {
            query = storage_1.db.select().from(schema_1.securityAuditLog).$dynamic();
            conditions = [];
            if (opts.userId)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.securityAuditLog.userId, opts.userId));
            if (opts.action)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.securityAuditLog.action, opts.action));
            if (opts.since)
                conditions.push((0, drizzle_orm_1.gte)(schema_1.securityAuditLog.createdAt, opts.since));
            if (conditions.length > 0) {
                query = query.where(drizzle_orm_1.and.apply(void 0, conditions));
            }
            return [2 /*return*/, query
                    .orderBy((0, drizzle_orm_1.desc)(schema_1.securityAuditLog.createdAt))
                    .limit(opts.limit || 100)
                    .all()];
        });
    });
}
/**
 * Get analytics events.
 */
function getAnalyticsEvents(opts) {
    return __awaiter(this, void 0, void 0, function () {
        var query, conditions;
        return __generator(this, function (_a) {
            query = storage_1.db.select().from(schema_1.analyticsEvents).$dynamic();
            conditions = [];
            if (opts.userId)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.analyticsEvents.userId, opts.userId));
            if (opts.eventType)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.analyticsEvents.eventType, opts.eventType));
            if (opts.since)
                conditions.push((0, drizzle_orm_1.gte)(schema_1.analyticsEvents.createdAt, opts.since));
            if (conditions.length > 0) {
                query = query.where(drizzle_orm_1.and.apply(void 0, conditions));
            }
            return [2 /*return*/, query
                    .orderBy((0, drizzle_orm_1.desc)(schema_1.analyticsEvents.createdAt))
                    .limit(opts.limit || 100)
                    .all()];
        });
    });
}
/**
 * Get analytics summary for admin dashboard.
 */
function getAnalyticsSummary(since) {
    return __awaiter(this, void 0, void 0, function () {
        var totalEvents, eventsByTypeRows, securityEvents, securityByTypeRows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.db
                        .select({ count: (0, drizzle_orm_1.count)() })
                        .from(schema_1.analyticsEvents)
                        .where((0, drizzle_orm_1.gte)(schema_1.analyticsEvents.createdAt, since))
                        .get()];
                case 1:
                    totalEvents = _a.sent();
                    return [4 /*yield*/, storage_1.db
                            .select({
                            eventType: schema_1.analyticsEvents.eventType,
                            count: (0, drizzle_orm_1.count)(),
                        })
                            .from(schema_1.analyticsEvents)
                            .where((0, drizzle_orm_1.gte)(schema_1.analyticsEvents.createdAt, since))
                            .groupBy(schema_1.analyticsEvents.eventType)
                            .all()];
                case 2:
                    eventsByTypeRows = _a.sent();
                    return [4 /*yield*/, storage_1.db
                            .select({ count: (0, drizzle_orm_1.count)() })
                            .from(schema_1.securityAuditLog)
                            .where((0, drizzle_orm_1.gte)(schema_1.securityAuditLog.createdAt, since))
                            .get()];
                case 3:
                    securityEvents = _a.sent();
                    return [4 /*yield*/, storage_1.db
                            .select({
                            action: schema_1.securityAuditLog.action,
                            count: (0, drizzle_orm_1.count)(),
                        })
                            .from(schema_1.securityAuditLog)
                            .where((0, drizzle_orm_1.gte)(schema_1.securityAuditLog.createdAt, since))
                            .groupBy(schema_1.securityAuditLog.action)
                            .all()];
                case 4:
                    securityByTypeRows = _a.sent();
                    return [2 /*return*/, {
                            totalEvents: Number((totalEvents === null || totalEvents === void 0 ? void 0 : totalEvents.count) || 0),
                            eventsByType: Object.fromEntries(eventsByTypeRows.map(function (r) { return [r.eventType, Number(r.count)]; })),
                            securityEvents: Number((securityEvents === null || securityEvents === void 0 ? void 0 : securityEvents.count) || 0),
                            securityByType: Object.fromEntries(securityByTypeRows.map(function (r) { return [r.action, Number(r.count)]; })),
                        }];
            }
        });
    });
}
