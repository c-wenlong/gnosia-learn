"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { changeRecent, fetchRecent, VISIT_STORED_EVENT, type RecentChange } from "@/lib/recent-client";
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
 * Recent from the catalog (`GET /api/learner/recent`), for the sidebar.
 * `drafts` says whether it brings the studio's conversations too: not while
 * the runner answers for them (`useConversations`), and yes without a studio
 * or with a runner that is not answering, so the conversations the catalog's
 * `draft` mirror holds still show.
 *
 * Read once the sidebar mounts, again a moment after each navigation (a
 * tutor session or an answer moves a row), once a module visit is stored
 * (`VISIT_STORED_EVENT`: the module just opened tops the list), and when the
 * window takes the focus back. Every read is every page shown, from the top,
 * and an answer older than the one on screen is dropped.
 */
export function useRecent(drafts: boolean): RecentState {
  const pathname = usePathname();
  const [model, setModel] = useState<RecentModel | null>(null);
  const pages = useRef(1);
  const issued = useRef(0);
  const landed = useRef(0);

  const read = useCallback(
    async (count: number) => {
      issued.current += 1;
      const ticket = issued.current;
      const next = await fetchRecent({ pages: count, drafts });
      if (next === null) return false;
      if (ticket < landed.current) return true;
      landed.current = ticket;
      setModel(next);
      return true;
    },
    [drafts],
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

  // The visit a module page writes as it opens has landed: read it. The
  // navigation's own read above may have run before it did.
  useEffect(() => {
    const now = () => void reread();
    window.addEventListener(VISIT_STORED_EVENT, now);
    return () => window.removeEventListener(VISIT_STORED_EVENT, now);
  }, [reread]);

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
    // Cleared when the words change: an answer for words typed over is
    // dropped, and its request is called off, since the server builds the
    // whole of Recent for each one.
    let live = true;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      // With a studio, the catalog leaves conversations to the runner's search.
      void fetchRecent({ pages: 1, drafts: !studio, q: words, signal: abort.signal }).then((answer) => {
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
      abort.abort();
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
