import { useState, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequestJson, parseApiErrorMessage } from "@/lib/queryClient";

// The server doesn't enforce a minimum, so this is the only check.
export const MIN_PASSWORD_LENGTH = 8;

// Landing page for the link in the password-reset email:
// /reset-password?token=...
export function ResetPasswordPage() {
  // Read the token once, then strip it from the address bar so it doesn't
  // linger in browser history.
  const [token] = useState(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (t) history.replaceState(null, "", window.location.pathname);
    return t;
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Same guard as the login form: stops a double-submit before re-render.
  const submittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    submittingRef.current = true;
    setLoading(true);
    try {
      await apiRequestJson("POST", "/api/auth/password-reset/confirm", { token, password });
      setDone(true);
    } catch (err: any) {
      setError(parseApiErrorMessage(err, "Couldn't reset your password. Please try again."));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  let body: React.ReactNode;
  if (!token) {
    body = (
      <>
        <h1 className="font-display text-xl font-700" data-testid="reset-title">Reset link missing</h1>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="reset-missing-token">
          This page needs the link from your password-reset email. Request a new one from the login page.
        </p>
        <Button asChild className="mt-6 w-full"><Link href="/auth">Go to login</Link></Button>
      </>
    );
  } else if (done) {
    body = (
      <>
        <h1 className="font-display text-xl font-700" data-testid="reset-title">Password updated</h1>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="reset-success">
          You can now log in with your new password.
        </p>
        <Button asChild className="mt-6 w-full"><Link href="/auth">Log in</Link></Button>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="font-display text-xl font-700" data-testid="reset-title">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} data-testid="input-new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} data-testid="input-confirm-password" />
          </div>
          {error && <p className="text-sm text-destructive" role="alert" data-testid="reset-error">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full" data-testid="button-reset-password">
            {loading ? "Saving..." : "Set new password"}
          </Button>
        </form>
        {error && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Link expired? <Link href="/auth" className="text-primary hover:underline font-500">Request a new one</Link>
          </p>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="hsl(240 5% 5%)" />
            <circle cx="16" cy="16" r="8" fill="none" stroke="hsl(41 76% 55%)" strokeWidth="2" />
            <circle cx="16" cy="16" r="2.5" fill="hsl(41 76% 55%)" />
          </svg>
          <span className="font-display text-lg font-600">THEFVC<span className="text-primary">.IS</span></span>
        </Link>
        {body}
      </div>
    </div>
  );
}
