import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Prefix server-served asset URLs (uploads, etc.) with API_BASE so they work in production
export function assetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
}

// Module-level auth token (no localStorage — blocked in sandboxed iframes)
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Extract the server's { error: "..." } message from an Error thrown by
 * apiRequest/apiRequestJson. Their message is `${status}: ${body}` (see
 * throwIfResNotOk above), so a plain JSON.parse(err.message) always throws
 * on the "<status>: " prefix and silently falls through to the caller's
 * fallback — meaning every failure (wrong password, rate-limited, blocked,
 * server error) looked identical to the user regardless of what actually
 * went wrong. Strip the prefix before parsing.
 */
export function parseApiErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  const body = raw.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(body || "{}");
    return typeof parsed?.error === "string" ? parsed.error : fallback;
  } catch {
    return fallback;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = getAuthHeaders();
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

export async function apiRequestJson<T>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  const res = await apiRequest(method, url, data);
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: getAuthHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// 5 minutes — balances fresh data with avoiding unnecessary refetches.
// Forge correction: was `Infinity` at line 90, which prevented cache invalidation
// from ever triggering refetches and masked stale data.
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

// Retry failed queries up to 2 times with exponential backoff (PRD-003: Client Reliability)
function retryWithBackoff(failureCount: number, error: Error): boolean {
  // Don't retry on 401/403 (auth errors) or 4xx client errors
  const status = (error as { status?: number })?.status;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: DEFAULT_STALE_TIME,
      retry: retryWithBackoff,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
});
