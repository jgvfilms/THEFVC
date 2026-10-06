import { Clapperboard } from "lucide-react";
import { assetUrl } from "@/lib/queryClient";

/** Square thumbnail for production lists: the cover image, or the clapperboard when there isn't one. */
export function ProductionThumb({ coverUrl }: { coverUrl: string | null | undefined }) {
  if (coverUrl) {
    return <img src={assetUrl(coverUrl)} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />;
  }
  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 flex-shrink-0">
      <Clapperboard className="h-5 w-5 text-primary" />
    </div>
  );
}
