import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { apiRequestJson, assetUrl } from "@/lib/queryClient";
import { getVideoEmbedUrl } from "@/lib/video";
import type { Profile, Credit } from "@shared/schema";
import { LandingShell } from "./landing";

// PRD-006: Public profile SEO — set meta tags dynamically
function setProfileMeta(profile: Profile) {
  const title = `${profile.displayName} — ${profile.role} | thefvc.is`;
  const description = profile.bio || `${profile.displayName}, ${profile.role} based in ${profile.city || "thefvc.is"}`;
  const imageUrl = profile.avatarUrl || profile.coverUrl || "";

  document.title = title;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute("content", description);
  } else {
    const meta = document.createElement("meta");
    meta.name = "description";
    meta.content = description;
    document.head.appendChild(meta);
  }

  // Open Graph tags
  const setOg = (property: string, content: string) => {
    let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("property", property);
      document.head.appendChild(tag);
    }
    tag.content = content;
  };
  setOg("og:title", title);
  setOg("og:description", description);
  setOg("og:type", "profile");
  if (imageUrl) {
    setOg("og:image", imageUrl.startsWith("http") ? imageUrl : `${window.location.origin}${imageUrl}`);
  }
  setOg("og:url", window.location.href);

  // Twitter Card
  const setTwitter = (name: string, content: string) => {
    let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", name);
      document.head.appendChild(tag);
    }
    tag.content = content;
  };
  setTwitter("twitter:card", "summary");
  setTwitter("twitter:title", title);
  setTwitter("twitter:description", description);
  if (imageUrl) {
    setTwitter("twitter:image", imageUrl.startsWith("http") ? imageUrl : `${window.location.origin}${imageUrl}`);
  }
}

// Glue an initial to the word after it ("J. Garrett") so the big display name
// never strands a lone "J." on its own line.
function keepInitialsTogether(name: string) {
  return name.replace(/(^|\s)(\p{L}\.)\s+/gu, "$1$2\u00a0");
}

interface ProfileWithCredits {
  profile: Profile & { handle?: string };
  credits: Credit[];
}

interface VideoLink {
  provider: string;
  url: string;
  title: string;
}

interface ImdbCredit {
  title: string;
  year: number | null;
  role: string;
  rating: string | null;
  imdbUrl: string | null;
}

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  vimeo: "Vimeo",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
};

const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available",
  booked: "Booked",
  unavailable: "Unavailable",
};

