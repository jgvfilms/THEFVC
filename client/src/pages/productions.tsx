import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequestJson } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Clapperboard, MapPin, Calendar } from "lucide-react";
import type { Production } from "@shared/schema";

const PRODUCTION_TYPES = [
  { value: "feature", label: "Feature Film" },
  { value: "short", label: "Short Film" },
  { value: "music_video", label: "Music Video" },
  { value: "commercial", label: "Commercial" },
  { value: "web", label: "Web Series" },
  { value: "documentary", label: "Documentary" },
];

const STATUS_LABELS: Record<string, string> = {
  pre_production: "Pre-Production",
  in_production: "In Production",
  post: "Post-Production",
  wrapped: "Wrapped",
};

export function ProductionsList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newProd, setNewProd] = useState({
    title: "",
    type: "short",
    description: "",
    location: "",
    startDate: "",
    endDate: "",
    budget: "",
  });

  const { data: productions, isLoading } = useQuery({
    queryKey: ["/api/productions"],
    queryFn: () => apiRequestJson<Production[]>("GET", "/api/productions"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequestJson<Production>("POST", "/api/productions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/productions"] });
      toast({ title: "Production created", description: "Your new production is ready." });
      setOpen(false);
      setNewProd({ title: "", type: "short", description: "", location: "", startDate: "", endDate: "", budget: "" });
    },
    onError: () => {
      toast({ title: "Failed to create production", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newProd.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      title: newProd.title,
      type: newProd.type,
      description: newProd.description || undefined,
      location: newProd.location || undefined,
      startDate: newProd.startDate || undefined,
      endDate: newProd.endDate || undefined,
      budget: newProd.budget ? parseInt(newProd.budget) : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Productions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your film projects and crew.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-production">
              <Plus className="h-4 w-4 mr-1" /> New Production
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Production</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prod-title">Title</Label>
                <Input
                  id="prod-title"
                  value={newProd.title}
                  onChange={(e) => setNewProd({ ...newProd, title: e.target.value })}
                  placeholder="My Indie Feature"
                  data-testid="input-prod-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-type">Type</Label>
                <Select value={newProd.type} onValueChange={(v) => setNewProd({ ...newProd, type: v })}>
                  <SelectTrigger data-testid="select-prod-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-desc">Description</Label>
                <Textarea
                  id="prod-desc"
                  value={newProd.description}
                  onChange={(e) => setNewProd({ ...newProd, description: e.target.value })}
                  placeholder="Brief description of the project..."
                  rows={3}
                  data-testid="input-prod-desc"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="prod-location">Location</Label>
                  <Input
                    id="prod-location"
                    value={newProd.location}
                    onChange={(e) => setNewProd({ ...newProd, location: e.target.value })}
                    placeholder="Brooklyn, NY"
                    data-testid="input-prod-location"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prod-budget">Budget ($)</Label>
                  <Input
                    id="prod-budget"
                    type="number"
                    value={newProd.budget}
                    onChange={(e) => setNewProd({ ...newProd, budget: e.target.value })}
                    placeholder="50000"
                    data-testid="input-prod-budget"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="prod-start">Start Date</Label>
                  <Input
                    id="prod-start"
                    type="date"
                    value={newProd.startDate}
                    onChange={(e) => setNewProd({ ...newProd, startDate: e.target.value })}
                    data-testid="input-prod-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prod-end">End Date</Label>
                  <Input
                    id="prod-end"
                    type="date"
                    value={newProd.endDate}
                    onChange={(e) => setNewProd({ ...newProd, endDate: e.target.value })}
                    data-testid="input-prod-end"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-create-production">
                  {createMutation.isPending ? "Creating..." : "Create Production"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : productions && productions.length > 0 ? (
        <div className="space-y-2">
          {productions.map((prod) => (
            <Link key={prod.id} href={`/app/productions/${prod.id}`}>
              <Card className="hover:border-primary/40 transition-colors cursor-pointer" data-testid={`card-production-${prod.id}`}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                      <Clapperboard className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium" data-testid={`text-prod-title-${prod.id}`}>{prod.title}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span className="capitalize">{prod.type.replace(/_/g, " ")}</span>
                        {prod.location && (
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" /> {prod.location}
                          </span>
                        )}
                        {prod.startDate && (
                          <span className="flex items-center gap-0.5">
                            <Calendar className="h-3 w-3" /> {prod.startDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge variant={prod.status === "in_production" ? "default" : "secondary"} data-testid={`badge-prod-status-${prod.id}`}>
                    {prod.status ? (STATUS_LABELS[prod.status] || prod.status) : "Unknown"}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Clapperboard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">No productions yet</p>
            <Button size="sm" onClick={() => setOpen(true)} data-testid="button-create-production-empty">
              <Plus className="h-3 w-3 mr-1" /> Create your first production
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
