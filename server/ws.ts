/**
 * WebSocket server (PRD-009: Real-Time & WebSocket).
 *
 * Pulled out of server/index.ts so server/routes.ts can import
 * `broadcastToUser` without importing server/index.ts itself — see
 * server/lib/logger.ts for why that circular import was a problem.
 *
 * server/index.ts wires this into the HTTP server's "upgrade" event; this
 * module has no dependency on the Express app or HTTP server instance
 * itself, only on `storage`.
 */
import type { Request } from "express";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { storage } from "./storage";

export interface WsClient {
  userId: number;
  ws: WebSocket;
}

// Map of userId -> Set of WebSocket connections
const wsClients = new Map<number, Set<WebSocket>>();

export function broadcastToUser(userId: number, data: any) {
  const clients = wsClients.get(userId);
  if (clients) {
    const msg = JSON.stringify(data);
    clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    });
  }
}

export function broadcastToAll(data: any) {
  const msg = JSON.stringify(data);
  wsClients.forEach((clients) => {
    clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    });
  });
}

export const wss = new WebSocketServer({
  noServer: true,
  path: "/ws",
});

wss.on("connection", (ws: WebSocket, request: Request) => {
  // Authenticate via token query param or Authorization header
  const url = new URL(request.url || "", "http://localhost");
  const token = url.searchParams.get("token") || request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    ws.close(4001, "Authentication required");
    return;
  }

  const session = storage.getSessionByToken(token);
  if (!session || session.expiresAt < new Date()) {
    ws.close(4001, "Invalid or expired token");
    return;
  }

  const userId = session.userId;

  // Register client
  if (!wsClients.has(userId)) {
    wsClients.set(userId, new Set());
  }
  wsClients.get(userId)!.add(ws);

  // Send unread notification count on connect
  const unreadCount = storage.getUnreadNotificationCount(userId);
  ws.send(JSON.stringify({ type: "unread_count", count: unreadCount }));

  ws.on("message", (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      // Handle client messages (e.g., ping, subscribe, mark_read)
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      } else if (msg.type === "mark_read") {
        if (msg.id) {
          storage.markNotificationRead(msg.id);
        } else if (msg.all) {
          storage.markAllNotificationsRead(userId);
        }
        const count = storage.getUnreadNotificationCount(userId);
        ws.send(JSON.stringify({ type: "unread_count", count }));
      } else if (msg.type === "fetch_notifications") {
        const notifications = storage.getNotifications(userId, msg.limit || 50, msg.unreadOnly);
        ws.send(JSON.stringify({ type: "notifications", notifications }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
    }
  });

  ws.on("close", () => {
    const clients = wsClients.get(userId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        wsClients.delete(userId);
      }
    }
  });

  ws.on("error", () => {
    // Clean up on error
    const clients = wsClients.get(userId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        wsClients.delete(userId);
      }
    }
  });
});
