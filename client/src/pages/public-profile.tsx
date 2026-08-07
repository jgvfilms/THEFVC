import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { apiRequestJson, assetUrl } from "@/lib/queryClient";
import { getVideoEmbedUrl } from "@/lib/video";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, DollarSign, Film, ArrowLeft, ExternalLink, Instagram, Youtube, Linkedin, Music2, Video } from "lucide-react";
import type { Profile, Credit } from "@shared/schema";

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

interface ProfileWithCredits {
  profile: Profile & { handle?: string };
  credits: Credit[];
}

const THEMES: Record<string, { accent: string; bg: string; cover: string }> = {
  cinema_gold: { accent: "#e8b339", bg: "from-amber-950/30 to-stone-950", cover: "from-stone-900/60 to-stone-950/80" },
  warm_sepia: { accent: "#c87f3e", bg: "from-orange-950/30 to-stone-950", cover: "from-orange-950/60 to-stone-950/80" },
  noir_blue: { accent: "#5b8def", bg: "from-blue-950/30 to-slate-950", cover: "from-blue-950/60 to-slate-950/80" },
  forest_green: { accent: "#4ade80", bg: "from-green-950/30 to-stone-950", cover: "from-green-950/60 to-stone-950/80" },
  festival_red: { accent: "#ef4444", bg: "from-red-950/30 to-stone-950", cover: "from-red-950/60 to-stone-950/80" },
  mono_white: { accent: "#e4e4e7", bg: "from-zinc-800/30 to-zinc-950", cover: "from-zinc-800/60 to-zinc-950/80" },
};

interface VideoLink {
  provider: string;
  url: string;
  title: string;
}

const getEmbedUrl = getVideoEmbedUrl;

