import type { ChainEntry } from "@/lib/agent/providers";

/**
 * What the Providers and Model selection cards say about a request: the
 * status line's state, the reply shape their routes answer with, and the
 * sentence for a refusal. Shared so the two cards say the same thing the
 * same way.
 */

export type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string };

export interface Reply {
  ok?: boolean;
  error?: string;
  /** The mirrored `byok.json` write's answer on preset providers: false when the runner did not take it (D95). */
  byok?: boolean;
  chain?: ChainEntry[];
  models?: { id: string; free?: boolean }[];
  message?: string;
  served?: string;
  model?: string;
  source?: string;
  status?: number | null;
  tested?: string;
}

export const tone = (s: Status) => (s.kind === "done" ? "ok" : s.kind === "error" ? "danger" : "muted");
export const textOf = (s: Status) => (s.kind === "idle" ? null : s.text);
export const failure = (what: string, reply: { status: number; data: Reply } | null) =>
  reply === null ? `Not ${what}: the server did not answer.` : (reply.data.error ?? `Not ${what} (HTTP ${reply.status}).`);
