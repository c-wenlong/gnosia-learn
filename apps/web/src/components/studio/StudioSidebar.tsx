"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PanelLink } from "@/components/studio/PanelLink";
import { usePanelHost } from "@/components/studio/panel-host";
import { cx, LABEL } from "@/components/ui/classes";
import {
  DRAFT_CHANGED_EVENT,
  draftRows,
  historyGroups,
  LIST_LIMIT,
  LISTED_STATES,
  type DraftRow,
} from "@/lib/studio-draft-list";
import { listDrafts, type DraftSummary } from "@/lib/studio-drafts";
import { conversationHref, relativeTime } from "@/lib/studio-view";

/**
 * The studio's sidebar: New chat, then every conversation a person can open
 * again, newest first under day headings (docs/STUDIO-CHAT-FIRST.md, "Home
 * and the full-screen conversation"). It is beside the home view and beside
 * a conversation alike, so moving between conversations is one press.
 *
 * The page reads the list on the server, so it is there on the first paint.
 * Opening and closing a conversation does not render the page again
 * (`PanelHost`), so this reads the list itself when the open conversation
 * changes, when that conversation says its title, turns or state moved
 * (`DRAFT_CHANGED_EVENT`), and when the window regains focus, for a
 * conversation started in another tab. A conversation that is open but not
 * listed yet (it is being made, or nothing in it has reached the runner) is
 * drawn at the top anyway, so the one on screen is always marked here.
 *
 * From 768px up it is a column; below that a drawer the header's toggle
 * opens (`SidebarToggle`), closed again by a pick, the backdrop or Escape.
 */
export function StudioSidebar({
  initial,
  path,
  titles,
  active,
  pending,
  open,
  onClose,
  onNewChat,
}: {
  /** What the page read, or null when the runner did not answer. */
  initial: DraftSummary[] | null;
  /** The page's own URL, which a row's link patches. */
  path: string;
  /** Diagram titles by name, for a draft that extends one and has no words yet. */
  titles: Readonly<Record<string, string>>;
  /** The conversation on screen, by id. */
  active: string | null;
  /** The words of a conversation being made, before it has an id. */
  pending: string | null;
  /** The drawer, below 768px. */
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
}) {
  const [fresh, setFresh] = useState<{ base: string; drafts: DraftSummary[] } | null>(null);
  // A read from here stands until the page reads something different.
  const version = signature(initial);
  const drafts = fresh !== null && fresh.base === version ? fresh.drafts : initial;

  // Reads can overlap, and an older answer landing after a newer one would
  // put the list back a step. Each read takes a number, and an answer older
  // than the last one shown is dropped.
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
    // A turn streams several changes in a breath; one read covers them.
    let soon: ReturnType<typeof setTimeout> | null = null;
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
  }, [reread]);

  const shown = useRef(active);
  useEffect(() => {
    if (shown.current === active) return;
    shown.current = active;
    void reread();
  }, [active, reread]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rows = drafts === null ? [] : draftRows(drafts, titles);
  const unlisted = pending !== null || (active !== null && !rows.some((row) => row.draftId === active));
  const groups = historyGroups(rows, new Date());

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close the conversation list"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-page/60 backdrop-blur-[2px] md:hidden"
        />
      )}
      <nav
        aria-label="Conversations"
        className={cx(
          "w-[260px] shrink-0 flex-col border-r border-hair bg-surface",
          "md:static md:flex md:h-auto",
          open ? "fixed inset-y-0 left-0 z-50 flex w-[min(85vw,300px)] pt-[env(safe-area-inset-top)] shadow-xl" : "hidden",
        )}
      >
        <div className="shrink-0 p-2">
          <button
            type="button"
            data-studio-new=""
            onClick={onNewChat}
            className={cx(
              "flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] font-medium text-text",
              "transition-colors hover:bg-surface2",
              "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
            )}
          >
            <ComposeIcon />
            New chat
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {unlisted && (
            <ul className="mb-3 flex flex-col">
              <li>
                <span aria-current="page" className={cx(ROW, "bg-surface2 font-medium")}>
                  <span className="min-w-0 flex-1 truncate">{pending ?? "New conversation"}</span>
                </span>
              </li>
            </ul>
          )}
          {groups.map((group) => (
            <section key={group.label} className="mb-3" aria-label={group.label}>
              <h2 className={cx(LABEL, "px-2.5 pb-1 pt-2 text-text3")}>{group.label}</h2>
              <ul className="flex flex-col">
                {group.rows.map((row) => (
                  <li key={row.draftId}>
                    <HistoryRow row={row} href={conversationHref(path, row.draftId)} current={row.draftId === active} onPick={onClose} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {rows.length === 0 && !unlisted && (
            <p className="px-2.5 pt-2 text-[13px] leading-5 text-text3">Conversations you start show here.</p>
          )}
        </div>
      </nav>
    </>
  );
}

const ROW = cx(
  "flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] text-text",
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
);

function HistoryRow({ row, href, current, onPick }: { row: DraftRow; href: string; current: boolean; onPick: () => void }) {
  return (
    <PanelLink
      href={href}
      onClick={onPick}
      aria-current={current ? "page" : undefined}
      title={`${row.heading}\n${row.state} · ${relativeTime(row.updated)}`}
      // The time is "3 minutes ago" on the server and may be "4" here.
      suppressHydrationWarning
      className={cx(ROW, "transition-colors", current ? "bg-surface2 font-medium" : "hover:bg-surface2")}
    >
      <span className={cx("min-w-0 flex-1 truncate", row.quoted && !current && "text-text2")}>{row.heading}</span>
      {row.briefed && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />}
      <span className="sr-only">, {row.state}</span>
    </PanelLink>
  );
}

/** The sidebar's toggle, before the title on a phone. Nothing from 768px up, where the sidebar is always there. */
export function SidebarToggle({ onOpen, className }: { onOpen?: () => void; className?: string }) {
  // The home view is drawn by the server, which cannot hand a callback down,
  // so there the host's own is used.
  const host = usePanelHost();
  return (
    <button
      type="button"
      onClick={onOpen ?? host?.openSidebar}
      aria-label="Open the conversation list"
      className={cx(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text2 transition-colors hover:bg-surface2 hover:text-text md:hidden",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" />
      </svg>
    </button>
  );
}

function signature(drafts: readonly DraftSummary[] | null): string {
  return drafts === null ? "none" : drafts.map((draft) => `${draft.draftId}@${draft.updated}:${draft.state}`).join(",");
}

function ComposeIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-[18px] shrink-0 text-text2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4" />
      <path d="M14.2 3.3a1.5 1.5 0 0 1 2.1 2.1L10 11.7l-2.8.7.7-2.8z" />
    </svg>
  );
}
