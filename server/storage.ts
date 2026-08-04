import {
  users, sessions, profiles, productions, productionCrew, credits,
  betaInvites, betaRequests, betaFeedback,
  activityFeed, feedPosts,
  securityAuditLog, analyticsEvents, emailQueue,
  passwordResets, emailVerifications, blockedIps, newsCache,
  notifications,
  subscriptionTiers, payments, w9Forms,
} from '@shared/schema';
import type {
  User, InsertUser,
  Session, InsertSession,
  Profile, InsertProfile,
  Production, InsertProduction,
  ProductionCrew, InsertProductionCrew,
  Credit, InsertCredit,
  BetaInvite, BetaRequest, BetaFeedback,
  ActivityFeed, InsertActivity,
  FeedPost, InsertFeedPost,
  SecurityAuditLog, InsertSecurityAuditLog,
  AnalyticsEvent, InsertAnalyticsEvent,
  EmailQueue, InsertEmailQueue,
  PasswordReset, InsertPasswordReset,
  EmailVerification, InsertEmailVerification,
  BlockedIp, InsertBlockedIp,
  NewsCache,
  Notification, InsertNotification,
  SubscriptionTier, InsertSubscriptionTier,
  Payment, InsertPayment,
  W9Form, InsertW9Form,
} from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, or, desc, sql, gte, lt, getTableColumns } from "drizzle-orm";
import { sqlite } from "./migrate";
import { decryptSensitive } from "./lib/encryption";

export const db = drizzle(sqlite);

export interface IStorage {
  // Users
  getUser(id: number): User | undefined;
  getUserByHandle(handle: string): User | undefined;
  getUserByEmail(email: string): User | undefined;
  createUser(user: InsertUser): User;

  // Sessions
  createSession(session: InsertSession): Session;
  getSessionByToken(token: string): Session | undefined;
  deleteSession(token: string): void;

  // Profiles
  getProfile(userId: number): Profile | undefined;
  getProfileByHandle(handle: string): Profile | undefined;
  getProfileById(id: number): Profile | undefined;
  createProfile(profile: InsertProfile): Profile;
  updateProfile(userId: number, data: Partial<InsertProfile>): Profile | undefined;
  searchProfiles(opts: { role?: string; city?: string; skill?: string; availability?: string }): Profile[];

  // Productions
  getProductionsByUser(userId: number): Production[];
  getProduction(id: number): Production | undefined;
  createProduction(prod: InsertProduction): Production;
  updateProduction(id: number, data: Partial<InsertProduction>): Production | undefined;

  // Production Crew
  getCrewByProduction(productionId: number): (ProductionCrew & { profile?: Profile })[];
  getCrewMember(id: number): ProductionCrew | undefined;
  addCrewMember(crew: InsertProductionCrew): ProductionCrew;
  updateCrewMember(id: number, data: Partial<InsertProductionCrew>): ProductionCrew | undefined;
  removeCrewMember(id: number): void;

  // Credits
  getCreditsByProfile(profileId: number): Credit[];
  createCredit(credit: InsertCredit): Credit;

  // Beta Invites
  createInvite(data: { token: string; email?: string; displayName?: string; role?: string; maxUses?: number; createdBy: number; notes?: string }): BetaInvite;
  getInviteByToken(token: string): BetaInvite | undefined;
  getInvites(): BetaInvite[];
  updateInvite(id: number, data: Partial<BetaInvite>): BetaInvite | undefined;
  revokeInvite(id: number): void;

  // Beta Requests
  createBetaRequest(data: { email: string; handle?: string; displayName?: string; role?: string; city?: string; message?: string }): BetaRequest;
  getBetaRequests(status?: string): BetaRequest[];
  getBetaRequest(id: number): BetaRequest | undefined;
  updateBetaRequest(id: number, data: Partial<BetaRequest>): BetaRequest | undefined;

  // Beta Feedback
  createFeedback(data: { userId: number; category: string; message: string; pageUrl?: string }): BetaFeedback;
  getFeedback(): BetaFeedback[];
  getFeedbackByUser(userId: number): BetaFeedback[];
  updateFeedbackStatus(id: number, status: string, adminNotes?: string): BetaFeedback | undefined;

