import { useEffect, useRef, useState, useCallback } from "react";

export interface WsMessage {
  type: string;
  [key: string]: any;
}

export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata?: any;
  createdAt: string;
}

export interface UseWebSocketOptions {
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

/**
 * PRD-009: Real-Time & WebSocket
 * Client-side WebSocket hook for real-time notifications and activity feed.
 * Connects to the server's /ws endpoint, authenticates via session token,
 * and provides real-time updates via callback handlers.
 */
export function useWebSocket(
  token: string | null,
  options: UseWebSocketOptions = {}
) {
  const { reconnectInterval = 5000, maxReconnectAttempts = 10 } = options;
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "unread_count":
            setUnreadCount(msg.count);
            break;
          case "notifications":
            setNotifications(msg.notifications);
            break;
          case "notification":
            // New real-time notification
            setNotifications((prev) => [msg.notification, ...prev]);
            setUnreadCount((prev) => prev + 1);
            break;
          case "pong":
            // Heartbeat response
            break;
          case "error":
            console.error("WebSocket error:", msg.message);
            break;
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, reconnectInterval * reconnectAttemptsRef.current);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }, [token, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const sendMessage = useCallback((msg: WsMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const fetchNotifications = useCallback((limit = 50, unreadOnly = false) => {
    sendMessage({ type: "fetch_notifications", limit, unreadOnly });
  }, [sendMessage]);

  const markRead = useCallback((id?: number, all = false) => {
    sendMessage({ type: "mark_read", id, all });
  }, [sendMessage]);

  const ping = useCallback(() => {
    sendMessage({ type: "ping" });
  }, [sendMessage]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connected,
    unreadCount,
    notifications,
    sendMessage,
    fetchNotifications,
    markRead,
    ping,
    disconnect,
  };
}
