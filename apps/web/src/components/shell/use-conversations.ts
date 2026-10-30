"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LIST_LIMIT, LISTED_STATES, readHistory } from "@/lib/studio-draft-list";
import { listDrafts, runnerDown, type DraftSummary } from "@/lib/studio-drafts";
import { useDraftsWake } from "@/lib/use-drafts-wake";

import type { StudioChats } from "./shell-context";

export interface Conversations {
  /** Every loaded page, and whether the runner may have more; null until a read lands. */
  list: { drafts: DraftSummary[]; more: boolean } | null;
  /** Diagram titles by name, which outlive the studio page. */
  titles: Readonly<Record<string, string>>;
  /** One more page; resolves false, and keeps the pages shown, when the runner did not answer. */
  showOlder: () => Promise<boolean>;
  /** Every page shown, read again now (after a rename); false when the runner did not answer. */
  refresh: () => Promise<boolean>;
  /**
   * True when the last read found the runner not answering (nothing
   * listening, or no list has landed yet whatever the failure): the sidebar
   * then shows the conversations the catalog's `draft` mirror holds, and
   * pages that, rather than a list the runner may never page again. Any
   * other refusal keeps the list shown. A later read that lands puts the
   * runner's list back.
   */
  failed: boolean;
}

/**
 * The studio's conversations, read from its runner: the rows Recent shows
 * for the studio, merged with the catalog's other four kinds by the sidebar
 * (`mergeStreams`). The runner, not the `draft` mirror, because it names a
 * conversation from its first message before the planner has given it a
 * title, and a conversation just started is the one most likely to be
 * looked for.
 *
 * On `/studio` the page reads the list on the server and publishes it
 * (`usePublishStudioChats`), so it is there on the first paint. Anywhere else
 * the list is read here once the sidebar mounts. The sidebar outlives every
 * navigation, so the list read on one page is still shown on the next.
 *
 * It is read again when the open conversation changes, when that
 * conversation says its title, turns or state moved (`DRAFT_CHANGED_EVENT`),
 * and when the window regains focus. The runner answers a page at a time
 * (`LIST_LIMIT`), and every read is every page shown, read again from the top
 * (`readHistory`).
 */
export function useConversations(enabled: boolean, chats: StudioChats | null): Conversations {
  const active = chats?.active ?? null;
  const [list, setList] = useState<{ drafts: DraftSummary[]; more: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  // The page's own read stands until a read here replaces it, and a page
  // that reads something different (a server render) replaces that in turn.
  const seed = chats?.initial ?? null;
  const seedSignature = signature(seed);
  const [seen, setSeen] = useState("none");
  if (seed !== null && seedSignature !== seen) {
    setSeen(seedSignature);
    setList({ drafts: seed, more: seed.length >= LIST_LIMIT });
    // The page read the runner's list just now: it is answering.
    setFailed(false);
  }
  /** Whether a page has handed a list over, which makes the first read here moot. */
  const adopted = useRef(false);
  useEffect(() => {
    if (seen !== "none") adopted.current = true;
  }, [seen]);
  const [titles, setTitles] = useState<Readonly<Record<string, string>>>({});
  if (chats !== null && chats.titles !== titles) setTitles(chats.titles);

  /** How many pages are shown: one, and one more for each Show older. */
  const pages = useRef(1);

  // Reads can overlap, and an older answer landing after a newer one would
  // put the list back a step. Each read takes a number, and an answer older
  // than the last one shown is dropped.
  const issued = useRef(0);
  const landed = useRef(0);
  // A list the page hands over is newer than any read still in flight here.
  /** Whether any list has landed, here or from the page. */
  const listed = useRef(false);
  useEffect(() => {
    if (seen === "none") return;
    landed.current = issued.current + 1;
    listed.current = true;
  }, [seen]);
  const read = useCallback(async (count: number) => {
    issued.current += 1;
    const ticket = issued.current;
    let down = false;
    const result = await readHistory(count, async (before) => {
      const answer = await listDrafts({ state: LISTED_STATES, nonEmpty: true, limit: LIST_LIMIT, ...(before === undefined ? {} : { before }) });
      if (!answer.ok && runnerDown(answer.status, answer.refusal)) down = true;
      return answer.ok && Array.isArray(answer.data.drafts) ? answer.data.drafts : null;
    });
    if (ticket < landed.current) return result !== null;
    // A failed read keeps what is shown, rather than an empty list that
    // would read as "no conversations"; a runner that is down hands over to
    // the catalog's mirror (`failed`).
    setFailed(result === null && (down || !listed.current));
    if (result === null) return false;
    landed.current = ticket;
    listed.current = true;
    setList(result);
    return true;
  }, []);
  const reread = useCallback(() => read(pages.current), [read]);

  // The first read, unless the studio page hands one over. The sidebar mounts
  // before the page publishes (its effects run first, being earlier in the
  // tree), so the read waits a task for the page's list to land.
  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(() => {
      if (!adopted.current) void reread();
    }, 0);
    return () => clearTimeout(first);
  }, [reread, enabled]);

  useDraftsWake(reread, enabled);

  // A conversation opened that the list does not have yet: it was just made.
  const shown = useRef(active);
  useEffect(() => {
    if (!enabled || shown.current === active) return;
    shown.current = active;
    if (active !== null && !list?.drafts.some((draft) => draft.draftId === active)) void reread();
  }, [active, list, reread, enabled]);

  const showOlder = useCallback(async () => {
    // Counted before the read, so a refresh that starts while it runs reads
    // the new page too rather than landing after it with one page fewer.
    const next = pages.current + 1;
    pages.current = next;
    const ok = await read(next);
    if (!ok && pages.current === next) pages.current = next - 1;
    return ok;
  }, [read]);

  return { list: enabled ? list : null, titles, showOlder, refresh: reread, failed: enabled && failed };
}

function signature(drafts: readonly DraftSummary[] | null): string {
  // The name too: a rename leaves `updated` alone.
  return drafts === null ? "none" : drafts.map((draft) => `${draft.draftId}@${draft.updated}:${draft.state}:${draft.name ?? ""}`).join(",");
}
