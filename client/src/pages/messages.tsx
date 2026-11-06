import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson, parseApiErrorMessage } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

interface Conversation {
  handle: string | null;
  displayName: string;
  lastBody: string;
  lastAt: string;
  unread: number;
}
interface ThreadMessage {
  id: number;
  mine: boolean;
  body: string;
  createdAt: string;
}

const MAX = 2000;

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Thread({ handle }: { handle: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [body, setBody] = useState("");

  const thread = useQuery({
    queryKey: ["/api/messages/with", handle],
    queryFn: () => apiRequestJson<ThreadMessage[]>("GET", `/api/messages/with/${encodeURIComponent(handle)}`),
  });
  // Opening the thread marks it read on the server, so refresh the counts.
  const refreshCounts = () => {
    qc.invalidateQueries({ queryKey: ["/api/messages"] });
    qc.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
  };

  const send = useMutation({
    mutationFn: () => apiRequestJson("POST", "/api/messages", { toHandle: handle, body: body.trim() }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["/api/messages/with", handle] });
      refreshCounts();
    },
    onError: (err) => toast({ title: "Message not sent", description: parseApiErrorMessage(err, "Try again."), variant: "destructive" }),
  });

  // The GET marks the thread read; refresh counts once it has loaded.
  const loaded = thread.isSuccess;
  useEffect(() => {
    if (loaded) refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return (
    <div className="flex flex-col gap-3" data-testid="message-thread">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/app/messages")} data-testid="button-messages-back">
          <ArrowLeft className="h-4 w-4 mr-1" /> Inbox
        </Button>
        <h2 className="font-display text-xl font-semibold">@{handle}</h2>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col gap-3 min-h-[200px]">
          {thread.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {thread.isSuccess && thread.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages yet. Say hello below.</p>
          )}
          {thread.data?.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  m.mine ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {m.body}
                <div className={`mt-1 text-[11px] ${m.mine ? "opacity-80" : "text-muted-foreground"}`}>{formatWhen(m.createdAt)}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim() && !send.isPending) send.mutate();
        }}
      >
        <label htmlFor="message-body" className="sr-only">Message to @{handle}</label>
        <Textarea
          id="message-body"
          value={body}
          maxLength={MAX}
          rows={3}
          placeholder={`Write to @${handle}`}
          onChange={(e) => setBody(e.target.value)}
          data-testid="input-message-body"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{body.length}/{MAX}. They'll get an email notice without your text.</span>
          <Button type="submit" disabled={!body.trim() || send.isPending} data-testid="button-send-message">
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Inbox() {
  const [, setLocation] = useLocation();
  const list = useQuery({
    queryKey: ["/api/messages"],
    queryFn: () => apiRequestJson<Conversation[]>("GET", "/api/messages"),
  });

  return (
    <div className="flex flex-col gap-3" data-testid="message-inbox">
      {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.isSuccess && list.data.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No conversations yet. Open a member's profile in the Crew Finder and choose Message to start one.
          </CardContent>
        </Card>
      )}
      {list.data?.map((c) => (
        <button
          key={c.handle ?? c.displayName}
          type="button"
          disabled={!c.handle}
          onClick={() => c.handle && setLocation(`/app/messages/${c.handle}`)}
          className="text-left w-full rounded-md border border-border p-3 hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          data-testid={`conversation-${c.handle}`}
        >
          <div className="flex items-center gap-2">
            <span className={`truncate ${c.unread ? "font-semibold" : "font-medium"}`}>{c.displayName}</span>
            {c.unread > 0 && <Badge>{c.unread} new</Badge>}
            <span className="ml-auto text-xs text-muted-foreground shrink-0">{formatWhen(c.lastAt)}</span>
          </div>
          <p className="text-sm text-muted-foreground truncate">{c.lastBody}</p>
        </button>
      ))}
    </div>
  );
}

export function MessagesPage() {
  const { handle } = useParams<{ handle?: string }>();
  return (
    <div className="mx-auto w-full max-w-2xl p-4 md:p-6 flex flex-col gap-4">
      {!handle && <h1 className="font-display text-2xl font-semibold">Messages</h1>}
      {handle ? <Thread key={handle} handle={handle} /> : <Inbox />}
    </div>
  );
}
