import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequestJson, parseApiErrorMessage } from "@/lib/queryClient";

const ROLES = [
  "Director", "Producer", "Director of Photography", "Camera Operator", "1st AC", "2nd AC",
  "Gaffer", "Best Boy", "Sound Mixer", "Boom Operator", "Production Designer", "Art Director",
  "Editor", "Colorist", "Script Supervisor", "Production Coordinator", "Line Producer",
  "Wardrobe", "Makeup Artist", "Stunt Coordinator", "Actor", "Filmmaker",
];

export function AuthPage() {
  const { login, signup } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [mode, setMode] = useState<"login" | "signup" | "request">("login");
  const [loading, setLoading] = useState(false);

  // Invite token from URL query param (hash-based routing)
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{ email?: string; displayName?: string; role?: string } | null>(null);
  const [inviteChecked, setInviteChecked] = useState(false);

  // Form fields
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("Filmmaker");

  // Beta request fields
  const [reqEmail, setReqEmail] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqRole, setReqRole] = useState("Filmmaker");
  const [reqCity, setReqCity] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [reqSubmitted, setReqSubmitted] = useState(false);

  // Parse invite token from URL hash query
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split("?")[1] || "");
    const token = params.get("invite");
    if (token) {
      setInviteToken(token);
      setMode("signup");
      // Validate the invite
      apiRequestJson<{ valid: boolean; email?: string; displayName?: string; role?: string }>("GET", `/api/beta/invite/${token}`)
        .then(data => {
          if (data.valid) {
            setInviteData(data);
            if (data.email) setEmail(data.email);
            if (data.displayName) setDisplayName(data.displayName);
            if (data.role) setRole(data.role);
          } else {
            setInviteToken(null);
            toast({ title: "Invite link is invalid or expired", variant: "destructive" });
          }
        })
        .catch(() => {
          setInviteToken(null);
        })
        .finally(() => setInviteChecked(true));
    } else {
      setInviteChecked(true);
    }
  }, [location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!handle || !email || !password || !displayName) {
          toast({ title: "All fields are required", variant: "destructive" });
          setLoading(false);
          return;
        }
        if (!inviteToken) {
          toast({ title: "You need an invite to sign up during beta", variant: "destructive" });
          setMode("request");
          setLoading(false);
          return;
        }
        await signup(handle, email, password, displayName, role, inviteToken);
      } else {
        if (!email || !password) {
          toast({ title: "Email and password required", variant: "destructive" });
          setLoading(false);
          return;
        }
        await login(email, password);
      }
      toast({ title: mode === "signup" ? "Account created" : "Welcome back" });
      window.location.hash = "#/app";
    } catch (err: any) {
      let msg = parseApiErrorMessage(err, "Authentication failed");
      if (msg.includes("invite-only")) {
        setMode("request");
        msg = "Beta access required. Submit a request below.";
      }
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleBetaRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequestJson("POST", "/api/beta/request", {
        email: reqEmail,
        displayName: reqName,
        role: reqRole,
        city: reqCity,
        message: reqMessage,
      });
      setReqSubmitted(true);
      toast({ title: "Request submitted!", description: "We'll email you when beta access opens up." });
    } catch (err: any) {
      const msg = parseApiErrorMessage(err, "Failed to submit request");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Left: Form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" fill="hsl(240 5% 5%)" />
              <circle cx="16" cy="16" r="8" fill="none" stroke="hsl(41 76% 55%)" strokeWidth="2" />
              <circle cx="16" cy="16" r="2.5" fill="hsl(41 76% 55%)" />
            </svg>
            <span className="font-display text-lg font-600">THEFVC<span className="text-primary">.IS</span></span>
          </Link>

          {/* Mode tabs */}
          <div className="flex gap-1 mb-6 rounded-lg bg-card p-1 border border-border" data-testid="mode-tabs">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-md py-2 text-sm font-500 transition-colors ${mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="tab-login"
            >
              Log in
            </button>
            {inviteToken ? (
              <button
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-md py-2 text-sm font-500 transition-colors ${mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="tab-signup"
              >
                Sign up
              </button>
            ) : (
              <button
                onClick={() => setMode("request")}
                className={`flex-1 rounded-md py-2 text-sm font-500 transition-colors ${mode === "request" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="tab-request"
              >
                Request access
              </button>
            )}
          </div>

          {/* LOGIN MODE */}
          {mode === "login" && (
            <>
              <h1 className="font-display text-xl font-700" data-testid="auth-title">Welcome back</h1>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="auth-subtitle">Log in to your dashboard.</p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="........" data-testid="input-password" />
                </div>
                <Button type="submit" disabled={loading} className="w-full" data-testid="button-submit">
                  {loading ? "Loading..." : "Log in"}
                </Button>
              </form>
            </>
          )}

          {/* SIGNUP MODE (invite required) */}
          {mode === "signup" && (
            <>
              <h1 className="font-display text-xl font-700" data-testid="auth-title">Create your account</h1>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="auth-subtitle">
                {inviteToken ? "You're invited! Set up your account." : "Beta is invite-only. Request access to join."}
              </p>

              {inviteToken && inviteData && (
                <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground" data-testid="invite-info">
                  <p className="font-500 text-foreground">Beta invite accepted</p>
                  {inviteData.displayName && <p>For: {inviteData.displayName}</p>}
                  {inviteData.role && <p>Role: {inviteData.role}</p>}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="handle">Handle</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">thefvc.is/</span>
                    <Input id="handle" value={handle} onChange={e => setHandle(e.target.value.toLowerCase().replace(/\s/g, ""))} placeholder="yourname" data-testid="input-handle" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input id="displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your Name" data-testid="input-displayname" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Primary Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="role" data-testid="select-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="........" data-testid="input-password" />
                </div>
                <Button type="submit" disabled={loading} className="w-full" data-testid="button-submit">
                  {loading ? "Loading..." : "Create account"}
                </Button>
              </form>
            </>
          )}

          {/* REQUEST ACCESS MODE */}
          {mode === "request" && (
            <>
              {reqSubmitted ? (
                <div className="text-center" data-testid="request-success">
                  <div className="mb-4 text-5xl">........</div>
                  <h1 className="font-display text-xl font-700">You're on the list</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We'll email you when your beta invite is ready. You'll get a unique link to create your account.
                  </p>
                  <Button onClick={() => { setReqSubmitted(false); setMode("login"); }} variant="outline" className="mt-6">
                    Back to login
                  </Button>
                </div>
              ) : (
                <>
                  <h1 className="font-display text-xl font-700" data-testid="auth-title">Request beta access</h1>
                  <p className="mt-1 text-sm text-muted-foreground" data-testid="auth-subtitle">
                    We're rolling out invites in small batches. Tell us about yourself.
                  </p>

                  <form onSubmit={handleBetaRequest} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reqEmail">Email *</Label>
                      <Input id="reqEmail" type="email" value={reqEmail} onChange={e => setReqEmail(e.target.value)} placeholder="you@example.com" data-testid="input-req-email" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reqName">Name</Label>
                      <Input id="reqName" value={reqName} onChange={e => setReqName(e.target.value)} placeholder="Your Name" data-testid="input-req-name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reqRole">Primary Role</Label>
                      <Select value={reqRole} onValueChange={setReqRole}>
                        <SelectTrigger id="reqRole" data-testid="select-req-role"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reqCity">City</Label>
                      <Input id="reqCity" value={reqCity} onChange={e => setReqCity(e.target.value)} placeholder="e.g. Buffalo, NY" data-testid="input-req-city" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reqMessage">What do you need most?</Label>
                      <textarea
                        id="reqMessage"
                        value={reqMessage}
                        onChange={e => setReqMessage(e.target.value)}
                        placeholder="Payments, crew finder, production management..."
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        rows={3}
                        data-testid="input-req-message"
                      />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full" data-testid="button-submit-request">
                      {loading ? "Submitting..." : "Join the waitlist"}
                    </Button>
                  </form>
                </>
              )}
            </>
          )}

          {/* Footer links */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => setMode(mode === "login" ? (inviteToken ? "signup" : "request") : "login")}
              className="text-primary hover:underline font-500"
              data-testid="toggle-mode"
            >
              {mode === "login" ? (inviteToken ? "Sign up" : "Request access") : "Log in"}
            </button>
          </p>
        </div>
      </div>

      {/* Right: Cinematic panel */}
      <div className="hidden flex-1 items-center justify-center bg-card p-12 lg:flex">
        <div className="max-w-md text-center">
          <div className="mb-8 text-6xl">........</div>
          <h2 className="font-display text-xl font-700 leading-tight">
            "The digital co-producer every scrappy indie team needs."
          </h2>
          <p className="mt-6 text-muted-foreground">
            Payments, crew discovery, and production management — finally in one place.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-display text-2xl font-700 text-primary">$0</p>
              <p className="text-xs text-muted-foreground">to start</p>
            </div>
            <div>
              <p className="font-display text-2xl font-700 text-primary">3</p>
              <p className="text-xs text-muted-foreground">free projects</p>
            </div>
            <div>
              <p className="font-display text-2xl font-700 text-primary">2.5%</p>
              <p className="text-xs text-muted-foreground">transaction fee</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
