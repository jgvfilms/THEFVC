"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = exports.DatabaseStorage = exports.db = void 0;
var schema_1 = require("@shared/schema");
var better_sqlite3_1 = require("drizzle-orm/better-sqlite3");
var drizzle_orm_1 = require("drizzle-orm");
var migrate_1 = require("./migrate");
exports.db = (0, better_sqlite3_1.drizzle)(migrate_1.sqlite);
var DatabaseStorage = /** @class */ (function () {
    function DatabaseStorage() {
    }
    // ===== USERS =====
    DatabaseStorage.prototype.getUser = function (id) {
        return exports.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).get();
    };
    DatabaseStorage.prototype.getUserByHandle = function (handle) {
        return exports.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.handle, handle)).get();
    };
    DatabaseStorage.prototype.getUserByEmail = function (email) {
        return exports.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, email)).get();
    };
    DatabaseStorage.prototype.createUser = function (insertUser) {
        return exports.db.insert(schema_1.users).values(insertUser).returning().get();
    };
    // ===== SESSIONS =====
    DatabaseStorage.prototype.createSession = function (session) {
        return exports.db.insert(schema_1.sessions).values(session).returning().get();
    };
    DatabaseStorage.prototype.getSessionByToken = function (token) {
        return exports.db.select().from(schema_1.sessions).where((0, drizzle_orm_1.eq)(schema_1.sessions.token, token)).get();
    };
    DatabaseStorage.prototype.deleteSession = function (token) {
        exports.db.delete(schema_1.sessions).where((0, drizzle_orm_1.eq)(schema_1.sessions.token, token)).run();
    };
    // ===== PROFILES =====
    DatabaseStorage.prototype.getProfile = function (userId) {
        return exports.db.select().from(schema_1.profiles).where((0, drizzle_orm_1.eq)(schema_1.profiles.userId, userId)).get();
    };
    DatabaseStorage.prototype.getProfileByHandle = function (handle) {
        var user = this.getUserByHandle(handle);
        if (!user)
            return undefined;
        return this.getProfile(user.id);
    };
    DatabaseStorage.prototype.getProfileById = function (id) {
        return exports.db.select().from(schema_1.profiles).where((0, drizzle_orm_1.eq)(schema_1.profiles.id, id)).get();
    };
    DatabaseStorage.prototype.createProfile = function (profile) {
        return exports.db.insert(schema_1.profiles).values(profile).returning().get();
    };
    DatabaseStorage.prototype.updateProfile = function (userId, data) {
        exports.db.update(schema_1.profiles).set(__assign(__assign({}, data), { updatedAt: new Date() })).where((0, drizzle_orm_1.eq)(schema_1.profiles.userId, userId)).run();
        return this.getProfile(userId);
    };
    DatabaseStorage.prototype.searchProfiles = function (opts) {
        var query = exports.db.select().from(schema_1.profiles).$dynamic();
        var conditions = [(0, drizzle_orm_1.eq)(schema_1.profiles.isPublic, true)];
        // Helper: escape LIKE wildcards to prevent wildcard injection
        var escapeLike = function (str) { return str.replace(/[%_]/g, function (m) { return "\\".concat(m); }); };
        if (opts.role) {
            conditions.push((0, drizzle_orm_1.like)(schema_1.profiles.role, "%".concat(escapeLike(opts.role), "%")));
        }
        if (opts.city) {
            conditions.push((0, drizzle_orm_1.like)(schema_1.profiles.city, "%".concat(escapeLike(opts.city), "%")));
        }
        if (opts.availability) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.profiles.availability, opts.availability));
        }
        query = query.where(drizzle_orm_1.and.apply(void 0, conditions));
        if (opts.skill) {
            query = query.where((0, drizzle_orm_1.like)(schema_1.profiles.skills, "%".concat(escapeLike(opts.skill), "%")));
        }
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.profiles.createdAt)).limit(50).all();
    };
    // ===== PRODUCTIONS =====
    DatabaseStorage.prototype.getProductionsByUser = function (userId) {
        return exports.db.select().from(schema_1.productions).where((0, drizzle_orm_1.eq)(schema_1.productions.creatorId, userId)).orderBy((0, drizzle_orm_1.desc)(schema_1.productions.createdAt)).all();
    };
    DatabaseStorage.prototype.getProduction = function (id) {
        return exports.db.select().from(schema_1.productions).where((0, drizzle_orm_1.eq)(schema_1.productions.id, id)).get();
    };
    DatabaseStorage.prototype.createProduction = function (prod) {
        return exports.db.insert(schema_1.productions).values(prod).returning().get();
    };
    DatabaseStorage.prototype.updateProduction = function (id, data) {
        exports.db.update(schema_1.productions).set(data).where((0, drizzle_orm_1.eq)(schema_1.productions.id, id)).run();
        return this.getProduction(id);
    };
    // ===== PRODUCTION CREW =====
    DatabaseStorage.prototype.getCrewByProduction = function (productionId) {
        var _this = this;
        var crew = exports.db.select().from(schema_1.productionCrew).where((0, drizzle_orm_1.eq)(schema_1.productionCrew.productionId, productionId)).all();
        return crew.map(function (member) {
            var profile = _this.getProfileById(member.profileId);
            return __assign(__assign({}, member), { profile: profile });
        });
    };
    DatabaseStorage.prototype.addCrewMember = function (crew) {
        return exports.db.insert(schema_1.productionCrew).values(crew).returning().get();
    };
    DatabaseStorage.prototype.updateCrewMember = function (id, data) {
        exports.db.update(schema_1.productionCrew).set(data).where((0, drizzle_orm_1.eq)(schema_1.productionCrew.id, id)).run();
        return exports.db.select().from(schema_1.productionCrew).where((0, drizzle_orm_1.eq)(schema_1.productionCrew.id, id)).get();
    };
    DatabaseStorage.prototype.removeCrewMember = function (id) {
        exports.db.delete(schema_1.productionCrew).where((0, drizzle_orm_1.eq)(schema_1.productionCrew.id, id)).run();
    };
    // ===== CREDITS =====
    DatabaseStorage.prototype.getCreditsByProfile = function (profileId) {
        return exports.db.select().from(schema_1.credits).where((0, drizzle_orm_1.eq)(schema_1.credits.profileId, profileId)).orderBy((0, drizzle_orm_1.desc)(schema_1.credits.year)).all();
    };
    DatabaseStorage.prototype.createCredit = function (credit) {
        return exports.db.insert(schema_1.credits).values(credit).returning().get();
    };
    // ===== BETA INVITES =====
    DatabaseStorage.prototype.createInvite = function (data) {
        var _a;
        return exports.db.insert(schema_1.betaInvites).values({
            token: data.token,
            email: data.email,
            displayName: data.displayName,
            role: data.role,
            maxUses: (_a = data.maxUses) !== null && _a !== void 0 ? _a : 1,
            createdBy: data.createdBy,
            notes: data.notes,
        }).returning().get();
    };
    DatabaseStorage.prototype.getInviteByToken = function (token) {
        return exports.db.select().from(schema_1.betaInvites).where((0, drizzle_orm_1.eq)(schema_1.betaInvites.token, token)).get();
    };
    DatabaseStorage.prototype.getInvites = function () {
        return exports.db.select().from(schema_1.betaInvites).orderBy((0, drizzle_orm_1.desc)(schema_1.betaInvites.createdAt)).all();
    };
    DatabaseStorage.prototype.updateInvite = function (id, data) {
        exports.db.update(schema_1.betaInvites).set(data).where((0, drizzle_orm_1.eq)(schema_1.betaInvites.id, id)).run();
        return exports.db.select().from(schema_1.betaInvites).where((0, drizzle_orm_1.eq)(schema_1.betaInvites.id, id)).get();
    };
    DatabaseStorage.prototype.revokeInvite = function (id) {
        exports.db.update(schema_1.betaInvites).set({ status: "revoked" }).where((0, drizzle_orm_1.eq)(schema_1.betaInvites.id, id)).run();
    };
    // ===== BETA REQUESTS =====
    DatabaseStorage.prototype.createBetaRequest = function (data) {
        return exports.db.insert(schema_1.betaRequests).values(data).returning().get();
    };
    DatabaseStorage.prototype.getBetaRequests = function (status) {
        if (status) {
            return exports.db.select().from(schema_1.betaRequests).where((0, drizzle_orm_1.eq)(schema_1.betaRequests.status, status)).orderBy((0, drizzle_orm_1.desc)(schema_1.betaRequests.createdAt)).all();
        }
        return exports.db.select().from(schema_1.betaRequests).orderBy((0, drizzle_orm_1.desc)(schema_1.betaRequests.createdAt)).all();
    };
    DatabaseStorage.prototype.getBetaRequest = function (id) {
        return exports.db.select().from(schema_1.betaRequests).where((0, drizzle_orm_1.eq)(schema_1.betaRequests.id, id)).get();
    };
    DatabaseStorage.prototype.updateBetaRequest = function (id, data) {
        exports.db.update(schema_1.betaRequests).set(data).where((0, drizzle_orm_1.eq)(schema_1.betaRequests.id, id)).run();
        return exports.db.select().from(schema_1.betaRequests).where((0, drizzle_orm_1.eq)(schema_1.betaRequests.id, id)).get();
    };
    // ===== BETA FEEDBACK =====
    DatabaseStorage.prototype.createFeedback = function (data) {
        return exports.db.insert(schema_1.betaFeedback).values(data).returning().get();
    };
    DatabaseStorage.prototype.getFeedback = function () {
        return exports.db.select().from(schema_1.betaFeedback).orderBy((0, drizzle_orm_1.desc)(schema_1.betaFeedback.createdAt)).all();
    };
    DatabaseStorage.prototype.getFeedbackByUser = function (userId) {
        return exports.db.select().from(schema_1.betaFeedback).where((0, drizzle_orm_1.eq)(schema_1.betaFeedback.userId, userId)).orderBy((0, drizzle_orm_1.desc)(schema_1.betaFeedback.createdAt)).all();
    };
    DatabaseStorage.prototype.updateFeedbackStatus = function (id, status, adminNotes) {
        var updates = { status: status };
        if (adminNotes !== undefined) {
            updates.adminNotes = adminNotes;
        }
        return exports.db.update(schema_1.betaFeedback).set(updates).where((0, drizzle_orm_1.eq)(schema_1.betaFeedback.id, id)).returning().get();
    };
    // ===== ADMIN =====
    DatabaseStorage.prototype.getAllUsers = function () {
        return exports.db.select().from(schema_1.users).orderBy((0, drizzle_orm_1.desc)(schema_1.users.createdAt)).all();
    };
    DatabaseStorage.prototype.updateUserAccess = function (id, status) {
        exports.db.update(schema_1.users).set({ accessStatus: status }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).run();
        return exports.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).get();
    };
    DatabaseStorage.prototype.updateUser = function (id, data) {
        exports.db.update(schema_1.users).set(data).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).run();
        return exports.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).get();
    };
    DatabaseStorage.prototype.setLastLogin = function (id) {
        exports.db.update(schema_1.users).set({ lastLoginAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).run();
    };
    // ===== ACTIVITY FEED =====
    DatabaseStorage.prototype.createActivity = function (data) {
        return exports.db.insert(schema_1.activityFeed).values(data).returning().get();
    };
    DatabaseStorage.prototype.getFeed = function (limit, offset, publicOnly) {
        if (limit === void 0) { limit = 50; }
        if (offset === void 0) { offset = 0; }
        if (publicOnly === void 0) { publicOnly = false; }
        var query = publicOnly
            ? exports.db.select().from(schema_1.activityFeed).where((0, drizzle_orm_1.eq)(schema_1.activityFeed.isPublic, true)).orderBy((0, drizzle_orm_1.desc)(schema_1.activityFeed.createdAt)).limit(limit).offset(offset).all()
            : exports.db.select().from(schema_1.activityFeed).orderBy((0, drizzle_orm_1.desc)(schema_1.activityFeed.createdAt)).limit(limit).offset(offset).all();
        return query.map(function (item) {
            var user = exports.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, item.userId)).get();
            var profile = user ? exports.db.select().from(schema_1.profiles).where((0, drizzle_orm_1.eq)(schema_1.profiles.userId, user.id)).get() : undefined;
            return __assign(__assign({}, item), { user: user, profile: profile });
        });
    };
    // ===== FEED POSTS =====
    DatabaseStorage.prototype.createPost = function (data) {
        return exports.db.insert(schema_1.feedPosts).values(data).returning().get();
    };
    DatabaseStorage.prototype.getPosts = function (limit) {
        if (limit === void 0) { limit = 50; }
        var posts = exports.db.select().from(schema_1.feedPosts).orderBy((0, drizzle_orm_1.desc)(schema_1.feedPosts.createdAt)).limit(limit).all();
        return posts.map(function (post) {
            var user = exports.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, post.userId)).get();
            var profile = user ? exports.db.select().from(schema_1.profiles).where((0, drizzle_orm_1.eq)(schema_1.profiles.userId, user.id)).get() : undefined;
            return __assign(__assign({}, post), { user: user, profile: profile });
        });
    };
    // ===== SECURITY AUDIT LOG =====
    DatabaseStorage.prototype.createSecurityLog = function (data) {
        return exports.db.insert(schema_1.securityAuditLog).values(data).returning().get();
    };
    DatabaseStorage.prototype.getSecurityLog = function (opts) {
        var query = exports.db.select().from(schema_1.securityAuditLog).$dynamic();
        var conditions = [];
        if (opts.userId)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.securityAuditLog.userId, opts.userId));
        if (opts.action)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.securityAuditLog.action, opts.action));
        if (opts.since)
            conditions.push((0, drizzle_orm_1.gte)(schema_1.securityAuditLog.createdAt, opts.since));
        if (conditions.length > 0)
            query = query.where(drizzle_orm_1.and.apply(void 0, conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.securityAuditLog.createdAt)).limit(opts.limit || 100).all();
    };
    // ===== ANALYTICS EVENTS =====
    DatabaseStorage.prototype.createAnalyticsEvent = function (data) {
        return exports.db.insert(schema_1.analyticsEvents).values(data).returning().get();
    };
    DatabaseStorage.prototype.getAnalyticsEvents = function (opts) {
        var query = exports.db.select().from(schema_1.analyticsEvents).$dynamic();
        var conditions = [];
        if (opts.userId)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.analyticsEvents.userId, opts.userId));
        if (opts.eventType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.analyticsEvents.eventType, opts.eventType));
        if (opts.since)
            conditions.push((0, drizzle_orm_1.gte)(schema_1.analyticsEvents.createdAt, opts.since));
        if (conditions.length > 0)
            query = query.where(drizzle_orm_1.and.apply(void 0, conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.analyticsEvents.createdAt)).limit(opts.limit || 100).all();
    };
    // ===== EMAIL QUEUE =====
    DatabaseStorage.prototype.queueEmail = function (data) {
        return exports.db.insert(schema_1.emailQueue).values(data).returning().get();
    };
    DatabaseStorage.prototype.getEmailQueue = function (status) {
        if (status) {
            return exports.db.select().from(schema_1.emailQueue).where((0, drizzle_orm_1.eq)(schema_1.emailQueue.status, status)).orderBy((0, drizzle_orm_1.desc)(schema_1.emailQueue.createdAt)).all();
        }
        return exports.db.select().from(schema_1.emailQueue).orderBy((0, drizzle_orm_1.desc)(schema_1.emailQueue.createdAt)).all();
    };
    DatabaseStorage.prototype.updateEmailStatus = function (id, status, providerMessageId, error) {
        var updates = { status: status };
        if (providerMessageId)
            updates.providerMessageId = providerMessageId;
        if (error)
            updates.error = error;
        if (status === "sent")
            updates.sentAt = new Date();
        if (status === "failed")
            updates.failedAt = new Date();
        exports.db.update(schema_1.emailQueue).set(updates).where((0, drizzle_orm_1.eq)(schema_1.emailQueue.id, id)).run();
        return exports.db.select().from(schema_1.emailQueue).where((0, drizzle_orm_1.eq)(schema_1.emailQueue.id, id)).get();
    };
    // ===== PASSWORD RESETS =====
    DatabaseStorage.prototype.createPasswordReset = function (data) {
        return exports.db.insert(schema_1.passwordResets).values(data).returning().get();
    };
    DatabaseStorage.prototype.getPasswordResetByToken = function (token) {
        return exports.db.select().from(schema_1.passwordResets).where((0, drizzle_orm_1.eq)(schema_1.passwordResets.token, token)).get();
    };
    DatabaseStorage.prototype.markPasswordResetUsed = function (id) {
        exports.db.update(schema_1.passwordResets).set({ used: true, usedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.passwordResets.id, id)).run();
    };
    DatabaseStorage.prototype.deleteExpiredPasswordResets = function () {
        exports.db.delete(schema_1.passwordResets).where((0, drizzle_orm_1.lt)(schema_1.passwordResets.expiresAt, new Date())).run();
    };
    // ===== EMAIL VERIFICATIONS =====
    DatabaseStorage.prototype.createEmailVerification = function (data) {
        return exports.db.insert(schema_1.emailVerifications).values(data).returning().get();
    };
    DatabaseStorage.prototype.getEmailVerificationByToken = function (token) {
        return exports.db.select().from(schema_1.emailVerifications).where((0, drizzle_orm_1.eq)(schema_1.emailVerifications.token, token)).get();
    };
    DatabaseStorage.prototype.markEmailVerificationUsed = function (id) {
        exports.db.update(schema_1.emailVerifications).set({ used: true, usedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.emailVerifications.id, id)).run();
    };
    // ===== BLOCKED IPS =====
    DatabaseStorage.prototype.getBlockedIp = function (ipAddress) {
        return exports.db.select().from(schema_1.blockedIps).where((0, drizzle_orm_1.eq)(schema_1.blockedIps.ipAddress, ipAddress)).get();
    };
    DatabaseStorage.prototype.blockIp = function (data) {
        return exports.db.insert(schema_1.blockedIps).values(data).returning().get();
    };
    DatabaseStorage.prototype.unblockIp = function (ipAddress) {
        exports.db.update(schema_1.blockedIps).set({ isActive: false }).where((0, drizzle_orm_1.eq)(schema_1.blockedIps.ipAddress, ipAddress)).run();
    };
    DatabaseStorage.prototype.getActiveBlockedIps = function () {
        return exports.db.select().from(schema_1.blockedIps).where((0, drizzle_orm_1.eq)(schema_1.blockedIps.isActive, true)).orderBy((0, drizzle_orm_1.desc)(schema_1.blockedIps.blockedAt)).all();
    };
    // ===== NOTIFICATIONS (PRD-009: Real-Time & WebSocket) =====
    DatabaseStorage.prototype.createNotification = function (data) {
        return exports.db.insert(schema_1.notifications).values(data).returning().get();
    };
    DatabaseStorage.prototype.getNotifications = function (userId, limit, unreadOnly) {
        if (limit === void 0) { limit = 50; }
        if (unreadOnly === void 0) { unreadOnly = false; }
        var query = exports.db.select().from(schema_1.notifications).where((0, drizzle_orm_1.eq)(schema_1.notifications.userId, userId)).$dynamic();
        if (unreadOnly) {
            query = query.where((0, drizzle_orm_1.eq)(schema_1.notifications.isRead, false));
        }
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.notifications.createdAt)).limit(limit).all();
    };
    DatabaseStorage.prototype.markNotificationRead = function (id) {
        exports.db.update(schema_1.notifications).set({ isRead: true }).where((0, drizzle_orm_1.eq)(schema_1.notifications.id, id)).run();
    };
    DatabaseStorage.prototype.markAllNotificationsRead = function (userId) {
        exports.db.update(schema_1.notifications).set({ isRead: true }).where((0, drizzle_orm_1.eq)(schema_1.notifications.userId, userId)).run();
    };
    DatabaseStorage.prototype.getUnreadNotificationCount = function (userId) {
        var _a;
        var result = exports.db
            .select({ count: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
            .from(schema_1.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.userId, userId), (0, drizzle_orm_1.eq)(schema_1.notifications.isRead, false)))
            .get();
        return Number((_a = result === null || result === void 0 ? void 0 : result.count) !== null && _a !== void 0 ? _a : 0);
    };
    DatabaseStorage.prototype.deleteNotification = function (id) {
        exports.db.delete(schema_1.notifications).where((0, drizzle_orm_1.eq)(schema_1.notifications.id, id)).run();
    };
    // ===== NEWS CACHE =====
    DatabaseStorage.prototype.getNewsCache = function (limit) {
        if (limit === void 0) { limit = 30; }
        return exports.db.select().from(schema_1.newsCache).orderBy((0, drizzle_orm_1.desc)(schema_1.newsCache.pubDate)).limit(limit).all();
    };
    DatabaseStorage.prototype.setNewsCache = function (items) {
        // Use a transaction: clear old cache, insert new items
        var tx = exports.db.transaction(function () {
            exports.db.delete(schema_1.newsCache).run();
            for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                var item = items_1[_i];
                exports.db.insert(schema_1.newsCache).values({
                    source: item.source,
                    title: item.title,
                    link: item.link,
                    description: item.description,
                    category: item.category,
                    pubDate: item.pubDate,
                }).run();
            }
        });
    };
    DatabaseStorage.prototype.clearNewsCache = function () {
        exports.db.delete(schema_1.newsCache).run();
    };
    // ===== SUBSCRIPTION TIERS (PRD-007: Payments & Monetization) =====
    DatabaseStorage.prototype.getSubscriptionTiers = function (activeOnly) {
        if (activeOnly === void 0) { activeOnly = true; }
        var query = exports.db.select().from(schema_1.subscriptionTiers).$dynamic();
        if (activeOnly) {
            query = query.where((0, drizzle_orm_1.eq)(schema_1.subscriptionTiers.isActive, true));
        }
        return query.orderBy(schema_1.subscriptionTiers.priceCents).all();
    };
    DatabaseStorage.prototype.getSubscriptionTier = function (name) {
        return exports.db.select().from(schema_1.subscriptionTiers).where((0, drizzle_orm_1.eq)(schema_1.subscriptionTiers.name, name)).get();
    };
    DatabaseStorage.prototype.createSubscriptionTier = function (data) {
        return exports.db.insert(schema_1.subscriptionTiers).values(data).returning().get();
    };
    // ===== PAYMENTS (PRD-007: Payments & Monetization) =====
    DatabaseStorage.prototype.createPayment = function (data) {
        return exports.db.insert(schema_1.payments).values(data).returning().get();
    };
    DatabaseStorage.prototype.getPaymentsByUser = function (userId, limit) {
        if (limit === void 0) { limit = 50; }
        return exports.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.userId, userId)).orderBy((0, drizzle_orm_1.desc)(schema_1.payments.createdAt)).limit(limit).all();
    };
    DatabaseStorage.prototype.getPayment = function (id) {
        return exports.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.id, id)).get();
    };
    DatabaseStorage.prototype.getPaymentsByStripeSubscriptionId = function (stripeSubscriptionId) {
        return exports.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.stripeSubscriptionId, stripeSubscriptionId)).orderBy((0, drizzle_orm_1.desc)(schema_1.payments.createdAt)).all();
    };
    DatabaseStorage.prototype.updatePaymentStatus = function (id, status) {
        exports.db.update(schema_1.payments).set({ status: status, processedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.payments.id, id)).run();
        return exports.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.id, id)).get();
    };
    DatabaseStorage.prototype.getAllPayments = function (limit) {
        if (limit === void 0) { limit = 10000; }
        return exports.db.select().from(schema_1.payments).orderBy((0, drizzle_orm_1.desc)(schema_1.payments.createdAt)).limit(limit).all();
    };
    // ===== W-9 FORMS (PRD-007: Payments & Monetization) =====
    DatabaseStorage.prototype.createW9Form = function (data) {
        return exports.db.insert(schema_1.w9Forms).values(data).returning().get();
    };
    DatabaseStorage.prototype.getW9Form = function (userId) {
        return exports.db.select().from(schema_1.w9Forms).where((0, drizzle_orm_1.eq)(schema_1.w9Forms.userId, userId)).get();
    };
    DatabaseStorage.prototype.updateW9Form = function (userId, data) {
        exports.db.update(schema_1.w9Forms).set(data).where((0, drizzle_orm_1.eq)(schema_1.w9Forms.userId, userId)).run();
        return this.getW9Form(userId);
    };
    DatabaseStorage.prototype.getW9Forms = function (status) {
        var query = exports.db.select().from(schema_1.w9Forms).$dynamic();
        if (status) {
            query = query.where((0, drizzle_orm_1.eq)(schema_1.w9Forms.status, status));
        }
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.w9Forms.submittedAt)).all();
    };
    // ===== PROFILE SUBSCRIPTION UPDATES =====
    DatabaseStorage.prototype.updateProfileSubscription = function (userId, data) {
        exports.db.update(schema_1.profiles).set(__assign(__assign({}, data), { updatedAt: new Date() })).where((0, drizzle_orm_1.eq)(schema_1.profiles.userId, userId)).run();
        return this.getProfile(userId);
    };
    // ===== CREW FINDER PAGINATION (PRD-006) =====
    DatabaseStorage.prototype.searchProfilesPaginated = function (opts) {
        var _a;
        var limit = Math.min(opts.limit || 20, 50);
        var offset = opts.offset || 0;
        var query = exports.db.select().from(schema_1.profiles).$dynamic();
        var conditions = [(0, drizzle_orm_1.eq)(schema_1.profiles.isPublic, true)];
        // Helper: escape LIKE wildcards to prevent wildcard injection
        var escapeLike = function (str) { return str.replace(/[%_]/g, function (m) { return "\\".concat(m); }); };
        if (opts.role) {
            conditions.push((0, drizzle_orm_1.like)(schema_1.profiles.role, "%".concat(escapeLike(opts.role), "%")));
        }
        if (opts.city) {
            conditions.push((0, drizzle_orm_1.like)(schema_1.profiles.city, "%".concat(escapeLike(opts.city), "%")));
        }
        if (opts.availability) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.profiles.availability, opts.availability));
        }
        query = query.where(drizzle_orm_1.and.apply(void 0, conditions));
        if (opts.skill) {
            var skillCondition = (0, drizzle_orm_1.like)(schema_1.profiles.skills, "%".concat(escapeLike(opts.skill), "%"));
            query = query.where(skillCondition);
            conditions.push(skillCondition);
        }
        // Sort options
        var sortField = opts.sortBy || "createdAt";
        var sortDir = opts.sortDir === "asc" ? "asc" : "desc";
        var sortColumn = sortField === "dayRate" ? schema_1.profiles.dayRate : sortField === "displayName" ? schema_1.profiles.displayName : schema_1.profiles.createdAt;
        query = sortDir === "asc" ? query.orderBy(sortColumn) : query.orderBy((0, drizzle_orm_1.desc)(sortColumn));
        var profilesList = query.limit(limit).offset(offset).all();
        var totalResult = exports.db.select({ count: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["count(*)"], ["count(*)"]))) }).from(schema_1.profiles).where(drizzle_orm_1.and.apply(void 0, conditions)).get();
        var total = Number((_a = totalResult === null || totalResult === void 0 ? void 0 : totalResult.count) !== null && _a !== void 0 ? _a : 0);
        return { profiles: profilesList, total: total };
    };
    // ===== PRD-019: Stripe Connect — profile lookup by account ID =====
    DatabaseStorage.prototype.getProfileByStripeAccountId = function (accountId) {
        return exports.db.select().from(schema_1.profiles).where((0, drizzle_orm_1.eq)(schema_1.profiles.stripeConnectAccountId, accountId)).get();
    };
    // ===== PRD-019: Stripe Connect — profile lookup by customer ID =====
    DatabaseStorage.prototype.getProfileByStripeCustomerId = function (customerId) {
        return exports.db.select().from(schema_1.profiles).where((0, drizzle_orm_1.eq)(schema_1.profiles.stripeCustomerId, customerId)).get();
    };
    return DatabaseStorage;
}());
exports.DatabaseStorage = DatabaseStorage;
exports.storage = new DatabaseStorage();
var templateObject_1, templateObject_2;
