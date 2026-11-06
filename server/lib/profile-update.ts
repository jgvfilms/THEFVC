import { z } from "zod";

export const AVAILABILITY_VALUES = ["available", "booked", "unavailable"] as const;

// These render as <a href> on a public page, so anything but http(s) (e.g.
// javascript:) must never be stored. Empty string clears the field.
const webUrl = z.string().trim().max(500).refine(
  (u) => u === "" || /^https?:\/\//i.test(u),
  "must be an http(s) URL",
);

// JSON-in-a-text-column fields arrive as strings from the editor.
const jsonString = <T extends z.ZodType>(shape: T) =>
  z.string().max(20_000).refine((s) => {
    try { return shape.safeParse(JSON.parse(s)).success; } catch { return false; }
  }, "invalid JSON");

const videoEntry = z.object({ url: z.string().max(500), provider: z.string().max(40).optional(), title: z.string().max(200).optional() });

/**
 * Fields a member may set on their own profile via PATCH /api/profile.
 * Anything not listed is dropped (zod strips unknown keys) — in particular
 * userId, Stripe ids, subscription tier/status and w9Collected, which the
 * server owns, and avatar/cover URLs, which only the upload routes set.
 */
export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(100),
  city: z.string().trim().max(100).nullable(),
  state: z.string().trim().max(100).nullable(),
  country: z.string().trim().max(100).nullable(),
  bio: z.string().max(2000).nullable(),
  avatarInitials: z.string().trim().max(4).nullable(),
  reelUrl: webUrl.nullable(),
  imdbUrl: webUrl.nullable(),
  websiteUrl: webUrl.nullable(),
  themePreset: z.string().max(40),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  dayRate: z.number().int().min(0).max(1_000_000).nullable(),
  availability: z.enum(AVAILABILITY_VALUES),
  isPublic: z.boolean(),
  skills: jsonString(z.array(z.string().max(60)).max(60)),
  videoLinks: jsonString(z.array(z.union([z.string().max(500), videoEntry])).max(50)),
  socialLinks: jsonString(z.record(z.string(), z.string().max(500))),
  // Validated again by pageConfigSchema at the route.
  pageConfig: z.string().max(10_000).nullable(),
}).partial();

/** Video entries are stored as {provider,url,title} objects; older rows may hold bare URL strings. */
export function videoUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((v) => (typeof v === "string" ? v : typeof v?.url === "string" ? v.url : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}