// Public profiles share the landing page's look so the brand reads the same
// everywhere a visitor lands. Members' theme presets were built for the dark
// app and aren't applied here.
export function PublicProfile() {
  const { handle } = useParams<{ handle: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/profiles", handle],
    queryFn: () => apiRequestJson<ProfileWithCredits>("GET", `/api/profiles/${handle}`),
  });

  // PRD-006: Public profile SEO — update meta tags on load.
  // Must run unconditionally (before the early returns below) so hook order
  // stays stable across renders, or React throws "rendered fewer hooks".
  useEffect(() => {
    if (data?.profile) setProfileMeta(data.profile);
  }, [data]);

  if (isLoading) {
    return (
      <LandingShell>
        <section className="wrap page-body" aria-busy="true">
          <p className="label">Loading profile…</p>
        </section>
      </LandingShell>
    );
  }

  if (!data?.profile) {
    return (
      <LandingShell>
        <section className="wrap page-body pp-missing" aria-labelledby="pp-missing-title">
          <p className="label">Crew profile</p>
          <h1 id="pp-missing-title" className="display">Profile not found<span className="dot">.</span></h1>
          <p className="note">@{handle} hasn't claimed their page yet.</p>
          <Link href="/crew" className="btn btn-ghost">Browse crew</Link>
        </section>
      </LandingShell>
    );
  }

  const { profile, credits } = data;
  const skills: string[] = profile.skills ? JSON.parse(profile.skills) : [];
  const videoLinks: VideoLink[] = profile.videoLinks ? JSON.parse(profile.videoLinks) : [];
  // Show the reel inline rather than as a link off-site. Only when it's
  // actually embeddable — otherwise it stays a button with the other links.
  const reelEmbeddable = !!profile.reelUrl && !!getVideoEmbedUrl(profile.reelUrl);
  const reels: VideoLink[] = reelEmbeddable
    ? [{ provider: "reel", url: profile.reelUrl!, title: "Reel" }, ...videoLinks]
    : videoLinks;
  const socialLinks: Record<string, string> = profile.socialLinks ? JSON.parse(profile.socialLinks) : {};
  const socials = Object.entries(socialLinks).filter(([, url]) => url);
  const initials = profile.avatarInitials || profile.displayName.slice(0, 2).toUpperCase();
  const place = profile.city ? `${profile.city}${profile.state ? `, ${profile.state}` : ""}` : null;

  const imdbCredits: ImdbCredit[] = profile.imdbCredits ? JSON.parse(profile.imdbCredits) : [];
  const byTitle = new Map<string, { title: string; year: number | null; roles: string[]; rating: string | null; imdbUrl: string | null }>();
  for (const c of imdbCredits) {
    if (!byTitle.has(c.title)) byTitle.set(c.title, { title: c.title, year: c.year, roles: [], rating: c.rating, imdbUrl: c.imdbUrl });
    byTitle.get(c.title)!.roles.push(c.role);
  }
  const filmCredits = Array.from(byTitle.values()).sort((a, b) => (b.year || 0) - (a.year || 0));

  return (
    <LandingShell>
      <section className="hero" aria-labelledby="pp-name">
        <div className="wrap pp-back">
          <Link href="/crew" className="label pp-backlink" data-testid="button-back-crew">← Crew directory</Link>
        </div>
        <div className="wrap hero-grid pp-hero">
          <div className="hero-copy">
            <div className="pp-id">
              {profile.avatarUrl
                ? <img className="pp-avatar" src={assetUrl(profile.avatarUrl)} alt={profile.displayName} data-testid="img-profile-avatar" />
                : <span className="pp-avatar" aria-hidden="true">{initials}</span>}
              <div>
                <p className="label">Crew profile / <b>thefvc.is/{handle}</b></p>
                <p className="pp-role" data-testid="text-profile-role">{profile.role}</p>
              </div>
            </div>
            <h1 id="pp-name" className="display pp-name" data-testid="text-profile-name">
              {keepInitialsTogether(profile.displayName)}<span className="dot">.</span>
            </h1>

            {profile.bio && <p className="lede pp-bio" data-testid="text-profile-bio">{profile.bio}</p>}

            {(place || profile.dayRate || profile.availability) && (
              <dl className="facts pp-facts">
                {place && <><dt>Based in</dt><dd>{place}</dd></>}
                {profile.dayRate && <><dt>Day rate</dt><dd className="num">${profile.dayRate}/day</dd></>}
                {profile.availability && (
                  <><dt>Availability</dt><dd>
                    <span className={`chip ${profile.availability === "available" ? "ok" : "wait"}`} data-testid="badge-availability">
                      {AVAILABILITY_LABELS[profile.availability] || profile.availability}
                    </span>
                  </dd></>
                )}
              </dl>
            )}

            {(socials.length > 0 || (profile.reelUrl && !reelEmbeddable) || profile.imdbUrl || profile.websiteUrl) && (
              <div className="cta-row">
                {profile.reelUrl && !reelEmbeddable && (
                  <a href={profile.reelUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" data-testid="link-reel">Watch reel</a>
                )}
                {profile.imdbUrl && (
                  <a href={profile.imdbUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" data-testid="link-imdb">IMDb</a>
                )}
                {profile.websiteUrl && (
                  <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" data-testid="link-website">Website</a>
                )}
                {socials.map(([platform, url]) => (
                  <a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" data-testid={`link-social-${platform}`}>
                    {SOCIAL_LABELS[platform] || platform}
                  </a>
                ))}
              </div>
            )}

            {skills.length > 0 && (
              <div className="pp-skills">
                <p className="label">Skills &amp; equipment</p>
                <div className="tags">{skills.map((s) => <span key={s}>{s}</span>)}</div>
              </div>
            )}
          </div>

          <div className="hero-media">
            <figure className="plate">
              <span className="crop tl" aria-hidden="true" />
              <span className="crop tr" aria-hidden="true" />
              <span className="crop bl" aria-hidden="true" />
              <span className="crop br" aria-hidden="true" />
              {profile.coverUrl
                ? <img className="photo" src={assetUrl(profile.coverUrl)} alt="" data-testid="img-cover" />
                : <div className="photo pp-cover-blank" aria-hidden="true">{initials}</div>}
              <div className="plate-overlay" aria-hidden="true">
                <div className="plate-folio"><span>THEFVC<b>/</b>IS</span><span>{profile.role}</span></div>
                {place && <span className="plate-side">{place}</span>}
                <span className="plate-fig">@{handle}</span>
              </div>
            </figure>
          </div>
        </div>
      </section>

      {reels.length > 0 && (
        <section className="band" aria-labelledby="pp-reels">
          <div className="wrap">
            <div className="sec-head">
              <p className="label">Reels &amp; work</p>
              <h2 id="pp-reels" className="display">The work<span className="dot">.</span></h2>
            </div>
            <div className="pp-reels">
              {reels.map((video, idx) => {
                const embedUrl = getVideoEmbedUrl(video.url);
                return (
                  <figure key={idx} className="card pp-reel" data-testid={`video-${idx}`}>
                    {embedUrl ? (
                      <div className="pp-frame">
                        <iframe src={embedUrl} title={video.title || `Video ${idx + 1}`}
                          allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
                      </div>
                    ) : (
                      <a href={video.url} target="_blank" rel="noopener noreferrer" className="pp-reel-link">{video.title || video.url}</a>
                    )}
                    {video.title && embedUrl && <figcaption className="label">{video.title}</figcaption>}
                  </figure>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {(filmCredits.length > 0 || credits.length > 0) && (
        <section className="band" aria-labelledby="pp-credits">
          <div className="wrap">
            <div className="sec-head">
              <p className="label">Credits</p>
              <h2 id="pp-credits" className="display">Filmography<span className="dot">.</span></h2>
            </div>
            <div className="pp-credit-cols">
              {filmCredits.length > 0 && (
                <div className="card">
                  <div className="card-h">
                    <p className="label"><b>Film credits</b></p>
                    {profile.imdbUrl && <a href={profile.imdbUrl} target="_blank" rel="noopener noreferrer" className="sample-tag">IMDb</a>}
                  </div>
                  <ul className="rows">
                    {filmCredits.map((credit, idx) => (
                      <li key={idx} data-testid={`imdb-credit-${idx}`}>
                        {credit.imdbUrl
                          ? <a href={credit.imdbUrl} target="_blank" rel="noopener noreferrer" className="n pp-credit-title">{credit.title}</a>
                          : <span className="n">{credit.title}</span>}
                        <span className="s">{credit.roles.join(", ")}</span>
                        <span className="r">
                          {credit.year && <span className="num">{credit.year}</span>}
                          {credit.rating && <span className="chip">★ {credit.rating}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {credits.length > 0 && (
                <div className="card">
                  <div className="card-h"><p className="label"><b>FVC credits</b></p></div>
                  <ul className="rows">
                    {credits.map((credit) => (
                      <li key={credit.id} data-testid={`credit-${credit.id}`}>
                        <span className="n">{credit.productionTitle}</span>
                        <span className="s">{credit.role}{credit.format ? ` · ${credit.format.replace(/_/g, " ")}` : ""}</span>
                        <span className="r">
                          <span className="num">{credit.year}</span>
                          {credit.verified && <span className="chip ok">Verified</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </LandingShell>
  );
}
