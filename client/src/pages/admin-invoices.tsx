import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Send,
  ExternalLink,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Ban,
  RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

interface AdminInvoice {
  id: number;
  publicId: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  overdue: boolean;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  memo: string | null;
  internalNote: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  recipientUserId: number;
  recipientName: string;
  recipientEmail: string;
  remindersEnabled: boolean;
  reminderProfile: Array<{ offsetDays: number; tone: string }>;
  createdAt: string;
}

interface InvoiceStats {
  outstandingCents: number;
  outstandingCount: number;
  overdueCents: number;
  overdueCount: number;
  collectedThisMonthCents: number;
  avgDaysToPay: number | null;
  stripeConfigured: boolean;
}

interface LineItemDraft {
  description: string;
  quantity: number;
  unitAmount: string; // dollars, as typed
}

interface CrewMember {
  userId: number;
  displayName: string;
  handle?: string;
  role?: string;
}

const REMINDER_PROFILES: Record<string, Array<{ offsetDays: number; tone: string }>> = {
  standard: [
    { offsetDays: -3, tone: "friendly" },
    { offsetDays: 0, tone: "neutral" },
    { offsetDays: 3, tone: "neutral" },
    { offsetDays: 7, tone: "firm" },
    { offsetDays: 14, tone: "firm" },
    { offsetDays: 30, tone: "final" },
  ],
  gentle: [
    { offsetDays: 0, tone: "friendly" },
    { offsetDays: 7, tone: "friendly" },
    { offsetDays: 14, tone: "neutral" },
    { offsetDays: 21, tone: "neutral" },
  ],
  none: [],
};

// ─── Helpers ──────────────────────────────────────────────────

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const shortDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/** Dollars string -> integer cents, without float drift. */
function toCents(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = `${frac}00`.slice(0, 2);
  return parseInt(whole || "0", 10) * 100 + parseInt(cents, 10);
}

