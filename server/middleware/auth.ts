import type { Request, Response, NextFunction } from "express";
import { scryptSync, randomBytes, randomUUID } from "node:crypto";
import { storage } from "../storage";

// ===== AUTH HELPERS =====
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const verify = scryptSync(password, salt, 64).toString("hex");
  return verify === hash;
}

export function generateToken(): string {
  return randomUUID();
}

// Session TTL from env (Forge correction #4)
export const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || "30", 10);
export const SESSION_DURATION = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

// ===== AUTH MIDDLEWARE =====
export interface AuthedRequest extends Request {
  userId?: number;
}

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return next();
  }
  const session = storage.getSessionByToken(token);
  if (!session || session.expiresAt < new Date()) {
    return next();
  }
  req.userId = session.userId;
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const user = storage.getUser(req.userId);
  if (!user?.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
