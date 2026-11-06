import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Wallet } from "lucide-react";
import type { ProductionCrew, Profile } from "@shared/schema";

const dollars = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Set up (or finish setting up) the member's own Stripe payouts account. */
export function PayoutsCard() {
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["connect-status"],
    queryFn: () => apiRequestJson<{ started: boolean; ready: boolean }>("GET", "/api/stripe/connect-status"),
  });
  const start = useMutation({
    mutationFn: () => apiRequestJson<{ onboardingLink: string }>("POST", "/api/stripe/connect-account"),
    onSuccess: (r) => {
      window.location.href = r.onboardingLink;
    },
    onError: () => toast({ title: "Couldn't open payout setup", variant: "destructive" }),
  });
  if (!data) return null;
  return (
    <Card data-testid="card-payouts">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Payouts
          <Badge variant={data.ready ? "default" : "secondary"}>{data.ready ? "Ready" : data.started ? "Setup unfinished" : "Not set up"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {data.ready ? (
          <p>You can be paid through FVC. Money goes to your own Stripe account, and Stripe handles your payouts and tax forms.</p>
        ) : (
          <>
            <p>To get paid through FVC you need your own Stripe payouts account. Stripe verifies your identity and bank account on its own page; FVC never sees your bank details.</p>
            <Button onClick={() => start.mutate()} disabled={start.isPending} data-testid="button-setup-payouts">
              {data.started ? "Finish payout setup" : "Set up payouts"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface PaymentRow {
  id: number; kind: "receive" | "pay_crew"; amountCents: number; feeCents: number;
  description: string; status: string; payee: string; iAmPayee: boolean;
}

/** Owner's view: request money for the production, or pay a confirmed crew member. */
export function ProductionPayments({ productionId, crew }: { productionId: number; crew: (ProductionCrew & { profile?: Profile })[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["production-payments", productionId];
  const [kind, setKind] = useState<"pay_crew" | "receive">("pay_crew");
  const [crewProfileId, setCrewProfileId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const { data: rows = [] } = useQuery({ queryKey: key, queryFn: () => apiRequestJson<PaymentRow[]>("GET", `/api/productions/${productionId}/payments`) });
  const payable = crew.filter((c) => c.status === "confirmed" && c.profile);

  const open = useMutation({
    mutationFn: async (id: number) => (await apiRequestJson<{ url: string }>("POST", `/api/production-payments/${id}/checkout`)).url,
  });
  const create = useMutation({
    mutationFn: () =>
      apiRequestJson<{ id: number }>("POST", `/api/productions/${productionId}/payments`, {
        kind, amountCents: Math.round(parseFloat(amount) * 100), description,
        ...(kind === "pay_crew" ? { crewProfileId: parseInt(crewProfileId, 10) } : {}),
      }),
    onSuccess: () => {
      setAmount("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast({ title: "Couldn't create payment", description: String(e?.message ?? ""), variant: "destructive" }),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => apiRequestJson("DELETE", `/api/production-payments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const go = async (id: number, kindOfRow: PaymentRow["kind"]) => {
    try {
      const url = await open.mutateAsync(id);
      if (kindOfRow === "pay_crew") window.location.href = url;
      else {
        await navigator.clipboard?.writeText(url).catch(() => undefined);
        toast({ title: "Pay link copied", description: "Send it to whoever is paying. It expires in 24 hours." });
      }
    } catch (e: any) {
      toast({ title: "Couldn't get the pay link", description: String(e?.message ?? ""), variant: "destructive" });
    }
  };

  const valid = parseFloat(amount) >= 1 && description.trim() && (kind === "receive" || crewProfileId);

  return (
    <Card data-testid="card-production-payments">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Payments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger className="sm:w-44" data-testid="select-payment-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pay_crew">Pay a crew member</SelectItem>
              <SelectItem value="receive">Request a payment</SelectItem>
            </SelectContent>
          </Select>
          {kind === "pay_crew" && (
            <Select value={crewProfileId} onValueChange={setCrewProfileId}>
              <SelectTrigger className="sm:w-48" data-testid="select-payment-crew"><SelectValue placeholder="Who" /></SelectTrigger>
              <SelectContent>
                {payable.map((c) => <SelectItem key={c.id} value={String(c.profileId)}>{c.profile!.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input className="sm:w-28" inputMode="decimal" placeholder="$ amount" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="input-payment-amount" />
          <Input placeholder="What it's for" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-payment-description" />
          <Button onClick={() => create.mutate()} disabled={!valid || create.isPending} data-testid="button-create-payment">Create</Button>
        </div>
        {kind === "pay_crew" && payable.length === 0 && (
          <p className="text-xs text-muted-foreground">Only confirmed crew who have set up payouts can be paid.</p>
        )}
        {rows.length > 0 && (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid={`payment-row-${r.id}`}>
                <div>
                  <div>{r.description} <Badge variant="secondary">{r.status}</Badge></div>
                  <div className="text-xs text-muted-foreground">
                    {r.kind === "pay_crew" ? `To ${r.payee}` : "Paid to you"} · {dollars(r.amountCents)}{r.feeCents ? ` (FVC fee ${dollars(r.feeCents)})` : ""}
                  </div>
                </div>
                {r.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => go(r.id, r.kind)} data-testid={`button-pay-${r.id}`}>{r.kind === "pay_crew" ? "Pay now" : "Copy pay link"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)}>Cancel</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