  // Admin: all users
  getAllUsers(): User[];
  updateUserAccess(id: number, status: string): User | undefined;
  updateUser(id: number, data: Partial<InsertUser>): User | undefined;
  setLastLogin(id: number): void;

  // Activity Feed
  createActivity(data: InsertActivity): ActivityFeed;
  getFeed(limit?: number, offset?: number, publicOnly?: boolean): (ActivityFeed & { user?: User; profile?: Profile })[];

  // Feed Posts
  createPost(data: InsertFeedPost): FeedPost;
  getPosts(limit?: number): (FeedPost & { user?: User; profile?: Profile })[];

  // Security Audit Log
  createSecurityLog(data: InsertSecurityAuditLog): SecurityAuditLog;
  getSecurityLog(opts: { userId?: number; action?: string; limit?: number; since?: Date }): SecurityAuditLog[];

  // Analytics Events
  createAnalyticsEvent(data: InsertAnalyticsEvent): AnalyticsEvent;
  getAnalyticsEvents(opts: { userId?: number; eventType?: string; limit?: number; since?: Date }): AnalyticsEvent[];

  // Email Queue
  queueEmail(data: InsertEmailQueue): EmailQueue;
  getEmailQueue(status?: string): EmailQueue[];
  updateEmailStatus(id: number, status: string, providerMessageId?: string, error?: string): EmailQueue | undefined;

  // Password Resets
  createPasswordReset(data: InsertPasswordReset): PasswordReset;
  getPasswordResetByToken(token: string): PasswordReset | undefined;
  markPasswordResetUsed(id: number): void;
  deleteExpiredPasswordResets(): void;

  // Email Verifications
  createEmailVerification(data: InsertEmailVerification): EmailVerification;
  getEmailVerificationByToken(token: string): EmailVerification | undefined;
  markEmailVerificationUsed(id: number): void;

  // Blocked IPs
  getBlockedIp(ipAddress: string): BlockedIp | undefined;
  blockIp(data: InsertBlockedIp): BlockedIp;
  unblockIp(ipAddress: string): void;
  getActiveBlockedIps(): BlockedIp[];

  // Notifications (PRD-009: Real-Time & WebSocket)
  createNotification(data: InsertNotification): Notification;
  getNotifications(userId: number, limit?: number, unreadOnly?: boolean): Notification[];
  markNotificationRead(id: number): void;
  markAllNotificationsRead(userId: number): void;
  getUnreadNotificationCount(userId: number): number;
  deleteNotification(id: number): void;

  // News Cache
  getNewsCache(limit?: number): NewsCache[];
  setNewsCache(items: { source: string; title: string; link: string; description?: string; category: string; pubDate: Date }[]): void;
  clearNewsCache(): void;

  // ===== SUBSCRIPTION TIERS (PRD-007: Payments & Monetization) =====
  getSubscriptionTiers(activeOnly?: boolean): SubscriptionTier[];
  getSubscriptionTier(name: string): SubscriptionTier | undefined;
  createSubscriptionTier(data: InsertSubscriptionTier): SubscriptionTier;

  // ===== PAYMENTS (PRD-007: Payments & Monetization) =====
  createPayment(data: InsertPayment): Payment;
  getPaymentsByUser(userId: number, limit?: number): Payment[];
  getPayment(id: number): Payment | undefined;
  getPaymentsByStripeSubscriptionId(stripeSubscriptionId: string): Payment[];
  updatePaymentStatus(id: number, status: string): Payment | undefined;
  getAllPayments(limit?: number): Payment[];

  // ===== W-9 FORMS (PRD-007: Payments & Monetization) =====
  createW9Form(data: InsertW9Form): W9Form;
  getW9Form(userId: number): W9Form | undefined;
  updateW9Form(userId: number, data: Partial<InsertW9Form>): W9Form | undefined;
  getW9Forms(status?: string): W9Form[];

  // ===== PROFILE SUBSCRIPTION UPDATES =====
  updateProfileSubscription(userId: number, data: {
    stripeCustomerId?: string;
    stripeConnectAccountId?: string;
    subscriptionTier?: string;
    subscriptionStatus?: string;
    w9Collected?: boolean;
  }): Profile | undefined;

