/**
 * Turn a pasted video URL into an embeddable player URL.
 *
 * Members paste whatever the share button gave them, which is rarely the plain
 * watch URL: Shorts, youtu.be with tracking params, and — most often for
 * filmmakers — unlisted Vimeo review links that carry a required `h=` hash.
 * Anything we fail to parse falls back to an external link, so a miss here is
 * silently a visitor leaving the site.
 */
export function getVideoEmbedUrl(url: string): string | null {
  if (!url) return null;

  const trimmed = url.trim();

  // YouTube: watch, youtu.be, shorts, live, and already-embed URLs.
  const yt =
    trimmed.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/(?:shorts|embed|live)\/)([\w-]{11})/);
  if (yt) {
    const start = trimmed.match(/[?&](?:t|start)=(\d+)/);
    return `https://www.youtube.com/embed/${yt[1]}${start ? `?start=${start[1]}` : ""}`;
  }

  // Vimeo. The unlisted form is vimeo.com/<id>/<hash>; the hash must be passed
  // through as `h=` or the player 404s for anyone who isn't signed in.
  const vimeo = trimmed.match(/vimeo\.com\/(?:channels\/[\w-]+\/|groups\/[\w-]+\/videos\/|video\/)?(\d+)(?:\/([\w]+))?/);
  if (vimeo) {
    const hash = vimeo[2] || trimmed.match(/[?&]h=([\w]+)/)?.[1];
    return `https://player.vimeo.com/video/${vimeo[1]}${hash ? `?h=${hash}` : ""}`;
  }

  return null;
}
