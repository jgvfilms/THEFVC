import { z } from "zod";

// Section ids map to the bands on the public profile. The hero is always
// shown, so it is deliberately not configurable.
export const PAGE_SECTION_IDS = ["work", "filmography"] as const;

// Keep in sync with PROFILE_THEMES in client/src/lib/profile-themes.ts.
export const PROFILE_THEME_IDS = ["warm", "blue_hour", "slate_teal", "darkroom"] as const;

// https only: these render as <a href> on a public page, so javascript: and
// data: URLs must never get through.
const httpsUrl = z.string().url().max(500).refine((u) => u.startsWith("https://"), "must be an https URL");

export const pageConfigSchema = z.object({
  sections: z.array(z.object({
    id: z.enum(PAGE_SECTION_IDS),
    visible: z.boolean(),
  })).max(PAGE_SECTION_IDS.length),
  headline: z.string().trim().max(140).nullish(),
  customLinks: z.array(z.object({
    label: z.string().trim().min(1).max(40),
    url: httpsUrl,
  })).max(10),
}).strict();

export type PageConfig = z.infer<typeof pageConfigSchema>;

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  sections: PAGE_SECTION_IDS.map((id) => ({ id, visible: true })),
  headline: null,
  customLinks: [],
};

export function parsePageConfig(raw: string | null | undefined): PageConfig {
  if (!raw) return DEFAULT_PAGE_CONFIG;
  try {
    const r = pageConfigSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : DEFAULT_PAGE_CONFIG;
  } catch {
    return DEFAULT_PAGE_CONFIG;
  }
}

/**
 * Editor-side parse: keeps half-finished rows (e.g. a link with no label yet)
 * instead of collapsing to defaults the way parsePageConfig does. Only the
 * strict schema is ever trusted for rendering or saving.
 */
export function parsePageConfigDraft(raw: string | null | undefined): PageConfig {
  const strict = parsePageConfig(raw);
  if (!raw) return strict;
  try {
    const d = JSON.parse(raw);
    const sections = pageConfigSchema.shape.sections.safeParse(d.sections);
    return {
      sections: sections.success && sections.data.length ? sections.data : strict.sections,
      headline: typeof d.headline === "string" ? d.headline : null,
      customLinks: Array.isArray(d.customLinks)
        ? d.customLinks.map((l: { label?: unknown; url?: unknown }) => ({ label: String(l?.label ?? ""), url: String(l?.url ?? "") }))
        : [],
    };
  } catch {
    return strict;
  }
}
