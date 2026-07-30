import { db } from "../storage";
import { securityAuditLog, analyticsEvents } from "@shared/schema";
import type { InsertSecurityAuditLog, InsertAnalyticsEvent } from "@shared/schema";
import { desc, eq, and, gte, count } from "drizzle-orm";

/**
 * Log a security audit event.
 * Used for: login_success, login_failed, logout, password_change,
 * email_verification, account_locked, rate_limited, ip_blocked,
 * consent_given, consent_withdrawn
 */
export async function logSecurityEvent(opts: {
  userId?: number;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    await db.insert(securityAuditLog).values({
      userId: opts.userId,
      action: opts.action,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      success: opts.success ?? true,
      details: JSON.stringify(opts.details || {}),
    });
  } catch (err) {
    console.error("[analytics] Failed to log security event:", err);
  }
}

/**
 * Log an analytics event.
 * Used for: page_view, profile_view, production_create, post_create,
 * search, export_data, consent_accept
 */
export async function logAnalyticsEvent(opts: {
  userId?: number;
  eventType: string;
  eventName?: string;
  properties?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      userId: opts.userId,
      eventType: opts.eventType,
      eventName: opts.eventName,
      properties: JSON.stringify(opts.properties || {}),
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      sessionId: opts.sessionId,
    });
  } catch (err) {
    console.error("[analytics] Failed to log analytics event:", err);
  }
}

/**
 * Get security audit log entries.
 */
export async function getSecurityLog(opts: {
  userId?: number;
  action?: string;
  limit?: number;
  since?: Date;
}): Promise<any[]> {
  let query = db.select().from(securityAuditLog).$dynamic();

  const conditions = [];
  if (opts.userId) conditions.push(eq(securityAuditLog.userId, opts.userId));
  if (opts.action) conditions.push(eq(securityAuditLog.action, opts.action));
  if (opts.since) conditions.push(gte(securityAuditLog.createdAt, opts.since));

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return query
    .orderBy(desc(securityAuditLog.createdAt))
    .limit(opts.limit || 100)
    .all();
}

/**
 * Get analytics events.
 */
export async function getAnalyticsEvents(opts: {
  userId?: number;
  eventType?: string;
  limit?: number;
  since?: Date;
}): Promise<any[]> {
  let query = db.select().from(analyticsEvents).$dynamic();

  const conditions = [];
  if (opts.userId) conditions.push(eq(analyticsEvents.userId, opts.userId));
  if (opts.eventType) conditions.push(eq(analyticsEvents.eventType, opts.eventType));
  if (opts.since) conditions.push(gte(analyticsEvents.createdAt, opts.since));

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return query
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(opts.limit || 100)
    .all();
}

/**
 * Get analytics summary for admin dashboard.
 */
export async function getAnalyticsSummary(since: Date): Promise<{
  totalEvents: number;
  eventsByType: Record<string, number>;
  securityEvents: number;
  securityByType: Record<string, number>;
}> {
  const totalEvents = await db
    .select({ count: count() })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .get();

  const eventsByTypeRows = await db
    .select({
      eventType: analyticsEvents.eventType,
      count: count(),
    })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .groupBy(analyticsEvents.eventType)
    .all();

  const securityEvents = await db
    .select({ count: count() })
    .from(securityAuditLog)
    .where(gte(securityAuditLog.createdAt, since))
    .get();

  const securityByTypeRows = await db
    .select({
      action: securityAuditLog.action,
      count: count(),
    })
    .from(securityAuditLog)
    .where(gte(securityAuditLog.createdAt, since))
    .groupBy(securityAuditLog.action)
    .all();

  return {
    totalEvents: Number(totalEvents?.count || 0),
    eventsByType: Object.fromEntries(eventsByTypeRows.map(r => [r.eventType, Number(r.count)])),
    securityEvents: Number(securityEvents?.count || 0),
    securityByType: Object.fromEntries(securityByTypeRows.map(r => [r.action, Number(r.count)])),
  };
}
