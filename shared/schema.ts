import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import type * as z from "zod/mini";

// ===== USERS =====
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  handle: text("handle").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).default(false),
  accessStatus: text("access_status").default("active"), // pending | active | revoked
  invitedBy: integer("invited_by"),
  activatedAt: integer("activated_at", { mode: "timestamp" }),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertUserSchema = createInsertSchema(users).pick({
  handle: true,
  email: true,
  passwordHash: true,
  isAdmin: true,
  accessStatus: true,
  invitedBy: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ===== SESSIONS =====
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const insertSessionSchema = createInsertSchema(sessions).pick({
  token: true,
  userId: true,
  expiresAt: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// ===== PROFILES =====
export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  city: text("city"),
  state: text("state"),
  country: text("country").default("US"),
  bio: text("bio"),
  avatarInitials: text("avatar_initials"),
  reelUrl: text("reel_url"),
  imdbUrl: text("imdb_url"),
  websiteUrl: text("website_url"),
  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),
  themePreset: text("theme_preset").default("cinema_gold"),
  accentColor: text("accent_color"),
  videoLinks: text("video_links").default("[]"), // JSON array of {provider, url, title}
  socialLinks: text("social_links").default("{}"), // JSON object of platform -> url
  imdbCredits: text("imdb_credits").default("[]"), // JSON array of {title, year, role, rating}
  dayRate: integer("day_rate"),
  availability: text("availability").default("available"),
  skills: text("skills").default("[]"), // JSON array of strings
  isPublic: integer("is_public", { mode: "boolean" }).default(true),
  // PRD-007: Payments & Monetization — subscription status
  stripeCustomerId: text("stripe_customer_id"),
  stripeConnectAccountId: text("stripe_connect_account_id"),
  subscriptionTier: text("subscription_tier").default("free"), // free | pro | pro_plus
  subscriptionStatus: text("subscription_status").default("inactive"), // inactive | active | past_due | canceled
  w9Collected: integer("w9_collected", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertProfileSchema = createInsertSchema(profiles).pick({
  userId: true,
  displayName: true,
  role: true,
  city: true,
  state: true,
  country: true,
  bio: true,
  avatarInitials: true,
  reelUrl: true,
  imdbUrl: true,
  imdbCredits: true,
  websiteUrl: true,
  avatarUrl: true,
  coverUrl: true,
  themePreset: true,
  accentColor: true,
  videoLinks: true,
  socialLinks: true,
  dayRate: true,
  availability: true,
  skills: true,
  isPublic: true,
  stripeCustomerId: true,
  stripeConnectAccountId: true,
  subscriptionTier: true,
  subscriptionStatus: true,
  w9Collected: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

// ===== PRODUCTIONS =====
export const productions = sqliteTable("productions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  creatorId: integer("creator_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  type: text("type").notNull(), // feature, short, music_video, commercial, web, documentary
  description: text("description"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  location: text("location"),
  status: text("status").default("pre_production"), // pre_production, in_production, post, wrapped
  budget: integer("budget"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertProductionSchema = createInsertSchema(productions).pick({
  creatorId: true,
  title: true,
  type: true,
  description: true,
  startDate: true,
  endDate: true,
  location: true,
  status: true,
  budget: true,
});

export type InsertProduction = z.infer<typeof insertProductionSchema>;
export type Production = typeof productions.$inferSelect;

// ===== PRODUCTION CREW =====
export const productionCrew = sqliteTable("production_crew", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productionId: integer("production_id").notNull().references(() => productions.id),
  profileId: integer("profile_id").notNull().references(() => profiles.id),
  role: text("role").notNull(),
  status: text("status").default("invited"), // invited, confirmed, declined
  dayRate: integer("day_rate"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertProductionCrewSchema = createInsertSchema(productionCrew).pick({
  productionId: true,
  profileId: true,
  role: true,
  status: true,
  dayRate: true,
});

export type InsertProductionCrew = z.infer<typeof insertProductionCrewSchema>;
export type ProductionCrew = typeof productionCrew.$inferSelect;

// ===== CREDITS (verified production history on profiles) =====
export const credits = sqliteTable("credits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => profiles.id),
  productionTitle: text("production_title").notNull(),
  role: text("role").notNull(),
  year: integer("year").notNull(),
  format: text("format"), // feature, short, music_video, commercial, etc.
  verified: integer("verified", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertCreditSchema = createInsertSchema(credits).pick({
  profileId: true,
  productionTitle: true,
  role: true,
  year: true,
  format: true,
  verified: true,
});

export type InsertCredit = z.infer<typeof insertCreditSchema>;
export type Credit = typeof credits.$inferSelect;

// ===== BETA INVITES =====
export const betaInvites = sqliteTable("beta_invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  role: text("role"),
  status: text("status").notNull().default("active"), // active | used | revoked
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  usedAt: integer("used_at", { mode: "timestamp" }),
  notes: text("notes"),
});

export type BetaInvite = typeof betaInvites.$inferSelect;

// ===== BETA REQUESTS =====
export const betaRequests = sqliteTable("beta_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  handle: text("handle"),
  displayName: text("display_name"),
  role: text("role"),
  city: text("city"),
  message: text("message"),
  status: text("status").notNull().default("pending"), // pending | approved | invited | activated | rejected
  inviteId: integer("invite_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  notes: text("notes"),
});

export type BetaRequest = typeof betaRequests.$inferSelect;

// ===== BETA FEEDBACK =====
export const betaFeedback = sqliteTable("beta_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  category: text("category").notNull(), // bug | idea | note | praise
  message: text("message").notNull(),
  pageUrl: text("page_url"),
  status: text("status").notNull().default("new"), // new | reviewed | planned | resolved
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  adminNotes: text("admin_notes"),
});

export type BetaFeedback = typeof betaFeedback.$inferSelect;

// ===== ACTIVITY FEED =====
export const activityFeed = sqliteTable("activity_feed", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // member_joined | production_created | post_shared | profile_updated
  userId: integer("user_id").notNull().references(() => users.id),
  targetType: text("target_type"), // production | post | profile | user
  targetId: integer("target_id"),
  message: text("message"), // pre-rendered message
  metadata: text("metadata").default("{}"), // JSON for extra context
  isPublic: integer("is_public", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type ActivityFeed = typeof activityFeed.$inferSelect;

export const insertActivitySchema = createInsertSchema(activityFeed).pick({
  type: true,
  userId: true,
  targetType: true,
  targetId: true,
  message: true,
  metadata: true,
  isPublic: true,
});

export type InsertActivity = z.infer<typeof insertActivitySchema>;

// ===== FEED POSTS =====
export const feedPosts = sqliteTable("feed_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  linkUrl: text("link_url"),
  visibility: text("visibility").default("public"), // public | members
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type FeedPost = typeof feedPosts.$inferSelect;

export const insertFeedPostSchema = createInsertSchema(feedPosts).pick({
  userId: true,
  body: true,
  linkUrl: true,
  visibility: true,
});

export type InsertFeedPost = z.infer<typeof insertFeedPostSchema>;

// ===== NEWS CACHE (database-backed RSS feed cache) =====
export const newsCache = sqliteTable("news_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(), // e.g. "IndieWire"
  title: text("title").notNull(),
  link: text("link").notNull(),
  description: text("description"),
  category: text("category").notNull(), // Industry | Craft
  pubDate: integer("pub_date", { mode: "timestamp" }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type NewsCache = typeof newsCache.$inferSelect;
// ===== SECURITY AUDIT LOG (PRD-010: Legal & Compliance) =====
export const securityAuditLog = sqliteTable("security_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(), // login_success, login_failed, logout, password_change, email_verification, account_locked, rate_limited, ip_blocked, consent_given, consent_withdrawn
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  success: integer("success", { mode: "boolean" }).default(true),
  details: text("details").default("{}"), // JSON for extra context
  requestId: text("request_id"), // PRD-018v2: Correlate with HTTP request ID
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type SecurityAuditLog = typeof securityAuditLog.$inferSelect;
export type InsertSecurityAuditLog = typeof securityAuditLog.$inferInsert;

// ===== ANALYTICS EVENTS (PRD-015: Reporting & Analytics) =====
export const analyticsEvents = sqliteTable("analytics_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  eventType: text("event_type").notNull(), // page_view, profile_view, production_create, post_create, search, export_data, consent_accept
  eventName: text("event_name"), // human-readable name
  properties: text("properties").default("{}"), // JSON for event context
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  sessionId: text("session_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;

// ===== EMAIL QUEUE (PRD-013: Email Infrastructure) =====
export const emailQueue = sqliteTable("email_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  to: text("to").notNull(),
  from: text("from").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  text: text("text"),
  status: text("status").notNull().default("pending"), // pending | sending | sent | failed | bounced
  provider: text("provider").default("resend"),
  providerMessageId: text("provider_message_id"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  failedAt: integer("failed_at", { mode: "timestamp" }),
  error: text("error"),
  metadata: text("metadata").default("{}"), // JSON for template context, userId, etc.
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type EmailQueue = typeof emailQueue.$inferSelect;
export type InsertEmailQueue = typeof emailQueue.$inferInsert;

// ===== PASSWORD RESETS (PRD-011: Account & Settings) =====
export const passwordResets = sqliteTable("password_resets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  used: integer("used", { mode: "boolean" }).default(false),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type PasswordReset = typeof passwordResets.$inferSelect;
export type InsertPasswordReset = typeof passwordResets.$inferInsert;

// ===== EMAIL VERIFICATIONS (PRD-011: Account & Settings) =====
export const emailVerifications = sqliteTable("email_verifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  used: integer("used", { mode: "boolean" }).default(false),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type EmailVerification = typeof emailVerifications.$inferSelect;
export type InsertEmailVerification = typeof emailVerifications.$inferInsert;

// ===== BLOCKED IPS (PRD-010: Legal & Compliance / Security) =====
export const blockedIps = sqliteTable("blocked_ips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ipAddress: text("ip_address").notNull().unique(),
  reason: text("reason").notNull(), // rate_limit_abuse, brute_force, suspicious_activity, manual
  // Route group this block applies to (e.g. "auth"). Null = blocks every
  // route, same as the historical behavior. ip_address stays UNIQUE, so
  // only one active block can exist per IP at a time regardless of scope —
  // matches the existing (pre-scope) constraint, not a new limitation.
  scope: text("scope"),
  blockedBy: integer("blocked_by").references(() => users.id),
  blockedAt: integer("blocked_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }), // null = permanent
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});

export type BlockedIp = typeof blockedIps.$inferSelect;
export type InsertBlockedIp = typeof blockedIps.$inferInsert;

// ===== NOTIFICATIONS (PRD-009: Real-Time & WebSocket) =====
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // activity | feed_post | mention | profile_view | system
  title: text("title").notNull(),
  message: text("message"),
  linkUrl: text("link_url"), // deep link to open on click
  metadata: text("metadata").default("{}"), // JSON for extra context
  isRead: integer("is_read", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ===== SUBSCRIPTION TIERS (PRD-007: Payments & Monetization) =====
export const subscriptionTiers = sqliteTable("subscription_tiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(), // free | pro | pro_plus
  displayName: text("display_name").notNull(), // Free | Pro | Pro Plus
  priceCents: integer("price_cents").notNull(), // 0 | 999 | 2999
  interval: text("interval").notNull().default("month"), // month | year
  features: text("features").notNull().default("[]"), // JSON array of feature strings
  maxProductions: integer("max_productions"), // null = unlimited
  maxCrewMembers: integer("max_crew_members"), // null = unlimited
  stripePriceId: text("stripe_price_id"), // Stripe Price ID for checkout
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type SubscriptionTier = typeof subscriptionTiers.$inferSelect;
export type InsertSubscriptionTier = typeof subscriptionTiers.$inferInsert;

// ===== PAYMENTS (PRD-007: Payments & Monetization) =====
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  amount: integer("amount").notNull(), // in cents
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull(), // succeeded | failed | pending | refunded | canceled
  description: text("description"),
  metadata: text("metadata").default("{}"), // JSON for extra context
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  processedAt: integer("processed_at", { mode: "timestamp" }),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ===== W-9 FORMS (PRD-007: Payments & Monetization) =====
export const w9Forms = sqliteTable("w9_forms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  fullName: text("full_name").notNull(),
  businessName: text("business_name"),
  taxClassification: text("tax_classification").notNull(), // individual | corporation | partnership | llc | other
  einOrSsn: text("ein_or_ssn").notNull(), // encrypted / last 4 only
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  stripeAccountId: text("stripe_account_id"),
  status: text("status").notNull().default("pending"), // pending | verified | rejected
  submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  verifiedAt: integer("verified_at", { mode: "timestamp" }),
});

export type W9Form = typeof w9Forms.$inferSelect;
export type InsertW9Form = typeof w9Forms.$inferInsert;

// ===== INVOICES =====
// Stripe is the source of truth for PAYMENT STATE (status, amounts paid).
// This table is the source of truth for WHO/WHAT/WHY (member linkage,
// production association, internal notes) and mirrors Stripe's state.
//
// issuerUserId is NULL when THE FVC is the one billing. It exists now so
// member-to-member invoicing (crew billing productions via Connect) can be
// added later without a schema rewrite.
export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(), // FVC-2026-0041, shown in UI + emails
  stripeInvoiceId: text("stripe_invoice_id").unique(), // NULL while local draft
  stripeCustomerId: text("stripe_customer_id"), // encrypted at rest

  issuerUserId: integer("issuer_user_id").references(() => users.id), // NULL = FVC
  recipientUserId: integer("recipient_user_id").notNull().references(() => users.id),
  // Snapshotted at send time. A member can change their profile email after
  // being invoiced; the invoice is a financial record and must show what was
  // true when it was issued. Stripe freezes customer_email on finalize too.
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name").notNull(),

  productionId: integer("production_id").references(() => productions.id),

  status: text("status").notNull().default("draft"), // draft | open | paid | void | uncollectible
  currency: text("currency").notNull().default("usd"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  amountDueCents: integer("amount_due_cents").notNull().default(0),

  dueDate: integer("due_date", { mode: "timestamp" }),
  issuedAt: integer("issued_at", { mode: "timestamp" }),
  paidAt: integer("paid_at", { mode: "timestamp" }),
  voidedAt: integer("voided_at", { mode: "timestamp" }),

  hostedInvoiceUrl: text("hosted_invoice_url"), // Stripe pay page, post-finalize
  invoicePdfUrl: text("invoice_pdf_url"),

  memo: text("memo"), // shown to recipient
  internalNote: text("internal_note"), // admin-only, MUST never be emailed

  remindersEnabled: integer("reminders_enabled", { mode: "boolean" }).notNull().default(true),
  reminderProfile: text("reminder_profile"), // JSON: [{offsetDays, tone}]

  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

// ===== INVOICE LINE ITEMS =====
export const invoiceLineItems = sqliteTable("invoice_line_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  stripeInvoiceItemId: text("stripe_invoice_item_id"),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitAmountCents: integer("unit_amount_cents").notNull(),
  amountCents: integer("amount_cents").notNull(), // quantity * unitAmountCents, computed server-side
  position: integer("position").notNull().default(0),
});

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

// ===== INVOICE REMINDERS (auto follow-up queue) =====
// One row per scheduled follow-up. UNIQUE(invoice_id, offset_days) is the
// idempotency guard — a double-run of the scheduler cannot duplicate a reminder.
export const invoiceReminders = sqliteTable("invoice_reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  offsetDays: integer("offset_days").notNull(), // negative = before due, 0 = on due, positive = overdue
  sendAt: integer("send_at", { mode: "timestamp" }).notNull(),
  tone: text("tone").notNull().default("neutral"), // friendly | neutral | firm | final
  status: text("status").notNull().default("pending"), // pending | sent | skipped | failed | cancelled
  sentAt: integer("sent_at", { mode: "timestamp" }),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
});

export type InvoiceReminder = typeof invoiceReminders.$inferSelect;
export type InsertInvoiceReminder = typeof invoiceReminders.$inferInsert;

// ===== INVOICE EVENTS (append-only audit trail) =====
export const invoiceEvents = sqliteTable("invoice_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // created | sent | reminder_sent | paid | payment_failed | voided | note
  source: text("source").notNull(), // admin | stripe_webhook | dunning_worker | system
  actorId: integer("actor_id").references(() => users.id),
  payload: text("payload").default("{}"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type InvoiceEvent = typeof invoiceEvents.$inferSelect;
export type InsertInvoiceEvent = typeof invoiceEvents.$inferInsert;

// ===== STRIPE WEBHOOK EVENTS (dedupe) =====
// Stripe retries for up to 3 days with exponential backoff and CAN deliver the
// same event more than once. Without this table, a redelivered invoice.paid
// would re-run side effects.
export const stripeWebhookEvents = sqliteTable("stripe_webhook_events", {
  id: text("id").primaryKey(), // Stripe's evt_... id
  type: text("type").notNull(),
  receivedAt: integer("received_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  processedAt: integer("processed_at", { mode: "timestamp" }),
  error: text("error"),
});

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type InsertStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;
