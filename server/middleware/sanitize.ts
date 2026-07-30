import type { Request, Response, NextFunction } from "express";

/**
 * Sanitization middleware.
 * Recursively strips potentially dangerous content from request body,
 * query params, and URL params.
 *
 * - Removes keys starting with `$` (MongoDB NoSQL injection)
 * - Strips HTML tags from string values
 * - Trims whitespace
 * - Removes null bytes
 */

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Remove null bytes
    let cleaned = value.replace(/\0/g, "");
    // Strip HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, "");
    // Trim whitespace
    cleaned = cleaned.trim();
    return cleaned;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Skip keys that look like NoSQL injection attempts
      if (key.startsWith("$")) continue;
      obj[key] = sanitizeValue(val);
    }
    return obj;
  }
  return value;
}

export function sanitize(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeValue(req.query) as any;
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params) as any;
  }
  next();
}
