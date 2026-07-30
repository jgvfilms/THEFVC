import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequestJson, assetUrl } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  UserPlus,
  Clapperboard,
  MessageSquare,
  Send,
  ExternalLink,
  Clock,
  Video,
  Instagram,
  Heart,
  Link2,
} from "lucide-react";

type FeedItem = {
  id: number;
  type: string;
  message?: string;
  metadata?: string | null;
  createdAt: string | number;
  user?: { handle?: string } | null;
  profile?: {
    displayName?: string;
    role?: string;
    city?: string;
    avatarUrl?: string | null;
    avatarInitials?: string | null;
  } | null;
  // For posts
  body?: string;
  linkUrl?: string | null;
  // Internal flag to distinguish activities from posts in the merged timeline
  isActivity?: boolean;
};

function timeAgo(date: string | number): string {
  const now = Date.now();
  const then = typeof date === "number" ? date : new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getActivityIcon(type: string) {
  switch (type) {
    case "member_joined": return UserPlus;
    case "production_created": return Clapperboard;
    case "post_shared": return MessageSquare;
    case "video_shared": return Video;
    case "social_shared": return Instagram;
    case "profile_updated": return UserPlus;
    default: return MessageSquare;
  }
}

function parseMetadata(item: FeedItem): { url?: string; platform?: string } {
  if (!item.metadata) return {};
  try {
    return JSON.parse(item.metadata);
  } catch {
    return {};
  }
}

function getSocialIcon(platform?: string) {
  if (!platform) return Link2;
  const lower = platform.toLowerCase();
  if (lower.includes("instagram")) return Instagram;
  if (lower.includes("youtube") || lower.includes("vimeo") || lower.includes("video")) return Video;
  return Link2;
}

function MediaCard({ item, index }: { item: FeedItem; index: number }) {
  if (item.type !== "video_shared" && item.type !== "social_shared") return null;
  const meta = parseMetadata(item);
  if (!meta.url) return null;
  const SocialIcon = getSocialIcon(meta.platform);
  let displayUrl = meta.url;
  try {
    const u = new URL(meta.url);
    displayUrl = u.hostname + u.pathname.slice(0, 30);
  } catch (e) {
    // use default meta.url
  }
  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-2 rounded-lg border border-border p-2.5 hover:border-primary/40 transition-colors group"
      data-testid={`feed-media-link-${index}`}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary flex-shrink-0">
        <SocialIcon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{meta.platform || "Link"}</p>
        <p className="text-xs text-muted-foreground truncate">{displayUrl}</p>
      </div>
      <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary flex-shrink-0" />
    </a>
  );
}

export function FeedComposer() {
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: { body: string; linkUrl?: string }) =>
      apiRequestJson("POST", "/api/feed/posts", data),
    onSuccess: () => {
      toast({ title: "Posted!", description: "Your update is live on the feed." });
      setBody("");
      setLinkUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    },
    onError: () => {
      toast({ title: "Failed to post", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!body.trim()) return;
    mutation.mutate({ body: body.trim(), linkUrl: linkUrl.trim() || undefined });
  };

  return (
    <Card data-testid="card-feed-composer">
      <CardContent className="pt-5">
        <div className="flex gap-3">
          <Textarea
            placeholder="Share an update with the collective..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="resize-none min-h-[80px] bg-background"
            data-testid="textarea-post-body"
            maxLength={2000}
          />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Input
            placeholder="Optional link URL (YouTube, Vimeo, etc.)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="flex-1 text-sm bg-background"
            data-testid="input-post-link"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!body.trim() || mutation.isPending}
            data-testid="button-submit-post"
          >
            <Send className="h-3 w-3 mr-1" />
            {mutation.isPending ? "Posting..." : "Post"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {body.length}/2000 characters
        </p>
      </CardContent>
    </Card>
  );
}

