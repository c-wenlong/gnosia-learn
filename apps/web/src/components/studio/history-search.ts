"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DRAFT_CHANGED_EVENT, LIST_LIMIT, LISTED_STATES, readHistory } from "@/lib/studio-draft-list";
import { listDrafts, type DraftSummary } from "@/lib/studio-drafts";

/** How long typing rests before the runner is asked, so each letter is not a read. */
export const SEARCH_DEBOUNCE_MS = 200;

/** The most the field takes; the runner refuses a longer `q`. */
export const SEARCH_MAX = 200;

/**
 * How a read ended: `landed` (it is on screen), `failed` (the runner did not
 * answer, and no newer read has been started since), or `superseded` (a newer
 * read, or newer words, took over, so whatever this one found or failed to
 * find says nothing about the screen). Only the newest read's failure is a
 * failure.
 */
type ReadOutcome = "landed" | "failed" | "superseded";

export interface HistorySearch {
  /** What is in the field, as typed. */
  query: string;
  setQuery: (next: string) => void;
  /** The words searched for: the field, trimmed. Empty means no search, and the grouped history shows. */
  words: string;
  /** The matches for `words`, or null while they are being read or when the read failed. */
  found: { drafts: DraftSummary[]; more: boolean } | null;
  /** True when `words` is not empty and nothing for it has landed yet. */
  searching: boolean;
  /** Said when the read for `words` failed, so "No conversations match" is never the answer to a runner that did not answer. */
  error: string | null;
  loadingMore: boolean;
  moreError: string | null;
  showMore: () => void;
  clear: () => void;
}

/**
 * The history's search (D87 of docs/STUDIO-CHAT-FIRST.md): what is typed,
 * the runner's matches for it, and the paging of those matches.
 *
 * The runner searches every conversation, loaded here or not (`q` on
 * `GET /api/drafts`), and the matches page the way the history does: each
 * page after the last row of the one before, every read from the top
 * (`readHistory`). Typing waits `SEARCH_DEBOUNCE_MS` before it asks. An answer
 * for words that are no longer in the field is dropped, so a slow read never
 * lands over a newer one. It reads again, for the same words, when the
 * window regains focus and when a conversation says it moved, as the grouped
 * history does.
 */
export function useHistorySearch(): HistorySearch {
  const [query, setQueryState] = useState("");
  const words = query.trim();
  const [landed, setLanded] = useState<{ words: string; drafts: DraftSummary[]; more: boolean } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  /** The words last typed, read by an answer when it lands. */
  const current = useRef("");
  /** How many pages of matches are shown. */
  const pages = useRef(1);
  const issued = useRef(0);
  const shownTicket = useRef(0);

  const read = useCallback(async (q: string, count: number): Promise<ReadOutcome> => {
    issued.current += 1;
    const ticket = issued.current;
    const result = await readHistory(count, async (before) => {
      const answer = await listDrafts({ state: LISTED_STATES, nonEmpty: true, limit: LIST_LIMIT, q, ...(before === undefined ? {} : { before }) });
      return answer.ok && Array.isArray(answer.data.drafts) ? answer.data.drafts : null;
    });
    // Words that have moved on: nothing here is the screen's business.
    if (current.current !== q) return "superseded";
    if (result === null) {
      // A read that was not the newest failing, after a newer one began or
      // landed, changes nothing: the newer read says how the search stands.
      return ticket === issued.current ? "failed" : "superseded";
    }
    // An answer older than the one shown.
    if (ticket < shownTicket.current) return "superseded";
    shownTicket.current = ticket;
    setFailed(null);
    setLanded({ words: q, ...result });
    return "landed";
  }, []);

  const setQuery = useCallback((next: string) => {
    const trimmed = next.trim();
    // A stray space changes the field and not the search: the pages shown stay.
    if (trimmed !== current.current) {
      current.current = trimmed;
      pages.current = 1;
      setMoreError(null);
      setFailed(null);
    }
    setQueryState(next);
  }, []);

  useEffect(() => {
    if (words === "") return;
    const timer = setTimeout(() => {
      void read(words, 1).then((outcome) => {
        // The newest read failing says so for these words, unless they moved on.
        if (outcome === "failed" && current.current === words) setFailed(words);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [words, read]);

  useEffect(() => {
    if (words === "") return;
    // A turn streams several changes in a breath; one read covers them.
    let soon: ReturnType<typeof setTimeout> | null = null;
    const wake = () => {
      if (current.current === words) void read(words, pages.current);
    };
    const changed = () => {
      if (soon !== null) clearTimeout(soon);
      soon = setTimeout(wake, 400);
    };
    window.addEventListener("focus", wake);
    window.addEventListener(DRAFT_CHANGED_EVENT, changed);
    return () => {
      window.removeEventListener("focus", wake);
      window.removeEventListener(DRAFT_CHANGED_EVENT, changed);
      if (soon !== null) clearTimeout(soon);
    };
  }, [words, read]);

  async function showMore() {
    if (loadingMore || words === "") return;
    setLoadingMore(true);
    setMoreError(null);
    const next = pages.current + 1;
    pages.current = next;
    const outcome = await read(words, next);
    setLoadingMore(false);
    // Only this press's own failure, with no newer read since, takes the page
    // back: a newer read for the same words may already have loaded it.
    if (outcome === "failed") {
      if (pages.current === next) pages.current = next - 1;
      setMoreError("More matches could not be read: the studio did not answer.");
    }
  }

  const found = words !== "" && landed !== null && landed.words === words ? { drafts: landed.drafts, more: landed.more } : null;
  const error = words !== "" && failed === words ? "The studio did not answer, so nothing could be searched." : null;
  return {
    query,
    setQuery,
    words,
    found,
    searching: words !== "" && found === null && error === null,
    error,
    loadingMore,
    moreError,
    showMore: () => void showMore(),
    clear: () => setQuery(""),
  };
}
