/**
 * Member network: Follow (one-way, instant), Connect (two-way, request then
 * accept) and Block. Identity always comes from req.userId; the other member
 * is named by handle in the path.
 *
 * Policy (see CLAUDE.md "Member network"): messaging and crew-adding are NOT
 * gated by Connect, so existing conversations and productions are untouched.
 * Connect adds a crew shortcut; Block is the only thing that stops messages.
 */
import type { Express, Response } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, storage } from "./storage";
import { follows, memberConnections, memberBlocks, activityFeed, feedPosts, type User } from "@shared/schema";
import { requireAuth, type AuthedRequest } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";

const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** True when either member has blocked the other. */
export function isBlockedEitherWay(a: number, b: number): boolean {
  return !!db
    .select({ id: memberBlocks.id })
    .from(memberBlocks)
    .where(or(
      and(eq(memberBlocks.blockerId, a), eq(memberBlocks.blockedId, b)),
      and(eq(memberBlocks.blockerId, b), eq(memberBlocks.blockedId, a)),
    ))
    .get();
}

function findConnection(a: number, b: number) {
  return db
    .select()
    .from(memberConnections)
    .where(or(
      and(eq(memberConnections.requesterId, a), eq(memberConnections.addresseeId, b)),
      and(eq(memberConnections.requesterId, b), eq(memberConnections.addresseeId, a)),
    ))
    .get();
}

/** The member card the network pages show. Never includes email or other private columns. */
function card(user: User) {
  const p = storage.getProfile(user.id);
  return {
    handle: user.handle,
    displayName: p?.displayName || user.handle,
    role: p?.role ?? null,
    city: p?.city ?? null,
    avatarUrl: p?.avatarUrl ?? null,
    avatarInitials: p?.avatarInitials ?? null,
  };
}

function cards(ids: number[]) {
  return ids
    .map((id) => storage.getUser(id))
    .filter((u): u is User => !!u && u.accessStatus === "active")
    .map(card);
}

function relationship(me: number, other: number) {
  const conn = findConnection(me, other);
  const connection = !conn
    ? "none"
    : conn.status === "accepted"
      ? "connected"
      : conn.requesterId === me
        ? "pending_out"
        : "pending_in";
  return {
    following: !!db.select({ id: follows.id }).from(follows)
      .where(and(eq(follows.followerId, me), eq(follows.followeeId, other))).get(),
    followedBy: !!db.select({ id: follows.id }).from(follows)
      .where(and(eq(follows.followerId, other), eq(follows.followeeId, me))).get(),
    connection,
    blocked: !!db.select({ id: memberBlocks.id }).from(memberBlocks)
      .where(and(eq(memberBlocks.blockerId, me), eq(memberBlocks.blockedId, other))).get(),
  };
}

function notify(userId: number, type: string, title: string, fromHandle: string) {
  storage.createNotification({
    userId,
    type,
    title,
    message: null,
    linkUrl: "/app/network",
    metadata: JSON.stringify({ fromHandle }),
  } as any);
}