function statusBadge(invoice: AdminInvoice) {
  if (invoice.status === "open" && invoice.overdue) {
    return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">Past due</Badge>;
  }
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    open: { label: "Sent", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    void: { label: "Void", className: "bg-muted text-muted-foreground line-through" },
    uncollectible: { label: "Uncollectible", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  const entry = map[invoice.status] ?? map.draft;
  return <Badge className={entry.className}>{entry.label}</Badge>;
}

/** Resolve reminder offsets into real dates so the admin sees what will be sent. */
function previewReminderDates(dueDate: string, steps: Array<{ offsetDays: number }>): string[] {
  if (!dueDate) return [];
  const due = new Date(dueDate);
  return steps
    .map((s) => {
      const d = new Date(due);
      d.setDate(d.getDate() + s.offsetDays);
      return d;
    })
    .filter((d) => d > new Date())
    .map((d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
}

// ─── Page ─────────────────────────────────────────────────────

export function AdminInvoicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const { data: stats } = useQuery({
    queryKey: ["admin-invoice-stats"],
    queryFn: () => apiRequestJson<InvoiceStats>("GET", "/api/admin/invoices/stats"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-invoices", filter],
    queryFn: () =>
      apiRequestJson<{ invoices: AdminInvoice[] }>(
        "GET",
        filter === "overdue"
          ? "/api/admin/invoices?overdue=true"
          : filter === "all"
            ? "/api/admin/invoices"
            : `/api/admin/invoices?status=${filter}`
      ),
  });

  const invoices = data?.invoices ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["admin-invoice-stats"] });
    if (detailId) queryClient.invalidateQueries({ queryKey: ["admin-invoice", detailId] });
  };

  const sendMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequestJson<{ remindersScheduled: number }>("POST", `/api/admin/invoices/${id}/send`, {}),
    onSuccess: (res) => {
      toast({
        title: "Invoice sent",
        description: `Emailed to the member. ${res.remindersScheduled} follow-up${res.remindersScheduled === 1 ? "" : "s"} scheduled.`,
      });
      refresh();
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: number) => apiRequestJson("POST", `/api/admin/invoices/${id}/void`, {}),
    onSuccess: () => {
      toast({ title: "Invoice voided", description: "Follow-up reminders cancelled." });
      refresh();
    },
    onError: (err: Error) => toast({ title: "Void failed", description: err.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => apiRequestJson("POST", `/api/admin/invoices/${id}/mark-paid`, {}),
    onSuccess: () => {
      toast({ title: "Marked paid", description: "Recorded as an out-of-band payment. Reminders cancelled." });
      refresh();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequestJson("DELETE", `/api/admin/invoices/${id}`),
    onSuccess: () => {
      toast({ title: "Draft deleted" });
      refresh();
    },
  });

  return (
    <div className="space-y-6" data-testid="admin-invoices-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">Bill members and track what's outstanding.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="new-invoice-button">
          <Plus className="h-4 w-4 mr-2" />
          New invoice
        </Button>
      </div>

      {stats && !stats.stripeConfigured && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-amber-500">Stripe isn't configured on this environment</p>
            <p className="text-muted-foreground">
              You can create and edit drafts, but sending is disabled until STRIPE_SECRET_KEY is set.
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Outstanding" value={stats ? money(stats.outstandingCents) : undefined} sub={stats ? `${stats.outstandingCount} open` : undefined} />
        <StatCard
          label="Overdue"
          value={stats ? money(stats.overdueCents) : undefined}
          sub={stats ? `${stats.overdueCount} past due` : undefined}
          alert={!!stats?.overdueCount}
        />
        <StatCard label="Collected this month" value={stats ? money(stats.collectedThisMonthCents) : undefined} />
        <StatCard
          label="Avg days to pay"
          value={stats ? (stats.avgDaysToPay === null ? "—" : String(stats.avgDaysToPay)) : undefined}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all", label: "All" },
          { key: "draft", label: "Drafts" },
          { key: "open", label: "Sent" },
          { key: "overdue", label: "Overdue" },
          { key: "paid", label: "Paid" },
        ].map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
            data-testid={`filter-${f.key}`}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p>No invoices yet.</p>
              <Button variant="ghost" className="mt-2" onClick={() => setCreateOpen(true)}>
                Create the first one
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium">Due</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-center">Follow-ups</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                      onClick={() => setDetailId(invoice.id)}
                      data-testid={`invoice-row-${invoice.publicId}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{invoice.publicId}</td>
                      <td className="px-4 py-3">
                        <div>{invoice.recipientName}</div>
                        <div className="text-xs text-muted-foreground">{invoice.recipientEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{money(invoice.totalCents)}</td>
                      <td className="px-4 py-3">{shortDate(invoice.dueDate)}</td>
                      <td className="px-4 py-3">{statusBadge(invoice)}</td>
                      <td className="px-4 py-3 text-center">
                        {invoice.status !== "open" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : invoice.remindersEnabled ? (
                          <Bell className="h-4 w-4 text-primary inline" />
                        ) : (
                          <BellOff className="h-4 w-4 text-muted-foreground inline" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {invoice.status === "draft" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => sendMutation.mutate(invoice.id)}
                                disabled={sendMutation.isPending || !stats?.stripeConfigured}
                                data-testid={`send-${invoice.publicId}`}
                              >
                                <Send className="h-3 w-3 mr-1" />
                                Send
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteMutation.mutate(invoice.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {invoice.status === "open" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markPaidMutation.mutate(invoice.id)}
                                title="Record a check/cash payment"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Mark paid
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => voidMutation.mutate(invoice.id)}>
                                <Ban className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {invoice.hostedInvoiceUrl && (
                            <Button size="sm" variant="ghost" asChild>
                              <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
      <InvoiceDetailDialog id={detailId} onOpenChange={(open) => !open && setDetailId(null)} onChanged={refresh} />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value?: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {value === undefined ? (
          <Skeleton className="h-8 w-24 mt-2" />
        ) : (
          <p className={`text-2xl font-semibold mt-1 ${alert ? "text-amber-500" : ""}`}>{value}</p>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Create ───────────────────────────────────────────────────

function CreateInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [recipientUserId, setRecipientUserId] = useState<string>("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [memo, setMemo] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [profileName, setProfileName] = useState("standard");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([
    { description: "", quantity: 1, unitAmount: "" },
  ]);

  // Reuse the member directory as the picker source, so the admin never
  // re-types a name or an email that the platform already knows.
  const { data: crew } = useQuery({
    queryKey: ["members-for-invoice"],
    queryFn: () =>
      apiRequestJson<{ profiles: CrewMember[] }>("GET", "/api/profiles/paginated?limit=200"),
    enabled: open,
  });

  const total = useMemo(
    () => lineItems.reduce((sum, li) => sum + li.quantity * toCents(li.unitAmount), 0),
    [lineItems]
  );

  const reminderPreview = useMemo(
    () => previewReminderDates(dueDate, REMINDER_PROFILES[profileName] ?? []),
    [dueDate, profileName]
  );

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequestJson("POST", "/api/admin/invoices", {
        recipientUserId: parseInt(recipientUserId, 10),
        dueDate: new Date(`${dueDate}T17:00:00`).toISOString(),
        memo: memo || null,
        internalNote: internalNote || null,
        remindersEnabled,
        reminderProfileName: profileName,
        lineItems: lineItems
          .filter((li) => li.description.trim() && toCents(li.unitAmount) >= 0)
          .map((li) => ({
            description: li.description.trim(),
            quantity: li.quantity,
            unitAmountCents: toCents(li.unitAmount),
          })),
      }),
    onSuccess: () => {
      toast({ title: "Draft created", description: "Review it, then send when you're ready." });
      onOpenChange(false);
      reset();
      onCreated();
    },
    onError: (err: Error) => toast({ title: "Could not create", description: err.message, variant: "destructive" }),
  });

  const reset = () => {
    setRecipientUserId("");
    setMemo("");
    setInternalNote("");
    setLineItems([{ description: "", quantity: 1, unitAmount: "" }]);
  };

  const valid =
    recipientUserId &&
    dueDate &&
    lineItems.some((li) => li.description.trim() && toCents(li.unitAmount) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Saved as a draft. Nothing is sent and nothing hits Stripe until you press Send.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Member</Label>
            <Select value={recipientUserId} onValueChange={setRecipientUserId}>
              <SelectTrigger data-testid="member-picker">
                <SelectValue placeholder="Choose a member…" />
              </SelectTrigger>
              <SelectContent>
                {(crew?.profiles ?? []).map((m) => (
                  <SelectItem key={m.userId} value={String(m.userId)}>
                    {m.displayName}
                    {m.role ? ` — ${m.role}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Name and email are pulled from their profile at send time.
            </p>
          </div>

          <div>
            <Label>Line items</Label>
            <div className="space-y-2 mt-1">
              {lineItems.map((li, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <Input
                    placeholder="Description"
                    value={li.description}
                    className="flex-1"
                    onChange={(e) => {
                      const next = [...lineItems];
                      next[index] = { ...li, description: e.target.value };
                      setLineItems(next);
                    }}
                    data-testid={`line-desc-${index}`}
                  />
                  <Input
                    type="number"
                    min={1}
                    value={li.quantity}
                    className="w-20"
                    onChange={(e) => {
                      const next = [...lineItems];
                      next[index] = { ...li, quantity: Math.max(1, parseInt(e.target.value || "1", 10)) };
                      setLineItems(next);
                    }}
                  />
                  <Input
                    placeholder="0.00"
                    value={li.unitAmount}
                    className="w-28"
                    onChange={(e) => {
                      const next = [...lineItems];
                      next[index] = { ...li, unitAmount: e.target.value };
                      setLineItems(next);
                    }}
                    data-testid={`line-amount-${index}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLineItems(lineItems.filter((_, i) => i !== index))}
                    disabled={lineItems.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLineItems([...lineItems, { description: "", quantity: 1, unitAmount: "" }])}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add line
              </Button>
              <div className="text-sm">
                Total <span className="font-semibold text-lg ml-2">{money(total)}</span>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="due">Due date</Label>
            <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="memo">Memo (the member sees this)</Label>
            <Textarea id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
          </div>

          <div className="rounded-md border border-dashed border-muted-foreground/40 p-3">
            <Label htmlFor="note" className="text-muted-foreground">
              Internal note — never emailed, admin only
            </Label>
            <Textarea
              id="note"
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              rows={2}
              className="mt-1 bg-muted/40"
            />
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <Label>Automatic follow-ups</Label>
              <Switch checked={remindersEnabled} onCheckedChange={setRemindersEnabled} />
            </div>
            {remindersEnabled && (
              <>
                <Select value={profileName} onValueChange={setProfileName}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard — 6 reminders, escalating</SelectItem>
                    <SelectItem value="gentle">Gentle — 4 reminders, friendly</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {reminderPreview.length > 0
                    ? `They'll be emailed on: ${reminderPreview.join(", ")}. Stops the moment it's paid.`
                    : "No follow-ups will be sent."}
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!valid || createMutation.isPending}
            data-testid="save-draft"
          >
            Save draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail ───────────────────────────────────────────────────

function InvoiceDetailDialog({
  id,
  onOpenChange,
  onChanged,
}: {
  id: number | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-invoice", id],
    queryFn: () =>
      apiRequestJson<{
        invoice: AdminInvoice;
        lineItems: Array<{ id: number; description: string; quantity: number; amountCents: number }>;
        reminders: Array<{ id: number; offsetDays: number; sendAt: string; tone: string; status: string }>;
        events: Array<{ id: number; eventType: string; source: string; createdAt: string }>;
      }>("GET", `/api/admin/invoices/${id}`),
    enabled: id !== null,
  });

  const remindMutation = useMutation({
    mutationFn: (tone: string) => apiRequestJson("POST", `/api/admin/invoices/${id}/remind`, { tone }),
    onSuccess: () => {
      toast({ title: "Reminder queued" });
      onChanged();
    },
  });

  const toggleReminders = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequestJson("PATCH", `/api/admin/invoices/${id}/reminders`, { remindersEnabled: enabled }),
    onSuccess: () => onChanged(),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequestJson("POST", `/api/admin/invoices/${id}/sync`, {}),
    onSuccess: () => {
      toast({ title: "Synced with Stripe" });
      onChanged();
    },
  });

  const invoice = data?.invoice;

  return (
    <Dialog open={id !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading || !invoice ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className="font-mono">{invoice.publicId}</span>
                {statusBadge(invoice)}
              </DialogTitle>
              <DialogDescription>
                {invoice.recipientName} · {invoice.recipientEmail}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-baseline justify-between border-b border-border pb-4">
              <div>
                <p className="text-3xl font-semibold">{money(invoice.totalCents)}</p>
                <p className="text-sm text-muted-foreground">Due {shortDate(invoice.dueDate)}</p>
              </div>
              <div className="flex gap-2">
                {invoice.hostedInvoiceUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Pay page
                    </a>
                  </Button>
                )}
                {invoice.invoicePdfUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={invoice.invoicePdfUrl} target="_blank" rel="noopener noreferrer">
                      PDF
                    </a>
                  </Button>
                )}
                {invoice.status !== "draft" && (
                  <Button size="sm" variant="ghost" onClick={() => syncMutation.mutate()}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <section>
              <h3 className="text-sm font-medium mb-2">Line items</h3>
              <table className="w-full text-sm">
                <tbody>
                  {(data?.lineItems ?? []).map((li) => (
                    <tr key={li.id} className="border-b border-border/50">
                      <td className="py-2">{li.description}</td>
                      <td className="py-2 text-muted-foreground text-right w-16">×{li.quantity}</td>
                      <td className="py-2 text-right w-24">{money(li.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {invoice.internalNote && (
              <section className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Internal note — not visible to the member
                </p>
                <p className="text-sm">{invoice.internalNote}</p>
              </section>
            )}

            {invoice.status === "open" && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Follow-up schedule</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Auto reminders</span>
                    <Switch
                      checked={invoice.remindersEnabled}
                      onCheckedChange={(v) => toggleReminders.mutate(v)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  {(data?.reminders ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No reminders scheduled.</p>
                  ) : (
                    (data?.reminders ?? []).map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-sm py-1">
                        <span>
                          {shortDate(r.sendAt)}
                          <span className="text-muted-foreground ml-2">({r.tone})</span>
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {r.status}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => remindMutation.mutate("neutral")}
                  disabled={remindMutation.isPending}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Send a reminder now
                </Button>
              </section>
            )}

            <section>
              <h3 className="text-sm font-medium mb-2">Timeline</h3>
              <div className="space-y-1 text-sm">
                {(data?.events ?? []).map((e) => (
                  <div key={e.id} className="flex justify-between text-muted-foreground">
                    <span>
                      {e.eventType.replace(/_/g, " ")}
                      <span className="text-xs ml-2 opacity-60">via {e.source.replace(/_/g, " ")}</span>
                    </span>
                    <span className="text-xs">{shortDate(e.createdAt)}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AdminInvoicesPage;
