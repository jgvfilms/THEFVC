import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { flushSync } from "react-dom";
import { apiRequestJson, setAuthToken, getAuthToken } from "./queryClient";

interface AuthUser {
  id: number;
  handle: string;
  email: string;
  isAdmin?: boolean;
  accessStatus?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (handle: string, email: string, password: string, displayName: string, role: string, inviteToken?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if we have a token (from in-memory state on page load)
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    // Validate token by fetching /api/auth/me
    apiRequestJson<{ user: AuthUser }>("GET", "/api/auth/me")
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        } else {
          setAuthToken(null);
        }
      })
      .catch(() => {
        setAuthToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiRequestJson<{ token: string; user: AuthUser }>(
      "POST",
      "/api/auth/login",
      { email, password }
    );
    setAuthToken(data.token);
    // flushSync: callers navigate() immediately after login() resolves. wouter's
    // path-based location hook uses useSyncExternalStore, which re-renders
    // synchronously the moment history.pushState fires. Without flushSync, that
    // synchronous re-render can win the race against this (normally batched,
    // deferred) setUser update, so ProtectedRoute mounts at the destination
    // still seeing user=null and immediately bounces back to /auth — the
    // "have to log in twice" bug. Committing user before returning guarantees
    // the post-navigate render already has it.
    flushSync(() => setUser(data.user));
  };

  const signup = async (handle: string, email: string, password: string, displayName: string, role: string, inviteToken?: string) => {
    const data = await apiRequestJson<{ token: string; user: AuthUser }>(
      "POST",
      "/api/auth/signup",
      { handle, email, password, displayName, role, inviteToken }
    );
    setAuthToken(data.token);
    // See comment in login() above — same navigate-right-after race applies here.
    flushSync(() => setUser(data.user));
  };

  const logout = async () => {
    try {
      await apiRequestJson("POST", "/api/auth/logout");
    } catch {
      // Ignore errors
    }
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
