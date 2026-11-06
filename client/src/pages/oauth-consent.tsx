import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequestJson, parseApiErrorMessage } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plug } from "lucide-react";
import { SCOPE_OPTIONS, type Scope } from "./connections";

interface PendingView {
  clientName: string;
  redirectHost: string;
  scopes: Scope[];
}

/**
 * Where an AI app (claude.ai etc.) sends a member to approve a connection.
 * Reached via /authorize -> here; approving redirects the browser back to the
 * app with a one-time code.
 */
export function OAuthConsentPage() {
  const { id } = useParams<{ id: string }>();
  // null = "everything offered"; set once the member unticks something.
  const [chosen, setChosen] = useState<Scope[] | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["/api/oauth/pending", id],
    queryFn: () => apiRequestJson<PendingView>("GET", `/api/oauth/pending/${id}`),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      apiRequestJson<{ redirectTo: string }>("POST", `/api/oauth/pending/${id}/decision`, {
        approve,
        scopes: approve ? (chosen ?? data!.scopes) : undefined,
      }),
    onSuccess: (res) => {
      window.location.assign(res.redirectTo);
    },
  });

  const scopes = chosen ?? data?.scopes ?? [];
  const toggle = (scope: Scope, on: boolean) =>
    setChosen((on ? [...scopes, scope] : scopes.filter((s) => s !== scope)));

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full" data-testid="oauth-consent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" /> Connect an AI app
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive" data-testid="text-consent-error">
              {parseApiErrorMessage(error, "This authorization request has expired. Start again from your AI app.")}
            </p>
          )}
          {data && (
            <>
              <p className="text-sm">
                <strong data-testid="text-client-name">{data.clientName}</strong> wants to access your THEFVC.IS account
                {" "}and will return to <span className="font-mono">{data.redirectHost}</span>.
                Only approve apps you started connecting yourself.
              </p>
              <div className="space-y-3">
                {SCOPE_OPTIONS.filter((o) => data.scopes.includes(o.id)).map((o) => (
                  <div key={o.id} className="flex items-start gap-2">
                    <Checkbox
                      id={`scope-${o.id}`}
                      data-testid={`checkbox-scope-${o.id}`}
                      checked={scopes.includes(o.id)}
                      onCheckedChange={(v) => toggle(o.id, v === true)}
                    />
                    <Label htmlFor={`scope-${o.id}`} className="leading-tight">
                      {o.label}
                      <span className="block text-xs font-normal text-muted-foreground">{o.hint}</span>
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                You can revoke this any time from AI Connections. It never gets billing, password or subscription access.
              </p>
              {decide.error && (
                <p className="text-sm text-destructive">{parseApiErrorMessage(decide.error, "Could not complete the request")}</p>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={decide.isPending || scopes.length === 0}
                  onClick={() => decide.mutate(true)}
                  data-testid="button-oauth-approve"
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate(false)}
                  data-testid="button-oauth-deny"
                >
                  Deny
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
