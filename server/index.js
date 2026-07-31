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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wss = void 0;
exports.broadcastToUser = broadcastToUser;
exports.broadcastToAll = broadcastToAll;
exports.log = log;
require("dotenv/config");
var express_1 = require("express");
var routes_1 = require("./routes");
var static_1 = require("./static");
var node_http_1 = require("node:http");
var ws_1 = require("ws");
var node_path_1 = require("node:path");
var node_fs_1 = require("node:fs");
var jobs_1 = require("./jobs");
var securityHeaders_1 = require("./middleware/securityHeaders");
var sanitize_1 = require("./middleware/sanitize");
var rateLimit_1 = require("./middleware/rateLimit");
// Import migrate to run idempotent column additions on startup
require("./migrate");
var app = (0, express_1.default)();
var httpServer = (0, node_http_1.createServer)(app);
var storage_1 = require("./storage");
// Map of userId -> Set of WebSocket connections
var wsClients = new Map();
function broadcastToUser(userId, data) {
    var clients = wsClients.get(userId);
    if (clients) {
        var msg_1 = JSON.stringify(data);
        clients.forEach(function (ws) {
            if (ws.readyState === ws.OPEN) {
                ws.send(msg_1);
            }
        });
    }
}
function broadcastToAll(data) {
    var msg = JSON.stringify(data);
    wsClients.forEach(function (clients) {
        clients.forEach(function (ws) {
            if (ws.readyState === ws.OPEN) {
                ws.send(msg);
            }
        });
    });
}
exports.wss = new ws_1.WebSocketServer({
    noServer: true,
    path: "/ws",
});
exports.wss.on("connection", function (ws, request) {
    var _a;
    // Authenticate via token query param or Authorization header
    var url = new URL(request.url || "", "http://localhost");
    var token = url.searchParams.get("token") || ((_a = request.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace("Bearer ", ""));
    if (!token) {
        ws.close(4001, "Authentication required");
        return;
    }
    var session = storage_1.storage.getSessionByToken(token);
    if (!session || session.expiresAt < new Date()) {
        ws.close(4001, "Invalid or expired token");
        return;
    }
    var userId = session.userId;
    // Register client
    if (!wsClients.has(userId)) {
        wsClients.set(userId, new Set());
    }
    wsClients.get(userId).add(ws);
    // Send unread notification count on connect
    var unreadCount = storage_1.storage.getUnreadNotificationCount(userId);
    ws.send(JSON.stringify({ type: "unread_count", count: unreadCount }));
    ws.on("message", function (data) {
        try {
            var msg = JSON.parse(data.toString());
            // Handle client messages (e.g., ping, subscribe, mark_read)
            if (msg.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }));
            }
            else if (msg.type === "mark_read") {
                if (msg.id) {
                    storage_1.storage.markNotificationRead(msg.id);
                }
                else if (msg.all) {
                    storage_1.storage.markAllNotificationsRead(userId);
                }
                var count = storage_1.storage.getUnreadNotificationCount(userId);
                ws.send(JSON.stringify({ type: "unread_count", count: count }));
            }
            else if (msg.type === "fetch_notifications") {
                var notifications = storage_1.storage.getNotifications(userId, msg.limit || 50, msg.unreadOnly);
                ws.send(JSON.stringify({ type: "notifications", notifications: notifications }));
            }
        }
        catch (err) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
        }
    });
    ws.on("close", function () {
        var clients = wsClients.get(userId);
        if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
                wsClients.delete(userId);
            }
        }
    });
    ws.on("error", function () {
        // Clean up on error
        var clients = wsClients.get(userId);
        if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
                wsClients.delete(userId);
            }
        }
    });
});
// Ensure uploads directory exists
var uploadsDir = (0, node_path_1.join)(process.cwd(), "uploads", "profiles");
if (!(0, node_fs_1.existsSync)(uploadsDir)) {
    (0, node_fs_1.mkdirSync)(uploadsDir, { recursive: true });
}
// Serve uploaded files
app.use("/uploads", express_1.default.static((0, node_path_1.join)(process.cwd(), "uploads")));
app.use(express_1.default.json({
    verify: function (req, _res, buf) {
        req.rawBody = buf;
    },
}));
app.use(express_1.default.urlencoded({ extended: false }));
// Apply security middleware
app.use(securityHeaders_1.securityHeaders);
app.use(sanitize_1.sanitize);
app.use((0, rateLimit_1.rateLimit)({ windowMs: 15 * 60 * 1000, max: 100, identifier: "global" }));
// Start background job scheduler
(0, jobs_1.startJobScheduler)();
function log(message, source) {
    if (source === void 0) { source = "express"; }
    var formattedTime = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
    console.log("".concat(formattedTime, " [").concat(source, "] ").concat(message));
}
app.use(function (req, res, next) {
    var start = Date.now();
    var path = req.path;
    var capturedJsonResponse = undefined;
    var originalResJson = res.json;
    res.json = function (bodyJson) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(res, __spreadArray([bodyJson], args, true));
    };
    res.on("finish", function () {
        var duration = Date.now() - start;
        if (path.startsWith("/api")) {
            var logLine = "".concat(req.method, " ").concat(path, " ").concat(res.statusCode, " in ").concat(duration, "ms");
            if (capturedJsonResponse) {
                logLine += " :: ".concat(JSON.stringify(capturedJsonResponse));
            }
            log(logLine);
        }
    });
    next();
});
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var setupVite, port;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, routes_1.registerRoutes)(httpServer, app)];
            case 1:
                _a.sent();
                app.use(function (err, _req, res, next) {
                    var status = err.status || err.statusCode || 500;
                    var message = err.message || "Internal Server Error";
                    console.error("Internal Server Error:", err);
                    if (res.headersSent) {
                        return next(err);
                    }
                    return res.status(status).json({ message: message });
                });
                if (!(process.env.NODE_ENV === "production")) return [3 /*break*/, 2];
                (0, static_1.serveStatic)(app);
                return [3 /*break*/, 5];
            case 2: return [4 /*yield*/, Promise.resolve().then(function () { return require("./vite"); })];
            case 3:
                setupVite = (_a.sent()).setupVite;
                return [4 /*yield*/, setupVite(httpServer, app)];
            case 4:
                _a.sent();
                _a.label = 5;
            case 5:
                port = parseInt(process.env.PORT || "5000", 10);
                // WebSocket upgrade handler (PRD-009: Real-Time & WebSocket)
                httpServer.on("upgrade", function (request, socket, head) {
                    var _a;
                    if ((_a = request.url) === null || _a === void 0 ? void 0 : _a.startsWith("/ws")) {
                        exports.wss.handleUpgrade(request, socket, head, function (ws) {
                            exports.wss.emit("connection", ws, request);
                        });
                    }
                    else {
                        socket.destroy();
                    }
                });
                httpServer.listen({
                    port: port,
                    host: "0.0.0.0",
                    reusePort: true,
                }, function () {
                    log("serving on port ".concat(port));
                });
                return [2 /*return*/];
        }
    });
}); })();
