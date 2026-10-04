"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { HistorySearch } from "@/components/studio/history-search";
import { cx, LABEL } from "@/components/ui/classes";
import { TextLink } from "@/components/ui/TextLink";
import {
  draftRows,
  historyGroups,
  LIST_LIMIT,
  LISTED_STATES,
  readHistory,
  type DraftRow,
} from "@/lib/studio-draft-list";
import { useDraftsWake } from "@/lib/use-drafts-wake";
import { listDrafts, type DraftSummary } from "@/lib/studio-drafts";
import { conversationHref, relativeTime } from "@/lib/studio-view";

import { SearchResults } from "./ChatSearch";
import { rowClick } from "./row-click";
import { useShell } from "./shell-context";

/**
 * The studio's conversations in the app's sidebar: every one a person can
 * open again, newest first under day headings (docs/STUDIO-CHAT-FIRST.md,
 * "Home and the full-screen conversation"). It is in the sidebar on every
 * page, so a conversation is one press from anywhere, as in a chat app.
 *
 * On `/studio` the page reads the list on the server and publishes it
 * (`usePublishStudioChats`), so it is there on the first paint, and a row
 * opens its conversation in the browser rather than through a server render.
 * Anywhere else the list is read here, once the sidebar mounts, and a row is
 * a link to `/studio?draft=`. The sidebar outlives every navigation, so the
 * list read on one page is still shown on the next.
 *
 * It is read again when the open conversation changes, when that
 * conversation says its title, turns or state moved (`DRAFT_CHANGED_EVENT`),
 * and when the window regains focus, for a conversation started in another
 * tab. A conversation that is open but not listed yet (it is being made, or
 * nothing in it has reached the runner) is drawn at the top anyway, so the
 * one on screen is always marked here.
 *
 * The runner answers a page at a time (`LIST_LIMIT`), so a full page ends in
 * "Show older conversations", which shows one more. Every read is every page
 * shown, read again from the top (`readHistory`).
 *
 * While the search field holds words (`search`, D87) the matches take the
 * place of the day groups: the runner searches every conversation, loaded
 * here or not, and a match opens the way a row does.
 */