  // ===== CREW FINDER PAGINATION (PRD-006) =====
  searchProfilesPaginated(opts: {
    role?: string;
    city?: string;
    skill?: string;
    availability?: string;
    sortBy?: string;
    sortDir?: string;
    limit?: number;
    offset?: number;
  }): { profiles: (Profile & { handle: string })[]; total: number };

  getProfileByStripeAccountId(accountId: string): Profile | undefined;
  getProfileByStripeCustomerId(customerId: string): Profile | undefined;

  // ===== PRD-022v2: GDPR Export — Audit Logs & Analytics =====
  getSecurityLogsByUser(userId: number, limit?: number): SecurityAuditLog[];
  getAnalyticsByUser(userId: number, limit?: number): AnalyticsEvent[];
}

export class DatabaseStorage implements IStorage {
  // ===== USERS =====
  getUser(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  getUserByHandle(handle: string): User | undefined {
    return db.select().from(users).where(eq(users.handle, handle)).get();
  }

  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  }

  createUser(insertUser: InsertUser): User {
    return db.insert(users).values(insertUser).returning().get();
  }

  // ===== SESSIONS =====
  createSession(session: InsertSession): Session {
    return db.insert(sessions).values(session).returning().get();
  }

  getSessionByToken(token: string): Session | undefined {
    return db.select().from(sessions).where(eq(sessions.token, token)).get();
  }

  deleteSession(token: string): void {
    db.delete(sessions).where(eq(sessions.token, token)).run();
  }

  // ===== PROFILES =====
  getProfile(userId: number): Profile | undefined {
    const profile = db.select().from(profiles).where(eq(profiles.userId, userId)).get();
    if (profile) {
      // PRD-018v2: Decrypt Stripe IDs on read
      if (profile.stripeCustomerId) {
        profile.stripeCustomerId = decryptSensitive(profile.stripeCustomerId) || profile.stripeCustomerId;
      }
      if (profile.stripeConnectAccountId) {
        profile.stripeConnectAccountId = decryptSensitive(profile.stripeConnectAccountId) || profile.stripeConnectAccountId;
      }
    }
    return profile;
  }

  getProfileByHandle(handle: string): Profile | undefined {
    const user = this.getUserByHandle(handle);
    if (!user) return undefined;
    return this.getProfile(user.id);
  }

  getProfileById(id: number): Profile | undefined {
    return db.select().from(profiles).where(eq(profiles.id, id)).get();
  }

  createProfile(profile: InsertProfile): Profile {
    return db.insert(profiles).values(profile).returning().get();
  }

  updateProfile(userId: number, data: Partial<InsertProfile>): Profile | undefined {
    db.update(profiles).set({ ...data, updatedAt: new Date() }).where(eq(profiles.userId, userId)).run();
    return this.getProfile(userId);
  }

  searchProfiles(opts: { role?: string; city?: string; skill?: string; availability?: string }): Profile[] {
    let query = db.select().from(profiles).$dynamic();
    const conditions = [eq(profiles.isPublic, true)];

    // Helper: escape LIKE wildcards to prevent wildcard injection.
    // NOTE: this backslash only means anything to SQLite because every
    // like() below is a raw `sql` template with an explicit ESCAPE '\'
    // clause — Drizzle's like() helper has no escape option (0.45.2), and
    // without that clause SQLite treats the backslash as a literal
    // character, so escaped patterns silently match nothing.
    const escapeLike = (str: string) => str.replace(/[%_]/g, (m) => `\\${m}`);

    if (opts.role) {
      const pattern = `%${escapeLike(opts.role)}%`;
      conditions.push(sql`${profiles.role} LIKE ${pattern} ESCAPE '\\'`);
    }
    if (opts.city) {
      const pattern = `%${escapeLike(opts.city)}%`;
      conditions.push(sql`${profiles.city} LIKE ${pattern} ESCAPE '\\'`);
    }
    if (opts.availability) {
      conditions.push(eq(profiles.availability, opts.availability));
    }

    query = query.where(and(...conditions));

    if (opts.skill) {
      const pattern = `%${escapeLike(opts.skill)}%`;
      query = query.where(sql`${profiles.skills} LIKE ${pattern} ESCAPE '\\'`);
    }

    return query.orderBy(desc(profiles.createdAt)).limit(50).all();
  }

