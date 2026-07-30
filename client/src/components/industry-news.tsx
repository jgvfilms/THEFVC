import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, ExternalLink, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface NewsItem {
  title: string;
  link: string;
  description: string;
  source: string;
  category: string;
  pubDate: number;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / 60000);
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

export function IndustryNews({ limit = 8 }: { limit?: number }) {
  const { data: news, isLoading } = useQuery<NewsItem[]>({
    queryKey: ["/api/feed/news"],
    queryFn: async () => {
      const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
      const res = await fetch(`${API_BASE}/api/feed/news`);
      if (!res.ok) throw new Error("Failed to load news");
      return res.json();
    },
    staleTime: 10 * 60 * 1000, // 10 min client cache
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!news || news.length === 0) {
    return null;
  }

  const items = news.slice(0, limit);

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <a
          key={idx}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`news-item-${idx}`}
        >
          <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Newspaper className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs font-normal">
                      {item.source}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(item.pubDate)}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold leading-snug mb-1 line-clamp-2">
                    {item.title}
                  </h4>
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-1" />
              </div>
            </CardContent>
          </Card>
        </a>
      ))}
    </div>
  );
}
