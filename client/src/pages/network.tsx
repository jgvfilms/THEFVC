import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson, assetUrl } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { NetworkData, NetworkMember } from "@/components/network-actions";

type Action = { label: string; verb: string; method: string; url: string; variant?: "default" | "outline" };

function Row({ m, section, actions }: { m: NetworkMember; section: string; actions: Action[] }) {
  const qc = useQueryClient();
  const mutate = useMutation({
    mutationFn: (a: Action) => apiRequestJson(a.method, a.url),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/network"] });
      qc.invalidateQueries({ queryKey: ["/api/network/feed"] });
    },
  });
  const initials = m.avatarInitials || m.displayName.slice(0, 2).toUpperCase();
  return (
    <li className="flex items-center gap-3 py-2" data-testid={`${section}-${m.handle}`}>
      <Avatar className="h-9 w-9">
        {m.avatarUrl ? <img src={assetUrl(m.avatarUrl)} alt="" className="h-full w-full object-cover" /> : <AvatarFallback>{initials}</AvatarFallback>}
      </Avatar>
      <div className="min-w-0 flex-1">
        <Link href={`/u/${m.handle}`} className="font-medium hover:underline truncate block">{m.displayName}</Link>
        <p className="text-xs text-muted-foreground truncate">@{m.handle}{m.role ? ` · ${m.role}` : ""}{m.city ? ` · ${m.city}` : ""}</p>
      </div>
      {actions.map((a) => (
        <Button
          key={a.verb}
          size="sm"
          variant={a.variant ?? "outline"}
          disabled={mutate.isPending}
          onClick={() => mutate.mutate(a)}
          data-testid={`button-${a.verb}-${m.handle}`}
        >
          {a.label}
        </Button>
      ))}
    </li>
  );
}

function Section({ title, id, members, actions, empty }: {
  title: string; id: string; members: NetworkMember[]; empty: string;
  actions: (m: NetworkMember) => Action[];
}) {
  return (
    <Card data-testid={`section-${id}`}>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title} ({members.length})</CardTitle></CardHeader>
      <CardContent>
        {members.length === 0
          ? <p className="text-sm text-muted-foreground">{empty}</p>
          : <ul className="divide-y divide-border">{members.map((m) => <Row key={m.handle} m={m} section={id} actions={actions(m)} />)}</ul>}
      </CardContent>
    </Card>
  );
}

export function NetworkPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/network"],
    queryFn: () => apiRequestJson<NetworkData>("GET", "/api/network"),
  });
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const A = (verb: string, label: string, method: string, path: string, handle: string, variant?: "default" | "outline"): Action =>
    ({ verb, label, method, url: `/api/network/${path.replace(":h", encodeURIComponent(handle))}`, variant });
  return (
    <div className="mx-auto w-full max-w-2xl p-4 md:p-6 flex flex-col gap-4" data-testid="network-page">
      <h1 className="font-display text-2xl font-semibold">My Network</h1>
      <p className="text-sm text-muted-foreground">
        Follow members to see their activity on your dashboard. Connect to build your trusted crew; connected members appear as a shortcut when you add crew to a production.
      </p>
      <Section id="incoming" title="Connection requests" members={data.incoming} empty="No pending requests."
        actions={(m) => [A("accept", "Accept", "POST", "requests/:h/accept", m.handle, "default"), A("decline", "Decline", "POST", "requests/:h/decline", m.handle)]} />
      <Section id="connections" title="Connections" members={data.connections} empty="No connections yet. Open a member's profile and choose Connect."
        actions={(m) => [A("disconnect", "Disconnect", "DELETE", "connect/:h", m.handle)]} />
      <Section id="outgoing" title="Requests you sent" members={data.outgoing} empty="Nothing waiting on others."
        actions={(m) => [A("cancel", "Cancel", "DELETE", "connect/:h", m.handle)]} />
      <Section id="following" title="Following" members={data.following} empty="You aren't following anyone yet."
        actions={(m) => [A("unfollow", "Unfollow", "DELETE", "follow/:h", m.handle)]} />
      <Section id="followers" title="Followers" members={data.followers} empty="No followers yet."
        actions={(m) => [A("block", "Block", "POST", "block/:h", m.handle)]} />
      {data.blocked.length > 0 && (
        <Section id="blocked" title="Blocked" members={data.blocked} empty=""
          actions={(m) => [A("unblock", "Unblock", "DELETE", "block/:h", m.handle)]} />
      )}
    </div>
  );
}
