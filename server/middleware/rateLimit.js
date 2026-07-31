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
exports.rateLimit = rateLimit;
exports.getClientIp = getClientIp;
exports.blockIpManual = blockIpManual;
exports.unblockIp = unblockIp;
exports.cleanupExpiredBlocks = cleanupExpiredBlocks;
var storage_1 = require("../storage");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var rateLimitStore = new Map();
function rateLimit(opts) {
    var _this = this;
    var windowMs = opts.windowMs, max = opts.max, _a = opts.identifier, identifier = _a === void 0 ? "default" : _a, _b = opts.skipSuccessful, skipSuccessful = _b === void 0 ? false : _b;
    return function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var ip, isBlocked, key, now, entry, originalSend_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ip = getClientIp(req);
                    return [4 /*yield*/, isIpBlocked(ip)];
                case 1:
                    isBlocked = _a.sent();
                    if (isBlocked) {
                        return [2 /*return*/, res.status(403).json({ error: "Your IP has been blocked due to abuse." })];
                    }
                    key = "".concat(ip, ":").concat(identifier);
                    now = Date.now();
                    entry = rateLimitStore.get(key);
                    if (!(!entry || now > entry.resetTime)) return [3 /*break*/, 2];
                    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
                    return [3 /*break*/, 4];
                case 2:
                    entry.count++;
                    if (!(entry.count > max)) return [3 /*break*/, 4];
                    // Block the IP
                    return [4 /*yield*/, blockIp(ip, "rate_limit_abuse")];
                case 3:
                    // Block the IP
                    _a.sent();
                    rateLimitStore.delete(key);
                    return [2 /*return*/, res.status(429).json({
                            error: "Rate limit exceeded. Your IP has been temporarily blocked.",
                            retryAfter: Math.ceil((entry.resetTime - now) / 1000),
                        })];
                case 4:
                    // Track response for skipSuccessful
                    if (skipSuccessful) {
                        originalSend_1 = res.send.bind(res);
                        res.send = (function (body) {
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                // Decrement count for successful requests
                                var current = rateLimitStore.get(key);
                                if (current)
                                    current.count = Math.max(0, current.count - 1);
                            }
                            return originalSend_1(body);
                        });
                    }
                    next();
                    return [2 /*return*/];
            }
        });
    }); };
}
/**
 * Get the real client IP, respecting X-Forwarded-For.
 */
function getClientIp(req) {
    var forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
        return forwarded.split(",")[0].trim();
    }
    return req.socket.remoteAddress || "unknown";
}
/**
 * Check if an IP is currently blocked in the database.
 */
function isIpBlocked(ip) {
    return __awaiter(this, void 0, void 0, function () {
        var result, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, storage_1.db
                            .select()
                            .from(schema_1.blockedIps)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.blockedIps.ipAddress, ip), (0, drizzle_orm_1.eq)(schema_1.blockedIps.isActive, true), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.blockedIps.expiresAt, null), (0, drizzle_orm_1.gt)(schema_1.blockedIps.expiresAt, new Date()))))
                            .get()];
                case 1:
                    result = _b.sent();
                    return [2 /*return*/, !!result];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Block an IP address by inserting into the blocked_ips table.
 */
function blockIp(ip, reason) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, storage_1.db.insert(schema_1.blockedIps).values({
                            ipAddress: ip,
                            reason: reason,
                            blockedAt: new Date(),
                            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour default
                            isActive: true,
                        })];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Manually block an IP (admin action).
 */
function blockIpManual(ip, reason, durationHours) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.db.insert(schema_1.blockedIps).values({
                        ipAddress: ip,
                        reason: reason,
                        blockedAt: new Date(),
                        expiresAt: durationHours ? new Date(Date.now() + durationHours * 3600 * 1000) : null,
                        isActive: true,
                    })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Unblock an IP.
 */
function unblockIp(ip) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.db
                        .update(schema_1.blockedIps)
                        .set({ isActive: false })
                        .where((0, drizzle_orm_1.eq)(schema_1.blockedIps.ipAddress, ip))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Clean up expired blocked IPs.
 */
function cleanupExpiredBlocks() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.db
                        .update(schema_1.blockedIps)
                        .set({ isActive: false })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.blockedIps.isActive, true), (0, drizzle_orm_1.lt)(schema_1.blockedIps.expiresAt, new Date())))
                        .run().changes];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
