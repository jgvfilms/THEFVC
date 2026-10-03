// Looks a member can pick for their public profile. Each id maps to a
// `.theme-<id>` palette in pages/landing.css; "warm" is the site's own look.
export type ProfileThemeId = "warm" | "blue_hour" | "slate_teal" | "darkroom";

export const PROFILE_THEMES: { id: ProfileThemeId; label: string; paper: string; ink: string; signal: string }[] = [
  { id: "warm", label: "Warm", paper: "#f2ede2", ink: "#17150f", signal: "#c2410c" },
  { id: "blue_hour", label: "Blue hour", paper: "#e7ebee", ink: "#0f161d", signal: "#1d5c8c" },
  { id: "slate_teal", label: "Slate and teal", paper: "#e6ecea", ink: "#0e1a19", signal: "#0f6b63" },
  { id: "darkroom", label: "Darkroom", paper: "#11161b", ink: "#e8edf0", signal: "#4fa3c7" },
];

// Profiles saved before these looks existed still hold the old dark-app
// presets; map each to its nearest look rather than migrating stored rows.
const LEGACY: Record<string, ProfileThemeId> = {
  noir_blue: "blue_hour",
  forest_green: "slate_teal",
  mono_white: "darkroom",
};

export function normalizeProfileTheme(value: string | null | undefined): ProfileThemeId {
  if (value && PROFILE_THEMES.some((t) => t.id === value)) return value as ProfileThemeId;
  return (value && LEGACY[value]) || "warm";
}