  // ===== PRODUCTIONS =====
  getProductionsByUser(userId: number): Production[] {
    return db.select().from(productions).where(eq(productions.creatorId, userId)).orderBy(desc(productions.createdAt)).all();
  }

  getProduction(id: number): Production | undefined {
    return db.select().from(productions).where(eq(productions.id, id)).get();
  }

  createProduction(prod: InsertProduction): Production {
    return db.insert(productions).values(prod).returning().get();
  }

  updateProduction(id: number, data: Partial<InsertProduction>): Production | undefined {
    db.update(productions).set(data).where(eq(productions.id, id)).run();
    return this.getProduction(id);
  }

  // ===== PRODUCTION CREW =====
  getCrewByProduction(productionId: number): (ProductionCrew & { profile?: Profile })[] {
    const crew = db.select().from(productionCrew).where(eq(productionCrew.productionId, productionId)).all();
    return crew.map(member => {
      const profile = this.getProfileById(member.profileId);
      return { ...member, profile };
    });
  }

  addCrewMember(crew: InsertProductionCrew): ProductionCrew {
    return db.insert(productionCrew).values(crew).returning().get();
  }

  getCrewMember(id: number): ProductionCrew | undefined {
    return db.select().from(productionCrew).where(eq(productionCrew.id, id)).get();
  }

  updateCrewMember(id: number, data: Partial<InsertProductionCrew>): ProductionCrew | undefined {
    db.update(productionCrew).set(data).where(eq(productionCrew.id, id)).run();
    return db.select().from(productionCrew).where(eq(productionCrew.id, id)).get();
  }

  removeCrewMember(id: number): void {
    db.delete(productionCrew).where(eq(productionCrew.id, id)).run();
  }

  // ===== CREDITS =====
  getCreditsByProfile(profileId: number): Credit[] {
    return db.select().from(credits).where(eq(credits.profileId, profileId)).orderBy(desc(credits.year)).all();
  }

  createCredit(credit: InsertCredit): Credit {
    return db.insert(credits).values(credit).returning().get();
  }

  // ===== BETA INVITES =====
  createInvite(data: { token: string; email?: string; displayName?: string; role?: string; maxUses?: number; createdBy: number; notes?: string }): BetaInvite {
    return db.insert(betaInvites).values({
      token: data.token,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      maxUses: data.maxUses ?? 1,
      createdBy: data.createdBy,
      notes: data.notes,
    }).returning().get();
  }

  getInviteByToken(token: string): BetaInvite | undefined {
    return db.select().from(betaInvites).where(eq(betaInvites.token, token)).get();
  }

  getInvites(): BetaInvite[] {
    return db.select().from(betaInvites).orderBy(desc(betaInvites.createdAt)).all();
  }

  updateInvite(id: number, data: Partial<BetaInvite>): BetaInvite | undefined {
    db.update(betaInvites).set(data).where(eq(betaInvites.id, id)).run();
    return db.select().from(betaInvites).where(eq(betaInvites.id, id)).get();
  }

  revokeInvite(id: number): void {
    db.update(betaInvites).set({ status: "revoked" }).where(eq(betaInvites.id, id)).run();
  }

  // ===== BETA REQUESTS =====
  createBetaRequest(data: { email: string; handle?: string; displayName?: string; role?: string; city?: string; message?: string }): BetaRequest {
    return db.insert(betaRequests).values(data).returning().get();
  }

  getBetaRequests(status?: string): BetaRequest[] {
    if (status) {
      return db.select().from(betaRequests).where(eq(betaRequests.status, status)).orderBy(desc(betaRequests.createdAt)).all();
    }
    return db.select().from(betaRequests).orderBy(desc(betaRequests.createdAt)).all();
  }

  getBetaRequest(id: number): BetaRequest | undefined {
    return db.select().from(betaRequests).where(eq(betaRequests.id, id)).get();
  }

  updateBetaRequest(id: number, data: Partial<BetaRequest>): BetaRequest | undefined {
    db.update(betaRequests).set(data).where(eq(betaRequests.id, id)).run();
    return db.select().from(betaRequests).where(eq(betaRequests.id, id)).get();
  }

