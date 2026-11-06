import { describe, it, expect } from "vitest";
import { getVideoEmbedUrl } from "../../client/src/lib/video";

describe("getVideoEmbedUrl", () => {
  it("embeds the plain YouTube watch URL", () => {
    expect(getVideoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("embeds youtu.be short links, including ones carrying share params", () => {
    expect(getVideoEmbedUrl("https://youtu.be/dQw4w9WgXcQ?si=abc123")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("embeds Shorts, which the share sheet hands out by default on mobile", () => {
    expect(getVideoEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("keeps a timestamp when the member linked to a specific moment", () => {
    expect(getVideoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?start=90",
    );
  });

  it("embeds a plain Vimeo URL", () => {
    expect(getVideoEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
  });

  // The one that matters most for filmmakers: unlisted review links. Dropping
  // the hash yields a player that 404s for every logged-out visitor.
  it("carries the hash through on unlisted Vimeo links", () => {
    expect(getVideoEmbedUrl("https://vimeo.com/123456789/a1b2c3d4e5")).toBe(
      "https://player.vimeo.com/video/123456789?h=a1b2c3d4e5",
    );
  });

  it("handles Vimeo channel and group URLs", () => {
    expect(getVideoEmbedUrl("https://vimeo.com/channels/staffpicks/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
    expect(getVideoEmbedUrl("https://vimeo.com/groups/shortfilms/videos/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("returns null for things it can't embed, so the caller can link out", () => {
    expect(getVideoEmbedUrl("https://example.com/my-reel.mp4")).toBeNull();
    expect(getVideoEmbedUrl("")).toBeNull();
  });
});
