import type { Request, Response, NextFunction } from "express";

/**
 * Security headers middleware.
 * Sets standard security-related HTTP headers on all responses.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  // Prevent MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // XSS protection (legacy browsers)
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy. Google Fonts is allowed because the SPA shell
  // (index.html) links it for every route, and the landing page's type
  // depends on it; without it the page silently falls back to system fonts.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );

  // HSTS (only in production with HTTPS)
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // Permissions policy
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Cache control for API routes
  if (_req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
}
