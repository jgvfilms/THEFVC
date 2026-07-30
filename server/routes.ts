import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage, db } from "./storage";
import { users, sessions, profiles, activityFeed, feedPosts, notifications } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "./index";
import { broadcastToUser } from "./index";
import multer from "multer";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  SESSION_DURATION,
  authMiddleware,
  requireAuth,
  requireAdmin,
  type AuthedRequest,
} from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import { encryptSensitive, decryptSensitive, maskTaxId, isValidTaxId } from "./lib/encryption";
import { createStripeConnectAccount, createAccountLink, handleStripeWebhook, stripe } from "./lib/stripe";
import { generate1099Forms, generate1099NECData, get1099EligibleContractors } from "./lib/tax-documents";
import { Stripe } from "stripe";

// ===== AUTH HELPERS (re-exported from middleware/auth.ts) =====
// hashPassword, verifyPassword, generateToken, SESSION_DURATION
// authMiddleware, requireAuth, requireAdmin, AuthedRequest

const BETA_SEAT_LIMIT = 50;

// ===== ROUTES =====
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(authMiddleware);

  // PRD-018: Rate limiting for sensitive payment/tax endpoints
  app.use("/api/payments", rateLimit({ windowMs: 60 * 1000, max: 60, identifier: "payments" }));
  app.use("/api/w9", rateLimit({ windowMs: 60 * 1000, max: 30, identifier: "w9" }));
  app.use("/api/stripe", rateLimit({ windowMs: 60 * 1000, max: 30, identifier: "stripe" }));
  app.use("/api/admin/tax-export", rateLimit({ windowMs: 60 * 1000, max: 10, identifier: "tax-export" }));
  // PRD-018: Stricter rate limiting on auth endpoints to prevent brute-force
  app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, identifier: "login" }));
  app.use("/api/auth/signup", rateLimit({ windowMs: 15 * 60 * 1000, max: 5, identifier: "signup" }));
  app.use("/api/auth/password-reset", rateLimit({ windowMs: 15 * 60 * 1000, max: 5, identifier: "password-reset" }));

  // ----- AUTH -----
  app.post("/api/auth/signup", async (req: AuthedRequest, res: Response) => {
    try {
      const { handle, email, password, displayName, role, inviteToken } = req.body;

      if (!handle || !email || !password) {
        return res.status(400).json({ error: "Handle, email, and password are required" });
      }

      // Beta gate: require invite token
      if (!inviteToken) {
        return res.status(403).json({ error: "The beta is invite-only. Request access to join the waitlist." });
      }

      const invite = storage.getInviteByToken(inviteToken);
      if (!invite || invite.status !== "active" || invite.usedCount >= invite.maxUses) {
        return res.status(403).json({ error: "Invalid or expired invite token" });
      }

      // Check if handle or email exists
      if (storage.getUserByHandle(handle)) {
        return res.status(409).json({ error: "Handle already taken" });
      }
      if (storage.getUserByEmail(email)) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Create user
      const user = storage.createUser({
        handle,
        email,
        passwordHash: hashPassword(password),
        invitedBy: invite.createdBy,
      });

      // Update invite usage
      const newUsedCount = invite.usedCount + 1;
      storage.updateInvite(invite.id, {
        usedCount: newUsedCount,
        status: newUsedCount >= invite.maxUses ? "used" : "active",
        usedAt: new Date(),
      });

      // If this invite was tied to a beta request, mark it activated
      if (invite.email) {
        const requests = storage.getBetaRequests();
        const matchedReq = requests.find(r => r.email === invite.email && r.inviteId === invite.id);
        if (matchedReq) {
          storage.updateBetaRequest(matchedReq.id, { status: "activated" });
        }
      }

      // Create default profile
      const initials = (displayName || handle).slice(0, 2).toUpperCase();
      storage.createProfile({
        userId: user.id,
        displayName: displayName || handle,
        role: role || "Filmmaker",
        avatarInitials: initials,
        skills: "[]",
        isPublic: true,
        availability: "available",
      });

      // Create activity: member joined
      storage.createActivity({
        type: "member_joined",
        userId: user.id,
        targetType: "user",
        targetId: user.id,
        message: "just joined thefvc",
        isPublic: true,
      });

      // Create session
      const token = generateToken();
      storage.createSession({
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DURATION),
      });

      res.status(201).json({
        token,
        user: { id: user.id, handle: user.handle, email: user.email, isAdmin: !!user.isAdmin, accessStatus: user.accessStatus },
      });
    } catch (err) {
      log(`Signup error: ${err}`, "auth");
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req: AuthedRequest, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const user = storage.getUserByEmail(email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check access status
      if (user.accessStatus === "revoked") {
        return res.status(403).json({ error: "Your access has been revoked. Contact the team." });
      }

      storage.setLastLogin(user.id);

      const token = generateToken();
      storage.createSession({
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DURATION),
      });

      res.json({
        token,
        user: { id: user.id, handle: user.handle, email: user.email, isAdmin: !!user.isAdmin, accessStatus: user.accessStatus },
      });
    } catch (err) {
      log(`Login error: ${err}`, "auth");
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req: AuthedRequest, res: Response) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      storage.deleteSession(token);
    }
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req: AuthedRequest, res: Response) => {
    if (!req.userId) {
      return res.json({ user: null });
    }
    const user = storage.getUser(req.userId);
    if (!user) {
      return res.json({ user: null });
    }
    const profile = storage.getProfile(user.id);
    res.json({
      user: { id: user.id, handle: user.handle, email: user.email, isAdmin: user.isAdmin, accessStatus: user.accessStatus },
      profile,
    });
  });

  // ----- PROFILES -----
  app.get("/api/profiles", async (_req: AuthedRequest, res: Response) => {
    const role = _req.query.role as string;
    const city = _req.query.city as string;
    const skill = _req.query.skill as string;
    const availability = _req.query.availability as string;

    const results = storage.searchProfiles({ role, city, skill, availability });
    res.json(results);
  });

  app.get("/api/profiles/:handle", async (req: AuthedRequest, res: Response) => {
    const profile = storage.getProfileByHandle(req.params.handle);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    // PRD-018: Only expose public profiles
    if (!profile.isPublic) {
      return res.status(403).json({ error: "Profile is private" });
    }
    const credits = storage.getCreditsByProfile(profile.id);
    res.json({ profile, credits });
  });

  app.get("/api/profile", requireAuth, async (req: AuthedRequest, res: Response) => {
    const profile = storage.getProfile(req.userId!);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(profile);
  });

  app.patch("/api/profile", requireAuth, async (req: AuthedRequest, res: Response) => {
    // Fetch existing profile to compare media links
    const existing = storage.getProfile(req.userId!);

    const updated = storage.updateProfile(req.userId!, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Detect newly added video links
    if (existing && updated.videoLinks) {
      const oldVideos: string[] = existing.videoLinks ? (() => {
        try { return JSON.parse(existing.videoLinks as string); } catch { return []; }
      })() : [];
      const newVideos: string[] = (() => {
        try { return JSON.parse(updated.videoLinks as string); } catch { return []; }
      })();
      const oldSet = new Set(oldVideos.map((u: string) => u.toLowerCase().trim()));
      for (const url of newVideos) {
        if (url && !oldSet.has(url.toLowerCase().trim())) {
          const platform = url.includes('youtube') || url.includes('youtu.be') ? 'YouTube'
            : url.includes('vimeo') ? 'Vimeo' : 'Video';
          storage.createActivity({
            type: "video_shared",
            userId: req.userId!,
            targetType: "profile",
            targetId: updated.id,
            message: "shared a new video",
            metadata: JSON.stringify({ url, platform }),
            isPublic: true,
          });
        }
      }
    }

    // Detect newly added social links (Instagram)
    if (existing && updated.socialLinks) {
      const oldSocial: Record<string, string> = existing.socialLinks ? (() => {
        try { return JSON.parse(existing.socialLinks as string); } catch { return {}; }
      })() : {};
      const newSocial: Record<string, string> = (() => {
        try { return JSON.parse(updated.socialLinks as string); } catch { return {}; }
      })();
      const oldSet = new Set(Object.entries(oldSocial).map(([k, v]) => `${k}:${(v as string).toLowerCase().trim()}`));
      for (const [platform, url] of Object.entries(newSocial)) {
        if (url && !oldSet.has(`${platform}:${(url as string).toLowerCase().trim()}`)) {
          const displayPlatform = platform.charAt(0).toUpperCase() + platform.slice(1);
          storage.createActivity({
            type: "social_shared",
            userId: req.userId!,
            targetType: "profile",
            targetId: updated.id,
            message: `shared their ${displayPlatform}`,
            metadata: JSON.stringify({ url, platform: displayPlatform }),
            isPublic: true,
          });
        }
      }
    }

    res.json(updated);
  });

  // ----- PROFILE PHOTO UPLOADS -----
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = join(process.cwd(), "uploads", "profiles");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const ext = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
        cb(null, `${randomUUID()}.${ext}`);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB max
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
      }
    },
  });

  app.post("/api/profile/avatar", requireAuth, upload.single("avatar"), async (req: AuthedRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const url = `/uploads/profiles/${req.file.filename}`;
    const updated = storage.updateProfile(req.userId!, { avatarUrl: url });
    res.json({ url, profile: updated });
  });

  app.post("/api/profile/cover", requireAuth, upload.single("cover"), async (req: AuthedRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const url = `/uploads/profiles/${req.file.filename}`;
    const updated = storage.updateProfile(req.userId!, { coverUrl: url });
    res.json({ url, profile: updated });
  });

  // ----- PRODUCTIONS -----
  app.get("/api/productions", requireAuth, async (req: AuthedRequest, res: Response) => {
    const prods = storage.getProductionsByUser(req.userId!);
    res.json(prods);
  });

  app.post("/api/productions", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const prod = storage.createProduction({
        ...req.body,
        creatorId: req.userId!,
      });
      // Create activity: production started
      storage.createActivity({
        type: "production_created",
        userId: req.userId!,
        targetType: "production",
        targetId: prod.id,
        message: `started production "${prod.title}"`,
        isPublic: true,
      });
      res.status(201).json(prod);
    } catch (err) {
      res.status(500).json({ error: "Failed to create production" });
    }
  });

  app.get("/api/productions/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    const prod = storage.getProduction(parseInt(req.params.id));
    if (!prod) {
      return res.status(404).json({ error: "Production not found" });
    }
    const crew = storage.getCrewByProduction(prod.id);
    res.json({ production: prod, crew });
  });

  app.patch("/api/productions/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    const prod = storage.getProduction(parseInt(req.params.id));
    if (!prod || prod.creatorId !== req.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const updated = storage.updateProduction(prod.id, req.body);
    res.json(updated);
  });

  // ----- PRODUCTION CREW -----
  app.get("/api/productions/:id/crew", requireAuth, async (req: AuthedRequest, res: Response) => {
    const crew = storage.getCrewByProduction(parseInt(req.params.id));
    res.json(crew);
  });

  app.post("/api/productions/:id/crew", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const member = storage.addCrewMember({
        ...req.body,
        productionId: parseInt(req.params.id),
      });
      res.status(201).json(member);
    } catch (err) {
      res.status(500).json({ error: "Failed to add crew member" });
    }
  });

  app.patch("/api/crew/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    const updated = storage.updateCrewMember(parseInt(req.params.id), req.body);
    res.json(updated);
  });

  app.delete("/api/crew/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    storage.removeCrewMember(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ----- CREDITS -----
  app.get("/api/profiles/:handle/credits", async (req: AuthedRequest, res: Response) => {
    const profile = storage.getProfileByHandle(req.params.handle);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    const credits = storage.getCreditsByProfile(profile.id);
    res.json(credits);
  });

  app.post("/api/credits", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = storage.getProfile(req.userId!);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      const credit = storage.createCredit({
        ...req.body,
        profileId: profile.id,
      });
      res.status(201).json(credit);
    } catch (err) {
      res.status(500).json({ error: "Failed to create credit" });
    }
  });

  // ----- SEED DATA (dev only) -----
  app.post("/api/seed", async (_req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const seedUsers = [
        { handle: "sarahk", email: "sarah@test.com", displayName: "Sarah Kowalski", role: "Director of Photography", city: "Brooklyn", state: "NY", skills: ["RED Komodo", "Music Videos", "Narrative"], dayRate: 850, bio: "DP based in Brooklyn. 10+ years shooting indie features, music videos, and branded content.", reelUrl: "https://vimeo.com/sarahk" },
        { handle: "marcusl", email: "marcus@test.com", displayName: "Marcus Lee", role: "Director", city: "Atlanta", state: "GA", skills: ["Narrative", "Short Film", "Commercial"], dayRate: 1200, bio: "Award-winning indie director. Three films on the festival circuit.", reelUrl: "https://vimeo.com/marcuslee" },
        { handle: "jennyt", email: "jenny@test.com", displayName: "Jenny Torres", role: "1st AC", city: "Los Angeles", state: "CA", skills: ["ARRI Alexa", "Lens Maintenance", "Focus Pulling"], dayRate: 600, bio: "1st AC with 6 years on union and non-union sets. Fast, reliable, no drama.", reelUrl: "" },
        { handle: "davidw", email: "david@test.com", displayName: "David Washington", role: "Gaffer", city: "Atlanta", state: "GA", skills: ["Lighting Design", "LED Panels", "Rigging"], dayRate: 700, bio: "Gaffer and best boy available. Own a 1-ton grip truck.", reelUrl: "" },
        { handle: "ameliar", email: "amelia@test.com", displayName: "Amelia Rodriguez", role: "Production Designer", city: "Austin", state: "TX", skills: ["Set Design", "Props", "Art Direction"], dayRate: 800, bio: "Production designer for indie features and music videos. Art dept workflow specialist.", reelUrl: "" },
        { handle: "tommyh", email: "tommy@test.com", displayName: "Tommy Huang", role: "Sound Mixer", city: "New York", state: "NY", skills: ["Location Sound", "Boom Op", "Wireless Lav"], dayRate: 650, bio: "Production sound mixer with full kit. Based in NYC, travels.", reelUrl: "" },
      ];

      for (const u of seedUsers) {
        if (storage.getUserByHandle(u.handle)) continue;
        const user = storage.createUser({
          handle: u.handle,
          email: u.email,
          passwordHash: hashPassword("password123"),
        });
        storage.createProfile({
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
    } catch (err) {
      res.status(500).json({ error: "Seed failed" });
    }
  });

  // ----- BETA: Public request access -----
  app.post("/api/beta/request", async (req: AuthedRequest, res: Response) => {
    try {
      const { email, handle, displayName, role, city, message } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Check if already requested
      const existing = storage.getBetaRequests().find(r => r.email === email);
      if (existing) {
        return res.status(409).json({ error: "You're already on the waitlist", status: existing.status });
      }

      const betaReq = storage.createBetaRequest({ email, handle, displayName, role, city, message });
      res.status(201).json({ success: true, message: "Request received", id: betaReq.id });
    } catch (err) {
      res.status(500).json({ error: "Failed to submit request" });
    }
  });

  // Validate invite token (for auth page)
  app.get("/api/beta/invite/:token", async (req: AuthedRequest, res: Response) => {
    const invite = storage.getInviteByToken(req.params.token);
    if (!invite || invite.status !== "active" || invite.usedCount >= invite.maxUses) {
      return res.status(404).json({ valid: false });
    }
    res.json({
      valid: true,
      email: invite.email,
      displayName: invite.displayName,
      role: invite.role,
    });
  });

  // ----- BETA FEEDBACK (logged-in users) -----
  app.post("/api/feedback", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { category, message, pageUrl } = req.body;
      if (!category || !message) {
        return res.status(400).json({ error: "Category and message are required" });
      }
      const feedback = storage.createFeedback({
        userId: req.userId!,
        category,
        message,
        pageUrl,
      });
      res.status(201).json(feedback);
    } catch (err) {
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.get("/api/feedback/me", requireAuth, async (req: AuthedRequest, res: Response) => {
    const feedback = storage.getFeedbackByUser(req.userId!);
    res.json(feedback);
  });

  // ----- ADMIN: Beta Dashboard -----
  app.get("/api/admin/beta", requireAdmin, async (req: AuthedRequest, res: Response) => {
    const requests = storage.getBetaRequests();
    const invites = storage.getInvites();
    const allUsers = storage.getAllUsers();
    const feedback = storage.getFeedback();
    const activeMembers = allUsers.filter(u => u.accessStatus === "active" && !u.isAdmin);

    res.json({
      seats: {
        used: activeMembers.length,
        limit: BETA_SEAT_LIMIT,
        remaining: BETA_SEAT_LIMIT - activeMembers.length,
      },
      requests: {
        pending: requests.filter(r => r.status === "pending").length,
        approved: requests.filter(r => r.status === "approved" || r.status === "invited").length,
        activated: requests.filter(r => r.status === "activated").length,
        rejected: requests.filter(r => r.status === "rejected").length,
        total: requests.length,
      },
      invites: {
        active: invites.filter(i => i.status === "active").length,
        used: invites.filter(i => i.status === "used").length,
        revoked: invites.filter(i => i.status === "revoked").length,
        total: invites.length,
      },
      members: allUsers.map(u => ({
        id: u.id,
        handle: u.handle,
        email: u.email,
        isAdmin: u.isAdmin,
        accessStatus: u.accessStatus,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        invitedBy: u.invitedBy,
      })),
      feedback: feedback.map(f => ({
        id: f.id,
        userId: f.userId,
        category: f.category,
        message: f.message,
        pageUrl: f.pageUrl,
        status: f.status,
        createdAt: f.createdAt,
        adminNotes: f.adminNotes,
      })),
      pendingRequests: requests.filter(r => r.status === "pending"),
      allInvites: invites,
    });
  });

  // Approve a beta request → generates invite
  app.post("/api/admin/beta/requests/:id/approve", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const betaReq = storage.getBetaRequest(parseInt(req.params.id));
      if (!betaReq) {
        return res.status(404).json({ error: "Request not found" });
      }
      if (betaReq.status !== "pending") {
        return res.status(400).json({ error: "Request is not pending" });
      }

      const activeMembers = storage.getAllUsers().filter(u => u.accessStatus === "active" && !u.isAdmin);
      if (activeMembers.length >= BETA_SEAT_LIMIT) {
        return res.status(400).json({ error: "Beta seat limit reached" });
      }

      // Generate invite
      const token = randomBytes(32).toString("base64url");
      const invite = storage.createInvite({
        token,
        email: betaReq.email,
        displayName: betaReq.displayName,
        role: betaReq.role,
        createdBy: req.userId!,
        notes: `Auto-generated for request #${betaReq.id}`,
      });

      // Update request
      storage.updateBetaRequest(betaReq.id, {
        status: "invited",
        inviteId: invite.id,
        approvedAt: new Date(),
      });

      res.json({
        success: true,
        invite,
        inviteUrl: `#/auth?invite=${token}`,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to approve request" });
    }
  });

  // Reject a beta request
  app.post("/api/admin/beta/requests/:id/reject", requireAdmin, async (req: AuthedRequest, res: Response) => {
    const betaReq = storage.getBetaRequest(parseInt(req.params.id));
    if (!betaReq) {
      return res.status(404).json({ error: "Request not found" });
    }
    storage.updateBetaRequest(betaReq.id, { status: "rejected" });
    res.json({ success: true });
  });

  // Manually create an invite
  app.post("/api/admin/beta/invites", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { email, displayName, role, notes } = req.body;
      const token = randomBytes(32).toString("base64url");
      const invite = storage.createInvite({
        token,
        email,
        displayName,
        role,
        createdBy: req.userId!,
        notes,
      });
      res.json({ success: true, invite, inviteUrl: `#/auth?invite=${token}` });
    } catch (err) {
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  // Revoke an invite
  app.post("/api/admin/beta/invites/:id/revoke", requireAdmin, async (req: AuthedRequest, res: Response) => {
    storage.revokeInvite(parseInt(req.params.id));
    res.json({ success: true });
  });

  // Update user access (activate/revoke)
  app.patch("/api/admin/users/:id/access", requireAdmin, async (req: AuthedRequest, res: Response) => {
    const { status } = req.body;
    if (!["active", "revoked"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const user = storage.updateUserAccess(parseInt(req.params.id), status);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true, user: { id: user.id, handle: user.handle, accessStatus: user.accessStatus } });
  });

  // Update feedback status
  app.patch("/api/admin/feedback/:id", requireAdmin, async (req: AuthedRequest, res: Response) => {
    const { status, adminNotes } = req.body;
    const allFeedback = storage.getFeedback();
    const feedback = allFeedback.find(f => f.id === parseInt(req.params.id));
    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    // Use Drizzle ORM via storage (Forge correction: no raw SQL)
    storage.updateFeedbackStatus(feedback.id, status || feedback.status, adminNotes ?? feedback.adminNotes);
    res.json({ success: true });
  });

  // ===== FEED =====
  // Public feed (no auth required, public items only)
  app.get("/api/feed/public", async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const items = storage.getFeed(limit, 0, true);
    // Sanitize: only return safe fields, no emails
    const sanitized = items.map((item) => ({
      id: item.id,
      type: item.type,
      message: item.message,
      metadata: item.metadata,
      createdAt: item.createdAt,
      user: item.user ? { handle: item.user.handle } : null,
      profile: item.profile ? { displayName: item.profile.displayName, role: item.profile.role, city: item.profile.city, avatarUrl: item.profile.avatarUrl, avatarInitials: item.profile.avatarInitials } : null,
    }));
    const posts = storage.getPosts(limit).map((p) => ({
      id: p.id,
      body: p.body,
      linkUrl: p.linkUrl,
      createdAt: p.createdAt,
      user: p.user ? { handle: p.user.handle } : null,
      profile: p.profile ? { displayName: p.profile.displayName, role: p.profile.role, city: p.profile.city, avatarUrl: p.profile.avatarUrl, avatarInitials: p.profile.avatarInitials } : null,
    }));
    res.json({ activities: sanitized, posts });
  });

  // Authenticated feed ( richer data)
  app.get("/api/feed", requireAuth, async (req: AuthedRequest, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const items = storage.getFeed(limit);
    const posts = storage.getPosts(limit);
    res.json({ activities: items, posts });
  });

  // Create a post
  app.post("/api/feed/posts", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { body, linkUrl, visibility } = req.body;
      if (!body || !body.trim()) {
        return res.status(400).json({ error: "Post body is required" });
      }
      if (body.length > 2000) {
        return res.status(400).json({ error: "Post is too long (max 2000 characters)" });
      }
      const post = storage.createPost({
        userId: req.userId!,
        body: body.trim(),
        linkUrl: linkUrl || null,
        visibility: visibility || "public",
      });
      // Create activity: post shared
      storage.createActivity({
        type: "post_shared",
        userId: req.userId!,
        targetType: "post",
        targetId: post.id,
        message: "shared an update",
        isPublic: true,
      });
      res.status(201).json(post);
    } catch (err) {
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  // ===== INDUSTRY NEWS =====
  const NEWS_FEEDS = [
    { name: "IndieWire", url: "https://www.indiewire.com/feed/", category: "Industry" },
    { name: "Deadline", url: "https://deadline.com/feed/", category: "Industry" },
    { name: "Variety", url: "https://variety.com/feed/", category: "Industry" },
    { name: "Filmmaker Magazine", url: "https://filmmakermagazine.com/feed/", category: "Craft" },
    { name: "No Film School", url: "https://nofilmschool.com/feed", category: "Craft" },
    { name: "MovieMaker", url: "https://www.moviemaker.com/feed/", category: "Craft" },
  ];

  let newsCache: { items: any[]; fetchedAt: number } | null = null;
  const NEWS_CACHE_TTL = parseInt(process.env.NEWS_CACHE_TTL_MS || "10800000", 10); // default 3 hours

  function decodeEntities(str: string): string {
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
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
  }

  function stripHtml(html: string): string {
    return decodeEntities(html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 280));
  }

  function parseRssItems(xml: string, source: string, category: string) {
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] || block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
      const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || "";
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || "";
      const desc = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] || block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "";
      const date = pubDate ? new Date(pubDate).getTime() : Date.now();
      items.push({
        title: decodeEntities(title.trim()),
        link: link.trim(),
        description: stripHtml(desc),
        source,
        category,
        pubDate: date,
      });
    }
    return items;
  }

  app.get("/api/feed/news", async (req: Request, res: Response) => {
    try {
      if (newsCache && Date.now() - newsCache.fetchedAt < NEWS_CACHE_TTL) {
        return res.json(newsCache.items);
      }

      const results = await Promise.allSettled(
        NEWS_FEEDS.map(async (feed) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          try {
            const resp = await fetch(feed.url, {
              signal: controller.signal,
              headers: { "User-Agent": "Mozilla/5.0 (compatible; TheFVC/1.0)" },
            });
            const xml = await resp.text();
            return parseRssItems(xml, feed.name, feed.category);
          } catch (e) {
            console.error(`[news] Failed to fetch ${feed.name}:`, (e as Error).message);
            return [];
          } finally {
            clearTimeout(timeout);
          }
        })
      );

      const allItems = results
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
        .flatMap((r) => r.value)
        .sort((a, b) => b.pubDate - a.pubDate)
        .slice(0, 30);

      newsCache = { items: allItems, fetchedAt: Date.now() };
      res.json(allItems);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch news" });
    }
  });

  // ===== PRD-010: LEGAL & COMPLIANCE =====

  // Security audit log (admin only)
  app.get("/api/compliance/security-log", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { userId, action, limit, since } = req.query as Record<string, string>;
      const events = storage.getSecurityLog({
        userId: userId ? parseInt(userId) : undefined,
        action: action,
        limit: limit ? parseInt(limit) : 100,
        since: since ? new Date(since) : undefined,
      });
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch security log" });
    }
  });

  // Blocked IPs (admin only)
  app.get("/api/compliance/blocked-ips", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const ips = storage.getActiveBlockedIps();
      res.json(ips);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch blocked IPs" });
    }
  });

  // ===== PRD-013: EMAIL INFRASTRUCTURE =====

  // Email queue stats (admin only)
  app.get("/api/email/stats", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { getEmailStats } = await import("./email/queue");
      const stats = await getEmailStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch email stats" });
    }
  });

  // ===== PRD-011: ACCOUNT & SETTINGS =====

  // Password reset request
  app.post("/api/auth/password-reset/request", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      const user = storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal whether email exists
        return res.json({ success: true, message: "If the email exists, a reset link will be sent." });
      }
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      storage.createPasswordReset({
        userId: user.id,
        token,
        expiresAt,
        used: false,
      });
      // Queue the email
      const { queueEmail } = await import("./email/queue");
      const { passwordResetTemplate } = await import("./email/templates");
      queueEmail({
        to: email,
        subject: "Password Reset Request",
        html: passwordResetTemplate({
          resetUrl: `${process.env.FRONTEND_URL || "https://thefvc.is"}/reset-password?token=${token}`,
          userHandle: user.displayName || user.handle,
        }).html,
        metadata: { type: "password_reset", userId: user.id },
      });
      // Log security event
      storage.createSecurityLog({
        userId: user.id,
        action: "password_reset_requested",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        success: true,
      });
      res.json({ success: true, message: "If the email exists, a reset link will be sent." });
    } catch (err) {
      res.status(500).json({ error: "Failed to process password reset" });
    }
  });

  // Password reset confirmation
  app.post("/api/auth/password-reset/confirm", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ error: "Token and password are required" });
      }
      const reset = storage.getPasswordResetByToken(token);
      if (!reset || reset.expiresAt < new Date() || reset.used) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }
      const user = storage.getUser(reset.userId);
      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }
      storage.updateUser(user.id, { passwordHash: hashPassword(password) });
      storage.markPasswordResetUsed(reset.id);
      storage.createSecurityLog({
        userId: user.id,
        action: "password_reset_completed",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        success: true,
      });
      res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Email verification request
  app.post("/api/auth/email-verification/request", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      storage.createEmailVerification({
        userId: user.id,
        email: user.email,
        token,
        expiresAt,
        used: false,
      });
      const { queueEmail } = await import("./email/queue");
      const { emailVerificationTemplate } = await import("./email/templates");
      queueEmail({
        to: user.email,
        subject: "Email Verification",
        html: emailVerificationTemplate({
          verificationUrl: `${process.env.FRONTEND_URL || "https://thefvc.is"}/verify-email?token=${token}`,
          userHandle: user.displayName || user.handle,
        }).html,
        metadata: { type: "email_verification", userId: user.id },
      });
      storage.createSecurityLog({
        userId: user.id,
        action: "email_verification_requested",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        success: true,
      });
      res.json({ success: true, message: "Verification email sent." });
    } catch (err) {
      res.status(500).json({ error: "Failed to send verification email" });
    }
  });

  // Email verification confirmation
  app.post("/api/auth/email-verification/confirm", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }
      const verification = storage.getEmailVerificationByToken(token);
      if (!verification || verification.expiresAt < new Date() || verification.used) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }
      storage.markEmailVerificationUsed(verification.id);
      storage.createSecurityLog({
        userId: verification.userId,
        action: "email_verified",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        success: true,
      });
      res.json({ success: true, message: "Email verified successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // ===== PRD-015: REPORTING & ANALYTICS =====

  // Log an analytics event
  app.post("/api/analytics/event", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { eventType, eventName, properties, sessionId } = req.body;
      if (!eventType) {
        return res.status(400).json({ error: "eventType is required" });
      }
      storage.createAnalyticsEvent({
        userId: req.userId,
        eventType,
        eventName: eventName || undefined,
        properties: JSON.stringify(properties || {}),
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        sessionId: sessionId || undefined,
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to log analytics event" });
    }
  });

  // Get analytics events (admin only)
  app.get("/api/analytics/events", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { userId, eventType, limit, since } = req.query as Record<string, string>;
      const events = storage.getAnalyticsEvents({
        userId: userId ? parseInt(userId) : undefined,
        eventType: eventType,
        limit: limit ? parseInt(limit) : 100,
        since: since ? new Date(since) : undefined,
      });
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch analytics events" });
    }
  });

  // Get analytics summary (admin only)
  app.get("/api/analytics/summary", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { since } = req.query as Record<string, string>;
      const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { getAnalyticsSummary } = await import("./analytics");
      const summary = await getAnalyticsSummary(sinceDate);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch analytics summary" });
    }
  });

  // ===== PRD-009: NOTIFICATIONS API =====
  // Get user's notifications
  app.get("/api/notifications", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { limit, unreadOnly } = req.query as Record<string, string>;
      const notifications = storage.getNotifications(
        req.userId!,
        limit ? parseInt(limit) : 50,
        unreadOnly === "true"
      );
      res.json(notifications);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Get unread notification count
  app.get("/api/notifications/unread-count", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const count = storage.getUnreadNotificationCount(req.userId!);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Mark a notification as read
  app.post("/api/notifications/:id/read", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      storage.markNotificationRead(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/read-all", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      storage.markAllNotificationsRead(req.userId!);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // Delete a notification
  app.delete("/api/notifications/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      storage.deleteNotification(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // ===== PRD-006: Crew Finder Pagination Endpoint =====
  app.get("/api/profiles/paginated", async (req: AuthedRequest, res: Response) => {
    const opts = {
      role: req.query.role as string | undefined,
      city: req.query.city as string | undefined,
      skill: req.query.skill as string | undefined,
      availability: req.query.availability as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortDir: req.query.sortDir as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const result = storage.searchProfilesPaginated(opts);
    res.json(result);
  });

  // ===== PRD-007: Payments & Monetization =====

  // --- Subscription Tiers ---
  app.get("/api/subscription-tiers", async (_req: AuthedRequest, res: Response) => {
    const tiers = storage.getSubscriptionTiers(true);
    res.json(tiers);
  });

  app.get("/api/subscription-tiers/:name", async (req: AuthedRequest, res: Response) => {
    const tier = storage.getSubscriptionTier(req.params.name);
    if (!tier) {
      return res.status(404).json({ error: "Tier not found" });
    }
    res.json(tier);
  });

  // --- Subscription Management (PRD-020) ---
  app.get("/api/subscription", requireAuth, async (req: AuthedRequest, res: Response) => {
    const profile = storage.getProfile(req.userId!);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json({
      tier: profile.subscriptionTier,
      status: profile.subscriptionStatus,
      stripeCustomerId: profile.stripeCustomerId,
    });
  });

  app.post("/api/subscription/checkout", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { tierName } = req.body;
      if (!tierName) {
        return res.status(400).json({ error: "Tier name is required" });
      }
      const tier = storage.getSubscriptionTier(tierName);
      if (!tier || !tier.stripePriceId) {
        return res.status(404).json({ error: "Tier not found or not available for purchase" });
      }
      // PRD-019: Create Stripe Checkout Session
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "[REDACTED]", {
        apiVersion: "2023-10-16",
      });
      const profile = storage.getProfile(req.userId!);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: tier.stripePriceId, quantity: 1 }],
        customer_email: profile.stripeCustomerId || undefined,
        success_url: `${process.env.FRONTEND_URL || "https://thefvc.is"}/app/payments?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || "https://thefvc.is"}/app/payments`,
        metadata: { userId: String(req.userId!), tierName },
      });
      res.json({ checkoutUrl: session.url });
    } catch (err) {
      console.error("Checkout error:", err);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/subscription/cancel", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = storage.getProfile(req.userId!);
      if (!profile || !profile.stripeCustomerId) {
        return res.status(404).json({ error: "No active subscription found" });
      }
      // PRD-019: Cancel subscription via Stripe API
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "[REDACTED]", {
        apiVersion: "2023-10-16",
      });
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripeCustomerId,
        limit: 1,
      });
      if (subscriptions.data.length > 0) {
        await stripe.subscriptions.cancel(subscriptions.data[0].id, {
          invoice_now: true,
          prorate: true,
        });
      }
      storage.updateProfileSubscription(req.userId!, {
        subscriptionStatus: "canceled",
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Cancel subscription error:", err);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  // --- Payments ---
  app.get("/api/payments", requireAuth, async (req: AuthedRequest, res: Response) => {
    // PRD-018: Audit log
    storage.createSecurityLog({
      userId: req.userId!,
      action: "payments_accessed",
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || "",
      details: JSON.stringify({ limit: req.query.limit }),
    });
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const payments = storage.getPaymentsByUser(req.userId!, limit);
    res.json(payments);
  });

  app.get("/api/payments/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    // PRD-018: Audit log
    storage.createSecurityLog({
      userId: req.userId!,
      action: "payment_accessed",
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || "",
      details: JSON.stringify({ paymentId: req.params.id }),
    });
    const payment = storage.getPayment(parseInt(req.params.id));
    if (!payment || payment.userId !== req.userId) {
      return res.status(404).json({ error: "Payment not found" });
    }
    res.json(payment);
  });

  // --- W-9 Forms ---
  app.get("/api/w9", requireAuth, async (req: AuthedRequest, res: Response) => {
    // PRD-018: Audit log for W-9 access
    storage.createSecurityLog({
      userId: req.userId!,
      action: "w9_accessed",
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || "",
      details: JSON.stringify({ action: "view" }),
    });
    const form = storage.getW9Form(req.userId!);
    if (!form) {
      return res.status(404).json({ error: "No W-9 form on file" });
    }
    // PRD-018: Decrypt tax ID for display (masked)
    const decryptedTaxId = decryptSensitive(form.einOrSsn);
    res.json({ ...form, einOrSsn: decryptedTaxId ? maskTaxId(decryptedTaxId) : "***-***-****" });
  });

  app.post("/api/w9", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { fullName, businessName, taxClassification, einOrSsn, address, city, state, zipCode } = req.body;
      if (!fullName || !taxClassification || !einOrSsn || !address || !city || !state || !zipCode) {
        return res.status(400).json({ error: "All required fields must be provided" });
      }
      // PRD-018: Validate tax ID format
      if (!isValidTaxId(einOrSsn)) {
        return res.status(400).json({ error: "Invalid tax ID format. Use EIN (XX-XXXXXXX) or SSN (XXX-XX-XXXX)." });
      }
      // PRD-018: Encrypt tax ID before storage
      const encryptedTaxId = encryptSensitive(einOrSsn);
      const existing = storage.getW9Form(req.userId!);
      let form;
      if (existing) {
        form = storage.updateW9Form(req.userId!, {
          fullName, businessName, taxClassification, einOrSsn: encryptedTaxId, address, city, state, zipCode,
          submittedAt: new Date(),
        });
      } else {
        form = storage.createW9Form({
          userId: req.userId!,
          fullName, businessName, taxClassification, einOrSsn: encryptedTaxId, address, city, state, zipCode,
          submittedAt: new Date(),
        });
      }
      // PRD-018: Audit log
      storage.createSecurityLog({
        userId: req.userId!,
        action: "w9_submitted",
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || "",
        details: JSON.stringify({ fullName, hasBusinessName: !!businessName }),
      });
      // Update profile flag
      storage.updateProfileSubscription(req.userId!, { w9Collected: true });
      res.status(201).json({ ...form, einOrSsn: maskTaxId(einOrSsn) });
    } catch (err) {
      res.status(500).json({ error: "Failed to save W-9 form" });
    }
  });

  app.get("/api/w9/forms", requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    const status = req.query.status as string | undefined;
    const forms = storage.getW9Forms(status);
    // PRD-018: Decrypt tax IDs for admin display (masked)
    const decryptedForms = forms.map((form) => ({
      ...form,
      einOrSsn: form.einOrSsn ? maskTaxId(decryptSensitive(form.einOrSsn) || "") : "***-***-****",
    }));
    res.json(decryptedForms);
  });

  // --- Stripe Connect ---
  app.post("/api/stripe/connect-account", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      // PRD-018: Audit log
      storage.createSecurityLog({
        userId: req.userId!,
        action: "stripe_connect_initiated",
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || "",
        details: JSON.stringify({}),
      });
      // PRD-019: Create real Stripe Connect account
      const user = storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const stripeAccountId = await createStripeConnectAccount(req.userId!, user.email);
      // Generate onboarding link
      const onboardingLink = await createAccountLink(
        stripeAccountId,
        `${process.env.FRONTEND_URL || "https://thefvc.is"}/app/payments`,
        `${process.env.FRONTEND_URL || "https://thefvc.is"}/app/payments`
      );
      res.json({ stripeAccountId, onboardingLink, onboardingComplete: false });
    } catch (err) {
      console.error("Stripe Connect error:", err);
      res.status(500).json({ error: "Failed to create Stripe Connect account" });
    }
  });

  app.post("/api/stripe/onboarding-complete", requireAuth, async (req: AuthedRequest, res: Response) => {
    storage.createSecurityLog({
      userId: req.userId!,
      action: "stripe_onboarding_complete",
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || "",
      details: JSON.stringify({}),
    });
    storage.updateProfileSubscription(req.userId!, {
      subscriptionStatus: "active",
    });
    res.json({ success: true });
  });

  // PRD-019: Stripe webhook endpoint
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    if (!sig) {
      return res.status(400).json({ error: "Missing Stripe signature" });
    }

    let event: Stripe.Event;
    try {
      // Use raw body for webhook signature verification
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        return res.status(400).json({ error: "Missing raw body for webhook" });
      }
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || "[REDACTED]"
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).json({ error: "Invalid signature" });
    }

    await handleStripeWebhook(event);
    res.json({ received: true });
  });

  // --- Tax Export (PRD-007) ---
  app.get("/api/admin/tax-export", requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    // PRD-018: Audit log for tax export
    storage.createSecurityLog({
      userId: req.userId!,
      action: "tax_export_accessed",
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || "",
      details: JSON.stringify({ year: req.query.year }),
    });
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const payments = storage.getAllPayments(10000); // admin fetch all
    const w9Forms = storage.getW9Forms("verified");

    // Filter payments by year
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd = new Date(year, 11, 31).getTime();
    const yearPayments = payments.filter((p) => {
      const ts = new Date(p.createdAt).getTime();
      return ts >= yearStart && ts <= yearEnd;
    });

    // Build tax export data
    const exportData = yearPayments.map((p) => {
      const profile = storage.getProfile(p.userId);
      const user = storage.getUser(p.userId);
      const w9 = w9Forms.find((w) => w.userId === p.userId);
      return {
        paymentId: p.id,
        userId: p.userId,
        displayName: profile?.displayName || "",
        email: user?.email || "",
        taxId: w9?.einOrSsn ? maskTaxId(decryptSensitive(w9.einOrSsn) || "") : "",
        legalName: w9?.fullName || profile?.displayName || "",
        address: w9?.address || "",
        city: w9?.city || "",
        state: w9?.state || "",
        zipCode: w9?.zipCode || "",
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        description: p.description || "",
        createdAt: p.createdAt,
      };
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="tax-export-${year}.json"`);
    res.json({ year, count: exportData.length, data: exportData });
  });

  // PRD-022: Data Privacy & GDPR/CCPA Compliance
  app.get("/api/data/export", requireAuth, async (req: AuthedRequest, res: Response) => {
    // PRD-018: Audit log
    storage.createSecurityLog({
      userId: req.userId!,
      action: "data_export_requested",
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || "",
      details: JSON.stringify({}),
    });

    const user = storage.getUser(req.userId!);
    const profile = storage.getProfile(req.userId!);
    const payments = storage.getPaymentsByUser(req.userId!, 1000);
    const w9 = storage.getW9Form(req.userId!);
    const feedback = storage.getFeedbackByUser(req.userId!);

    const exportData = {
      user: {
        id: user?.id,
        handle: user?.handle,
        email: user?.email,
        accessStatus: user?.accessStatus,
        createdAt: user?.createdAt,
      },
      profile: {
        displayName: profile?.displayName,
        role: profile?.role,
        city: profile?.city,
        state: profile?.state,
        country: profile?.country,
        bio: profile?.bio,
        dayRate: profile?.dayRate,
        skills: profile?.skills,
        availability: profile?.availability,
        subscriptionTier: profile?.subscriptionTier,
        subscriptionStatus: profile?.subscriptionStatus,
      },
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        description: p.description,
        createdAt: p.createdAt,
      })),
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
      feedback: feedback.map((f) => ({
        category: f.category,
        message: f.message,
        createdAt: f.createdAt,
      })),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="data-export-${req.userId}.json"`);
    res.json(exportData);
  });

  app.delete("/api/data/delete", requireAuth, async (req: AuthedRequest, res: Response) => {
    // PRD-018: Audit log for deletion request
    storage.createSecurityLog({
      userId: req.userId!,
      action: "data_deletion_requested",
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || "",
      details: JSON.stringify({}),
    });

    // Check for active subscriptions
    const profile = storage.getProfile(req.userId!);
    if (profile?.subscriptionStatus === "active") {
      return res.status(400).json({
        error: "Cannot delete account with active subscription. Cancel subscription first.",
      });
    }

    // Check for pending payments
    const payments = storage.getPaymentsByUser(req.userId!, 100);
    const pendingPayments = payments.filter((p) => p.status === "pending" || p.status === "processing");
    if (pendingPayments.length > 0) {
      return res.status(400).json({
        error: "Cannot delete account with pending payments.",
      });
    }

    // Soft-delete: mark user as deleted but retain data for legal/compliance reasons
    // (IRS requires 7-year retention for tax records)
    const user = storage.getUser(req.userId!);
    if (user) {
      // Update user record
      storage.updateUser(req.userId!, {
        email: `deleted_${user.id}_${Date.now()}@deleted.thefvc.is`,
        accessStatus: "revoked" as any,
      });
      // Clear session
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        storage.deleteSession(token);
      }
    }

    res.json({ success: true, message: "Account data marked for deletion. Tax records retained per IRS requirements." });
  });

  // PRD-022: Cookie consent
  app.post("/api/consent/cookie", async (req: AuthedRequest, res: Response) => {
    const { analytics, marketing } = req.body;
    // Store consent in security audit log
    storage.createSecurityLog({
      userId: req.userId || 0,
      action: "consent_given",
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || "",
      details: JSON.stringify({ analytics, marketing }),
    });
    res.json({ success: true });
  });

  // PRD-021: 1099 Form Generation
  app.get("/api/admin/1099-eligible", requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear() - 1;
    const eligible = get1099EligibleContractors(year);
    res.json(eligible);
  });

  app.get("/api/admin/1099-forms", requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear() - 1;
    const forms = generate1099Forms(year);
    res.json(forms.map((f) => generate1099NECData(f)));
  });

  app.get("/api/admin/1099-export", requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear() - 1;
    const forms = generate1099Forms(year);
    const exportData = forms.map((f) => generate1099NECData(f));

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="1099-forms-${year}.json"`);
    res.json({ year, count: exportData.length, forms: exportData });
  });

  return httpServer;
}
