import type { RecentKind, RecentModel } from "@/lib/recent-core";
import { sendJson } from "@/lib/send-json";

/**
 * The browser's half of `/api/learner/recent`: the sidebar's read of Recent
 * and its row menu's pins. A conversation's Rename goes to the studio
 * runner instead (`renameDraft`), which keeps the name on the draft. Null when the server did not answer, or answered
 * with something other than a Recent, so a failed read keeps what is shown.
 */
export async function fetchRecent(options: { pages: number; drafts: boolean; q?: string }): Promise<RecentModel | null> {
  const params = new URLSearchParams({ pages: String(options.pages) });
  if (!options.drafts) params.set("drafts", "0");
  if (options.q !== undefined && options.q !== "") params.set("q", options.q);
  const answer = await sendJson<{ ok?: boolean; recent?: RecentModel }>("GET", `/api/learner/recent?${params}`);
  const recent = answer?.ok === true ? answer.data.recent : undefined;
  return recent !== undefined && Array.isArray(recent.items) ? recent : null;
}

export type RecentChange =
  | { action: "pin"; row: { key: string; kind: RecentKind; title: string; href: string } }
  | { action: "unpin"; key: string };

/** One change from the row menu; true once it is saved. */
export async function changeRecent(change: RecentChange): Promise<boolean> {
  const answer = await sendJson<{ ok?: boolean }>("POST", "/api/learner/recent", change);
  return answer?.ok === true && answer.data.ok === true;
}
