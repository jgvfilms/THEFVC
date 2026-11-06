// Where to send someone after they log in, when a dashboard page bounced them
// to /auth. Kept in sessionStorage so it survives the Google sign-in redirect.
const KEY = "fvc:returnTo";

export function rememberReturnPath(path: string) {
  try {
    if (path.startsWith("/app")) sessionStorage.setItem(KEY, path);
  } catch {
    // Storage blocked: login just lands on /app.
  }
}

/** The remembered dashboard path (cleared once read), or /app. */
export function takeReturnPath(): string {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    // Only same-site dashboard paths, never "//host" or anything off-site.
    if (path && path.startsWith("/app") && !path.startsWith("//")) return path;
  } catch {
    // fall through
  }
  return "/app";
}
