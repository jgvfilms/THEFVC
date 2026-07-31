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
exports.startJobScheduler = startJobScheduler;
exports.stopJobScheduler = stopJobScheduler;
exports.runJobNow = runJobNow;
var node_cron_1 = require("node-cron");
var index_1 = require("../index");
var queue_1 = require("../email/queue");
var rateLimit_1 = require("../middleware/rateLimit");
// Track scheduled tasks for graceful shutdown
var scheduledTasks = [];
/**
 * Start the background job scheduler.
 * All jobs run in-process (monolith) as per the architecture decision.
 */
function startJobScheduler() {
    var _this = this;
    // Process email queue every 2 minutes
    var emailJob = node_cron_1.default.schedule("*/2 * * * *", function () { return __awaiter(_this, void 0, void 0, function () {
        var result, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, queue_1.processEmailQueue)()];
                case 1:
                    result = _a.sent();
                    if (result.sent > 0 || result.failed > 0) {
                        (0, index_1.log)("[jobs] Email queue: ".concat(result.sent, " sent, ").concat(result.failed, " failed"), "jobs");
                    }
                    return [3 /*break*/, 3];
                case 2:
                    err_1 = _a.sent();
                    (0, index_1.log)("[jobs] Email queue error: ".concat(err_1), "jobs");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    scheduledTasks.push(emailJob);
    // Clean up expired blocked IPs every hour
    var cleanupJob = node_cron_1.default.schedule("0 * * * *", function () { return __awaiter(_this, void 0, void 0, function () {
        var cleaned, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, rateLimit_1.cleanupExpiredBlocks)()];
                case 1:
                    cleaned = _a.sent();
                    if (cleaned > 0) {
                        (0, index_1.log)("[jobs] Cleaned up ".concat(cleaned, " expired IP blocks"), "jobs");
                    }
                    return [3 /*break*/, 3];
                case 2:
                    err_2 = _a.sent();
                    (0, index_1.log)("[jobs] IP cleanup error: ".concat(err_2), "jobs");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    scheduledTasks.push(cleanupJob);
    // Log scheduler start
    (0, index_1.log)("[jobs] Background job scheduler started (email queue + IP cleanup)", "jobs");
}
/**
 * Stop all scheduled jobs (for graceful shutdown).
 */
function stopJobScheduler() {
    for (var _i = 0, scheduledTasks_1 = scheduledTasks; _i < scheduledTasks_1.length; _i++) {
        var task = scheduledTasks_1[_i];
        task.stop();
    }
    scheduledTasks.length = 0;
    (0, index_1.log)("[jobs] Background job scheduler stopped", "jobs");
}
/**
 * Run a one-off job immediately (useful for testing or manual triggers).
 */
function runJobNow(jobName) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, result, cleaned;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = jobName;
                    switch (_a) {
                        case "email": return [3 /*break*/, 1];
                        case "cleanup": return [3 /*break*/, 3];
                    }
                    return [3 /*break*/, 5];
                case 1: return [4 /*yield*/, (0, queue_1.processEmailQueue)()];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, "Email queue: ".concat(result.sent, " sent, ").concat(result.failed, " failed")];
                case 3: return [4 /*yield*/, (0, rateLimit_1.cleanupExpiredBlocks)()];
                case 4:
                    cleaned = _b.sent();
                    return [2 /*return*/, "Cleaned up ".concat(cleaned, " expired IP blocks")];
                case 5: return [2 /*return*/, "Unknown job: ".concat(jobName)];
            }
        });
    });
}
