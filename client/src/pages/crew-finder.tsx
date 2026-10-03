import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequestJson, assetUrl } from "@/lib/queryClient";
import type { Profile } from "@shared/schema";
import { LandingShell } from "./landing";

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

  // Any filter change starts the results over at page 1.
  const update = (setter: (val: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages || isLoading) return;
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <LandingShell>
      <section className="wrap page-body" aria-labelledby="crew-title">
        <div className="sec-head">
          <p className="label">Crew directory</p>
          <h1 id="crew-title" className="display" style={{ fontSize: "clamp(2.8rem, 6.4vw, 6rem)" }}>
            Find your crew<span className="dot">.</span>
          </h1>
        </div>
        <p className="note">Search FVC members by role, city, skills and availability.</p>

        <div className="card crew-search">
          <div className="crew-fields">
            <label className="field field-wide">
              <span className="label">City</span>
              <input value={search} onChange={(e) => update(setSearch)(e.target.value)}
                placeholder="e.g. Buffalo" data-testid="input-search-city" />
            </label>
            <label className="field field-wide">
              <span className="label">Skill or gear</span>
              <input value={skillFilter} onChange={(e) => update(setSkillFilter)(e.target.value)}
                placeholder="e.g. RED Komodo, Steadicam" data-testid="input-search-skill" />
            </label>
            <label className="field">
              <span className="label">Role</span>
              <select value={roleFilter} onChange={(e) => update(setRoleFilter)(e.target.value)} data-testid="select-role-filter">
                {ROLE_FILTERS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="label">Availability</span>
              <select value={availabilityFilter} onChange={(e) => update(setAvailabilityFilter)(e.target.value)} data-testid="select-availability-filter">
                <option value="all">All</option>
                <option value="available">Available only</option>
                <option value="booked">Booked</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Sort</span>
              <select value={sortBy} onChange={(e) => update(setSortBy)(e.target.value)} data-testid="select-sort">
                {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="crew-results-head">
          <p className="label" aria-live="polite">
            {isLoading ? "Loading crew…" : <><b>{total}</b> {total === 1 ? "member" : "members"}</>}
          </p>
        </div>

        {error ? (
          <div className="card crew-empty"><p>Something went wrong loading crew. Try again.</p></div>
        ) : isLoading ? (
          <div className="card" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="person crew-skeleton"><span /><span /></div>)}
          </div>
        ) : profiles.length > 0 ? (
          <ul className="card crew-list">
            {profiles.map((p) => {
              const skills: string[] = p.skills ? JSON.parse(p.skills) : [];
              const initials = p.avatarInitials || p.displayName.slice(0, 2).toUpperCase();
              return (
                <li key={p.id}>
                  <Link href={`/${p.handle}`} className="person crew-person" data-testid={`card-crew-${p.id}`}>
                    {p.avatarUrl
                      ? <img className="avatar" src={assetUrl(p.avatarUrl)} alt="" />
                      : <span className="avatar" aria-hidden="true">{initials}</span>}
                    <div className="crew-who">
                      <p className="n">{p.displayName}</p>
                      <p className="s">
                        <span>{p.role}</span>
                        {p.city && <span className="crew-place">{p.city}{p.state ? `, ${p.state}` : ""}</span>}
                      </p>
                      {skills.length > 0 && (
                        <div className="tags">
                          {skills.slice(0, 3).map((s) => <span key={s}>{s}</span>)}
                          {skills.length > 3 && <span>+{skills.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <div className="crew-meta">
                      {p.availability === "available" && <span className="chip ok">Available</span>}
                      {p.dayRate && <span className="num">${p.dayRate}/day</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="card crew-empty"><p>No crew match those filters. Try fewer filters.</p></div>
        )}

        {totalPages > 1 && (
          <nav className="crew-pager" aria-label="Pages">
            <button type="button" className="btn btn-ghost" onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading} data-testid="button-prev-page">Previous</button>
            <span className="label">Page <b>{currentPage}</b> of {totalPages}</span>
            <button type="button" className="btn btn-ghost" onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || isLoading} data-testid="button-next-page">Next</button>
          </nav>
        )}
      </section>
    </LandingShell>
  );
}
