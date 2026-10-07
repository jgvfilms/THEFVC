import { useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson, assetUrl, getAuthToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, MapPin, Calendar, DollarSign, Users, Trash2, ImagePlus } from "lucide-react";
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
  { value: "wrapped", label: "Complete" },
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

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequestJson<Production>("PATCH", `/api/productions/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/productions", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/productions"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverMutation = useMutation({
    mutationFn: async (file: File | null) => {
      // FormData upload, so this can't go through apiRequestJson (which sends JSON).
      const token = getAuthToken();
      const init: RequestInit = { headers: token ? { Authorization: `Bearer ${token}` } : {} };
      if (file) {
        const body = new FormData();
        body.append("cover", file);
        Object.assign(init, { method: "POST", body });
      } else {
        init.method = "DELETE";
      }
      const res = await fetch(assetUrl(`/api/productions/${id}/cover`)!, init);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed");
      return json as Production;
    },
    onSuccess: (_data, file) => {
      queryClient.invalidateQueries({ queryKey: ["/api/productions", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/productions"] });
      toast({ title: file ? "Cover image updated" : "Cover image removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't update the cover image", description: err.message, variant: "destructive" });
    },
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

      {/* Cover image */}
      <div className="relative overflow-hidden rounded-lg border bg-muted aspect-[21/9]" data-testid="prod-cover">
        {production.coverUrl ? (
          <>
            <img
              src={assetUrl(production.coverUrl)}
              alt={`Cover image for ${production.title}`}
              className="h-full w-full object-cover"
              data-testid="img-prod-cover"
            />
            <div className="absolute bottom-2 right-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => coverInputRef.current?.click()} disabled={coverMutation.isPending} data-testid="button-replace-cover">
                <ImagePlus className="h-3 w-3 mr-1" /> Replace
              </Button>
              <Button size="sm" variant="secondary" onClick={() => coverMutation.mutate(null)} disabled={coverMutation.isPending} data-testid="button-remove-cover">
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={coverMutation.isPending}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors border-2 border-dashed border-border rounded-lg"
            data-testid="button-add-cover"
          >
            <ImagePlus className="h-6 w-6" />
            <span className="text-sm">{coverMutation.isPending ? "Uploading..." : "Add a cover image"}</span>
            <span className="text-xs">JPEG, PNG or WebP, up to 8 MB</span>
          </button>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) coverMutation.mutate(file);
            e.target.value = "";
          }}
          data-testid="input-prod-cover"
        />
      </div>

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
            <Select
              value={production.status || "pre_production"}
              onValueChange={(v) => updateStatusMutation.mutate(v)}
              disabled={updateStatusMutation.isPending}
            >
              <SelectTrigger className="h-8 w-40 text-xs" data-testid="select-prod-detail-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value} data-testid={`option-prod-status-${s.value}`}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
