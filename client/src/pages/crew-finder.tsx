import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequestJson } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import type { Profile } from "@shared/schema";

const ROLE_FILTERS = [
  "All", "Director", "Director of Photography", "Camera Operator", "1st AC",
  "Gaffer", "Sound Mixer", "Production Designer", "Editor", "Producer",
];

const SORT_OPTIONS = [
  { value: "createdAt_desc", label: "Newest" },
  { value: "createdAt_asc", label: "Oldest" },
  { value: "dayRate_asc", label: "Rate: Low to High" },
  { value: "dayRate_desc", label: "Rate: High to Low" },
  { value: "displayName_asc", label: "Name: A-Z" },
];

const PAGE_SIZE = 20;

interface CrewFinderResponse {
  profiles: (Profile & { handle: string })[];
  total: number;
}

export function CrewFinder() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [skillFilter, setSkillFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt_desc");
  const [currentPage, setCurrentPage] = useState(1);

  const queryParams = new URLSearchParams();
  if (roleFilter !== "All") queryParams.set("role", roleFilter);
  if (search) queryParams.set("city", search);
  if (skillFilter) queryParams.set("skill", skillFilter);
  if (availabilityFilter !== "all") queryParams.set("availability", availabilityFilter);
  queryParams.set("sortBy", sortBy.split("_")[0]);
  queryParams.set("sortDir", sortBy.split("_")[1]);
  queryParams.set("limit", String(PAGE_SIZE));
  queryParams.set("offset", String((currentPage - 1) * PAGE_SIZE));

  const { data, isLoading, error } = useQuery({
    queryKey: ["crew-finder", roleFilter, search, skillFilter, availabilityFilter, sortBy, currentPage],
    queryFn: () =>
      apiRequestJson<CrewFinderResponse>("GET", `/api/profiles/paginated?${queryParams.toString()}`),
    placeholderData: (prev) => prev,
  });

  const profiles = data?.profiles ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Reset to first page when filters change
  const handleFilterChange = (setter: (val: string) => void, value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const handleSkillChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSkillFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages || isLoading) return;
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeFilters = [
    roleFilter !== "All" && `Role: ${roleFilter}`,
    skillFilter && `Skill: ${skillFilter}`,
    availabilityFilter !== "all" && `Availability: ${availabilityFilter}`,
  ].filter(Boolean);

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl font-bold">Crew Finder</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find verified crew by role, location, skills, and availability.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={handleSearchChange}
              placeholder="Search by city..."
              className="pl-9"
              data-testid="input-search-city"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => handleFilterChange(setRoleFilter, v)}>
            <SelectTrigger className="w-48" data-testid="select-role-filter">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_FILTERS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={skillFilter}
              onChange={handleSkillChange}
              placeholder="Search by skill (e.g. RED Komodo, Steadicam)..."
              className="pl-9"
              data-testid="input-search-skill"
            />
          </div>
          <Select
            value={availabilityFilter}
            onValueChange={(v) => handleFilterChange(setAvailabilityFilter, v)}
          >
            <SelectTrigger className="w-48" data-testid="select-availability-filter">
              <SelectValue placeholder="Filter by availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Availability</SelectItem>
              <SelectItem value="available">Available Only</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="unavailable">Unavailable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="w-48" data-testid="select-sort">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Active filters */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((f) => (
              <Badge key={String(f)} variant="secondary" className="text-xs">
                {f}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Something went wrong loading crew results. Try again.
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(PAGE_SIZE)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : profiles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {profiles.map((p) => {
            const skills: string[] = p.skills ? JSON.parse(p.skills) : [];
            return (
              <Link key={p.id} href={`/${p.handle}`}>
                <Card className="hover:border-primary/40 transition-colors cursor-pointer" data-testid={`card-crew-${p.id}`}>
                  <CardContent className="py-4 flex items-start gap-3">
                    <Avatar className="h-12 w-12 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {p.avatarInitials || p.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate">{p.displayName}</p>
                        {p.availability === "available" && (
                          <Badge variant="default" className="text-xs flex-shrink-0">Available</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{p.role}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {p.city && (
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {p.city}, {p.state}
                          </span>
                        )}
                        {p.dayRate && (
                          <span className="flex items-center gap-0.5">
                            <DollarSign className="h-3 w-3" />
                            ${p.dayRate}/day
                          </span>
                        )}
                      </div>
                      {skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {skills.slice(0, 3).map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                          ))}
                          {skills.length > 3 && (
                            <Badge variant="outline" className="text-xs">+{skills.length - 3}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No crew found. Try adjusting your filters.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results count & Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            {total} {total === 1 ? "result" : "results"} found — showing page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || isLoading}
              data-testid="button-next-page"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


