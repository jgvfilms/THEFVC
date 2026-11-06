import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequestJson, parseApiErrorMessage } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type Status = {
  self: boolean;
  following?: boolean;
  followedBy?: boolean;
  connection?: "none" | "pending_out" | "pending_in" | "connected";
  blocked?: boolean;
  canFollowOrConnect?: boolean;
};

export type NetworkMember = {
  handle: string;
  displayName: string;
  role: string | null;
  city: string | null;
  avatarUrl: string | null;
  avatarInitials: string | null;
};

export type NetworkData = {
  followers: NetworkMember[];
  following: NetworkMember[];
  connections: NetworkMember[];
  incoming: NetworkMember[];
  outgoing: NetworkMember[];
  blocked: NetworkMember[];
};

/** Mutations for one member; every one refreshes status, the network page and the following feed. */
export function useNetworkMutation(handle: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ method, path, body }: { method: string; path: string; body?: unknown }) =>
      apiRequestJson<Status>(method, `/api/network/${path}/${encodeURIComponent(handle)}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/network"] });
      qc.invalidateQueries({ queryKey: ["/api/network/status", handle] });
      qc.invalidateQueries({ queryKey: ["/api/network/feed"] });
    },
    onError: (err) => toast({ title: parseApiErrorMessage(err, "That didn't work. Try again."), variant: "destructive" }),
  });
}

/** Follow / Connect / Block controls for another member's profile. Renders nothing when signed out or on your own profile. */
export function NetworkActions({ handle }: { handle: string }) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["/api/network/status", handle],
    queryFn: () => apiRequestJson<Status>("GET", `/api/network/status/${encodeURIComponent(handle)}`),
    enabled: !!user,
  });
  const act = useNetworkMutation(handle);
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  if (!user || !data || data.self) return null;
  const run = (method: string, path: string) => act.mutate({ method, path });
  const busy = act.isPending;

  if (data.blocked) {
    return (
      <button className="btn btn-ghost" disabled={busy} onClick={() => run("DELETE", "block")} data-testid="button-unblock">
        Unblock
      </button>
    );
  }
  if (!data.canFollowOrConnect) return null;

  return (
    <>
      <button
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => run(data.following ? "DELETE" : "POST", "follow")}
        data-testid={data.following ? "button-unfollow" : "button-follow"}
      >
        {data.following ? "Following ✓" : "Follow"}
      </button>
      {data.connection === "none" && (
        <button className="btn btn-ghost" disabled={busy} onClick={() => setComposing((v) => !v)} data-testid="button-connect">
          Connect
        </button>
      )}
      {data.connection === "pending_out" && (
        <button className="btn btn-ghost" disabled={busy} onClick={() => run("DELETE", "connect")} data-testid="button-cancel-request">
          Request sent · Cancel
        </button>
      )}
      {data.connection === "pending_in" && (
        <AcceptDecline handle={handle} />
      )}
      {data.connection === "connected" && (
        <button className="btn btn-ghost" disabled={busy} onClick={() => run("DELETE", "connect")} data-testid="button-disconnect">
          Connected ✓ · Disconnect
        </button>
      )}
      <button className="btn btn-ghost" disabled={busy} onClick={() => run("POST", "block")} data-testid="button-block">
        Block
      </button>
      {composing && data.connection === "none" && (
        <form
          style={{ flexBasis: "100%" }}
          onSubmit={(e) => {
            e.preventDefault();
            act.mutate(
              { method: "POST", path: "connect", body: { message } },
              { onSuccess: () => { setComposing(false); setMessage(""); } },
            );
          }}
          data-testid="form-connect"
        >
          <label className="label" htmlFor="connect-message">Say why you want to connect. They'll get this as a message.</label>
          <textarea
            id="connect-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={3}
            style={{ display: "block", width: "100%", margin: "8px 0" }}
            data-testid="input-connect-message"
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !message.trim()} data-testid="button-send-request">
            Send request
          </button>
        </form>
      )}
    </>
  );
}

function AcceptDecline({ handle }: { handle: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (verb: "accept" | "decline") => apiRequestJson<Status>("POST", `/api/network/requests/${encodeURIComponent(handle)}/${verb}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/network"] });
      qc.invalidateQueries({ queryKey: ["/api/network/status", handle] });
    },
  });
  return (
    <>
      <button className="btn btn-primary" disabled={m.isPending} onClick={() => m.mutate("accept")} data-testid="button-accept-request">Accept request</button>
      <button className="btn btn-ghost" disabled={m.isPending} onClick={() => m.mutate("decline")} data-testid="button-decline-request">Decline</button>
    </>
  );
}

/** One-click handle fill for the Add Crew form; the crew rules themselves are unchanged. */
export function ConnectionPicker({ onPick }: { onPick: (handle: string) => void }) {
  const { data } = useQuery({
    queryKey: ["/api/network"],
    queryFn: () => apiRequestJson<NetworkData>("GET", "/api/network"),
  });
  if (!data || data.connections.length === 0) return null;
  return (
    <select
      className="rounded-md border border-input bg-background px-2 text-sm h-9"
      defaultValue=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
      aria-label="Pick from your connections"
      data-testid="select-crew-connection"
    >
      <option value="">From connections…</option>
      {data.connections.map((c) => (
        <option key={c.handle} value={c.handle}>{c.displayName} (@{c.handle})</option>
      ))}
    </select>
  );
}
