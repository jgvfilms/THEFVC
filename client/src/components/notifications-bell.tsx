import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useWebSocket, Notification } from "@/lib/useWebSocket";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";

interface NotificationsContextType {
  unreadCount: number;
  notifications: Notification[];
  fetchNotifications: (limit?: number, unreadOnly?: boolean) => void;
  markRead: (id?: number, all?: boolean) => void;
  markAllRead: () => void;
  connected: boolean;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}

/**
 * PRD-009: Real-Time & WebSocket
 * Provider that manages WebSocket connection and notification state.
 * Wraps the app to provide real-time notifications to all components.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const ws = useWebSocket(token);

  const markAllRead = () => {
    ws.markRead(undefined, true);
  };

  // Sync unread count with React Query cache
  useEffect(() => {
    if (user) {
      queryClient.setQueryData(["notifications", "unread-count", user.id], {
        count: ws.unreadCount,
      });
    }
  }, [ws.unreadCount, user]);

  return (
    <NotificationsContext.Provider
      value={{
        unreadCount: ws.unreadCount,
        notifications: ws.notifications,
        fetchNotifications: ws.fetchNotifications,
        markRead: ws.markRead,
        markAllRead,
        connected: ws.connected,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

/**
 * PRD-009: Real-Time & WebSocket
 * Bell icon component with unread notification badge.
 * Shows real-time unread count from WebSocket connection.
 */
export function NotificationsBell() {
  const { unreadCount, notifications, fetchNotifications, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      fetchNotifications(20);
    }
  }, [open, fetchNotifications]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full transition-colors"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.172V11c0-3.07-1.639-5.64-4.5-6.32V4a2.5 2.5 0 10-5 0v.68C7.639 5.36 6 7.93 6 11v3.172a2.032 2.032 0 00-.595 1.423L4 17h5m7 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center
                       min-w-[20px] h-5 px-1 text-xs font-bold text-white
                       bg-red-500 rounded-full"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end pt-12 pr-4
                     md:absolute md:inset-auto md:pt-0 md:pr-0 md:left-auto md:right-0
                     md:bottom-auto md:top-full md:mt-2
                     bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                     rounded-lg shadow-xl w-80 max-h-96 overflow-y-auto"
        >
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 border-b border-gray-100 dark:border-gray-700
                             last:border-0 cursor-pointer transition-colors
                             ${n.isRead ? "bg-gray-50 dark:bg-gray-800/50" : "bg-blue-50 dark:bg-blue-900/20"}
                             hover:bg-gray-100 dark:hover:bg-gray-700`}
                  onClick={() => {
                    if (!n.isRead) {
                      // Mark as read on click
                    }
                  }}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0
                                 ${n.isRead ? "bg-gray-400" : "bg-blue-500"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">
                        {n.title}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                        {n.message}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
