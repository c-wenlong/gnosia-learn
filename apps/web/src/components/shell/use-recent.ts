"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { changeRecent, fetchRecent, type RecentChange } from "@/lib/recent-client";
import { withoutPin, withPin, type RecentModel } from "@/lib/recent-core";
import { useDraftsWake } from "@/lib/use-drafts-wake";

/** How long a run of navigations rests before Recent is read again. */
export const RECENT_SETTLE_MS = 300;

export interface RecentState {
  /** The last read that landed; null until one does. */
  model: RecentModel | null;
  /** One more page; resolves false, and keeps the pages shown, when the server did not answer. */
  showOlder: () => Promise<boolean>;
  /** Pin or unpin a row: shown at once, saved, then read back. False when the save failed. */
  change: (change: RecentChange) => Promise<boolean>;
}

/**
 * Recent from the catalog (`GET /api/learner/recent`), for the sidebar:
 * every kind but the studio's conversations when the deployment has a studio,
 * since those come from the runner (`useConversations`).
 *
 * Read once the sidebar mounts, again a moment after each navigation (a
 * module page writes its visit as it opens, and a tutor session or an answer
 * moves a row), and when the window takes the focus back. Every read is
 * every page shown, from the top, and an answer older than the one on screen
 * is dropped.
 */
export function useRecent(studio: boolean): RecentState {
  const pathname = usePathname();
  const [model, setModel] = useState<RecentModel | null>(null);
  const pages = useRef(1);
  const issued = useRef(0);
  const landed = useRef(0);

  const read = useCallback(
    async (count: number) => {
      issued.current += 1;
      const ticket = issued.current;
      const next = await fetchRecent({ pages: count, drafts: !studio });
      if (next === null) return false;
      if (ticket < landed.current) return true;
      landed.current = ticket;
      setModel(next);
      return true;
    },
    [studio],
  );
  const reread = useCallback(() => read(pages.current), [read]);

  const first = useRef(true);
  useEffect(() => {
    // At once on mount; after a navigation, once the visit it writes has had a moment.
    const wait = first.current ? 0 : RECENT_SETTLE_MS;
    first.current = false;
    const timer = setTimeout(() => void reread(), wait);
    return () => clearTimeout(timer);
  }, [pathname, reread]);

  useDraftsWake(reread, true);

  const showOlder = useCallback(async () => {
    const next = pages.current + 1;
    pages.current = next;
    const ok = await read(next);
    if (!ok && pages.current === next) pages.current = next - 1;
    return ok;
  }, [read]);

  const change = useCallback(
    async (change: RecentChange) => {
      setModel((current) => (current === null ? current : applyChange(current, change)));
      const saved = await changeRecent(change);
      // Read back either way: a failed save puts the list back as it is stored.
      await reread();
      return saved;
    },
    [reread],
  );

  return { model, showOlder, change };
}

/** What a change looks like before the server has said so. */
export function applyChange(model: RecentModel, change: RecentChange): RecentModel {
  switch (change.action) {
    case "pin":
      return { ...model, pinned: withPin(model.pinned, { ...change.row, at: new Date().toISOString() }) };
    case "unpin":
      return { ...model, pinned: withoutPin(model.pinned, change.key) };
  }
}

/** How long typing rests before the server is asked; the runner's search waits as long. */
export const RECENT_SEARCH_DEBOUNCE_MS = 200;

export interface RecentSearch {
  /** The rows whose titles hold the words, newest first; null while they are read, or with no words. */
  found: RecentModel["items"] | null;
  /** Said when the read for the words failed, so "Nothing matches" is never the answer to a server that did not answer. */
  error: string | null;
}

/**
 * The sidebar search over Recent's catalog rows: every kind but the studio's
 * conversations when there is a studio; the runner searches those by their
 * names and their own words, first messages too (`useHistorySearch`), and
 * `SearchResults` merges the two. Asked once typing rests, and an answer for
 * words no longer in the field is dropped.
 */
export function useRecentSearch(words: string, studio: boolean): RecentSearch {
  const [landed, setLanded] = useState<{ words: string; items: RecentModel["items"] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (words === "") return;
    // Cleared when the words change: an answer for words typed over is dropped.
    let live = true;
    const timer = setTimeout(() => {
      // With a studio, the catalog leaves conversations to the runner's search.
      void fetchRecent({ pages: 1, drafts: !studio, q: words }).then((answer) => {
        if (!live) return;
        if (answer === null || !answer.reachable) {
          setFailed(words);
          return;
        }
        setFailed(null);
        setLanded({ words, items: answer.items });
      });
    }, RECENT_SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [words, studio]);

  if (words === "") return { found: null, error: null };
  return {
    found: landed !== null && landed.words === words ? landed.items : null,
    error:
      failed !== words
        ? null
        : studio
          ? "Recent could not be read, so only conversations were searched."
          : "Recent could not be read, so nothing could be searched.",
  };
}
