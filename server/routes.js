"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.registerRoutes = registerRoutes;
var storage_1 = require("./storage");
var index_1 = require("./index");
var multer_1 = require("multer");
var node_path_1 = require("node:path");
var node_fs_1 = require("node:fs");
var node_crypto_1 = require("node:crypto");
var auth_1 = require("./middleware/auth");
var rateLimit_1 = require("./middleware/rateLimit");
var encryption_1 = require("./lib/encryption");
var stripe_1 = require("./lib/stripe");
var tax_documents_1 = require("./lib/tax-documents");
var stripe_2 = require("stripe");
// ===== AUTH HELPERS (re-exported from middleware/auth.ts) =====
// hashPassword, verifyPassword, generateToken, SESSION_DURATION
// authMiddleware, requireAuth, requireAdmin, AuthedRequest
var BETA_SEAT_LIMIT = 50;
// Helper: safely extract a string query param (Express returns string | string[] | undefined)
var getQueryParam = function (query, key) {
    var val = query[key];
    if (typeof val === "string")
        return val;
    if (Array.isArray(val))
        return val[0];
    return undefined;
};
// Helper: safely extract an integer query param
var getQueryParamInt = function (query, key, fallback) {
    var val = getQueryParam(query, key);
    if (!val)
        return fallback;
    var parsed = parseInt(val, 10);
    return isNaN(parsed) ? fallback : parsed;
};
// ===== ROUTES =====
function registerRoutes(httpServer, app) {
    return __awaiter(this, void 0, void 0, function () {
        function decodeEntities(str) {
            return str
                .replace(/&#8216;/g, "\u2018")
                .replace(/&#8217;/g, "\u2019")
                .replace(/&#8220;/g, "\u201C")
                .replace(/&#8221;/g, "\u201D")
                .replace(/&#8212;/g, "\u2014")
                .replace(/&#8211;/g, "\u2013")
                .replace(/&#8230;/g, "\u2026")
                .replace(/&#038;/g, "&")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n)); })
                .replace(/&#x([0-9a-fA-F]+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 16)); });
        }
        function stripHtml(html) {
            return decodeEntities(html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 280));
        }
        function parseRssItems(xml, source, category) {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            var items = [];
            var itemRegex = /<item>([\s\S]*?)<\/item>/gi;
            var match;
            while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
                var block = match[1];
                var title = ((_a = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)) === null || _a === void 0 ? void 0 : _a[1]) || ((_b = block.match(/<title>([\s\S]*?)<\/title>/i)) === null || _b === void 0 ? void 0 : _b[1]) || "";
                var link = ((_d = (_c = block.match(/<link>([\s\S]*?)<\/link>/i)) === null || _c === void 0 ? void 0 : _c[1]) === null || _d === void 0 ? void 0 : _d.trim()) || "";
                var pubDate = ((_f = (_e = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)) === null || _e === void 0 ? void 0 : _e[1]) === null || _f === void 0 ? void 0 : _f.trim()) || "";
                var desc = ((_g = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)) === null || _g === void 0 ? void 0 : _g[1]) || ((_h = block.match(/<description>([\s\S]*?)<\/description>/i)) === null || _h === void 0 ? void 0 : _h[1]) || "";
                var date = pubDate ? new Date(pubDate).getTime() : Date.now();
                items.push({
                    title: decodeEntities(title.trim()),
                    link: link.trim(),
                    description: stripHtml(desc),
                    source: source,
                    category: category,
                    pubDate: date,
                });
            }
            return items;
        }
        var upload, NEWS_FEEDS, newsCache, NEWS_CACHE_TTL;
        var _this = this;
        return __generator(this, function (_a) {
            app.use(auth_1.authMiddleware);
            // PRD-018: Rate limiting for sensitive payment/tax endpoints
            app.use("/api/payments", (0, rateLimit_1.rateLimit)({ windowMs: 60 * 1000, max: 60, identifier: "payments" }));
            app.use("/api/w9", (0, rateLimit_1.rateLimit)({ windowMs: 60 * 1000, max: 30, identifier: "w9" }));
            app.use("/api/stripe", (0, rateLimit_1.rateLimit)({ windowMs: 60 * 1000, max: 30, identifier: "stripe" }));
            app.use("/api/admin/tax-export", (0, rateLimit_1.rateLimit)({ windowMs: 60 * 1000, max: 10, identifier: "tax-export" }));
            // PRD-018: Stricter rate limiting on auth endpoints to prevent brute-force
            app.use("/api/auth/login", (0, rateLimit_1.rateLimit)({ windowMs: 15 * 60 * 1000, max: 10, identifier: "login" }));
            app.use("/api/auth/signup", (0, rateLimit_1.rateLimit)({ windowMs: 15 * 60 * 1000, max: 5, identifier: "signup" }));
            app.use("/api/auth/password-reset", (0, rateLimit_1.rateLimit)({ windowMs: 15 * 60 * 1000, max: 5, identifier: "password-reset" }));
            // ----- AUTH -----
            app.post("/api/auth/signup", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, handle, email, password, displayName, role, inviteToken, invite_1, user, newUsedCount, requests, matchedReq, initials, token;
                return __generator(this, function (_b) {
                    try {
                        _a = req.body, handle = _a.handle, email = _a.email, password = _a.password, displayName = _a.displayName, role = _a.role, inviteToken = _a.inviteToken;
                        if (!handle || !email || !password) {
                            return [2 /*return*/, res.status(400).json({ error: "Handle, email, and password are required" })];
                        }
                        // Beta gate: require invite token
                        if (!inviteToken) {
                            return [2 /*return*/, res.status(403).json({ error: "The beta is invite-only. Request access to join the waitlist." })];
                        }
                        invite_1 = storage_1.storage.getInviteByToken(inviteToken);
                        if (!invite_1 || invite_1.status !== "active" || invite_1.usedCount >= invite_1.maxUses) {
                            return [2 /*return*/, res.status(403).json({ error: "Invalid or expired invite token" })];
                        }
                        // Check if handle or email exists
                        if (storage_1.storage.getUserByHandle(handle)) {
                            return [2 /*return*/, res.status(409).json({ error: "Handle already taken" })];
                        }
                        if (storage_1.storage.getUserByEmail(email)) {
                            return [2 /*return*/, res.status(409).json({ error: "Email already registered" })];
                        }
                        user = storage_1.storage.createUser({
                            handle: handle,
                            email: email,
                            passwordHash: (0, auth_1.hashPassword)(password),
                            invitedBy: invite_1.createdBy,
                        });
                        newUsedCount = invite_1.usedCount + 1;
                        storage_1.storage.updateInvite(invite_1.id, {
                            usedCount: newUsedCount,
                            status: newUsedCount >= invite_1.maxUses ? "used" : "active",
                            usedAt: new Date(),
                        });
                        // If this invite was tied to a beta request, mark it activated
                        if (invite_1.email) {
                            requests = storage_1.storage.getBetaRequests();
                            matchedReq = requests.find(function (r) { return r.email === invite_1.email && r.inviteId === invite_1.id; });
                            if (matchedReq) {
                                storage_1.storage.updateBetaRequest(matchedReq.id, { status: "activated" });
                            }
                        }
                        initials = (displayName || handle).slice(0, 2).toUpperCase();
                        storage_1.storage.createProfile({
                            userId: user.id,
                            displayName: displayName || handle,
                            role: role || "Filmmaker",
                            avatarInitials: initials,
                            skills: "[]",
                            isPublic: true,
                            availability: "available",
                        });
                        // Create activity: member joined
                        storage_1.storage.createActivity({
                            type: "member_joined",
                            userId: user.id,
                            targetType: "user",
                            targetId: user.id,
                            message: "just joined thefvc",
                            isPublic: true,
                        });
                        token = (0, auth_1.generateToken)();
                        storage_1.storage.createSession({
                            token: token,
                            userId: user.id,
                            expiresAt: new Date(Date.now() + auth_1.SESSION_DURATION),
                        });
                        res.status(201).json({
                            token: token,
                            user: { id: user.id, handle: user.handle, email: user.email, isAdmin: !!user.isAdmin, accessStatus: user.accessStatus },
                        });
                    }
                    catch (err) {
                        (0, index_1.log)("Signup error: ".concat(err), "auth");
                        res.status(500).json({ error: "Failed to create account" });
                    }
                    return [2 /*return*/];
                });
            }); });
            app.post("/api/auth/login", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, email, password, user, token;
                return __generator(this, function (_b) {
                    try {
                        _a = req.body, email = _a.email, password = _a.password;
                        if (!email || !password) {
                            return [2 /*return*/, res.status(400).json({ error: "Email and password required" })];
                        }
                        user = storage_1.storage.getUserByEmail(email);
                        if (!user || !(0, auth_1.verifyPassword)(password, user.passwordHash)) {
                            return [2 /*return*/, res.status(401).json({ error: "Invalid credentials" })];
                        }
                        // Check access status
                        if (user.accessStatus === "revoked") {
                            return [2 /*return*/, res.status(403).json({ error: "Your access has been revoked. Contact the team." })];
                        }
                        storage_1.storage.setLastLogin(user.id);
                        token = (0, auth_1.generateToken)();
                        storage_1.storage.createSession({
                            token: token,
                            userId: user.id,
                            expiresAt: new Date(Date.now() + auth_1.SESSION_DURATION),
                        });
                        res.json({
                            token: token,
                            user: { id: user.id, handle: user.handle, email: user.email, isAdmin: !!user.isAdmin, accessStatus: user.accessStatus },
                        });
                    }
                    catch (err) {
                        (0, index_1.log)("Login error: ".concat(err), "auth");
                        res.status(500).json({ error: "Login failed" });
                    }
                    return [2 /*return*/];
                });
            }); });
            app.post("/api/auth/logout", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var token;
                var _a;
                return __generator(this, function (_b) {
                    token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace("Bearer ", "");
                    if (token) {
                        storage_1.storage.deleteSession(token);
                    }
                    res.json({ success: true });
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/auth/me", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var user, profile;
                return __generator(this, function (_a) {
                    if (!req.userId) {
                        return [2 /*return*/, res.json({ user: null })];
                    }
                    user = storage_1.storage.getUser(req.userId);
                    if (!user) {
                        return [2 /*return*/, res.json({ user: null })];
                    }
                    profile = storage_1.storage.getProfile(user.id);
                    res.json({
                        user: { id: user.id, handle: user.handle, email: user.email, isAdmin: user.isAdmin, accessStatus: user.accessStatus },
                        profile: profile,
                    });
                    return [2 /*return*/];
                });
            }); });
            // ----- PROFILES -----
            app.get("/api/profiles", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
                var role, city, skill, availability, results;
                return __generator(this, function (_a) {
                    role = _req.query.role;
                    city = _req.query.city;
                    skill = _req.query.skill;
                    availability = _req.query.availability;
                    results = storage_1.storage.searchProfiles({ role: role, city: city, skill: skill, availability: availability });
                    res.json(results);
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/profiles/:handle", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var profile, credits;
                return __generator(this, function (_a) {
                    profile = storage_1.storage.getProfileByHandle(req.params.handle);
                    if (!profile) {
                        return [2 /*return*/, res.status(404).json({ error: "Profile not found" })];
                    }
                    // PRD-018: Only expose public profiles
                    if (!profile.isPublic) {
                        return [2 /*return*/, res.status(403).json({ error: "Profile is private" })];
                    }
                    credits = storage_1.storage.getCreditsByProfile(profile.id);
                    res.json({ profile: profile, credits: credits });
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/profile", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var profile;
                return __generator(this, function (_a) {
                    profile = storage_1.storage.getProfile(req.userId);
                    if (!profile) {
                        return [2 /*return*/, res.status(404).json({ error: "Profile not found" })];
                    }
                    res.json(profile);
                    return [2 /*return*/];
                });
            }); });
            app.patch("/api/profile", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var existing, updated, oldVideos, newVideos, oldSet, _i, newVideos_1, url, platform, oldSocial, newSocial, oldSet, _a, _b, _c, platform, url, displayPlatform;
                return __generator(this, function (_d) {
                    existing = storage_1.storage.getProfile(req.userId);
                    updated = storage_1.storage.updateProfile(req.userId, req.body);
                    if (!updated) {
                        return [2 /*return*/, res.status(404).json({ error: "Profile not found" })];
                    }
                    // Detect newly added video links
                    if (existing && updated.videoLinks) {
                        oldVideos = existing.videoLinks ? (function () {
                            try {
                                return JSON.parse(existing.videoLinks);
                            }
                            catch (_a) {
                                return [];
                            }
                        })() : [];
                        newVideos = (function () {
                            try {
                                return JSON.parse(updated.videoLinks);
                            }
                            catch (_a) {
                                return [];
                            }
                        })();
                        oldSet = new Set(oldVideos.map(function (u) { return u.toLowerCase().trim(); }));
                        for (_i = 0, newVideos_1 = newVideos; _i < newVideos_1.length; _i++) {
                            url = newVideos_1[_i];
                            if (url && !oldSet.has(url.toLowerCase().trim())) {
                                platform = url.includes('youtube') || url.includes('youtu.be') ? 'YouTube'
                                    : url.includes('vimeo') ? 'Vimeo' : 'Video';
                                storage_1.storage.createActivity({
                                    type: "video_shared",
                                    userId: req.userId,
                                    targetType: "profile",
                                    targetId: updated.id,
                                    message: "shared a new video",
                                    metadata: JSON.stringify({ url: url, platform: platform }),
                                    isPublic: true,
                                });
                            }
                        }
                    }
                    // Detect newly added social links (Instagram)
                    if (existing && updated.socialLinks) {
                        oldSocial = existing.socialLinks ? (function () {
                            try {
                                return JSON.parse(existing.socialLinks);
                            }
                            catch (_a) {
                                return {};
                            }
                        })() : {};
                        newSocial = (function () {
                            try {
                                return JSON.parse(updated.socialLinks);
                            }
                            catch (_a) {
                                return {};
                            }
                        })();
                        oldSet = new Set(Object.entries(oldSocial).map(function (_a) {
                            var k = _a[0], v = _a[1];
                            return "".concat(k, ":").concat(v.toLowerCase().trim());
                        }));
                        for (_a = 0, _b = Object.entries(newSocial); _a < _b.length; _a++) {
                            _c = _b[_a], platform = _c[0], url = _c[1];
                            if (url && !oldSet.has("".concat(platform, ":").concat(url.toLowerCase().trim()))) {
                                displayPlatform = platform.charAt(0).toUpperCase() + platform.slice(1);
                                storage_1.storage.createActivity({
                                    type: "social_shared",
                                    userId: req.userId,
                                    targetType: "profile",
                                    targetId: updated.id,
                                    message: "shared their ".concat(displayPlatform),
                                    metadata: JSON.stringify({ url: url, platform: displayPlatform }),
                                    isPublic: true,
                                });
                            }
                        }
                    }
                    res.json(updated);
                    return [2 /*return*/];
                });
            }); });
            upload = (0, multer_1.default)({
                storage: multer_1.default.diskStorage({
                    destination: function (_req, _file, cb) {
                        var dir = (0, node_path_1.join)(process.cwd(), "uploads", "profiles");
                        if (!(0, node_fs_1.existsSync)(dir))
                            (0, node_fs_1.mkdirSync)(dir, { recursive: true });
                        cb(null, dir);
                    },
                    filename: function (_req, file, cb) {
                        var _a;
                        var ext = ((_a = file.originalname.split(".").pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "jpg";
                        cb(null, "".concat((0, node_crypto_1.randomUUID)(), ".").concat(ext));
                    },
                }),
                limits: { fileSize: 8 * 1024 * 1024 }, // 8MB max
                fileFilter: function (_req, file, cb) {
                    var allowed = ["image/jpeg", "image/png", "image/webp"];
                    if (allowed.includes(file.mimetype)) {
                        cb(null, true);
                    }
                    else {
                        cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
                    }
                },
            });
            app.post("/api/profile/avatar", auth_1.requireAuth, upload.single("avatar"), function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var url, updated;
                return __generator(this, function (_a) {
                    if (!req.file) {
                        return [2 /*return*/, res.status(400).json({ error: "No file uploaded" })];
                    }
                    url = "/uploads/profiles/".concat(req.file.filename);
                    updated = storage_1.storage.updateProfile(req.userId, { avatarUrl: url });
                    res.json({ url: url, profile: updated });
                    return [2 /*return*/];
                });
            }); });
            app.post("/api/profile/cover", auth_1.requireAuth, upload.single("cover"), function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var url, updated;
                return __generator(this, function (_a) {
                    if (!req.file) {
                        return [2 /*return*/, res.status(400).json({ error: "No file uploaded" })];
                    }
                    url = "/uploads/profiles/".concat(req.file.filename);
                    updated = storage_1.storage.updateProfile(req.userId, { coverUrl: url });
                    res.json({ url: url, profile: updated });
                    return [2 /*return*/];
                });
            }); });
            // ----- PRODUCTIONS -----
            app.get("/api/productions", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var prods;
                return __generator(this, function (_a) {
                    prods = storage_1.storage.getProductionsByUser(req.userId);
                    res.json(prods);
                    return [2 /*return*/];
                });
            }); });
            app.post("/api/productions", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var prod;
                return __generator(this, function (_a) {
                    try {
                        prod = storage_1.storage.createProduction(__assign(__assign({}, req.body), { creatorId: req.userId }));
                        // Create activity: production started
                        storage_1.storage.createActivity({
                            type: "production_created",
                            userId: req.userId,
                            targetType: "production",
                            targetId: prod.id,
                            message: "started production \"".concat(prod.title, "\""),
                            isPublic: true,
                        });
                        res.status(201).json(prod);
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to create production" });
                    }
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/productions/:id", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var prod, crew;
                return __generator(this, function (_a) {
                    prod = storage_1.storage.getProduction(parseInt(req.params.id));
                    if (!prod) {
                        return [2 /*return*/, res.status(404).json({ error: "Production not found" })];
                    }
                    crew = storage_1.storage.getCrewByProduction(prod.id);
                    res.json({ production: prod, crew: crew });
                    return [2 /*return*/];
                });
            }); });
            app.patch("/api/productions/:id", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var prod, updated;
                return __generator(this, function (_a) {
                    prod = storage_1.storage.getProduction(parseInt(req.params.id));
                    if (!prod || prod.creatorId !== req.userId) {
                        return [2 /*return*/, res.status(403).json({ error: "Not authorized" })];
                    }
                    updated = storage_1.storage.updateProduction(prod.id, req.body);
                    res.json(updated);
                    return [2 /*return*/];
                });
            }); });
            // ----- PRODUCTION CREW -----
            app.get("/api/productions/:id/crew", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var crew;
                return __generator(this, function (_a) {
                    crew = storage_1.storage.getCrewByProduction(parseInt(req.params.id));
                    res.json(crew);
                    return [2 /*return*/];
                });
            }); });
            app.post("/api/productions/:id/crew", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var member;
                return __generator(this, function (_a) {
                    try {
                        member = storage_1.storage.addCrewMember(__assign(__assign({}, req.body), { productionId: parseInt(req.params.id) }));
                        res.status(201).json(member);
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to add crew member" });
                    }
                    return [2 /*return*/];
                });
            }); });
            app.patch("/api/crew/:id", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var updated;
                return __generator(this, function (_a) {
                    updated = storage_1.storage.updateCrewMember(parseInt(req.params.id), req.body);
                    res.json(updated);
                    return [2 /*return*/];
                });
            }); });
            app.delete("/api/crew/:id", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    storage_1.storage.removeCrewMember(parseInt(req.params.id));
                    res.json({ success: true });
                    return [2 /*return*/];
                });
            }); });
            // ----- CREDITS -----
            app.get("/api/profiles/:handle/credits", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var profile, credits;
                return __generator(this, function (_a) {
                    profile = storage_1.storage.getProfileByHandle(req.params.handle);
                    if (!profile) {
                        return [2 /*return*/, res.status(404).json({ error: "Profile not found" })];
                    }
                    credits = storage_1.storage.getCreditsByProfile(profile.id);
                    res.json(credits);
                    return [2 /*return*/];
                });
            }); });
            app.post("/api/credits", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var profile, credit;
                return __generator(this, function (_a) {
                    try {
                        profile = storage_1.storage.getProfile(req.userId);
                        if (!profile) {
                            return [2 /*return*/, res.status(404).json({ error: "Profile not found" })];
                        }
                        credit = storage_1.storage.createCredit(__assign(__assign({}, req.body), { profileId: profile.id }));
                        res.status(201).json(credit);
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to create credit" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // ----- SEED DATA (dev only) -----
            app.post("/api/seed", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
                var seedUsers, _i, seedUsers_1, u, user;
                return __generator(this, function (_a) {
                    if (process.env.NODE_ENV === "production") {
                        return [2 /*return*/, res.status(404).json({ error: "Not found" })];
                    }
                    try {
                        seedUsers = [
                            { handle: "sarahk", email: "sarah@test.com", displayName: "Sarah Kowalski", role: "Director of Photography", city: "Brooklyn", state: "NY", skills: ["RED Komodo", "Music Videos", "Narrative"], dayRate: 850, bio: "DP based in Brooklyn. 10+ years shooting indie features, music videos, and branded content.", reelUrl: "https://vimeo.com/sarahk" },
                            { handle: "marcusl", email: "marcus@test.com", displayName: "Marcus Lee", role: "Director", city: "Atlanta", state: "GA", skills: ["Narrative", "Short Film", "Commercial"], dayRate: 1200, bio: "Award-winning indie director. Three films on the festival circuit.", reelUrl: "https://vimeo.com/marcuslee" },
                            { handle: "jennyt", email: "jenny@test.com", displayName: "Jenny Torres", role: "1st AC", city: "Los Angeles", state: "CA", skills: ["ARRI Alexa", "Lens Maintenance", "Focus Pulling"], dayRate: 600, bio: "1st AC with 6 years on union and non-union sets. Fast, reliable, no drama.", reelUrl: "" },
                            { handle: "davidw", email: "david@test.com", displayName: "David Washington", role: "Gaffer", city: "Atlanta", state: "GA", skills: ["Lighting Design", "LED Panels", "Rigging"], dayRate: 700, bio: "Gaffer and best boy available. Own a 1-ton grip truck.", reelUrl: "" },
                            { handle: "ameliar", email: "amelia@test.com", displayName: "Amelia Rodriguez", role: "Production Designer", city: "Austin", state: "TX", skills: ["Set Design", "Props", "Art Direction"], dayRate: 800, bio: "Production designer for indie features and music videos. Art dept workflow specialist.", reelUrl: "" },
                            { handle: "tommyh", email: "tommy@test.com", displayName: "Tommy Huang", role: "Sound Mixer", city: "New York", state: "NY", skills: ["Location Sound", "Boom Op", "Wireless Lav"], dayRate: 650, bio: "Production sound mixer with full kit. Based in NYC, travels.", reelUrl: "" },
                        ];
                        for (_i = 0, seedUsers_1 = seedUsers; _i < seedUsers_1.length; _i++) {
                            u = seedUsers_1[_i];
                            if (storage_1.storage.getUserByHandle(u.handle))
                                continue;
                            user = storage_1.storage.createUser({
                                handle: u.handle,
                                email: u.email,
                                passwordHash: (0, auth_1.hashPassword)("password123"),
                            });
                            storage_1.storage.createProfile({
                                userId: user.id,
                                displayName: u.displayName,
                                role: u.role,
                                city: u.city,
                                state: u.state,
                                avatarInitials: u.displayName.slice(0, 2).toUpperCase(),
                                bio: u.bio,
                                reelUrl: u.reelUrl,
                                dayRate: u.dayRate,
                                skills: JSON.stringify(u.skills),
                                availability: "available",
                                isPublic: true,
                            });
                        }
                        res.json({ success: true, message: "Seed data created" });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Seed failed" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // ----- BETA: Public request access -----
            app.post("/api/beta/request", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, email_1, handle, displayName, role, city, message, existing, betaReq;
                return __generator(this, function (_b) {
                    try {
                        _a = req.body, email_1 = _a.email, handle = _a.handle, displayName = _a.displayName, role = _a.role, city = _a.city, message = _a.message;
                        if (!email_1) {
                            return [2 /*return*/, res.status(400).json({ error: "Email is required" })];
                        }
                        existing = storage_1.storage.getBetaRequests().find(function (r) { return r.email === email_1; });
                        if (existing) {
                            return [2 /*return*/, res.status(409).json({ error: "You're already on the waitlist", status: existing.status })];
                        }
                        betaReq = storage_1.storage.createBetaRequest({ email: email_1, handle: handle, displayName: displayName, role: role, city: city, message: message });
                        res.status(201).json({ success: true, message: "Request received", id: betaReq.id });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to submit request" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Validate invite token (for auth page)
            app.get("/api/beta/invite/:token", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var invite;
                return __generator(this, function (_a) {
                    invite = storage_1.storage.getInviteByToken(req.params.token);
                    if (!invite || invite.status !== "active" || invite.usedCount >= invite.maxUses) {
                        return [2 /*return*/, res.status(404).json({ valid: false })];
                    }
                    res.json({
                        valid: true,
                        email: invite.email,
                        displayName: invite.displayName,
                        role: invite.role,
                    });
                    return [2 /*return*/];
                });
            }); });
            // ----- BETA FEEDBACK (logged-in users) -----
            app.post("/api/feedback", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, category, message, pageUrl, feedback;
                return __generator(this, function (_b) {
                    try {
                        _a = req.body, category = _a.category, message = _a.message, pageUrl = _a.pageUrl;
                        if (!category || !message) {
                            return [2 /*return*/, res.status(400).json({ error: "Category and message are required" })];
                        }
                        feedback = storage_1.storage.createFeedback({
                            userId: req.userId,
                            category: category,
                            message: message,
                            pageUrl: pageUrl,
                        });
                        res.status(201).json(feedback);
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to submit feedback" });
                    }
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/feedback/me", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var feedback;
                return __generator(this, function (_a) {
                    feedback = storage_1.storage.getFeedbackByUser(req.userId);
                    res.json(feedback);
                    return [2 /*return*/];
                });
            }); });
            // ----- ADMIN: Beta Dashboard -----
            app.get("/api/admin/beta", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var requests, invites, allUsers, feedback, activeMembers;
                return __generator(this, function (_a) {
                    requests = storage_1.storage.getBetaRequests();
                    invites = storage_1.storage.getInvites();
                    allUsers = storage_1.storage.getAllUsers();
                    feedback = storage_1.storage.getFeedback();
                    activeMembers = allUsers.filter(function (u) { return u.accessStatus === "active" && !u.isAdmin; });
                    res.json({
                        seats: {
                            used: activeMembers.length,
                            limit: BETA_SEAT_LIMIT,
                            remaining: BETA_SEAT_LIMIT - activeMembers.length,
                        },
                        requests: {
                            pending: requests.filter(function (r) { return r.status === "pending"; }).length,
                            approved: requests.filter(function (r) { return r.status === "approved" || r.status === "invited"; }).length,
                            activated: requests.filter(function (r) { return r.status === "activated"; }).length,
                            rejected: requests.filter(function (r) { return r.status === "rejected"; }).length,
                            total: requests.length,
                        },
                        invites: {
                            active: invites.filter(function (i) { return i.status === "active"; }).length,
                            used: invites.filter(function (i) { return i.status === "used"; }).length,
                            revoked: invites.filter(function (i) { return i.status === "revoked"; }).length,
                            total: invites.length,
                        },
                        members: allUsers.map(function (u) { return ({
                            id: u.id,
                            handle: u.handle,
                            email: u.email,
                            isAdmin: u.isAdmin,
                            accessStatus: u.accessStatus,
                            createdAt: u.createdAt,
                            lastLoginAt: u.lastLoginAt,
                            invitedBy: u.invitedBy,
                        }); }),
                        feedback: feedback.map(function (f) { return ({
                            id: f.id,
                            userId: f.userId,
                            category: f.category,
                            message: f.message,
                            pageUrl: f.pageUrl,
                            status: f.status,
                            createdAt: f.createdAt,
                            adminNotes: f.adminNotes,
                        }); }),
                        pendingRequests: requests.filter(function (r) { return r.status === "pending"; }),
                        allInvites: invites,
                    });
                    return [2 /*return*/];
                });
            }); });
            // Approve a beta request → generates invite
            app.post("/api/admin/beta/requests/:id/approve", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var betaReq, activeMembers, token, invite;
                return __generator(this, function (_a) {
                    try {
                        betaReq = storage_1.storage.getBetaRequest(parseInt(req.params.id));
                        if (!betaReq) {
                            return [2 /*return*/, res.status(404).json({ error: "Request not found" })];
                        }
                        if (betaReq.status !== "pending") {
                            return [2 /*return*/, res.status(400).json({ error: "Request is not pending" })];
                        }
                        activeMembers = storage_1.storage.getAllUsers().filter(function (u) { return u.accessStatus === "active" && !u.isAdmin; });
                        if (activeMembers.length >= BETA_SEAT_LIMIT) {
                            return [2 /*return*/, res.status(400).json({ error: "Beta seat limit reached" })];
                        }
                        token = (0, node_crypto_1.randomBytes)(32).toString("base64url");
                        invite = storage_1.storage.createInvite({
                            token: token,
                            email: betaReq.email,
                            displayName: betaReq.displayName,
                            role: betaReq.role,
                            createdBy: req.userId,
                            notes: "Auto-generated for request #".concat(betaReq.id),
                        });
                        // Update request
                        storage_1.storage.updateBetaRequest(betaReq.id, {
                            status: "invited",
                            inviteId: invite.id,
                            approvedAt: new Date(),
                        });
                        res.json({
                            success: true,
                            invite: invite,
                            inviteUrl: "#/auth?invite=".concat(token),
                        });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to approve request" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Reject a beta request
            app.post("/api/admin/beta/requests/:id/reject", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var betaReq;
                return __generator(this, function (_a) {
                    betaReq = storage_1.storage.getBetaRequest(parseInt(req.params.id));
                    if (!betaReq) {
                        return [2 /*return*/, res.status(404).json({ error: "Request not found" })];
                    }
                    storage_1.storage.updateBetaRequest(betaReq.id, { status: "rejected" });
                    res.json({ success: true });
                    return [2 /*return*/];
                });
            }); });
            // Manually create an invite
            app.post("/api/admin/beta/invites", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, email, displayName, role, notes, token, invite;
                return __generator(this, function (_b) {
                    try {
                        _a = req.body, email = _a.email, displayName = _a.displayName, role = _a.role, notes = _a.notes;
                        token = (0, node_crypto_1.randomBytes)(32).toString("base64url");
                        invite = storage_1.storage.createInvite({
                            token: token,
                            email: email,
                            displayName: displayName,
                            role: role,
                            createdBy: req.userId,
                            notes: notes,
                        });
                        res.json({ success: true, invite: invite, inviteUrl: "#/auth?invite=".concat(token) });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to create invite" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Revoke an invite
            app.post("/api/admin/beta/invites/:id/revoke", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    storage_1.storage.revokeInvite(parseInt(req.params.id));
                    res.json({ success: true });
                    return [2 /*return*/];
                });
            }); });
            // Update user access (activate/revoke)
            app.patch("/api/admin/users/:id/access", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var status, user;
                return __generator(this, function (_a) {
                    status = req.body.status;
                    if (!["active", "revoked"].includes(status)) {
                        return [2 /*return*/, res.status(400).json({ error: "Invalid status" })];
                    }
                    user = storage_1.storage.updateUserAccess(parseInt(req.params.id), status);
                    if (!user) {
                        return [2 /*return*/, res.status(404).json({ error: "User not found" })];
                    }
                    res.json({ success: true, user: { id: user.id, handle: user.handle, accessStatus: user.accessStatus } });
                    return [2 /*return*/];
                });
            }); });
            // Update feedback status
            app.patch("/api/admin/feedback/:id", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, status, adminNotes, allFeedback, feedback;
                return __generator(this, function (_b) {
                    _a = req.body, status = _a.status, adminNotes = _a.adminNotes;
                    allFeedback = storage_1.storage.getFeedback();
                    feedback = allFeedback.find(function (f) { return f.id === parseInt(req.params.id); });
                    if (!feedback) {
                        return [2 /*return*/, res.status(404).json({ error: "Feedback not found" })];
                    }
                    // Use Drizzle ORM via storage (Forge correction: no raw SQL)
                    storage_1.storage.updateFeedbackStatus(feedback.id, status || feedback.status, adminNotes !== null && adminNotes !== void 0 ? adminNotes : feedback.adminNotes);
                    res.json({ success: true });
                    return [2 /*return*/];
                });
            }); });
            // ===== FEED =====
            // Public feed (no auth required, public items only)
            app.get("/api/feed/public", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var limit, items, sanitized, posts;
                return __generator(this, function (_a) {
                    limit = Math.min(parseInt(req.query.limit) || 20, 50);
                    items = storage_1.storage.getFeed(limit, 0, true);
                    sanitized = items.map(function (item) { return ({
                        id: item.id,
                        type: item.type,
                        message: item.message,
                        metadata: item.metadata,
                        createdAt: item.createdAt,
                        user: item.user ? { handle: item.user.handle } : null,
                        profile: item.profile ? { displayName: item.profile.displayName, role: item.profile.role, city: item.profile.city, avatarUrl: item.profile.avatarUrl, avatarInitials: item.profile.avatarInitials } : null,
                    }); });
                    posts = storage_1.storage.getPosts(limit).map(function (p) { return ({
                        id: p.id,
                        body: p.body,
                        linkUrl: p.linkUrl,
                        createdAt: p.createdAt,
                        user: p.user ? { handle: p.user.handle } : null,
                        profile: p.profile ? { displayName: p.profile.displayName, role: p.profile.role, city: p.profile.city, avatarUrl: p.profile.avatarUrl, avatarInitials: p.profile.avatarInitials } : null,
                    }); });
                    res.json({ activities: sanitized, posts: posts });
                    return [2 /*return*/];
                });
            }); });
            // Authenticated feed ( richer data)
            app.get("/api/feed", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var limit, items, posts;
                return __generator(this, function (_a) {
                    limit = Math.min(parseInt(req.query.limit) || 50, 100);
                    items = storage_1.storage.getFeed(limit);
                    posts = storage_1.storage.getPosts(limit);
                    res.json({ activities: items, posts: posts });
                    return [2 /*return*/];
                });
            }); });
            // Create a post
            app.post("/api/feed/posts", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, body, linkUrl, visibility, post;
                return __generator(this, function (_b) {
                    try {
                        _a = req.body, body = _a.body, linkUrl = _a.linkUrl, visibility = _a.visibility;
                        if (!body || !body.trim()) {
                            return [2 /*return*/, res.status(400).json({ error: "Post body is required" })];
                        }
                        if (body.length > 2000) {
                            return [2 /*return*/, res.status(400).json({ error: "Post is too long (max 2000 characters)" })];
                        }
                        post = storage_1.storage.createPost({
                            userId: req.userId,
                            body: body.trim(),
                            linkUrl: linkUrl || null,
                            visibility: visibility || "public",
                        });
                        // Create activity: post shared
                        storage_1.storage.createActivity({
                            type: "post_shared",
                            userId: req.userId,
                            targetType: "post",
                            targetId: post.id,
                            message: "shared an update",
                            isPublic: true,
                        });
                        res.status(201).json(post);
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to create post" });
                    }
                    return [2 /*return*/];
                });
            }); });
            NEWS_FEEDS = [
                { name: "IndieWire", url: "https://www.indiewire.com/feed/", category: "Industry" },
                { name: "Deadline", url: "https://deadline.com/feed/", category: "Industry" },
                { name: "Variety", url: "https://variety.com/feed/", category: "Industry" },
                { name: "Filmmaker Magazine", url: "https://filmmakermagazine.com/feed/", category: "Craft" },
                { name: "No Film School", url: "https://nofilmschool.com/feed", category: "Craft" },
                { name: "MovieMaker", url: "https://www.moviemaker.com/feed/", category: "Craft" },
            ];
            newsCache = null;
            NEWS_CACHE_TTL = parseInt(process.env.NEWS_CACHE_TTL_MS || "10800000", 10);
            app.get("/api/feed/news", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var results, allItems, err_1;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            if (newsCache && Date.now() - newsCache.fetchedAt < NEWS_CACHE_TTL) {
                                return [2 /*return*/, res.json(newsCache.items)];
                            }
                            return [4 /*yield*/, Promise.allSettled(NEWS_FEEDS.map(function (feed) { return __awaiter(_this, void 0, void 0, function () {
                                    var controller, timeout, resp, xml, e_1;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                controller = new AbortController();
                                                timeout = setTimeout(function () { return controller.abort(); }, 8000);
                                                _a.label = 1;
                                            case 1:
                                                _a.trys.push([1, 4, 5, 6]);
                                                return [4 /*yield*/, fetch(feed.url, {
                                                        signal: controller.signal,
                                                        headers: { "User-Agent": "Mozilla/5.0 (compatible; TheFVC/1.0)" },
                                                    })];
                                            case 2:
                                                resp = _a.sent();
                                                return [4 /*yield*/, resp.text()];
                                            case 3:
                                                xml = _a.sent();
                                                return [2 /*return*/, parseRssItems(xml, feed.name, feed.category)];
                                            case 4:
                                                e_1 = _a.sent();
                                                console.error("[news] Failed to fetch ".concat(feed.name, ":"), e_1.message);
                                                return [2 /*return*/, []];
                                            case 5:
                                                clearTimeout(timeout);
                                                return [7 /*endfinally*/];
                                            case 6: return [2 /*return*/];
                                        }
                                    });
                                }); }))];
                        case 1:
                            results = _a.sent();
                            allItems = results
                                .filter(function (r) { return r.status === "fulfilled"; })
                                .flatMap(function (r) { return r.value; })
                                .sort(function (a, b) { return b.pubDate - a.pubDate; })
                                .slice(0, 30);
                            newsCache = { items: allItems, fetchedAt: Date.now() };
                            res.json(allItems);
                            return [3 /*break*/, 3];
                        case 2:
                            err_1 = _a.sent();
                            res.status(500).json({ error: "Failed to fetch news" });
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            // ===== PRD-010: LEGAL & COMPLIANCE =====
            // Security audit log (admin only)
            app.get("/api/compliance/security-log", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, userId, action, limit, since, events;
                return __generator(this, function (_b) {
                    try {
                        _a = req.query, userId = _a.userId, action = _a.action, limit = _a.limit, since = _a.since;
                        events = storage_1.storage.getSecurityLog({
                            userId: userId ? parseInt(userId) : undefined,
                            action: action,
                            limit: limit ? parseInt(limit) : 100,
                            since: since ? new Date(since) : undefined,
                        });
                        res.json(events);
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to fetch security log" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Blocked IPs (admin only)
            app.get("/api/compliance/blocked-ips", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var ips;
                return __generator(this, function (_a) {
                    try {
                        ips = storage_1.storage.getActiveBlockedIps();
                        res.json(ips);
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to fetch blocked IPs" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // ===== PRD-013: EMAIL INFRASTRUCTURE =====
            // Email queue stats (admin only)
            app.get("/api/email/stats", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var getEmailStats, stats, err_2;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, Promise.resolve().then(function () { return require("./email/queue"); })];
                        case 1:
                            getEmailStats = (_a.sent()).getEmailStats;
                            return [4 /*yield*/, getEmailStats()];
                        case 2:
                            stats = _a.sent();
                            res.json(stats);
                            return [3 /*break*/, 4];
                        case 3:
                            err_2 = _a.sent();
                            res.status(500).json({ error: "Failed to fetch email stats" });
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); });
            // ===== PRD-011: ACCOUNT & SETTINGS =====
            // Password reset request
            app.post("/api/auth/password-reset/request", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var email, user, token, expiresAt, queueEmail, passwordResetTemplate, err_3;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            email = req.body.email;
                            if (!email) {
                                return [2 /*return*/, res.status(400).json({ error: "Email is required" })];
                            }
                            user = storage_1.storage.getUserByEmail(email);
                            if (!user) {
                                // Don't reveal whether email exists
                                return [2 /*return*/, res.json({ success: true, message: "If the email exists, a reset link will be sent." })];
                            }
                            token = (0, auth_1.generateToken)();
                            expiresAt = new Date(Date.now() + 60 * 60 * 1000);
                            storage_1.storage.createPasswordReset({
                                userId: user.id,
                                token: token,
                                expiresAt: expiresAt,
                                used: false,
                            });
                            return [4 /*yield*/, Promise.resolve().then(function () { return require("./email/queue"); })];
                        case 1:
                            queueEmail = (_a.sent()).queueEmail;
                            return [4 /*yield*/, Promise.resolve().then(function () { return require("./email/templates"); })];
                        case 2:
                            passwordResetTemplate = (_a.sent()).passwordResetTemplate;
                            queueEmail({
                                to: email,
                                subject: "Password Reset Request",
                                html: passwordResetTemplate({
                                    resetUrl: "".concat(process.env.FRONTEND_URL || "https://thefvc.is", "/reset-password?token=").concat(token),
                                    userHandle: user.displayName || user.handle,
                                }).html,
                                metadata: { type: "password_reset", userId: user.id },
                            });
                            // Log security event
                            storage_1.storage.createSecurityLog({
                                userId: user.id,
                                action: "password_reset_requested",
                                ipAddress: req.ip,
                                userAgent: req.get("User-Agent"),
                                success: true,
                            });
                            res.json({ success: true, message: "If the email exists, a reset link will be sent." });
                            return [3 /*break*/, 4];
                        case 3:
                            err_3 = _a.sent();
                            res.status(500).json({ error: "Failed to process password reset" });
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); });
            // Password reset confirmation
            app.post("/api/auth/password-reset/confirm", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, token, password, reset, user;
                return __generator(this, function (_b) {
                    try {
                        _a = req.body, token = _a.token, password = _a.password;
                        if (!token || !password) {
                            return [2 /*return*/, res.status(400).json({ error: "Token and password are required" })];
                        }
                        reset = storage_1.storage.getPasswordResetByToken(token);
                        if (!reset || reset.expiresAt < new Date() || reset.used) {
                            return [2 /*return*/, res.status(400).json({ error: "Invalid or expired token" })];
                        }
                        user = storage_1.storage.getUser(reset.userId);
                        if (!user) {
                            return [2 /*return*/, res.status(400).json({ error: "User not found" })];
                        }
                        storage_1.storage.updateUser(user.id, { passwordHash: (0, auth_1.hashPassword)(password) });
                        storage_1.storage.markPasswordResetUsed(reset.id);
                        storage_1.storage.createSecurityLog({
                            userId: user.id,
                            action: "password_reset_completed",
                            ipAddress: req.ip,
                            userAgent: req.get("User-Agent"),
                            success: true,
                        });
                        res.json({ success: true, message: "Password updated successfully" });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to reset password" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Email verification request
            app.post("/api/auth/email-verification/request", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var user, token, expiresAt, queueEmail, emailVerificationTemplate, err_4;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            user = storage_1.storage.getUser(req.userId);
                            if (!user) {
                                return [2 /*return*/, res.status(404).json({ error: "User not found" })];
                            }
                            token = (0, auth_1.generateToken)();
                            expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                            storage_1.storage.createEmailVerification({
                                userId: user.id,
                                email: user.email,
                                token: token,
                                expiresAt: expiresAt,
                                used: false,
                            });
                            return [4 /*yield*/, Promise.resolve().then(function () { return require("./email/queue"); })];
                        case 1:
                            queueEmail = (_a.sent()).queueEmail;
                            return [4 /*yield*/, Promise.resolve().then(function () { return require("./email/templates"); })];
                        case 2:
                            emailVerificationTemplate = (_a.sent()).emailVerificationTemplate;
                            queueEmail({
                                to: user.email,
                                subject: "Email Verification",
                                html: emailVerificationTemplate({
                                    verificationUrl: "".concat(process.env.FRONTEND_URL || "https://thefvc.is", "/verify-email?token=").concat(token),
                                    userHandle: user.displayName || user.handle,
                                }).html,
                                metadata: { type: "email_verification", userId: user.id },
                            });
                            storage_1.storage.createSecurityLog({
                                userId: user.id,
                                action: "email_verification_requested",
                                ipAddress: req.ip,
                                userAgent: req.get("User-Agent"),
                                success: true,
                            });
                            res.json({ success: true, message: "Verification email sent." });
                            return [3 /*break*/, 4];
                        case 3:
                            err_4 = _a.sent();
                            res.status(500).json({ error: "Failed to send verification email" });
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); });
            // Email verification confirmation
            app.post("/api/auth/email-verification/confirm", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var token, verification;
                return __generator(this, function (_a) {
                    try {
                        token = req.body.token;
                        if (!token) {
                            return [2 /*return*/, res.status(400).json({ error: "Token is required" })];
                        }
                        verification = storage_1.storage.getEmailVerificationByToken(token);
                        if (!verification || verification.expiresAt < new Date() || verification.used) {
                            return [2 /*return*/, res.status(400).json({ error: "Invalid or expired token" })];
                        }
                        storage_1.storage.markEmailVerificationUsed(verification.id);
                        storage_1.storage.createSecurityLog({
                            userId: verification.userId,
                            action: "email_verified",
                            ipAddress: req.ip,
                            userAgent: req.get("User-Agent"),
                            success: true,
                        });
                        res.json({ success: true, message: "Email verified successfully" });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to verify email" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // ===== PRD-015: REPORTING & ANALYTICS =====
            // Log an analytics event
            app.post("/api/analytics/event", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, eventType, eventName, properties, sessionId;
                return __generator(this, function (_b) {
                    try {
                        _a = req.body, eventType = _a.eventType, eventName = _a.eventName, properties = _a.properties, sessionId = _a.sessionId;
                        if (!eventType) {
                            return [2 /*return*/, res.status(400).json({ error: "eventType is required" })];
                        }
                        storage_1.storage.createAnalyticsEvent({
                            userId: req.userId,
                            eventType: eventType,
                            eventName: eventName || undefined,
                            properties: JSON.stringify(properties || {}),
                            ipAddress: req.ip,
                            userAgent: req.get("User-Agent"),
                            sessionId: sessionId || undefined,
                        });
                        res.json({ success: true });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to log analytics event" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Get analytics events (admin only)
            app.get("/api/analytics/events", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, userId, eventType, limit, since, events;
                return __generator(this, function (_b) {
                    try {
                        _a = req.query, userId = _a.userId, eventType = _a.eventType, limit = _a.limit, since = _a.since;
                        events = storage_1.storage.getAnalyticsEvents({
                            userId: userId ? parseInt(userId) : undefined,
                            eventType: eventType,
                            limit: limit ? parseInt(limit) : 100,
                            since: since ? new Date(since) : undefined,
                        });
                        res.json(events);
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to fetch analytics events" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Get analytics summary (admin only)
            app.get("/api/analytics/summary", auth_1.requireAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var since, sinceDate, getAnalyticsSummary, summary, err_5;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            since = req.query.since;
                            sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                            return [4 /*yield*/, Promise.resolve().then(function () { return require("./analytics"); })];
                        case 1:
                            getAnalyticsSummary = (_a.sent()).getAnalyticsSummary;
                            return [4 /*yield*/, getAnalyticsSummary(sinceDate)];
                        case 2:
                            summary = _a.sent();
                            res.json(summary);
                            return [3 /*break*/, 4];
                        case 3:
                            err_5 = _a.sent();
                            res.status(500).json({ error: "Failed to fetch analytics summary" });
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); });
            // ===== PRD-009: NOTIFICATIONS API =====
            // Get user's notifications
            app.get("/api/notifications", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, limit, unreadOnly, notifications_1;
                return __generator(this, function (_b) {
                    try {
                        _a = req.query, limit = _a.limit, unreadOnly = _a.unreadOnly;
                        notifications_1 = storage_1.storage.getNotifications(req.userId, limit ? parseInt(limit) : 50, unreadOnly === "true");
                        res.json(notifications_1);
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to fetch notifications" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Get unread notification count
            app.get("/api/notifications/unread-count", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    try {
                        count = storage_1.storage.getUnreadNotificationCount(req.userId);
                        res.json({ count: count });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to fetch unread count" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Mark a notification as read
            app.post("/api/notifications/:id/read", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    try {
                        storage_1.storage.markNotificationRead(parseInt(req.params.id));
                        res.json({ success: true });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to mark notification as read" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Mark all notifications as read
            app.post("/api/notifications/read-all", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    try {
                        storage_1.storage.markAllNotificationsRead(req.userId);
                        res.json({ success: true });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to mark all notifications as read" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // Delete a notification
            app.delete("/api/notifications/:id", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    try {
                        storage_1.storage.deleteNotification(parseInt(req.params.id));
                        res.json({ success: true });
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to delete notification" });
                    }
                    return [2 /*return*/];
                });
            }); });
            // ===== PRD-006: Crew Finder Pagination Endpoint =====
            app.get("/api/profiles/paginated", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var opts, result;
                return __generator(this, function (_a) {
                    opts = {
                        role: req.query.role,
                        city: req.query.city,
                        skill: req.query.skill,
                        availability: req.query.availability,
                        sortBy: req.query.sortBy,
                        sortDir: req.query.sortDir,
                        limit: req.query.limit ? parseInt(req.query.limit) : undefined,
                        offset: req.query.offset ? parseInt(req.query.offset) : undefined,
                    };
                    result = storage_1.storage.searchProfilesPaginated(opts);
                    res.json(result);
                    return [2 /*return*/];
                });
            }); });
            // ===== PRD-007: Payments & Monetization =====
            // --- Subscription Tiers ---
            app.get("/api/subscription-tiers", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
                var tiers;
                return __generator(this, function (_a) {
                    tiers = storage_1.storage.getSubscriptionTiers(true);
                    res.json(tiers);
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/subscription-tiers/:name", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var tier;
                return __generator(this, function (_a) {
                    tier = storage_1.storage.getSubscriptionTier(req.params.name);
                    if (!tier) {
                        return [2 /*return*/, res.status(404).json({ error: "Tier not found" })];
                    }
                    res.json(tier);
                    return [2 /*return*/];
                });
            }); });
            // --- Subscription Management (PRD-020) ---
            app.get("/api/subscription", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var profile;
                return __generator(this, function (_a) {
                    profile = storage_1.storage.getProfile(req.userId);
                    if (!profile) {
                        return [2 /*return*/, res.status(404).json({ error: "Profile not found" })];
                    }
                    res.json({
                        tier: profile.subscriptionTier,
                        status: profile.subscriptionStatus,
                        stripeCustomerId: profile.stripeCustomerId,
                    });
                    return [2 /*return*/];
                });
            }); });
            app.post("/api/subscription/checkout", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var tierName, tier, stripe_3, profile, session, err_6;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            tierName = req.body.tierName;
                            if (!tierName) {
                                return [2 /*return*/, res.status(400).json({ error: "Tier name is required" })];
                            }
                            tier = storage_1.storage.getSubscriptionTier(tierName);
                            if (!tier || !tier.stripePriceId) {
                                return [2 /*return*/, res.status(404).json({ error: "Tier not found or not available for purchase" })];
                            }
                            stripe_3 = new stripe_2.Stripe(process.env.STRIPE_SECRET_KEY || "[REDACTED]", {
                                apiVersion: "2023-10-16",
                            });
                            profile = storage_1.storage.getProfile(req.userId);
                            if (!profile) {
                                return [2 /*return*/, res.status(404).json({ error: "Profile not found" })];
                            }
                            return [4 /*yield*/, stripe_3.checkout.sessions.create({
                                    mode: "subscription",
                                    payment_method_types: ["card"],
                                    line_items: [{ price: tier.stripePriceId, quantity: 1 }],
                                    customer_email: profile.stripeCustomerId || undefined,
                                    success_url: "".concat(process.env.FRONTEND_URL || "https://thefvc.is", "/app/payments?session_id={CHECKOUT_SESSION_ID}"),
                                    cancel_url: "".concat(process.env.FRONTEND_URL || "https://thefvc.is", "/app/payments"),
                                    metadata: { userId: String(req.userId), tierName: tierName },
                                })];
                        case 1:
                            session = _a.sent();
                            res.json({ checkoutUrl: session.url });
                            return [3 /*break*/, 3];
                        case 2:
                            err_6 = _a.sent();
                            console.error("Checkout error:", err_6);
                            res.status(500).json({ error: "Failed to create checkout session" });
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            app.post("/api/subscription/cancel", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var profile, stripe_4, subscriptions, err_7;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 4, , 5]);
                            profile = storage_1.storage.getProfile(req.userId);
                            if (!profile || !profile.stripeCustomerId) {
                                return [2 /*return*/, res.status(404).json({ error: "No active subscription found" })];
                            }
                            stripe_4 = new stripe_2.Stripe(process.env.STRIPE_SECRET_KEY || "[REDACTED]", {
                                apiVersion: "2023-10-16",
                            });
                            return [4 /*yield*/, stripe_4.subscriptions.list({
                                    customer: profile.stripeCustomerId,
                                    limit: 1,
                                })];
                        case 1:
                            subscriptions = _a.sent();
                            if (!(subscriptions.data.length > 0)) return [3 /*break*/, 3];
                            return [4 /*yield*/, stripe_4.subscriptions.cancel(subscriptions.data[0].id, {
                                    invoice_now: true,
                                    prorate: true,
                                })];
                        case 2:
                            _a.sent();
                            _a.label = 3;
                        case 3:
                            storage_1.storage.updateProfileSubscription(req.userId, {
                                subscriptionStatus: "canceled",
                            });
                            res.json({ success: true });
                            return [3 /*break*/, 5];
                        case 4:
                            err_7 = _a.sent();
                            console.error("Cancel subscription error:", err_7);
                            res.status(500).json({ error: "Failed to cancel subscription" });
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
            // --- Payments ---
            app.get("/api/payments", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var limit, payments;
                return __generator(this, function (_a) {
                    // PRD-018: Audit log
                    storage_1.storage.createSecurityLog({
                        userId: req.userId,
                        action: "payments_accessed",
                        ipAddress: req.ip,
                        userAgent: req.get("user-agent") || "",
                        details: JSON.stringify({ limit: req.query.limit }),
                    });
                    limit = req.query.limit ? parseInt(req.query.limit) : 50;
                    payments = storage_1.storage.getPaymentsByUser(req.userId, limit);
                    res.json(payments);
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/payments/:id", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var payment;
                return __generator(this, function (_a) {
                    // PRD-018: Audit log
                    storage_1.storage.createSecurityLog({
                        userId: req.userId,
                        action: "payment_accessed",
                        ipAddress: req.ip,
                        userAgent: req.get("user-agent") || "",
                        details: JSON.stringify({ paymentId: req.params.id }),
                    });
                    payment = storage_1.storage.getPayment(parseInt(req.params.id));
                    if (!payment || payment.userId !== req.userId) {
                        return [2 /*return*/, res.status(404).json({ error: "Payment not found" })];
                    }
                    res.json(payment);
                    return [2 /*return*/];
                });
            }); });
            // --- W-9 Forms ---
            app.get("/api/w9", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var form, decryptedTaxId;
                return __generator(this, function (_a) {
                    // PRD-018: Audit log for W-9 access
                    storage_1.storage.createSecurityLog({
                        userId: req.userId,
                        action: "w9_accessed",
                        ipAddress: req.ip,
                        userAgent: req.get("user-agent") || "",
                        details: JSON.stringify({ action: "view" }),
                    });
                    form = storage_1.storage.getW9Form(req.userId);
                    if (!form) {
                        return [2 /*return*/, res.status(404).json({ error: "No W-9 form on file" })];
                    }
                    decryptedTaxId = (0, encryption_1.decryptSensitive)(form.einOrSsn);
                    res.json(__assign(__assign({}, form), { einOrSsn: decryptedTaxId ? (0, encryption_1.maskTaxId)(decryptedTaxId) : "***-***-****" }));
                    return [2 /*return*/];
                });
            }); });
            app.post("/api/w9", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, fullName, businessName, taxClassification, einOrSsn, address, city, state, zipCode, encryptedTaxId, existing, form;
                return __generator(this, function (_b) {
                    try {
                        _a = req.body, fullName = _a.fullName, businessName = _a.businessName, taxClassification = _a.taxClassification, einOrSsn = _a.einOrSsn, address = _a.address, city = _a.city, state = _a.state, zipCode = _a.zipCode;
                        if (!fullName || !taxClassification || !einOrSsn || !address || !city || !state || !zipCode) {
                            return [2 /*return*/, res.status(400).json({ error: "All required fields must be provided" })];
                        }
                        // PRD-018: Validate tax ID format
                        if (!(0, encryption_1.isValidTaxId)(einOrSsn)) {
                            return [2 /*return*/, res.status(400).json({ error: "Invalid tax ID format. Use EIN (XX-XXXXXXX) or SSN (XXX-XX-XXXX)." })];
                        }
                        encryptedTaxId = (0, encryption_1.encryptSensitive)(einOrSsn);
                        existing = storage_1.storage.getW9Form(req.userId);
                        form = void 0;
                        if (existing) {
                            form = storage_1.storage.updateW9Form(req.userId, {
                                fullName: fullName,
                                businessName: businessName,
                                taxClassification: taxClassification,
                                einOrSsn: encryptedTaxId,
                                address: address,
                                city: city,
                                state: state,
                                zipCode: zipCode,
                                submittedAt: new Date(),
                            });
                        }
                        else {
                            form = storage_1.storage.createW9Form({
                                userId: req.userId,
                                fullName: fullName,
                                businessName: businessName,
                                taxClassification: taxClassification,
                                einOrSsn: encryptedTaxId,
                                address: address,
                                city: city,
                                state: state,
                                zipCode: zipCode,
                                submittedAt: new Date(),
                            });
                        }
                        // PRD-018: Audit log
                        storage_1.storage.createSecurityLog({
                            userId: req.userId,
                            action: "w9_submitted",
                            ipAddress: req.ip,
                            userAgent: req.get("user-agent") || "",
                            details: JSON.stringify({ fullName: fullName, hasBusinessName: !!businessName }),
                        });
                        // Update profile flag
                        storage_1.storage.updateProfileSubscription(req.userId, { w9Collected: true });
                        res.status(201).json(__assign(__assign({}, form), { einOrSsn: (0, encryption_1.maskTaxId)(einOrSsn) }));
                    }
                    catch (err) {
                        res.status(500).json({ error: "Failed to save W-9 form" });
                    }
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/w9/forms", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var status, forms, decryptedForms;
                var _a;
                return __generator(this, function (_b) {
                    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.isAdmin)) {
                        return [2 /*return*/, res.status(403).json({ error: "Admin access required" })];
                    }
                    status = req.query.status;
                    forms = storage_1.storage.getW9Forms(status);
                    decryptedForms = forms.map(function (form) { return (__assign(__assign({}, form), { einOrSsn: form.einOrSsn ? (0, encryption_1.maskTaxId)((0, encryption_1.decryptSensitive)(form.einOrSsn) || "") : "***-***-****" })); });
                    res.json(decryptedForms);
                    return [2 /*return*/];
                });
            }); });
            // --- Stripe Connect ---
            app.post("/api/stripe/connect-account", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var user, profile, onboardingLink_1, stripeAccountId, onboardingLink, err_8;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 5, , 6]);
                            // PRD-018: Audit log
                            storage_1.storage.createSecurityLog({
                                userId: req.userId,
                                action: "stripe_connect_initiated",
                                ipAddress: req.ip,
                                userAgent: req.get("user-agent") || "",
                                details: JSON.stringify({}),
                            });
                            user = storage_1.storage.getUser(req.userId);
                            if (!user) {
                                return [2 /*return*/, res.status(404).json({ error: "User not found" })];
                            }
                            profile = storage_1.storage.getProfile(req.userId);
                            if (!(profile === null || profile === void 0 ? void 0 : profile.stripeConnectAccountId)) return [3 /*break*/, 2];
                            return [4 /*yield*/, (0, stripe_1.createAccountLink)(profile.stripeConnectAccountId, "".concat(process.env.FRONTEND_URL || "https://thefvc.is", "/app/payments"), "".concat(process.env.FRONTEND_URL || "https://thefvc.is", "/app/payments"))];
                        case 1:
                            onboardingLink_1 = _a.sent();
                            return [2 /*return*/, res.json({
                                    stripeAccountId: profile.stripeConnectAccountId,
                                    onboardingLink: onboardingLink_1,
                                    onboardingComplete: profile.subscriptionStatus === "active",
                                })];
                        case 2: return [4 /*yield*/, (0, stripe_1.createStripeConnectAccount)(req.userId, user.email)];
                        case 3:
                            stripeAccountId = _a.sent();
                            return [4 /*yield*/, (0, stripe_1.createAccountLink)(stripeAccountId, "".concat(process.env.FRONTEND_URL || "https://thefvc.is", "/app/payments"), "".concat(process.env.FRONTEND_URL || "https://thefvc.is", "/app/payments"))];
                        case 4:
                            onboardingLink = _a.sent();
                            res.json({ stripeAccountId: stripeAccountId, onboardingLink: onboardingLink, onboardingComplete: false });
                            return [3 /*break*/, 6];
                        case 5:
                            err_8 = _a.sent();
                            console.error("Stripe Connect error:", err_8);
                            res.status(500).json({ error: "Failed to create Stripe Connect account" });
                            return [3 /*break*/, 6];
                        case 6: return [2 /*return*/];
                    }
                });
            }); });
            app.post("/api/stripe/onboarding-complete", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    storage_1.storage.createSecurityLog({
                        userId: req.userId,
                        action: "stripe_onboarding_complete",
                        ipAddress: req.ip,
                        userAgent: req.get("user-agent") || "",
                        details: JSON.stringify({}),
                    });
                    storage_1.storage.updateProfileSubscription(req.userId, {
                        subscriptionStatus: "active",
                    });
                    res.json({ success: true });
                    return [2 /*return*/];
                });
            }); });
            // PRD-019: Stripe webhook endpoint
            app.post("/api/stripe/webhook", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var sig, event, rawBody;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            sig = req.headers["stripe-signature"];
                            if (!sig) {
                                return [2 /*return*/, res.status(400).json({ error: "Missing Stripe signature" })];
                            }
                            try {
                                rawBody = req.rawBody;
                                if (!rawBody) {
                                    return [2 /*return*/, res.status(400).json({ error: "Missing raw body for webhook" })];
                                }
                                event = stripe_1.stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET || "[REDACTED]");
                            }
                            catch (err) {
                                console.error("Webhook signature verification failed:", err.message);
                                return [2 /*return*/, res.status(400).json({ error: "Invalid signature" })];
                            }
                            return [4 /*yield*/, (0, stripe_1.handleStripeWebhook)(event)];
                        case 1:
                            _a.sent();
                            res.json({ received: true });
                            return [2 /*return*/];
                    }
                });
            }); });
            // --- Tax Export (PRD-007) ---
            app.get("/api/admin/tax-export", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var year, payments, w9Forms, yearStart, yearEnd, yearPayments, exportData;
                var _a;
                return __generator(this, function (_b) {
                    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.isAdmin)) {
                        return [2 /*return*/, res.status(403).json({ error: "Admin access required" })];
                    }
                    // PRD-018: Audit log for tax export
                    storage_1.storage.createSecurityLog({
                        userId: req.userId,
                        action: "tax_export_accessed",
                        ipAddress: req.ip,
                        userAgent: req.get("user-agent") || "",
                        details: JSON.stringify({ year: req.query.year }),
                    });
                    year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
                    payments = storage_1.storage.getAllPayments(10000);
                    w9Forms = storage_1.storage.getW9Forms("verified");
                    yearStart = new Date(year, 0, 1).getTime();
                    yearEnd = new Date(year, 11, 31).getTime();
                    yearPayments = payments.filter(function (p) {
                        var ts = new Date(p.createdAt).getTime();
                        return ts >= yearStart && ts <= yearEnd;
                    });
                    exportData = yearPayments.map(function (p) {
                        var profile = storage_1.storage.getProfile(p.userId);
                        var user = storage_1.storage.getUser(p.userId);
                        var w9 = w9Forms.find(function (w) { return w.userId === p.userId; });
                        return {
                            paymentId: p.id,
                            userId: p.userId,
                            displayName: (profile === null || profile === void 0 ? void 0 : profile.displayName) || "",
                            email: (user === null || user === void 0 ? void 0 : user.email) || "",
                            taxId: (w9 === null || w9 === void 0 ? void 0 : w9.einOrSsn) ? (0, encryption_1.maskTaxId)((0, encryption_1.decryptSensitive)(w9.einOrSsn) || "") : "",
                            legalName: (w9 === null || w9 === void 0 ? void 0 : w9.fullName) || (profile === null || profile === void 0 ? void 0 : profile.displayName) || "",
                            address: (w9 === null || w9 === void 0 ? void 0 : w9.address) || "",
                            city: (w9 === null || w9 === void 0 ? void 0 : w9.city) || "",
                            state: (w9 === null || w9 === void 0 ? void 0 : w9.state) || "",
                            zipCode: (w9 === null || w9 === void 0 ? void 0 : w9.zipCode) || "",
                            amount: p.amount,
                            currency: p.currency,
                            status: p.status,
                            description: p.description || "",
                            createdAt: p.createdAt,
                        };
                    });
                    res.setHeader("Content-Type", "application/json");
                    res.setHeader("Content-Disposition", "attachment; filename=\"tax-export-".concat(year, ".json\""));
                    res.json({ year: year, count: exportData.length, data: exportData });
                    return [2 /*return*/];
                });
            }); });
            // PRD-022: Data Privacy & GDPR/CCPA Compliance
            app.get("/api/data/export", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var user, profile, payments, w9, feedback, exportData;
                return __generator(this, function (_a) {
                    // PRD-018: Audit log
                    storage_1.storage.createSecurityLog({
                        userId: req.userId,
                        action: "data_export_requested",
                        ipAddress: req.ip,
                        userAgent: req.get("user-agent") || "",
                        details: JSON.stringify({}),
                    });
                    user = storage_1.storage.getUser(req.userId);
                    profile = storage_1.storage.getProfile(req.userId);
                    payments = storage_1.storage.getPaymentsByUser(req.userId, 1000);
                    w9 = storage_1.storage.getW9Form(req.userId);
                    feedback = storage_1.storage.getFeedbackByUser(req.userId);
                    exportData = {
                        user: {
                            id: user === null || user === void 0 ? void 0 : user.id,
                            handle: user === null || user === void 0 ? void 0 : user.handle,
                            email: user === null || user === void 0 ? void 0 : user.email,
                            accessStatus: user === null || user === void 0 ? void 0 : user.accessStatus,
                            createdAt: user === null || user === void 0 ? void 0 : user.createdAt,
                        },
                        profile: {
                            displayName: profile === null || profile === void 0 ? void 0 : profile.displayName,
                            role: profile === null || profile === void 0 ? void 0 : profile.role,
                            city: profile === null || profile === void 0 ? void 0 : profile.city,
                            state: profile === null || profile === void 0 ? void 0 : profile.state,
                            country: profile === null || profile === void 0 ? void 0 : profile.country,
                            bio: profile === null || profile === void 0 ? void 0 : profile.bio,
                            dayRate: profile === null || profile === void 0 ? void 0 : profile.dayRate,
                            skills: profile === null || profile === void 0 ? void 0 : profile.skills,
                            availability: profile === null || profile === void 0 ? void 0 : profile.availability,
                            subscriptionTier: profile === null || profile === void 0 ? void 0 : profile.subscriptionTier,
                            subscriptionStatus: profile === null || profile === void 0 ? void 0 : profile.subscriptionStatus,
                        },
                        payments: payments.map(function (p) { return ({
                            id: p.id,
                            amount: p.amount,
                            currency: p.currency,
                            status: p.status,
                            description: p.description,
                            createdAt: p.createdAt,
                        }); }),
                        w9: w9
                            ? {
                                fullName: w9.fullName,
                                businessName: w9.businessName,
                                taxClassification: w9.taxClassification,
                                address: w9.address,
                                city: w9.city,
                                state: w9.state,
                                zipCode: w9.zipCode,
                                status: w9.status,
                                submittedAt: w9.submittedAt,
                            }
                            : null,
                        feedback: feedback.map(function (f) { return ({
                            category: f.category,
                            message: f.message,
                            createdAt: f.createdAt,
                        }); }),
                    };
                    res.setHeader("Content-Type", "application/json");
                    res.setHeader("Content-Disposition", "attachment; filename=\"data-export-".concat(req.userId, ".json\""));
                    res.json(exportData);
                    return [2 /*return*/];
                });
            }); });
            app.delete("/api/data/delete", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var profile, payments, pendingPayments, user, token;
                var _a;
                return __generator(this, function (_b) {
                    // PRD-018: Audit log for deletion request
                    storage_1.storage.createSecurityLog({
                        userId: req.userId,
                        action: "data_deletion_requested",
                        ipAddress: req.ip,
                        userAgent: req.get("user-agent") || "",
                        details: JSON.stringify({}),
                    });
                    profile = storage_1.storage.getProfile(req.userId);
                    if ((profile === null || profile === void 0 ? void 0 : profile.subscriptionStatus) === "active") {
                        return [2 /*return*/, res.status(400).json({
                                error: "Cannot delete account with active subscription. Cancel subscription first.",
                            })];
                    }
                    payments = storage_1.storage.getPaymentsByUser(req.userId, 100);
                    pendingPayments = payments.filter(function (p) { return p.status === "pending" || p.status === "processing"; });
                    if (pendingPayments.length > 0) {
                        return [2 /*return*/, res.status(400).json({
                                error: "Cannot delete account with pending payments.",
                            })];
                    }
                    user = storage_1.storage.getUser(req.userId);
                    if (user) {
                        // Update user record
                        storage_1.storage.updateUser(req.userId, {
                            email: "deleted_".concat(user.id, "_").concat(Date.now(), "@deleted.thefvc.is"),
                            accessStatus: "revoked",
                        });
                        token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace("Bearer ", "");
                        if (token) {
                            storage_1.storage.deleteSession(token);
                        }
                    }
                    res.json({ success: true, message: "Account data marked for deletion. Tax records retained per IRS requirements." });
                    return [2 /*return*/];
                });
            }); });
            // PRD-022: Cookie consent
            app.post("/api/consent/cookie", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, analytics, marketing;
                return __generator(this, function (_b) {
                    _a = req.body, analytics = _a.analytics, marketing = _a.marketing;
                    // Store consent in security audit log
                    storage_1.storage.createSecurityLog({
                        userId: req.userId || 0,
                        action: "consent_given",
                        ipAddress: req.ip,
                        userAgent: req.get("user-agent") || "",
                        details: JSON.stringify({ analytics: analytics, marketing: marketing }),
                    });
                    res.json({ success: true });
                    return [2 /*return*/];
                });
            }); });
            // PRD-021: 1099 Form Generation
            app.get("/api/admin/1099-eligible", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var year, eligible;
                var _a;
                return __generator(this, function (_b) {
                    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.isAdmin)) {
                        return [2 /*return*/, res.status(403).json({ error: "Admin access required" })];
                    }
                    year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear() - 1;
                    eligible = (0, tax_documents_1.get1099EligibleContractors)(year);
                    res.json(eligible);
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/admin/1099-forms", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var year, forms;
                var _a;
                return __generator(this, function (_b) {
                    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.isAdmin)) {
                        return [2 /*return*/, res.status(403).json({ error: "Admin access required" })];
                    }
                    year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear() - 1;
                    forms = (0, tax_documents_1.generate1099Forms)(year);
                    res.json(forms.map(function (f) { return (0, tax_documents_1.generate1099NECData)(f); }));
                    return [2 /*return*/];
                });
            }); });
            app.get("/api/admin/1099-export", auth_1.requireAuth, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var year, forms, exportData;
                var _a;
                return __generator(this, function (_b) {
                    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.isAdmin)) {
                        return [2 /*return*/, res.status(403).json({ error: "Admin access required" })];
                    }
                    year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear() - 1;
                    forms = (0, tax_documents_1.generate1099Forms)(year);
                    exportData = forms.map(function (f) { return (0, tax_documents_1.generate1099NECData)(f); });
                    res.setHeader("Content-Type", "application/json");
                    res.setHeader("Content-Disposition", "attachment; filename=\"1099-forms-".concat(year, ".json\""));
                    res.json({ year: year, count: exportData.length, forms: exportData });
                    return [2 /*return*/];
                });
            }); });
            return [2 /*return*/, httpServer];
        });
    });
}
