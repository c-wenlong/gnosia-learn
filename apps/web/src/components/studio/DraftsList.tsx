"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { KIND_NAME } from "@/lib/studio-cards";
import { draftRows, LIST_LIMIT, LIST_ROWS, LISTED_STATES } from "@/lib/studio-draft-list";
import { listDrafts, type DraftSummary } from "@/lib/studio-drafts";
import { conversationHref, relativeTime } from "@/lib/studio-view";

/**
 * The conversations a person can pick up again, as a quiet section above the
 * grid (phase 3 of docs/STUDIO-CHAT-FIRST.md): drafts still talking or holding
 * a brief nobody drew, newest first. Each row reopens its conversation with
 * `?draft=`, the same URL a reload of the panel keeps.
 *
 * The page reads the list on the server, so it is there on the first paint and
 * fresh after every navigation. Closing a conversation is not one (it moves
 * the URL in the browser, `PanelHost`), so that reads it again from
 * here, as the window regaining focus does, for a conversation started or
 * closed in another tab meanwhile. With nothing to list, or the runner not
 * answering, there is no section at all: the grid, the plus card and the
 * page's own runner notice already say everything a person needs.
 */
export function DraftsList({
  initial,
  path,
  titles,
}: {
  /** What the page read, or null when the runner did not answer. */
  initial: DraftSummary[] | null;
  path: string;
  /** Diagram titles by name, for a draft that extends one and has no words yet. */
  titles: Readonly<Record<string, string>>;
}) {
  const [fresh, setFresh] = useState<{ base: string; drafts: DraftSummary[] } | null>(null);
  const [open, setOpen] = useState(false);
  // A read from here stands until the page reads something different: a
  // page render with news (a navigation, closing the panel) wins, and one
  // with the same list as before leaves a newer read from here in place.
  const version = signature(initial);
  const drafts = fresh !== null && fresh.base === version ? fresh.drafts : initial;

  // Reads can overlap (a focus and a close), and an older answer landing
  // after a newer one would put the list back a step. Each read takes a
  // number, and an answer older than the last one shown is dropped.
  const issued = useRef(0);
  const landed = useRef(0);
  const reread = useCallback(async () => {
    issued.current += 1;
    const ticket = issued.current;
    const result = await listDrafts({ state: LISTED_STATES, nonEmpty: true, limit: LIST_LIMIT });
    if (ticket < landed.current) return;
    // A failed read keeps what is shown: a runner that stopped answering is
    // the page's to say, and an empty list here would read as "no drafts".
    if (result.ok && Array.isArray(result.data.drafts)) {
      landed.current = ticket;
      setFresh({ base: version, drafts: result.data.drafts });
    }
  }, [version]);

  useEffect(() => {
    const wake = () => void reread();
    window.addEventListener("focus", wake);
    return () => window.removeEventListener("focus", wake);
  }, [reread]);

  // A conversation closed: it may have words now, or a brief nobody drew.
  const openDraft = useSearchParams().get("draft");
  const wasOpen = useRef(openDraft);
  useEffect(() => {
    const closed = wasOpen.current !== null && openDraft === null;
    wasOpen.current = openDraft;
    if (closed) void reread();
  }, [openDraft, reread]);

  const rows = drafts === null ? [] : draftRows(drafts, titles);
  if (rows.length === 0) return null;
  const shown = open ? rows : rows.slice(0, LIST_ROWS);
  const more = rows.length - shown.length;

  return (
    <section aria-labelledby="studio-drafts" className="max-w-3xl">
      <h2 id="studio-drafts" className="mb-1.5 px-1 text-[13px] font-semibold text-text2">
        Pick up a conversation
      </h2>
      <ul className="flex flex-col">
        {shown.map((row) => (
          <li key={row.draftId}>
            <Link
              href={conversationHref(path, row.draftId)}
              scroll={false}
              className={cx(
                "group flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors",
                "hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
                "max-sm:flex-wrap max-sm:gap-x-2 max-sm:gap-y-0.5",
              )}
            >
              <ChatIcon />
              <span
                className={cx(
                  "min-w-0 flex-1 truncate text-[14px] text-text max-sm:basis-[calc(100%-28px)]",
                  row.quoted && "text-text2",
                )}
                title={row.heading}
              >
                {row.quoted ? <>&ldquo;{row.heading}&rdquo;</> : row.heading}
              </span>
              {row.kinds.length > 0 && (
                <span className="flex shrink-0 items-center gap-1 text-text3" title={row.kinds.map((kind) => KIND_NAME[kind]).join(" and ")}>
                  {row.kinds.map((kind) => (
                    <Glyph key={kind} name={kind} size={16} />
                  ))}
                  <span className="sr-only">{row.kinds.map((kind) => KIND_NAME[kind]).join(" and ")}</span>
                </span>
              )}
              <span className="flex shrink-0 items-center gap-2 text-[12px] max-sm:pl-7">
                <span className={cx("inline-flex items-center gap-1.5", row.briefed ? "font-medium text-accent-text" : "text-text2")}>
                  {row.briefed && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
                  {row.state}
                </span>
                <span aria-hidden className="text-text3">
                  ·
                </span>
                <time dateTime={row.updated} title={new Date(row.updated).toLocaleString()} className="text-text3 tabular-nums" suppressHydrationWarning>
                  {relativeTime(row.updated)}
                </time>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-0.5 rounded-lg px-2 py-1 text-[13px] font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Show {more} more
        </button>
      )}
    </section>
  );
}

function signature(drafts: readonly DraftSummary[] | null): string {
  return drafts === null ? "none" : drafts.map((draft) => `${draft.draftId}@${draft.updated}:${draft.state}`).join(",");
}

function ChatIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-4 shrink-0 text-text3 group-hover:text-text2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-3.5 3v-3H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
    </svg>
  );
}
