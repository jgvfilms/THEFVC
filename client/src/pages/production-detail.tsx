import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, MapPin, Calendar, DollarSign, Users, Trash2 } from "lucide-react";
import type { Production, ProductionCrew, Profile } from "@shared/schema";

interface ProductionDetailData {
  production: Production;
  crew: (ProductionCrew & { profile?: Profile })[];
}

const CREW_ROLES = [
  "Director", "Producer", "DP", "1st AC", "2nd AC", "Gaffer", "Best Boy",
  "Sound Mixer", "Boom Operator", "Production Designer", "Art Director",
  "Editor", "Colorist", "Script Supervisor", "Production Coordinator", "Actor",
];

const STATUS_OPTIONS = [
  { value: "pre_production", label: "Pre-Production" },
  { value: "in_production", label: "In Production" },
  { value: "post", label: "Post-Production" },
  { value: "wrapped", label: "Wrapped" },
];

export function ProductionDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [crewHandle, setCrewHandle] = useState("");
  const [crewRole, setCrewRole] = useState("");
  const [crewRate, setCrewRate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/productions", id],
    queryFn: () => apiRequestJson<ProductionDetailData>("GET", `/api/productions/${id}`),
  });

  const addCrewMutation = useMutation({
    mutationFn: (crewData: Record<string, unknown>) =>
      apiRequestJson<ProductionCrew>("POST", `/api/productions/${id}/crew`, crewData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/productions", id] });
      toast({ title: "Crew member added" });
      setShowAddCrew(false);
      setCrewHandle("");
      setCrewRole("");
      setCrewRate("");
    },
    onError: () => {
      toast({ title: "Failed to add crew member", variant: "destructive" });
    },
  });

  const updateCrewMutation = useMutation({
    mutationFn: ({ crewId, status }: { crewId: number; status: string }) =>
      apiRequestJson<ProductionCrew>("PATCH", `/api/crew/${crewId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/productions", id] });
    },
  });

  const removeCrewMutation = useMutation({
    mutationFn: (crewId: number) =>
      apiRequestJson("DELETE", `/api/crew/${crewId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/productions", id] });
      toast({ title: "Crew member removed" });
    },
  });

  const handleAddCrew = () => {
    if (!crewHandle.trim() || !crewRole) {
      toast({ title: "Handle and role are required", variant: "destructive" });
      return;
    }
    // Look up profile by handle
    apiRequestJson<{ profile: Profile }>("GET", `/api/profiles/${crewHandle}`)
      .then((data) => {
        if (!data?.profile) {
          toast({ title: "Profile not found", variant: "destructive" });
          return;
        }
        addCrewMutation.mutate({
          profileId: data.profile.id,
          role: crewRole,
          status: "invited",
          dayRate: crewRate ? parseInt(crewRate) : undefined,
        });
      })
      .catch(() => {
        toast({ title: "Profile not found for that handle", variant: "destructive" });
      });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data?.production) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-muted-foreground">Production not found</p>
        <Link href="/app/productions">
          <Button variant="outline" size="sm">Back to Productions</Button>
        </Link>
      </div>
    );
  }

  const { production, crew } = data;

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/app/productions">
        <Button variant="ghost" size="sm" data-testid="button-back-productions">
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Productions
        </Button>
      </Link>

      {/* Production header */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-xl font-bold" data-testid="text-prod-detail-title">
                {production.title}
              </h1>
              <p className="text-sm text-muted-foreground capitalize mt-0.5">
                {production.type.replace(/_/g, " ")}
              </p>
            </div>
            <Badge variant={production.status === "in_production" ? "default" : "secondary"} data-testid="badge-prod-detail-status">
              {STATUS_OPTIONS.find((s) => s.value === production.status)?.label || production.status}
            </Badge>
          </div>

          {production.description && (
            <p className="text-sm mt-3" data-testid="text-prod-detail-desc">{production.description}</p>
          )}

          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
            {production.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {production.location}
              </span>
            )}
            {production.startDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {production.startDate}
                {production.endDate ? ` — ${production.endDate}` : ""}
              </span>
            )}
            {production.budget && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> ${production.budget.toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Crew management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Crew ({crew.length})
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowAddCrew(!showAddCrew)} data-testid="button-add-crew">
              <Plus className="h-3 w-3 mr-1" /> Add Crew
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Add crew form */}
          {showAddCrew && (
            <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 rounded-lg bg-muted/30">
              <Input
                value={crewHandle}
                onChange={(e) => setCrewHandle(e.target.value)}
                placeholder="@handle"
                className="flex-1"
                data-testid="input-crew-handle"
              />
              <Select value={crewRole} onValueChange={setCrewRole}>
                <SelectTrigger className="w-full sm:w-40" data-testid="select-crew-role">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  {CREW_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={crewRate}
                onChange={(e) => setCrewRate(e.target.value)}
                type="number"
                placeholder="Rate"
                className="w-full sm:w-24"
                data-testid="input-crew-rate"
              />
              <Button onClick={handleAddCrew} disabled={addCrewMutation.isPending} data-testid="button-confirm-add-crew">
                {addCrewMutation.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
          )}

          {/* Crew list */}
          {crew.length > 0 ? (
            <div className="space-y-2">
              {crew.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  data-testid={`crew-member-${member.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {member.profile?.avatarInitials || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {member.profile?.displayName || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.dayRate && (
                      <span className="text-xs text-muted-foreground">${member.dayRate}/day</span>
                    )}
                    <Select
                      value={member.status || "invited"}
                      onValueChange={(v) => updateCrewMutation.mutate({ crewId: member.id, status: v })}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs" data-testid={`select-crew-status-${member.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invited">Invited</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="declined">Declined</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCrewMutation.mutate(member.id)}
                      data-testid={`button-remove-crew-${member.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No crew members yet. Click "Add Crew" to invite someone.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