export function ActivityFeed({ publicMode = false }: { publicMode?: boolean }) {
  const queryKey = publicMode ? ["/api/feed/public"] : ["/api/feed"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiRequestJson<{ activities: FeedItem[]; posts: FeedItem[] }>(
      "GET",
      publicMode ? "/api/feed/public" : "/api/feed"
    ),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  // Merge activities and posts into a single timeline sorted by date
  // Skip post_shared activities since the post itself will appear in the timeline
  const allItems: FeedItem[] = [];

  if (data?.activities) {
    for (const a of data.activities) {
      if (a.type !== "post_shared") {
        allItems.push({ ...a, isActivity: true });
      }
    }
  }
  if (data?.posts) {
    for (const p of data.posts) {
      allItems.push({ ...p, isActivity: false });
    }
  }

  // Sort by createdAt descending
  allItems.sort((a, b) => {
    const aTime = typeof a.createdAt === "number" ? a.createdAt : new Date(a.createdAt).getTime();
    const bTime = typeof b.createdAt === "number" ? b.createdAt : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });

  const items = allItems.slice(0, publicMode ? 10 : 50);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No activity yet. Be the first to post!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const Icon = item.isActivity ? getActivityIcon(item.type) : MessageSquare;
        const name = item.profile?.displayName || item.user?.handle || "Someone";
        const initials = item.profile?.avatarInitials || name.slice(0, 2).toUpperCase();
        

        return (
          <Card key={`${item.isActivity ? "a" : "p"}-${item.id}`} data-testid={`feed-item-${i}`}>
            <CardContent className="py-4">
              <div className="flex gap-3">
                {/* Avatar */}
                <Avatar className="h-10 w-10 flex-shrink-0">
                  {item.profile?.avatarUrl ? (
                    <img
                      src={assetUrl(item.profile.avatarUrl)}
                      alt={name}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {initials}
                    </AvatarFallback>
                  )}
                </Avatar>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {publicMode ? (
                      <span className="font-medium text-sm" data-testid={`feed-name-${i}`}>{name}</span>
                    ) : (
                      <Link href={`/u/${item.user?.handle}`}>
                        <span className="font-medium text-sm hover:text-primary cursor-pointer" data-testid={`feed-name-${i}`}>
                          {name}
                        </span>
                      </Link>
                    )}
                    {item.profile?.role && (
                      <span className="text-xs text-muted-foreground">{item.profile.role}</span>
                    )}
                    {item.profile?.city && (
                      <span className="text-xs text-muted-foreground">· {item.profile.city}</span>
                    )}
                  </div>

                  {item.isActivity ? (
                    /* Activity item */
                    <div className="mt-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-primary/70" />
                        {item.message}
                      </p>

                      {/* Video/Social link card */}
                      <MediaCard item={item} index={i} />

                      {/* Say hello CTA for new members */}
                      {item.type === "member_joined" && (
                        <div className="mt-2 flex items-center gap-2">
                          {publicMode ? (
                            <span className="text-xs text-primary/80 flex items-center gap-1" data-testid={`feed-hello-${i}`}>
                              <Heart className="h-3 w-3" />
                              Say hello when they’re online
                            </span>
                          ) : (
                            <Link href={`/u/${item.user?.handle}`}>
                              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer" data-testid={`feed-hello-${i}`}>
                                <Heart className="h-3 w-3" />
                                Say hello · Connect with {name.split(" ")[0]}
                              </span>
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Post item */
                    <div className="mt-1.5">
                      <p className="text-sm whitespace-pre-wrap" data-testid={`feed-post-body-${i}`}>
                        {item.body}
                      </p>
                      {item.linkUrl && (
                        <a
                          href={item.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          data-testid={`feed-post-link-${i}`}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {(() => {
                            try { return new URL(item.linkUrl).hostname; } catch { return item.linkUrl; }
                          })()}
                        </a>
                      )}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span data-testid={`feed-time-${i}`}>{timeAgo(item.createdAt)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
