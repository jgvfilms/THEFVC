import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson, parseApiErrorMessage } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Copy, KeyRound, Trash2 } from "lucide-react";

export type Scope = "profile:read" | "profile:write" | "credits:read" | "credits:write" | "page:write" | "messages:read";

interface McpTokenView {
  kind: "token" | "app";
  id: number;
  name: string;
  tokenPrefix: string;
  scopes: Scope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export const SCOPE_OPTIONS: Array<{ id: Scope; label: string; hint: string }> = [
  { id: "profile:read", label: "Read profile", hint: "View your profile and page settings" },
  { id: "profile:write", label: "Edit profile", hint: "Change bio, role, location, rate, skills, links" },
  { id: "credits:read", label: "Read credits", hint: "View your filmography" },
  { id: "credits:write", label: "Manage credits", hint: "Add, edit and delete entries in your filmography" },
  { id: "page:write", label: "Customize page", hint: "Change theme, sections, headline, custom links" },
  { id: "messages:read", label: "Read messages", hint: "See who messaged you and read your conversations. Cannot send or reply, and never marks messages as read" },
];

const EXPIRY_OPTIONS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

export function ConnectionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["profile:read"]);
  const [expiresInDays, setExpiresInDays] = useState(90);
  // Plaintext token, held only until the member dismisses it — the server never shows it again.
  const [fresh, setFresh] = useState<string | null>(null);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["/api/mcp/tokens"],
    queryFn: () => apiRequestJson<McpTokenView[]>("GET", "/api/mcp/tokens"),
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequestJson<McpTokenView & { token: string }>("POST", "/api/mcp/tokens", { name, scopes, expiresInDays }),
    onSuccess: (res) => {
      setFresh(res.token);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/tokens"] });
    },
    onError: (err) => toast({ title: parseApiErrorMessage(err, "Could not create token"), variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => apiRequestJson("DELETE", `/api/mcp/tokens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/tokens"] });
      toast({ title: "Token revoked" });
    },
    onError: () => toast({ title: "Could not revoke token", variant: "destructive" }),
  });

  const mcpUrl = `${window.location.origin}/mcp`;
  const toggleScope = (s: Scope, on: boolean) => setScopes((prev) => (on ? [...prev, s] : prev.filter((x) => x !== s)));
  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(() => toast({ title: `${what} copied` }));
  const apps = tokens.filter((t) => t.kind === "app");
  const personal = tokens.filter((t) => t.kind === "token");

  return (
    <div className="max-w-2xl space-y-6" data-testid="page-connections">
      <div>
        <h1 className="text-2xl font-semibold">AI connections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Let your own AI assistant read and update your FVC profile and page. You choose what it can do, and you can disconnect it at any time.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Connect an assistant</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input readOnly value={mcpUrl} data-testid="input-mcp-url" />
            <Button type="button" variant="outline" size="icon" aria-label="Copy URL" onClick={() => copy(mcpUrl, "URL")} data-testid="button-copy-url">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1" data-testid="text-connect-claude">
            <p className="text-sm font-medium">Claude (claude.ai or the desktop app)</p>
            <p className="text-sm text-muted-foreground">
              Go to Settings → Connectors → Add custom connector, paste the URL above, and click Connect. You'll be sent back here to choose
              what Claude may do. No token needed. It shows up below as a connected app.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Other tools (Claude Code and similar)</p>
            <p className="text-sm text-muted-foreground">Create a personal token below and pass it as a bearer token.</p>
            <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto" data-testid="text-claude-code-snippet">{`claude mcp add --transport http thefvc ${mcpUrl} \\\n  --header "Authorization: Bearer <your token>"`}</pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Connected apps</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : apps.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-apps">No apps connected.</p>
          ) : (
            <ul className="divide-y divide-border">
              {apps.map((t) => (
                <li key={t.id} className="py-3 flex items-start gap-3" data-testid={`app-${t.id}`}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium">{t.name}</p>
                    <div className="flex flex-wrap gap-1">{t.scopes.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
                    <p className="text-xs text-muted-foreground">
                      {t.lastUsedAt ? `Last used ${fmt(t.lastUsedAt)}` : "Not used yet"} · Stays connected while in use
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(t.id)} data-testid={`button-disconnect-${t.id}`}>
                    <Trash2 className="h-4 w-4 mr-1" /> Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {fresh && (
        <Card className="border-primary" data-testid="card-new-token">
          <CardHeader><CardTitle className="text-base">Copy your token now</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">This is the only time it will be shown. Anyone with it can act on your profile within its permissions.</p>
            <div className="flex gap-2">
              <Input readOnly value={fresh} data-testid="input-new-token" />
              <Button type="button" variant="outline" size="icon" aria-label="Copy token" onClick={() => copy(fresh, "Token")} data-testid="button-copy-token">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button type="button" size="sm" onClick={() => setFresh(null)} data-testid="button-dismiss-token">I've saved it</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">New personal token</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token-name">Name</Label>
            <Input id="token-name" value={name} maxLength={60} placeholder="e.g. Claude Desktop" onChange={(e) => setName(e.target.value)} data-testid="input-token-name" />
          </div>
          <div className="space-y-2">
            <Label>Permissions</Label>
            {SCOPE_OPTIONS.map((s) => (
              <label key={s.id} className="flex items-start gap-2 text-sm">
                <Checkbox checked={scopes.includes(s.id)} onCheckedChange={(v) => toggleScope(s.id, v === true)} data-testid={`checkbox-scope-${s.id}`} />
                <span><span className="font-medium">{s.label}</span> <span className="text-muted-foreground">— {s.hint}</span></span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <Label>Expires</Label>
            <div className="flex gap-2">
              {EXPIRY_OPTIONS.map((o) => (
                <Button key={o.days} type="button" size="sm" variant={expiresInDays === o.days ? "default" : "outline"}
                  onClick={() => setExpiresInDays(o.days)} data-testid={`button-expiry-${o.days}`}>{o.label}</Button>
              ))}
            </div>
          </div>
          <Button type="button" disabled={!name.trim() || scopes.length === 0 || createMutation.isPending}
            onClick={() => createMutation.mutate()} data-testid="button-create-token">
            <KeyRound className="h-4 w-4 mr-1" /> Create token
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Personal tokens</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : personal.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-tokens">No active tokens.</p>
          ) : (
            <ul className="divide-y divide-border">
              {personal.map((t) => (
                <li key={t.id} className="py-3 flex items-start gap-3" data-testid={`token-${t.id}`}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium">{t.name} <span className="font-mono text-xs text-muted-foreground">{t.tokenPrefix}…</span></p>
                    <div className="flex flex-wrap gap-1">{t.scopes.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
                    <p className="text-xs text-muted-foreground">
                      {t.lastUsedAt ? `Last used ${fmt(t.lastUsedAt)}` : "Never used"}
                      {t.expiresAt ? ` · Expires ${fmt(t.expiresAt)}` : ""}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(t.id)} data-testid={`button-revoke-${t.id}`}>
                    <Trash2 className="h-4 w-4 mr-1" /> Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
