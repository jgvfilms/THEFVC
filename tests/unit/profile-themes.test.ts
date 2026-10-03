import { describe, it, expect } from "vitest";
import { PROFILE_THEMES, normalizeProfileTheme } from "@/lib/profile-themes";

describe("profile themes", () => {
  it("offers exactly the four looks", () => {
    expect(PROFILE_THEMES.map((t) => t.id)).toEqual(["warm", "blue_hour", "slate_teal", "darkroom"]);
  });

  it("keeps a current look as is", () => {
    for (const t of PROFILE_THEMES) expect(normalizeProfileTheme(t.id)).toBe(t.id);
  });

  it("maps old dark-app presets to their nearest look", () => {
    expect(normalizeProfileTheme("noir_blue")).toBe("blue_hour");
    expect(normalizeProfileTheme("forest_green")).toBe("slate_teal");
    expect(normalizeProfileTheme("mono_white")).toBe("darkroom");
    expect(normalizeProfileTheme("cinema_gold")).toBe("warm");
    expect(normalizeProfileTheme("warm_sepia")).toBe("warm");
  });

  it("falls back to warm for missing or unknown values", () => {
    expect(normalizeProfileTheme(null)).toBe("warm");
    expect(normalizeProfileTheme(undefined)).toBe("warm");
    expect(normalizeProfileTheme("neon")).toBe("warm");
  });
});