export function ChatHistory({ onPick, search }: { onPick: () => void; search: HistorySearch }) {
  const shell = useShell();
  const chats = shell?.chats ?? null;
  const active = chats?.active ?? null;
  const pending = chats?.pending ?? null;

  /** Every loaded page, and whether the runner may have more; null until a read lands. */
  const [list, setList] = useState<{ drafts: DraftSummary[]; more: boolean } | null>(null);
  // The page's own read stands until a read here replaces it, and a page
  // that reads something different (a server render) replaces that in turn.
  const seed = chats?.initial ?? null;
  const seedSignature = signature(seed);
  const [seen, setSeen] = useState("none");
  if (seed !== null && seedSignature !== seen) {
    setSeen(seedSignature);
    setList({ drafts: seed, more: seed.length >= LIST_LIMIT });
  }
  /** Whether a page has handed a list over, which makes the first read here moot. */
  const adopted = useRef(false);
  useEffect(() => {
    if (seen !== "none") adopted.current = true;
  }, [seen]);
  // Titles outlive the studio page, so a row named after a diagram keeps its name elsewhere.
  const [titles, setTitles] = useState<Readonly<Record<string, string>>>({});
  if (chats !== null && chats.titles !== titles) setTitles(chats.titles);

  /** How many pages are shown: one, and one more for each "Show older conversations". */
  const pages = useRef(1);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  // Reads can overlap, and an older answer landing after a newer one would
  // put the list back a step. Each read takes a number, and an answer older
  // than the last one shown is dropped.
  const issued = useRef(0);
  const landed = useRef(0);
  // A list the page hands over is newer than any read still in flight here:
  // those answers are dropped when they land.
  useEffect(() => {
    if (seen !== "none") landed.current = issued.current + 1;
  }, [seen]);
  const read = useCallback(async (count: number) => {
    issued.current += 1;
    const ticket = issued.current;
    const result = await readHistory(count, async (before) => {
      const answer = await listDrafts({ state: LISTED_STATES, nonEmpty: true, limit: LIST_LIMIT, ...(before === undefined ? {} : { before }) });
      return answer.ok && Array.isArray(answer.data.drafts) ? answer.data.drafts : null;
    });
    if (ticket < landed.current) return result !== null;
    // A failed read keeps what is shown: an empty list would read as "no
    // conversations" when the truth is a runner that stopped answering.
    if (result === null) return false;
    landed.current = ticket;
    setList(result);
    return true;
  }, []);
  const reread = useCallback(() => read(pages.current), [read]);

  // The first read, unless the studio page hands one over. The sidebar mounts
  // before the page publishes (its effects run first, being earlier in the
  // tree), so the read waits a task for the page's list to land.
  useEffect(() => {
    const first = setTimeout(() => {
      if (!adopted.current) void reread();
    }, 0);
    return () => clearTimeout(first);
  }, [reread]);

  useDraftsWake(reread, true);

  // A conversation opened that the list does not have yet: it was just made.
  const shown = useRef(active);
  useEffect(() => {
    if (shown.current === active) return;
    shown.current = active;
    if (active !== null && !list?.drafts.some((draft) => draft.draftId === active)) void reread();
  }, [active, list, reread]);

  async function showOlder() {
    if (loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    // Counted before the read, so a refresh that starts while it runs reads
    // the new page too rather than landing after it with one page fewer.
    const next = pages.current + 1;
    pages.current = next;
    const ok = await read(next);
    setLoadingOlder(false);
    if (!ok) {
      if (pages.current === next) pages.current = next - 1;
      setOlderError("Older conversations could not be read: the studio did not answer.");
    }
  }

  const rows = list === null ? [] : draftRows(list.drafts, titles);
  const unlisted = pending !== null || (active !== null && !rows.some((row) => row.draftId === active));
  const groups = historyGroups(rows, new Date());
  const path = chats?.path ?? "/studio";

  return (
    <div className="flex flex-col">
      <h2 className={cx(LABEL, "px-2.5 pb-1 pt-2 text-text3")}>Chats</h2>
      {search.words !== "" ? (
        <SearchResults search={search} titles={titles} path={path} active={active} navigate={chats?.navigate ?? null} onPick={onPick} />
      ) : (
        // The history fades back in as the search is cleared.
        <div className="flex animate-fade-in flex-col motion-reduce:animate-none">
          {unlisted && (
            <ul className="mb-2 flex flex-col">
              <li>
                <span aria-current="page" className={cx(ROW, "bg-surface2 font-medium")}>
                  <span className="min-w-0 flex-1 truncate">{pending ?? "New conversation"}</span>
                </span>
              </li>
            </ul>
          )}
          {groups.map((group) => (
            <section key={group.label} className="mb-2" aria-label={group.label}>
              <h3 className="px-2.5 pb-1 pt-2 text-[12px] leading-4 text-text3">{group.label}</h3>
              <ul className="flex flex-col">
                {group.rows.map((row) => (
                  <li key={row.draftId}>
                    <HistoryRow
                      row={row}
                      href={conversationHref(path, row.draftId)}
                      current={row.draftId === active}
                      navigate={chats?.navigate ?? null}
                      onPick={onPick}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {list?.more === true && rows.length > 0 && (
            <div className="px-1 pt-1">
              <TextLink onClick={() => void showOlder()} pending={loadingOlder} size="sm" className="px-1.5 py-1">
                {loadingOlder ? "Reading older conversations…" : "Show older conversations"}
              </TextLink>
              {olderError !== null && (
                <p role="alert" className="px-1.5 text-[12px] text-danger">
                  {olderError}
                </p>
              )}
            </div>
          )}
          {list !== null && rows.length === 0 && !unlisted && (
            <p className="px-2.5 pt-1 text-[13px] leading-5 text-text3">Conversations you start show here.</p>
          )}
        </div>
      )}
    </div>
  );
}

const ROW = cx(
  "flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] text-text",
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
);

function HistoryRow({
  row,
  href,
  current,
  navigate,
  onPick,
}: {
  row: DraftRow;
  href: string;
  current: boolean;
  /** The studio page's browser move, or null off the studio. */
  navigate: ((href: string) => boolean) | null;
  onPick: () => void;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      onClick={rowClick(navigate, href, onPick)}
      aria-current={current ? "page" : undefined}
      title={`${row.heading}\n${row.state} · ${relativeTime(row.updated)}`}
      // The time is "3 minutes ago" on the server and may be "4" here.
      suppressHydrationWarning
      className={cx(ROW, "transition-colors", current ? "bg-surface2 font-medium" : "hover:bg-surface2")}
    >
      <span className={cx("min-w-0 flex-1 truncate", row.quoted && !current && "text-text2")}>{row.heading}</span>
      {row.briefed && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />}
      <span className="sr-only">, {row.state}</span>
    </Link>
  );
}

function signature(drafts: readonly DraftSummary[] | null): string {
  return drafts === null ? "none" : drafts.map((draft) => `${draft.draftId}@${draft.updated}:${draft.state}`).join(",");
}
