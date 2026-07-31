"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_DURATION = exports.SESSION_TTL_DAYS = void 0;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.generateToken = generateToken;
exports.authMiddleware = authMiddleware;
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
var node_crypto_1 = require("node:crypto");
var storage_1 = require("../storage");
// ===== AUTH HELPERS =====
function hashPassword(password) {
    var salt = (0, node_crypto_1.randomBytes)(16).toString("hex");
    var hash = (0, node_crypto_1.scryptSync)(password, salt, 64).toString("hex");
    return "".concat(salt, ":").concat(hash);
}
function verifyPassword(password, stored) {
    var _a = stored.split(":"), salt = _a[0], hash = _a[1];
    var verify = (0, node_crypto_1.scryptSync)(password, salt, 64).toString("hex");
    return verify === hash;
}
function generateToken() {
    return (0, node_crypto_1.randomUUID)();
}
// Session TTL from env (Forge correction #4)
exports.SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || "30", 10);
exports.SESSION_DURATION = exports.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
function authMiddleware(req, res, next) {
    var _a;
    var token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace("Bearer ", "");
    if (!token) {
        return next();
    }
    var session = storage_1.storage.getSessionByToken(token);
    if (!session || session.expiresAt < new Date()) {
        return next();
    }
    req.userId = session.userId;
    next();
}
function requireAuth(req, res, next) {
    if (!req.userId) {
        return res.status(401).json({ error: "Authentication required" });
    }
    next();
}
function requireAdmin(req, res, next) {
    if (!req.userId) {
        return res.status(401).json({ error: "Authentication required" });
    }
    var user = storage_1.storage.getUser(req.userId);
    if (!(user === null || user === void 0 ? void 0 : user.isAdmin)) {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
}