  // ===== BETA FEEDBACK =====
  createFeedback(data: { userId: number; category: string; message: string; pageUrl?: string }): BetaFeedback {
    return db.insert(betaFeedback).values(data).returning().get();
  }

  getFeedback(): BetaFeedback[] {
    return db.select().from(betaFeedback).orderBy(desc(betaFeedback.createdAt)).all();
  }

  getFeedbackByUser(userId: number): BetaFeedback[] {
    return db.select().from(betaFeedback).where(eq(betaFeedback.userId, userId)).orderBy(desc(betaFeedback.createdAt)).all();
  }

  updateFeedbackStatus(id: number, status: string, adminNotes?: string): BetaFeedback | undefined {
    const updates: Partial<typeof betaFeedback.$inferInsert> = { status };
    if (adminNotes !== undefined) {
      updates.adminNotes = adminNotes;
    }
    return db.update(betaFeedback).set(updates).where(eq(betaFeedback.id, id)).returning().get();
  }

  // ===== ADMIN =====
  getAllUsers(): User[] {
    return db.select().from(users).orderBy(desc(users.createdAt)).all();
  }

  updateUserAccess(id: number, status: string): User | undefined {
    db.update(users).set({ accessStatus: status }).where(eq(users.id, id)).run();
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  updateUser(id: number, data: Partial<InsertUser>): User | undefined {
    db.update(users).set(data).where(eq(users.id, id)).run();
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  setLastLogin(id: number): void {
    db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id)).run();
  }

  // ===== ACTIVITY FEED =====
  createActivity(data: InsertActivity): ActivityFeed {
    return db.insert(activityFeed).values(data).returning().get();
  }

  getFeed(limit = 50, offset = 0, publicOnly = false): (ActivityFeed & { user?: User; profile?: Profile })[] {
    const query = publicOnly
      ? db.select().from(activityFeed).where(eq(activityFeed.isPublic, true)).orderBy(desc(activityFeed.createdAt)).limit(limit).offset(offset).all()
      : db.select().from(activityFeed).orderBy(desc(activityFeed.createdAt)).limit(limit).offset(offset).all();

    return query.map((item) => {
      const user = db.select().from(users).where(eq(users.id, item.userId)).get();
      const profile = user ? db.select().from(profiles).where(eq(profiles.userId, user.id)).get() : undefined;
      return { ...item, user, profile };
    });
  }

  // ===== FEED POSTS =====
  createPost(data: InsertFeedPost): FeedPost {
    return db.insert(feedPosts).values(data).returning().get();
  }

  getPosts(limit = 50): (FeedPost & { user?: User; profile?: Profile })[] {
    const posts = db.select().from(feedPosts).orderBy(desc(feedPosts.createdAt)).limit(limit).all();
    return posts.map((post) => {
      const user = db.select().from(users).where(eq(users.id, post.userId)).get();
      const profile = user ? db.select().from(profiles).where(eq(profiles.userId, user.id)).get() : undefined;
      return { ...post, user, profile };
    });
  }

  // ===== SECURITY AUDIT LOG =====
  createSecurityLog(data: InsertSecurityAuditLog): SecurityAuditLog {
    return db.insert(securityAuditLog).values(data).returning().get();
  }

  getSecurityLog(opts: { userId?: number; action?: string; limit?: number; since?: Date }): SecurityAuditLog[] {
    let query = db.select().from(securityAuditLog).$dynamic();
    const conditions = [];
    if (opts.userId) conditions.push(eq(securityAuditLog.userId, opts.userId));
    if (opts.action) conditions.push(eq(securityAuditLog.action, opts.action));
    if (opts.since) conditions.push(gte(securityAuditLog.createdAt, opts.since));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.orderBy(desc(securityAuditLog.createdAt)).limit(opts.limit || 100).all();
  }

  // ===== ANALYTICS EVENTS =====
  createAnalyticsEvent(data: InsertAnalyticsEvent): AnalyticsEvent {
    return db.insert(analyticsEvents).values(data).returning().get();
  }