const SOCIAL_ICONS: Record<string, typeof Instagram> = {
  instagram: Instagram,
  youtube: Youtube,
  vimeo: Video,
  tiktok: Music2,
  twitter: ExternalLink,
  linkedin: Linkedin,
};

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  vimeo: "Vimeo",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
};

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
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data?.profile) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-3">
        <Film className="h-10 w-10 text-muted-foreground mx-auto" />
        <h1 className="font-display text-xl font-semibold">Profile not found</h1>
        <p className="text-sm text-muted-foreground">
          @{handle} hasn't claimed their page yet.
        </p>
        <Link href="/crew">
          <Button variant="outline" size="sm">Browse crew</Button>
        </Link>
      </div>
    );
  }

  const { profile, credits } = data;
  const skills: string[] = profile.skills ? JSON.parse(profile.skills) : [];
  const videoLinks: VideoLink[] = profile.videoLinks ? JSON.parse(profile.videoLinks) : [];
  // Show the reel inline rather than as a link off-site. Only when it's
  // actually embeddable — otherwise it stays a button under Quick Links.
  const reelEmbeddable = !!profile.reelUrl && !!getVideoEmbedUrl(profile.reelUrl);
  const reels: VideoLink[] = reelEmbeddable
    ? [{ provider: "reel", url: profile.reelUrl!, title: "Reel" }, ...videoLinks]
    : videoLinks;
  const socialLinks: Record<string, string> = profile.socialLinks ? JSON.parse(profile.socialLinks) : {};
  const theme = THEMES[profile.themePreset || "cinema_gold"] || THEMES.cinema_gold;

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-0">
      <Link href="/crew">
        <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-crew">
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Crew Finder
        </Button>
      </Link>

      {/* Cover + Avatar with theme */}
      <Card className={`overflow-hidden bg-gradient-to-br ${theme.bg}`} style={{ borderColor: `${theme.accent}30` }}>
        {/* Cover photo */}
        <div className="h-40 relative overflow-hidden">
          {profile.coverUrl ? (
            <img src={assetUrl(profile.coverUrl)} alt="Cover" className="w-full h-full object-cover" data-testid="img-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${theme.cover}`} />
          )}
          <div className={`absolute inset-0 bg-gradient-to-b ${theme.cover}`} />
        </div>

        <CardContent className="pt-0 -mt-14 relative">
          <div className="flex items-end gap-4">
            {/* Avatar */}
            {profile.avatarUrl ? (
              <img
                src={assetUrl(profile.avatarUrl)}
                alt={profile.displayName}
                className="w-24 h-24 rounded-full border-4 object-cover flex-shrink-0"
                style={{ borderColor: theme.accent }}
                data-testid="img-profile-avatar"
              />
            ) : (
              <Avatar
                className="w-24 h-24 border-4 flex-shrink-0"
                style={{ borderColor: theme.accent }}
              >
                <AvatarFallback
                  className="text-xl font-semibold"
                  style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
                >
                  {profile.avatarInitials || profile.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 pb-2">
              <h1 className="font-display text-xl font-bold" data-testid="text-profile-name">
                {profile.displayName}
              </h1>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-role">
                {profile.role}
              </p>
            </div>
          </div>

          {/* Location & rate */}
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
            {profile.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {profile.city}{profile.state ? `, ${profile.state}` : ""}
              </span>
            )}
            {profile.dayRate && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                ${profile.dayRate}/day
              </span>
            )}
            {profile.availability && (
              <Badge
                variant={profile.availability === "available" ? "default" : "secondary"}
                style={profile.availability === "available" ? { backgroundColor: theme.accent, color: "#0a0a0b" } : {}}
                data-testid="badge-availability"
              >
                {profile.availability}
              </Badge>
            )}
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="mt-4 text-sm leading-relaxed" data-testid="text-profile-bio">
              {profile.bio}
            </p>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Skills & Equipment</h3>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Social Links */}
          {Object.keys(socialLinks).length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Social</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(socialLinks).filter(([, url]) => url).map(([platform, url]) => {
                  const Icon = SOCIAL_ICONS[platform] || ExternalLink;
                  const label = SOCIAL_LABELS[platform] || platform;
                  return (
                    <a key={platform} href={url} target="_blank" rel="noopener noreferrer" data-testid={`link-social-${platform}`}>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Icon className="h-3.5 w-3.5" style={{ color: theme.accent }} />
                        {label}
                      </Button>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Links */}
          {((profile.reelUrl && !reelEmbeddable) || profile.imdbUrl || profile.websiteUrl) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.reelUrl && !reelEmbeddable && (
                <a href={profile.reelUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" data-testid="link-reel">
                    <ExternalLink className="h-3 w-3 mr-1" /> Reel
                  </Button>
                </a>
              )}
              {profile.imdbUrl && (
                <a href={profile.imdbUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" data-testid="link-imdb">
                    IMDb
                  </Button>
                </a>
              )}
              {profile.websiteUrl && (
                <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" data-testid="link-website">
                    Website
                  </Button>
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Video Embeds */}
      {reels.length > 0 && (
        <div className="mt-4 space-y-4">
          <h3 className="font-display text-base font-semibold px-1">Reels & Work</h3>
          {reels.map((video, idx) => {
            const embedUrl = getEmbedUrl(video.url);
            return (
              <Card key={idx} data-testid={`video-${idx}`}>
                <CardContent className="p-0 overflow-hidden">
                  {embedUrl ? (
                    <div className="aspect-video">
                      <iframe
                        src={embedUrl}
                        title={video.title || `Video ${idx + 1}`}
                        className="w-full h-full"
                        frameBorder="0"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <a href={video.url} target="_blank" rel="noopener noreferrer" className="block p-4 hover:bg-muted/30">
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{video.title || video.url}</span>
                      </div>
                    </a>
                  )}
                  {video.title && embedUrl && (
                    <p className="text-sm font-medium p-3 border-t border-border">{video.title}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* IMDb Credits */}
      {(() => {
        const imdbCredits: Array<{ title: string; year: number | null; role: string; rating: string | null; imdbUrl: string | null }> =
          profile.imdbCredits ? JSON.parse(profile.imdbCredits) : [];
        if (imdbCredits.length === 0) return null;
        // Group by title
        const byTitle = new Map<string, { title: string; year: number | null; roles: string[]; rating: string | null; imdbUrl: string | null }>();
        for (const c of imdbCredits) {
          const key = c.title;
          if (!byTitle.has(key)) {
            byTitle.set(key, { title: c.title, year: c.year, roles: [], rating: c.rating, imdbUrl: c.imdbUrl });
          }
          byTitle.get(key)!.roles.push(c.role);
        }
        const grouped = Array.from(byTitle.values()).sort((a, b) => (b.year || 0) - (a.year || 0));
        return (
          <Card className="mt-4">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                  <Film className="h-4 w-4" style={{ color: theme.accent }} />
                  Film Credits
                </h3>
                {profile.imdbUrl && (
                  <a href={profile.imdbUrl} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs" style={{ borderColor: `${theme.accent}40`, color: theme.accent }}>
                      IMDb
                    </Badge>
                  </a>
                )}
              </div>
              <div className="space-y-2">
                {grouped.map((credit, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    data-testid={`imdb-credit-${idx}`}
                  >
                    <div className="min-w-0 flex-1">
                      {credit.imdbUrl ? (
                        <a href={credit.imdbUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline truncate block">
                          {credit.title}
                        </a>
                      ) : (
                        <p className="text-sm font-medium truncate">{credit.title}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{credit.roles.join(', ')}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {credit.rating && (
                        <Badge variant="secondary" className="text-xs" style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}>
                          ⭐ {credit.rating}
                        </Badge>
                      )}
                      {credit.year && (
                        <span className="text-xs text-muted-foreground">{credit.year}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Credits */}
      {credits.length > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-5">
            <h3 className="font-display text-base font-semibold mb-3">Credits</h3>
            <div className="space-y-2">
              {credits.map((credit) => (
                <div
                  key={credit.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  data-testid={`credit-${credit.id}`}
                >
                  <div>
                    <p className="text-sm font-medium">{credit.productionTitle}</p>
                    <p className="text-xs text-muted-foreground">{credit.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {credit.format && (
                      <Badge variant="outline" className="text-xs">
                        {credit.format.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{credit.year}</span>
                    {credit.verified && (
                      <Badge variant="default" className="text-xs">Verified</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      <div className="mt-6 text-center">
        <p className="text-xs text-muted-foreground">
          Claimed at <span className="font-mono" style={{ color: theme.accent }}>thefvc.is/{handle}</span>
        </p>
      </div>
    </div>
  );
}
