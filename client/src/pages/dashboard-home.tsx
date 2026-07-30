import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequestJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Clapperboard, Users, Film, TrendingUp, Plus } from "lucide-react";
import { ActivityFeed, FeedComposer } from "@/components/activity-feed";
import { IndustryNews } from "@/components/industry-news";
import { Newspaper } from "lucide-react";
import type { Profile, Production } from "@shared/schema";

export function DashboardHome() {
  const { user } = useAuth();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/profile"],
    queryFn: () => apiRequestJson<Profile>("GET", "/api/profile"),
  });

  const { data: productions, isLoading: prodsLoading } = useQuery({
    queryKey: ["/api/productions"],
    queryFn: () => apiRequestJson<Production[]>("GET", "/api/productions"),
  });

  const skills: string[] = profile?.skills ? JSON.parse(profile.skills) : [];
  const activeProductions = productions?.filter((p) => p.status === "in_production") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold" data-testid="text-dashboard-title">
          Welcome back, {profile?.displayName || user?.handle}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here's what's happening with your productions.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clapperboard className="h-4 w-4" />
              <span className="text-xs">Productions</span>
            </div>
            <p className="font-display text-2xl font-bold mt-2" data-testid="text-stat-productions">
              {prodsLoading ? "—" : productions?.length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Active</span>
            </div>
            <p className="font-display text-2xl font-bold mt-2" data-testid="text-stat-active">
              {prodsLoading ? "—" : activeProductions.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-xs">Skills</span>
            </div>
            <p className="font-display text-2xl font-bold mt-2" data-testid="text-stat-skills">
              {profileLoading ? "—" : skills.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Film className="h-4 w-4" />
              <span className="text-xs">Day Rate</span>
            </div>
            <p className="font-display text-2xl font-bold mt-2" data-testid="text-stat-dayrate">
              {profileLoading ? "—" : profile?.dayRate ? `$${profile.dayRate}` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Profile completion */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Complete your profile to appear in Crew Finder</span>
                <Badge variant="secondary" data-testid="text-profile-completion">
                  {[
                    profile.displayName,
                    profile.role,
                    profile.city,
                    profile.bio,
                    profile.dayRate,
                    skills.length > 0,
                  ].filter(Boolean).length}/6
                </Badge>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${([
                      profile.displayName,
                      profile.role,
                      profile.city,
                      profile.bio,
                      profile.dayRate,
                      skills.length > 0,
                    ].filter(Boolean).length / 6) * 100}%`,
                  }}
                />
              </div>
              <Link href="/app/profile">
                <Button variant="outline" size="sm" data-testid="button-edit-profile">
                  <Plus className="h-3 w-3 mr-1" /> Edit Profile
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Feed + Industry News */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold">Activity Feed</h2>
          </div>
          <div className="space-y-3">
            <FeedComposer />
            <ActivityFeed />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Newspaper className="h-4 w-4" />
              Industry News
            </h2>
          </div>
          <IndustryNews limit={6} />
        </div>
      </div>

      {/* Recent productions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold">Recent Productions</h2>
          <Link href="/app/productions">
            <Button variant="ghost" size="sm" data-testid="button-view-all-productions">
              View all
            </Button>
          </Link>
        </div>

        {prodsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : productions && productions.length > 0 ? (
          <div className="space-y-2">
            {productions.slice(0, 3).map((prod) => (
              <Link key={prod.id} href={`/app/productions/${prod.id}`}>
                <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                        <Clapperboard className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid={`text-production-title-${prod.id}`}>
                          {prod.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {prod.type.replace(/_/g, " ")} · {prod.location || "No location"}
                        </p>
                      </div>
                    </div>
                    <Badge variant={prod.status === "in_production" ? "default" : "secondary"} data-testid={`badge-prod-status-${prod.id}`}>
                            {prod.status ? prod.status.replace(/_/g, " ") : "Unknown"}
                          </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <Clapperboard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No productions yet</p>
              <Link href="/app/productions">
                <Button size="sm" data-testid="button-create-first-production">
                  <Plus className="h-3 w-3 mr-1" /> Create your first production
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