  getAnalyticsEvents(opts: { userId?: number; eventType?: string; limit?: number; since?: Date }): AnalyticsEvent[] {
    let query = db.select().from(analyticsEvents).$dynamic();
    const conditions = [];
    if (opts.userId) conditions.push(eq(analyticsEvents.userId, opts.userId));
    if (opts.eventType) conditions.push(eq(analyticsEvents.eventType, opts.eventType));
    if (opts.since) conditions.push(gte(analyticsEvents.createdAt, opts.since));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.orderBy(desc(analyticsEvents.createdAt)).limit(opts.limit || 100).all();
  }

  // ===== PRD-022v2: GDPR Export — Audit Logs & Analytics =====
  getSecurityLogsByUser(userId: number, limit = 1000): SecurityAuditLog[] {
    return db.select().from(securityAuditLog)
      .where(eq(securityAuditLog.userId, userId))
      .orderBy(desc(securityAuditLog.createdAt))
      .limit(limit)
      .all();
  }

  getAnalyticsByUser(userId: number, limit = 1000): AnalyticsEvent[] {
    return db.select().from(analyticsEvents)
      .where(eq(analyticsEvents.userId, userId))
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(limit)
      .all();
  }

  // ===== EMAIL QUEUE =====
  queueEmail(data: InsertEmailQueue): EmailQueue {
    return db.insert(emailQueue).values(data).returning().get();
  }

  getEmailQueue(status?: string): EmailQueue[] {
    if (status) {
      return db.select().from(emailQueue).where(eq(emailQueue.status, status)).orderBy(desc(emailQueue.createdAt)).all();
    }
    return db.select().from(emailQueue).orderBy(desc(emailQueue.createdAt)).all();
  }

  updateEmailStatus(id: number, status: string, providerMessageId?: string, error?: string): EmailQueue | undefined {
    const updates: Record<string, any> = { status };
    if (providerMessageId) updates.providerMessageId = providerMessageId;
    if (error) updates.error = error;
    if (status === "sent") updates.sentAt = new Date();
    if (status === "failed") updates.failedAt = new Date();
    db.update(emailQueue).set(updates).where(eq(emailQueue.id, id)).run();
    return db.select().from(emailQueue).where(eq(emailQueue.id, id)).get();
  }

  // ===== PASSWORD RESETS =====
  createPasswordReset(data: InsertPasswordReset): PasswordReset {
    return db.insert(passwordResets).values(data).returning().get();
  }

  getPasswordResetByToken(token: string): PasswordReset | undefined {
    return db.select().from(passwordResets).where(eq(passwordResets.token, token)).get();
  }

  markPasswordResetUsed(id: number): void {
    db.update(passwordResets).set({ used: true, usedAt: new Date() }).where(eq(passwordResets.id, id)).run();
  }

  deleteExpiredPasswordResets(): void {
    db.delete(passwordResets).where(lt(passwordResets.expiresAt, new Date())).run();
  }

  // ===== EMAIL VERIFICATIONS =====
  createEmailVerification(data: InsertEmailVerification): EmailVerification {
    return db.insert(emailVerifications).values(data).returning().get();
  }

  getEmailVerificationByToken(token: string): EmailVerification | undefined {
    return db.select().from(emailVerifications).where(eq(emailVerifications.token, token)).get();
  }

  markEmailVerificationUsed(id: number): void {
    db.update(emailVerifications).set({ used: true, usedAt: new Date() }).where(eq(emailVerifications.id, id)).run();
  }

  // ===== BLOCKED IPS =====
  getBlockedIp(ipAddress: string): BlockedIp | undefined {
    return db.select().from(blockedIps).where(eq(blockedIps.ipAddress, ipAddress)).get();
  }

  blockIp(data: InsertBlockedIp): BlockedIp {
    return db.insert(blockedIps).values(data).returning().get();
  }

  unblockIp(ipAddress: string): void {
    db.update(blockedIps).set({ isActive: false }).where(eq(blockedIps.ipAddress, ipAddress)).run();
  }

  getActiveBlockedIps(): BlockedIp[] {
    return db.select().from(blockedIps).where(eq(blockedIps.isActive, true)).orderBy(desc(blockedIps.blockedAt)).all();
  }

  // ===== NOTIFICATIONS (PRD-009: Real-Time & WebSocket) =====
  createNotification(data: InsertNotification): Notification {
    return db.insert(notifications).values(data).returning().get();
  }

