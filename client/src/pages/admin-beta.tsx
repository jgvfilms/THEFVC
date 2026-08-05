import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestJson } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Copy, Ban, MessageSquare, Users, Ticket, Star } from "lucide-react";

interface BetaData {
  seats: { used: number; limit: number; remaining: number };
  requests: { pending: number; approved: number; activated: number; rejected: number; total: number };
  invites: { active: number; used: number; revoked: number; total: number };
  members: Array<{
    id: number; handle: string; email: string; isAdmin: boolean;
    accessStatus: string; createdAt: string; lastLoginAt: string | null; invitedBy: number | null;
  }>;
  feedback: Array<{
    id: number; userId: number; category: string; message: string;
    pageUrl: string | null; status: string; createdAt: string; adminNotes: string | null;
  }>;
  pendingRequests: Array<{
    id: number; email: string; handle: string | null; displayName: string | null;
    role: string | null; city: string | null; message: string | null; status: string; createdAt: string;
  }>;
  allInvites: Array<{
    id: number; token: string; email: string | null; displayName: string | null;
    role: string | null; status: string; maxUses: number; usedCount: number;
    createdAt: string; usedAt: string | null; notes: string | null;
  }>;
}

export function AdminBetaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "requests" | "invites" | "members" | "feedback">("overview");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviteNotes, setInviteNotes] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const { data, isLoading } = useQuery<BetaData>({
    queryKey: ["/api/admin/beta"],
    queryFn: () => apiRequestJson("GET", "/api/admin/beta"),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequestJson("POST", `/api/admin/beta/requests/${id}/approve`),
    onSuccess: (data: any) => {
      toast({ title: "Request approved", description: "Invite link generated" });
      if (data.inviteUrl) {
        setLastInviteUrl(`${window.location.origin}${data.inviteUrl}`);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/beta"] });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => apiRequestJson("POST", `/api/admin/beta/requests/${id}/reject`),
    onSuccess: () => {
      toast({ title: "Request rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/beta"] });
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: () => apiRequestJson("POST", "/api/admin/beta/invites", {
      email: inviteEmail || undefined,
      displayName: inviteName || undefined,
      role: inviteRole || undefined,
      notes: inviteNotes || undefined,
    }),
    onSuccess: (data: any) => {
      toast({ title: "Invite created", description: "Copy the link to share" });
      if (data.inviteUrl) {
        setLastInviteUrl(`${window.location.origin}${data.inviteUrl}`);
      }
      setInviteEmail(""); setInviteName(""); setInviteRole(""); setInviteNotes("");
      setShowInviteForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/beta"] });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (id: number) => apiRequestJson("POST", `/api/admin/beta/invites/${id}/revoke`),
    onSuccess: () => {
      toast({ title: "Invite revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/beta"] });
    },
  });

  const toggleAccessMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequestJson("PATCH", `/api/admin/users/${id}/access`, { status }),
    onSuccess: () => {
      toast({ title: "Access updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/beta"] });
    },
  });

  const updateFeedbackMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequestJson("PATCH", `/api/admin/feedback/${id}`, { status }),
    onSuccess: () => {
      toast({ title: "Feedback updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/beta"] });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  }

  if (!data) return null;

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Star },
    { id: "requests" as const, label: "Requests", icon: MessageSquare, badge: data.requests.pending },
    { id: "invites" as const, label: "Invites", icon: Ticket },
    { id: "members" as const, label: "Members", icon: Users },
    { id: "feedback" as const, label: "Feedback", icon: MessageSquare, badge: data.feedback.filter(f => f.status === "new").length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-700" data-testid="admin-title">Beta Access Panel</h1>
        <p className="text-sm text-muted-foreground">Manage invites, members, and feedback</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Users className="h-4 w-4" /> Beta Seats
          </div>
          <p className="mt-1 font-display text-2xl font-700">{data.seats.used}<span className="text-muted-foreground text-sm">/{data.seats.limit}</span></p>
          <p className="text-xs text-muted-foreground">{data.seats.remaining} remaining</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <MessageSquare className="h-4 w-4" /> Pending Requests
          </div>
          <p className="mt-1 font-display text-2xl font-700">{data.requests.pending}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Ticket className="h-4 w-4" /> Active Invites
          </div>
          <p className="mt-1 font-display text-2xl font-700">{data.invites.active}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Star className="h-4 w-4" /> New Feedback
          </div>
          <p className="mt-1 font-display text-2xl font-700">{data.feedback.filter(f => f.status === "new").length}</p>
        </div>
      </div>

      {/* Last generated invite link */}
      {lastInviteUrl && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="last-invite-link">
          <p className="text-sm font-500 mb-2">Invite link generated:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-3 py-2 text-xs">{lastInviteUrl}</code>
            <Button size="sm" variant="outline" onClick={() => copyToClipboard(lastInviteUrl)} data-testid="button-copy-invite">
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border" data-testid="admin-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-500 transition-colors ${
                activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.badge ? (
                <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">{tab.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Activated</p>
              <p className="font-display text-xl font-700">{data.requests.activated}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Invited</p>
              <p className="font-display text-xl font-700">{data.requests.approved}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Rejected</p>
              <p className="font-display text-xl font-700">{data.requests.rejected}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Total Requests</p>
              <p className="font-display text-xl font-700">{data.requests.total}</p>
            </div>
          </div>
          <Button onClick={() => setShowInviteForm(!showInviteForm)} data-testid="button-new-invite">
            <Ticket className="h-4 w-4 mr-1" /> Create Invite Manually
          </Button>
        </div>
      )}

      {/* REQUESTS */}
      {activeTab === "requests" && (
        <div className="space-y-3">
          {data.pendingRequests.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No pending requests</p>
          ) : (
            data.pendingRequests.map(req => (
              <div key={req.id} className="rounded-lg border border-border bg-card p-4" data-testid={`request-${req.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-500">{req.displayName || req.email}</p>
                    <p className="text-xs text-muted-foreground">{req.email}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {req.role && <span className="rounded bg-muted px-2 py-0.5">{req.role}</span>}
                      {req.city && <span className="rounded bg-muted px-2 py-0.5">{req.city}</span>}
                      {req.handle && <span className="rounded bg-muted px-2 py-0.5">@{req.handle}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approveMutation.mutate(req.id)} data-testid={`button-approve-${req.id}`}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(req.id)} data-testid={`button-reject-${req.id}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {req.message && (
                  <p className="mt-2 text-sm text-muted-foreground border-t border-border pt-2">{req.message}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* INVITES */}
      {activeTab === "invites" && (
        <div className="space-y-3">
          <Button onClick={() => setShowInviteForm(!showInviteForm)} size="sm" data-testid="button-toggle-invite-form">
            <Ticket className="h-4 w-4 mr-1" /> New Invite
          </Button>

          {showInviteForm && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="invite-form">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="invEmail">Email (optional)</Label>
                  <Input id="invEmail" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="filmmaker@email.com" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="invName">Name (optional)</Label>
                  <Input id="invName" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="invRole">Role (optional)</Label>
                  <Input id="invRole" value={inviteRole} onChange={e => setInviteRole(e.target.value)} placeholder="Director" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="invNotes">Notes (internal)</Label>
                  <Input id="invNotes" value={inviteNotes} onChange={e => setInviteNotes(e.target.value)} placeholder="Met at festival" />
                </div>
              </div>
              <Button onClick={() => createInviteMutation.mutate()} disabled={createInviteMutation.isPending} data-testid="button-create-invite">
                {createInviteMutation.isPending ? "Creating..." : "Generate Invite Link"}
              </Button>
            </div>
          )}

          {data.allInvites.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No invites yet</p>
          ) : (
            data.allInvites.map(inv => {
              const url = `${window.location.origin}/auth?invite=${inv.token}`;
              return (
                <div key={inv.id} className="rounded-lg border border-border bg-card p-3" data-testid={`invite-${inv.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-500 text-sm">{inv.email || "No email"}</span>
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          inv.status === "active" ? "bg-green-500/20 text-green-600" :
                          inv.status === "used" ? "bg-blue-500/20 text-blue-600" :
                          "bg-red-500/20 text-red-600"
                        }`}>{inv.status}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{url}</p>
                      {inv.displayName && <p className="text-xs text-muted-foreground">For: {inv.displayName}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(url)} data-testid={`button-copy-${inv.id}`}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      {inv.status === "active" && (
                        <Button size="sm" variant="ghost" onClick={() => revokeInviteMutation.mutate(inv.id)} data-testid={`button-revoke-${inv.id}`}>
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MEMBERS */}
      {activeTab === "members" && (
        <div className="space-y-2">
          {data.members.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No members yet</p>
          ) : (
            data.members.map(m => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3" data-testid={`member-${m.id}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-500 text-sm">{m.handle}</span>
                    {m.isAdmin && <span className="rounded bg-primary/20 px-2 py-0.5 text-xs text-primary">Admin</span>}
                    <span className={`rounded px-2 py-0.5 text-xs ${
                      m.accessStatus === "active" ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600"
                    }`}>{m.accessStatus}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(m.createdAt).toLocaleDateString()}
                    {m.lastLoginAt && ` · Last seen ${new Date(m.lastLoginAt).toLocaleDateString()}`}
                  </p>
                </div>
                {!m.isAdmin && (
                  <Button
                    size="sm"
                    variant={m.accessStatus === "active" ? "outline" : "default"}
                    onClick={() => toggleAccessMutation.mutate({ id: m.id, status: m.accessStatus === "active" ? "revoked" : "active" })}
                    data-testid={`button-toggle-access-${m.id}`}
                  >
                    {m.accessStatus === "active" ? "Revoke" : "Activate"}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* FEEDBACK */}
      {activeTab === "feedback" && (
        <div className="space-y-3">
          {data.feedback.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No feedback yet</p>
          ) : (
            data.feedback.map(f => (
              <div key={f.id} className="rounded-lg border border-border bg-card p-4" data-testid={`feedback-${f.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`rounded px-2 py-0.5 text-xs ${
                        f.category === "bug" ? "bg-red-500/20 text-red-600" :
                        f.category === "idea" ? "bg-blue-500/20 text-blue-600" :
                        f.category === "praise" ? "bg-green-500/20 text-green-600" :
                        "bg-muted text-muted-foreground"
                      }`}>{f.category}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${
                        f.status === "new" ? "bg-primary/20 text-primary" :
                        f.status === "resolved" ? "bg-green-500/20 text-green-600" :
                        "bg-muted text-muted-foreground"
                      }`}>{f.status}</span>
                    </div>
                    <p className="text-sm">{f.message}</p>
                    {f.pageUrl && <p className="mt-1 text-xs text-muted-foreground">Page: {f.pageUrl}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">User #{f.userId} · {new Date(f.createdAt).toLocaleDateString()}</p>
                  </div>
                  <select
                    value={f.status}
                    onChange={e => updateFeedbackMutation.mutate({ id: f.id, status: e.target.value })}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    data-testid={`select-feedback-status-${f.id}`}
                  >
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="planned">Planned</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
