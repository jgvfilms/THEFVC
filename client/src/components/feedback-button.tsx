import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, X, Bug, Lightbulb, Heart, StickyNote } from "lucide-react";

interface FeedbackButtonProps {
  user: { id: number } | null;
}

export function FeedbackButton({ user }: FeedbackButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"bug" | "idea" | "note" | "praise">("note");
  const [message, setMessage] = useState("");

  const submitMutation = useMutation({
    mutationFn: () => apiRequestJson("POST", "/api/feedback", {
      userId: user?.id,
      category,
      message,
      pageUrl: window.location.hash,
    }),
    onSuccess: () => {
      toast({ title: "Feedback sent", description: "Thanks for helping us improve!" });
      setMessage("");
      setCategory("note");
      setOpen(false);
    },
    onError: () => toast({ title: "Failed to send feedback", variant: "destructive" }),
  });

  if (!user) return null;

  const categories = [
    { id: "bug" as const, label: "Bug", icon: Bug, color: "text-red-500" },
    { id: "idea" as const, label: "Idea", icon: Lightbulb, color: "text-blue-500" },
    { id: "note" as const, label: "Note", icon: StickyNote, color: "text-muted-foreground" },
    { id: "praise" as const, label: "Praise", icon: Heart, color: "text-green-500" },
  ];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
        data-testid="button-feedback"
      >
        <MessageSquare className="h-4 w-4" />
        Feedback
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg"
            onClick={e => e.stopPropagation()}
            data-testid="feedback-dialog"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-700">Send Feedback</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Category</Label>
                <div className="grid grid-cols-4 gap-2">
                  {categories.map(cat => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors ${
                          category === cat.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                        }`}
                        data-testid={`feedback-cat-${cat.id}`}
                      >
                        <Icon className={`h-5 w-5 ${cat.color}`} />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label htmlFor="feedback-message">Message</Label>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us what you think..."
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  rows={4}
                  data-testid="input-feedback-message"
                />
              </div>

              <Button
                onClick={() => submitMutation.mutate()}
                disabled={!message.trim() || submitMutation.isPending}
                className="w-full"
                data-testid="button-submit-feedback"
              >
                {submitMutation.isPending ? "Sending..." : "Send Feedback"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