  getNotifications(userId: number, limit = 50, unreadOnly = false): Notification[] {
    let query = db.select().from(notifications).where(eq(notifications.userId, userId)).$dynamic();
    if (unreadOnly) {
      query = query.where(eq(notifications.isRead, false));
    }
    return query.orderBy(desc(notifications.createdAt)).limit(limit).all();
  }

  markNotificationRead(id: number): void {
    db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).run();
  }

  markAllNotificationsRead(userId: number): void {
    db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId)).run();
  }

  getUnreadNotificationCount(userId: number): number {
    const result = db
      .select({ count: sql`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .get();
    return Number(result?.count ?? 0);
  }

  deleteNotification(id: number): void {
    db.delete(notifications).where(eq(notifications.id, id)).run();
  }

  // ===== NEWS CACHE =====
  getNewsCache(limit = 30): NewsCache[] {
    return db.select().from(newsCache).orderBy(desc(newsCache.pubDate)).limit(limit).all();
  }

  setNewsCache(items: { source: string; title: string; link: string; description?: string; category: string; pubDate: Date }[]): void {
    // Use a transaction: clear old cache, insert new items
    const tx = db.transaction(() => {
      db.delete(newsCache).run();
      for (const item of items) {
        db.insert(newsCache).values({
          source: item.source,
          title: item.title,
          link: item.link,
          description: item.description,
          category: item.category,
          pubDate: item.pubDate,
        }).run();
      }
    });
  }

  clearNewsCache(): void {
    db.delete(newsCache).run();
  }

  // ===== SUBSCRIPTION TIERS (PRD-007: Payments & Monetization) =====
  getSubscriptionTiers(activeOnly = true): SubscriptionTier[] {
    let query = db.select().from(subscriptionTiers).$dynamic();
    if (activeOnly) {
      query = query.where(eq(subscriptionTiers.isActive, true));
    }
    return query.orderBy(subscriptionTiers.priceCents).all();
  }

  getSubscriptionTier(name: string): SubscriptionTier | undefined {
    return db.select().from(subscriptionTiers).where(eq(subscriptionTiers.name, name)).get();
  }

  createSubscriptionTier(data: InsertSubscriptionTier): SubscriptionTier {
    return db.insert(subscriptionTiers).values(data).returning().get();
  }

  // ===== PAYMENTS (PRD-007: Payments & Monetization) =====
  createPayment(data: InsertPayment): Payment {
    return db.insert(payments).values(data).returning().get();
  }

  getPaymentsByUser(userId: number, limit = 50): Payment[] {
    return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt)).limit(limit).all();
  }

  getPayment(id: number): Payment | undefined {
    return db.select().from(payments).where(eq(payments.id, id)).get();
  }

  getPaymentsByStripeSubscriptionId(stripeSubscriptionId: string): Payment[] {
    return db.select().from(payments).where(eq(payments.stripeSubscriptionId, stripeSubscriptionId)).orderBy(desc(payments.createdAt)).all();
  }

  updatePaymentStatus(id: number, status: string): Payment | undefined {
    db.update(payments).set({ status, processedAt: new Date() }).where(eq(payments.id, id)).run();
    return db.select().from(payments).where(eq(payments.id, id)).get();
  }

  getAllPayments(limit = 10000): Payment[] {
    return db.select().from(payments).orderBy(desc(payments.createdAt)).limit(limit).all();
  }

  // ===== W-9 FORMS (PRD-007: Payments & Monetization) =====
  createW9Form(data: InsertW9Form): W9Form {
    return db.insert(w9Forms).values(data).returning().get();
  }

  getW9Form(userId: number): W9Form | undefined {
    return db.select().from(w9Forms).where(eq(w9Forms.userId, userId)).get();
  }

  updateW9Form(userId: number, data: Partial<InsertW9Form>): W9Form | undefined {
    db.update(w9Forms).set(data).where(eq(w9Forms.userId, userId)).run();
    return this.getW9Form(userId);
  }

  getW9Forms(status?: string): W9Form[] {
    let query = db.select().from(w9Forms).$dynamic();
    if (status) {
      query = query.where(eq(w9Forms.status, status));
    }
    return query.orderBy(desc(w9Forms.submittedAt)).all();
  }

  // ===== PROFILE SUBSCRIPTION UPDATES =====
  updateProfileSubscription(userId: number, data: {
    stripeCustomerId?: string;
    stripeConnectAccountId?: string;
    subscriptionTier?: string;
    subscriptionStatus?: string;
    w9Collected?: boolean;
  }): Profile | undefined {
    db.update(profiles).set({ ...data, updatedAt: new Date() }).where(eq(profiles.userId, userId)).run();
    return this.getProfile(userId);
  }

  // ===== CREW FINDER PAGINATION (PRD-006) =====
  searchProfilesPaginated(opts: {
    role?: string;
    city?: string;
    skill?: string;
    availability?: string;
    sortBy?: string;
    sortDir?: string;
    limit?: number;
    offset?: number;
  }): { profiles: (Profile & { handle: string })[]; total: number } {
    const limit = Math.min(opts.limit || 20, 50);
    const offset = opts.offset || 0;

    // Helper: escape LIKE wildcards to prevent wildcard injection.
    // NOTE: this backslash only means anything to SQLite because every
    // like() below is a raw `sql` template with an explicit ESCAPE '\'
    // clause — Drizzle's like() helper has no escape option (0.45.2), and
    // without that clause SQLite treats the backslash as a literal
    // character, so escaped patterns silently match nothing.
    const escapeLike = (str: string) => str.replace(/[%_]/g, (m) => `\\${m}`);

    const conditions = [eq(profiles.isPublic, true)];

    if (opts.role) {
      const pattern = `%${escapeLike(opts.role)}%`;
      conditions.push(sql`${profiles.role} LIKE ${pattern} ESCAPE '\\'`);
    }
    if (opts.city) {
      const pattern = `%${escapeLike(opts.city)}%`;
      conditions.push(sql`${profiles.city} LIKE ${pattern} ESCAPE '\\'`);
    }
    if (opts.availability) {
      conditions.push(eq(profiles.availability, opts.availability));
    }
    if (opts.skill) {
      const pattern = `%${escapeLike(opts.skill)}%`;
      conditions.push(sql`${profiles.skills} LIKE ${pattern} ESCAPE '\\'`);
    }

    // Sort options
    const sortField = opts.sortBy || "createdAt";
    const sortDir = opts.sortDir === "asc" ? "asc" : "desc";
    const sortColumn = sortField === "dayRate" ? profiles.dayRate : sortField === "displayName" ? profiles.displayName : profiles.createdAt;

    // Join with users to get the real handle
    const profilesList = db
      .select({
        ...getTableColumns(profiles),
        handle: users.handle,
      })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(and(...conditions))
      .orderBy(sortDir === "asc" ? sortColumn : desc(sortColumn))
      .limit(limit)
      .offset(offset)
      .all();

    const totalResult = db.select({ count: sql`count(*)` }).from(profiles).where(and(...conditions)).get();
    const total = Number(totalResult?.count ?? 0);

    return { profiles: profilesList, total };
  }

  // ===== PRD-019: Stripe Connect — profile lookup by account ID =====
  // PRD-018v2: Decrypt stored values and compare since IDs are now encrypted at rest
  getProfileByStripeAccountId(accountId: string): Profile | undefined {
    const allProfiles = db.select().from(profiles)
      .where(sql`${profiles.stripeConnectAccountId} IS NOT NULL`)
      .all();
    return allProfiles.find((p) => {
      const decrypted = p.stripeConnectAccountId ? (decryptSensitive(p.stripeConnectAccountId) || p.stripeConnectAccountId) : null;
      return decrypted === accountId;
    });
  }

  // ===== PRD-019: Stripe Connect — profile lookup by customer ID =====
  // PRD-018v2: Decrypt stored values and compare since IDs are now encrypted at rest
  getProfileByStripeCustomerId(customerId: string): Profile | undefined {
    const allProfiles = db.select().from(profiles)
      .where(sql`${profiles.stripeCustomerId} IS NOT NULL`)
      .all();
    return allProfiles.find((p) => {
      const decrypted = p.stripeCustomerId ? (decryptSensitive(p.stripeCustomerId) || p.stripeCustomerId) : null;
      return decrypted === customerId;
    });
  }
}

export const storage = new DatabaseStorage();