export function registerNetworkRoutes(app: Express) {
  app.use("/api/network", rateLimit({ windowMs: 60 * 1000, max: 60, identifier: "network" }));

  /**
   * Resolve the other member for follow/connect. One "Member not found" answer
   * covers: unknown handle, inactive, yourself, private profile, and blocked
   * either way, so none of those can be probed.
   */
  function resolveTarget(req: AuthedRequest, res: Response): User | null {
    const me = req.userId!;
    const other = storage.getUserByHandle(param(req.params.handle));
    const profile = other ? storage.getProfile(other.id) : undefined;
    const ok =
      other && other.id !== me && other.accessStatus === "active" &&
      profile?.isPublic !== false &&
      !isBlockedEitherWay(me, other.id);
    if (!ok) {
      res.status(404).json({ error: "Member not found." });
      return null;
    }
    return other;
  }

  const myName = (me: number) => storage.getProfile(me)?.displayName || storage.getUser(me)!.handle;

  // ----- Follow -----
  app.post("/api/network/follow/:handle", requireAuth, (req: AuthedRequest, res: Response) => {
    const other = resolveTarget(req, res);
    if (!other) return;
    const me = req.userId!;
    const inserted = db.insert(follows).values({ followerId: me, followeeId: other.id }).onConflictDoNothing().returning().get();
    if (inserted) notify(other.id, "follow", `${myName(me)} followed you`, storage.getUser(me)!.handle);
    res.json(relationship(me, other.id));
  });

  app.delete("/api/network/follow/:handle", requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.userId!;
    const other = storage.getUserByHandle(param(req.params.handle));
    if (!other) return res.status(404).json({ error: "Member not found." });
    db.delete(follows).where(and(eq(follows.followerId, me), eq(follows.followeeId, other.id))).run();
    res.json(relationship(me, other.id));
  });

  // ----- Connect -----
  app.post("/api/network/connect/:handle", requireAuth, (req: AuthedRequest, res: Response) => {
    const other = resolveTarget(req, res);
    if (!other) return;
    const me = req.userId!;
    const myHandle = storage.getUser(me)!.handle;
    const existing = findConnection(me, other.id);
    if (!existing) {
      db.insert(memberConnections).values({ requesterId: me, addresseeId: other.id }).run();
      notify(other.id, "connection_request", `${myName(me)} wants to connect`, myHandle);
    } else if (existing.status === "pending" && existing.addresseeId === me) {
      // They already asked us: asking back is the same as accepting.
      db.update(memberConnections).set({ status: "accepted", respondedAt: new Date() })
        .where(eq(memberConnections.id, existing.id)).run();
      notify(other.id, "connection_accepted", `${myName(me)} accepted your connection`, myHandle);
    }
    res.json(relationship(me, other.id));
  });

  // Accepting/declining only ever touches a request addressed to the caller.
  app.post("/api/network/requests/:handle/accept", requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.userId!;
    const other = storage.getUserByHandle(param(req.params.handle));
    const conn = other && !isBlockedEitherWay(me, other.id) ? findConnection(me, other.id) : undefined;
    if (!other || !conn || conn.status !== "pending" || conn.addresseeId !== me) {
      return res.status(404).json({ error: "Request not found." });
    }
    db.update(memberConnections).set({ status: "accepted", respondedAt: new Date() })
      .where(eq(memberConnections.id, conn.id)).run();
    notify(other.id, "connection_accepted", `${myName(me)} accepted your connection`, storage.getUser(me)!.handle);
    res.json(relationship(me, other.id));
  });

  app.post("/api/network/requests/:handle/decline", requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.userId!;
    const other = storage.getUserByHandle(param(req.params.handle));
    const conn = other ? findConnection(me, other.id) : undefined;
    if (!other || !conn || conn.status !== "pending" || conn.addresseeId !== me) {
      return res.status(404).json({ error: "Request not found." });
    }
    // Deleted rather than flagged: a decline is silent and the sender may ask again later.
    db.delete(memberConnections).where(eq(memberConnections.id, conn.id)).run();
    res.json(relationship(me, other.id));
  });

  // Cancel your own pending request, or disconnect an accepted one (either side).
  app.delete("/api/network/connect/:handle", requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.userId!;
    const other = storage.getUserByHandle(param(req.params.handle));
    if (!other) return res.status(404).json({ error: "Member not found." });
    const conn = findConnection(me, other.id);
    if (conn && (conn.status === "accepted" || conn.requesterId === me)) {
      db.delete(memberConnections).where(eq(memberConnections.id, conn.id)).run();
    }
    res.json(relationship(me, other.id));
  });

  // ----- Block -----
  app.post("/api/network/block/:handle", requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.userId!;
    const other = storage.getUserByHandle(param(req.params.handle));
    if (!other || other.id === me) return res.status(404).json({ error: "Member not found." });
    db.transaction((tx) => {
      tx.insert(memberBlocks).values({ blockerId: me, blockedId: other.id }).onConflictDoNothing().run();
      // A block severs every relationship in both directions.
      tx.delete(follows).where(or(
        and(eq(follows.followerId, me), eq(follows.followeeId, other.id)),
        and(eq(follows.followerId, other.id), eq(follows.followeeId, me)),
      )).run();
      tx.delete(memberConnections).where(or(
        and(eq(memberConnections.requesterId, me), eq(memberConnections.addresseeId, other.id)),
        and(eq(memberConnections.requesterId, other.id), eq(memberConnections.addresseeId, me)),
      )).run();
    });
    res.json(relationship(me, other.id));
  });

  app.delete("/api/network/block/:handle", requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.userId!;
    const other = storage.getUserByHandle(param(req.params.handle));
    if (!other) return res.status(404).json({ error: "Member not found." });
    db.delete(memberBlocks).where(and(eq(memberBlocks.blockerId, me), eq(memberBlocks.blockedId, other.id))).run();
    res.json(relationship(me, other.id));
  });

  // ----- Read -----
  app.get("/api/network/status/:handle", requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.userId!;
    const other = storage.getUserByHandle(param(req.params.handle));
    if (!other || other.accessStatus !== "active") return res.status(404).json({ error: "Member not found." });
    if (other.id === me) return res.json({ self: true });
    const rel = relationship(me, other.id);
    // If they blocked us we only say "can't", never who blocked whom.
    const canAct = !isBlockedEitherWay(me, other.id) && storage.getProfile(other.id)?.isPublic !== false;
    res.json({ self: false, ...rel, canFollowOrConnect: canAct });
  });

  app.get("/api/network", requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.userId!;
    const followers = db.select().from(follows).where(eq(follows.followeeId, me)).orderBy(desc(follows.createdAt)).all();
    const following = db.select().from(follows).where(eq(follows.followerId, me)).orderBy(desc(follows.createdAt)).all();
    const conns = db.select().from(memberConnections)
      .where(or(eq(memberConnections.requesterId, me), eq(memberConnections.addresseeId, me))).all();
    const blocks = db.select().from(memberBlocks).where(eq(memberBlocks.blockerId, me)).all();
    const otherOf = (c: { requesterId: number; addresseeId: number }) => (c.requesterId === me ? c.addresseeId : c.requesterId);
    res.json({
      followers: cards(followers.map((f) => f.followerId)),
      following: cards(following.map((f) => f.followeeId)),
      connections: cards(conns.filter((c) => c.status === "accepted").map(otherOf)),
      incoming: cards(conns.filter((c) => c.status === "pending" && c.addresseeId === me).map(otherOf)),
      outgoing: cards(conns.filter((c) => c.status === "pending" && c.requesterId === me).map(otherOf)),
      blocked: cards(blocks.map((b) => b.blockedId)),
    });
  });

  // Recent activity and posts from the members you follow.
  app.get("/api/network/feed", requireAuth, (req: AuthedRequest, res: Response) => {
    const ids = db.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, req.userId!)).all().map((r) => r.id);
    if (ids.length === 0) return res.json({ activities: [], posts: [] });
    const shape = <T extends { userId: number }>(row: T) => {
      const u = storage.getUser(row.userId);
      const p = u ? storage.getProfile(u.id) : undefined;
      return {
        ...row,
        user: u ? { handle: u.handle } : null,
        profile: p ? { displayName: p.displayName, role: p.role, city: p.city, avatarUrl: p.avatarUrl, avatarInitials: p.avatarInitials } : null,
      };
    };
    const activities = db.select().from(activityFeed).where(inArray(activityFeed.userId, ids))
      .orderBy(desc(activityFeed.createdAt)).limit(50).all().map(shape);
    const posts = db.select().from(feedPosts).where(inArray(feedPosts.userId, ids))
      .orderBy(desc(feedPosts.createdAt)).limit(50).all().map(shape);
    res.json({ activities, posts });
  });
}
