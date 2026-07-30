import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, FileText, TrendingUp, Calendar, Download, Plus, ExternalLink, AlertTriangle } from "lucide-react";
import type { Payment, SubscriptionTier, W9Form, Profile } from "@shared/schema";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface SubscriptionStatus {
  tier: string;
  status: string;
  stripeCustomerId?: string | null;
}

export function PaymentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"payments" | "tiers" | "w9">("payments");

  const { data: payments, isLoading: isLoadingPayments } = useQuery({
    queryKey: ["payments"],
    queryFn: () => apiRequestJson<Payment[]>("GET", "/api/payments"),
  });

  const { data: tiers, isLoading: isLoadingTiers } = useQuery({
    queryKey: ["subscription-tiers"],
    queryFn: () => apiRequestJson<SubscriptionTier[]>("GET", "/api/subscription-tiers"),
  });

  const { data: w9, isLoading: isLoadingW9 } = useQuery({
    queryKey: ["w9"],
    queryFn: () => apiRequestJson<W9Form>("GET", "/api/w9"),
    retry: false,
  });

  const { data: subscription, isLoading: isLoadingSub } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => apiRequestJson<SubscriptionStatus>("GET", "/api/subscription"),
  });

  const checkoutMutation = useMutation({
    mutationFn: (tierName: string) =>
      apiRequestJson<{ checkoutUrl: string }>("POST", "/api/subscription/checkout", { tierName }),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    },
    onError: () => {
      toast({
        title: "Checkout failed",
        description: "Could not start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiRequestJson("POST", "/api/subscription/cancel", {}),
    onSuccess: () => {
      toast({ title: "Subscription canceled", description: "Your subscription has been canceled." });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: () => {
      toast({
        title: "Cancellation failed",
        description: "Could not cancel subscription. Please try again.",
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr: string | Date) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleCheckout = (tierName: string) => {
    checkoutMutation.mutate(tierName);
  };

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold">Payments & Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription, view payment history, and handle tax documents.
        </p>
      </div>

      {/* Current Plan Card (PRD-020) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingSub ? (
            <Skeleton className="h-16 w-full" />
          ) : subscription ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium capitalize">{subscription.tier} Plan</p>
                <p className="text-sm text-muted-foreground">
                  Status:{" "}
                  <Badge
                    variant={
                      subscription.status === "active" ? "default" :
                      subscription.status === "past_due" ? "secondary" : "outline"
                    }
                  >
                    {subscription.status}
                  </Badge>
                </p>
              </div>
              {subscription.tier !== "free" && subscription.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  data-testid="button-cancel-subscription"
                >
                  Cancel Subscription
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Unable to load subscription status.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("payments")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "payments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-payments"
        >
          Payment History
        </button>
        <button
          onClick={() => setActiveTab("tiers")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "tiers"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-tiers"
        >
          Subscription Tiers
        </button>
        <button
          onClick={() => setActiveTab("w9")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "w9"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-w9"
        >
          Tax Documents (W-9)
        </button>
      </div>

      {/* Payment History Tab */}
      {activeTab === "payments" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingPayments ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : payments && payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`payment-${p.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatCurrency(p.amount)}</span>
                        <Badge
                          variant={
                            p.status === "succeeded" ? "default" : p.status === "pending" ? "secondary" : "outline"
                          }
                          className="text-xs"
                        >
                          {p.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {p.description || "Payment"}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(p.createdAt)}
                        </span>
                        {p.currency && <span>{p.currency.toUpperCase()}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No payment history yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscription Tiers Tab */}
      {activeTab === "tiers" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Subscription Tiers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingTiers ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : tiers && tiers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tiers.map((tier) => {
                  const isCurrent = subscription?.tier === tier.name;
                  return (
                    <Card key={tier.id} data-testid={`tier-${tier.name}`}>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          {tier.displayName}
                          {isCurrent && (
                            <Badge variant="default" className="ml-2 text-xs">
                              Current
                            </Badge>
                          )}
                        </CardTitle>
                        <p className="text-2xl font-bold">
                          {tier.priceCents === 0 ? "Free" : formatCurrency(tier.priceCents)}
                          {tier.priceCents > 0 && (
                            <span className="text-sm text-muted-foreground">/{tier.interval}</span>
                          )}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <ul className="text-sm space-y-1">
                          {JSON.parse(tier.features || "[]").map((f: string, i: number) => (
                            <li key={i} className="flex items-center gap-1">
                              <span className="text-green-500">✓</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                        {tier.maxProductions && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Up to {tier.maxProductions} productions
                          </p>
                        )}
                        {!isCurrent && tier.priceCents > 0 && (
                          <Button
                            size="sm"
                            className="mt-3 w-full"
                            onClick={() => handleCheckout(tier.name)}
                            disabled={checkoutMutation.isPending}
                            data-testid={`button-checkout-${tier.name}`}
                          >
                            {checkoutMutation.isPending && checkoutMutation.variables === tier.name
                              ? "Redirecting..."
                              : "Upgrade"}
                          </Button>
                        )}
                        {isCurrent && tier.priceCents > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 w-full"
                            onClick={() => cancelMutation.mutate()}
                            disabled={cancelMutation.isPending}
                            data-testid="button-cancel-current"
                          >
                            Cancel Subscription
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No subscription tiers available.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* W-9 Tab */}
      {activeTab === "w9" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Tax Documents (W-9)
              </div>
              <Link href="/w9">
                <Button size="sm" data-testid="button-edit-w9">
                  {w9 ? "Edit W-9" : "Add W-9"}
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingW9 ? (
              <Skeleton className="h-24 w-full" />
            ) : w9 ? (
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Legal Name</span>
                  <p className="text-sm">{w9.fullName}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Business Name</span>
                  <p className="text-sm">{w9.businessName || "N/A"}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Tax Classification</span>
                  <p className="text-sm">{w9.taxClassification}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Tax ID</span>
                  <p className="text-sm">{w9.einOrSsn}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Address</span>
                  <p className="text-sm">{w9.address}, {w9.city}, {w9.state} {w9.zipCode}</p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Badge variant={w9.status === "verified" ? "default" : "secondary"}>
                    {w9.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Submitted {formatDate(w9.submittedAt)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">
                  No W-9 form on file. Submit one to receive payments.
                </p>
                <Link href="/w9">
                  <Button size="sm" data-testid="button-add-w9">
                    <Plus className="h-3 w-3 mr-1" />
                    Add W-9 Form
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
