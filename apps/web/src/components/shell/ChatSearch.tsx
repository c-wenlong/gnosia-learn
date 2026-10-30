"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RefObject } from "react";

import { SEARCH_MAX, type HistorySearch } from "@/components/studio/history-search";
import { TextLink } from "@/components/ui/TextLink";
import { cx, STATUS_TEXT } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { SearchField as KitSearchField } from "@/components/ui/SearchField";
import { isCurrentRow } from "@/lib/nav";
import { matchedTitle, time, type RecentItem } from "@/lib/recent-core";
import { matchParts, searchRows, type SearchRow } from "@/lib/studio-draft-list";
import { conversationHref, relativeTime } from "@/lib/studio-view";

import { FADE, FADE_IN } from "./motion";
import { rowClick } from "./row-click";
import { recentGlyph, ROW, rowFill } from "./rows";
import { useRecentSearch } from "./use-recent";

/**
 * The sidebar's search (D87 of docs/STUDIO-CHAT-FIRST.md, widened by L7 of
 * docs/proposals/library-by-type-and-day.md): the field under New chat, and
 * the matches that take the place of Recent's day groups while it holds
 * words. It searches everything Recent holds: the studio's conversations
 * through the runner, which matches their first messages too
 * (`useHistorySearch`), and every other row's title through the catalog
 * (`useRecentSearch`); the two are merged newest first.
 *
 * What is drawn here is marked `data-peek-hold`: the folded sidebar slid out
 * over the page stays out while focus is in the field or a match, and slides
 * back once focus and the pointer have both left (`AppSidebar`).
 */

/**
 * The field: the kit `SearchField`'s filled face, the sidebar's, at the
 * sidebar's row size (36px, radius 10, its magnifier 8px in, where a row's
 * glyph sits, so it lines up with the rows and centres on the rail). Escape
 * clears it when it holds words and does nothing else, so a drawer or a
 * slid-out sidebar is not closed by the same press; with the field empty
 * Escape goes on to close them.
 */
export function SearchField({
  search,
  inputRef,
  compact = false,
}: {
  search: HistorySearch;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Narrowed to its icon on the folded rail: no fill, so it reads as one of the rail's icons. */
  compact?: boolean;
}) {
  return (
    <div data-peek-hold="">
      <KitSearchField
        ref={inputRef}
        face="filled"
        label="Search recent"
        name="history-search"
        value={search.query}
        maxLength={SEARCH_MAX}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search"
        aria-label="Search recent"
        onChange={(event) => search.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || search.query === "") return;
          event.stopPropagation();
          search.clear();
        }}
        // Not on the folded rail: it would sit on the icon, under the rail's search button.
        onClear={compact ? undefined : search.clear}
        // The kit's filled face is 40px with radius 8 and its magnifier 10px
        // in; the sidebar's rows are the density variables', so the field
        // takes theirs.
        className="!rounded-[var(--shell-row-radius,10px)] [&_svg]:!left-[var(--shell-row-pad,8px)]"
        // The words and the fill fade with the sidebar's labels; the icon
        // beside them stays. The clear button's room is kept on the rail too,
        // so the placeholder does not move as the sidebar widens.
        inputClassName={cx(
          "pr-8 !h-[var(--shell-row,36px)] !rounded-[var(--shell-row-radius,10px)] !pl-[34px]",
          FADE,
          compact ? "opacity-0" : FADE_IN,
        )}
      />
    </div>
  );
}

/** What the field found, in place of Recent's day groups: one flat list, newest first, or why there is none. */
export function SearchResults({
  search,
  studio,
  path,
  active,
  navigate,
  onPick,
}: {
  search: HistorySearch;
  /** Whether the runner's conversations are searched too. */
  studio: boolean;
  path: string;
  active: string | null;
  /** The studio page's browser move, or null off the studio. */
  navigate: ((href: string) => boolean) | null;
  onPick: () => void;
}) {
  const recent = useRecentSearch(search.words, studio);
  // The runner matches a conversation's name as well as its own words, and
  // heads each row by `conversationTitle`, so a renamed one is found and
  // shown by its name.
  // Only while the runner answers for the conversations: otherwise the
  // catalog's matches hold them, and the runner's too would list each twice.
  const conversations = !studio || search.found === null ? [] : searchRows(search.found.drafts, {}, search.words);
  const others = (recent.found ?? []).filter((item) => !(studio && item.kind === "draft"));
  const hits: ({ type: "draft"; at: string; row: SearchRow } | { type: "item"; at: string; item: RecentItem })[] = [
    ...conversations.map((row) => ({ type: "draft" as const, at: row.updated, row })),
    ...others.map((item) => ({ type: "item" as const, at: item.at, item })),
    // By the instant, as every list in Recent is: the runner and the catalog
    // spell their times differently, and a string compare misorders them.
  ].sort((a, b) => time(b.at) - time(a.at));
  const searching = (studio && search.searching) || (recent.found === null && recent.error === null);
  const settled = !searching && (!studio || search.found !== null || search.error !== null);
  const errors = [studio ? search.error : null, recent.error].filter((e): e is string => e !== null);
  // Fades in over the list it replaces, once, as the search starts; the
  // words that follow redraw it in place.
  return (
    <div data-peek-hold="" className="animate-fade-in pt-1 motion-reduce:animate-none">
      {errors.map((error) => (
        <p key={error} role="alert" className={cx(STATUS_TEXT, "px-2 pt-1 text-danger")}>
          {error}
        </p>
      ))}
      {searching && hits.length === 0 && (
        <p role="status" className={cx(STATUS_TEXT, "px-2 pt-1 text-text3")}>
          Searching…
        </p>
      )}
      {settled && hits.length === 0 && search.found?.more !== true && errors.length === 0 && (
        <p role="status" className={cx(STATUS_TEXT, "px-2 pt-1 text-text3")}>
          Nothing matches
        </p>
      )}
      {hits.length > 0 && (
        <>
          <p role="status" className="sr-only">
            {hits.length} {hits.length === 1 ? "row matches" : "rows match"}
          </p>
          <ul className="flex flex-col gap-px">
            {hits.map((hit) =>
              hit.type === "draft" ? (
                <li key={`draft:${hit.row.draftId}`}>
                  <SearchHit
                    row={hit.row}
                    words={search.words}
                    href={conversationHref(path, hit.row.draftId)}
                    current={hit.row.draftId === active}
                    navigate={navigate}
                    onPick={onPick}
                  />
                </li>
              ) : (
                <li key={hit.item.key}>
                  <RecentHit item={hit.item} words={search.words} onPick={onPick} />
                </li>
              ),
            )}
          </ul>
        </>
      )}
      {studio && search.found?.more === true && (
        <div className="px-0.5 pt-2">
          <TextLink onClick={search.showMore} pending={search.loadingMore} size="sm" className="px-1.5 py-1">
            {search.loadingMore ? "Reading more matches…" : "Show more matches"}
          </TextLink>
          {search.moreError !== null && (
            <p role="alert" className={cx(STATUS_TEXT, "px-1.5 text-danger")}>
              {search.moreError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** A catalog row that matched: its glyph and its title, the words marked. */
function RecentHit({ item, words, onPick }: { item: RecentItem; words: string; onPick: () => void }) {
  const pathname = usePathname();
  const current = isCurrentRow(item.href, pathname, item.kind === "module");
  const kind = recentGlyph(item);
  // A row found by a tutor session folded into it shows that session's title.
  const title = matchedTitle(item, words);
  return (
    <Link href={item.href} onClick={onPick} aria-current={current ? "page" : undefined} title={title} className={cx(ROW, rowFill(current))}>
      <Glyph name={kind.glyph} size={18} className="text-text2" />
      <span className="min-w-0 flex-1 truncate">
        <span className="sr-only">{kind.word}: </span>
        <Marked text={title} words={words} />
      </span>
    </Link>
  );
}

/** The matched words, in bold and the accent's text colour. */
function Marked({ text, words }: { text: string; words: string }) {
  return (
    <>
      {matchParts(text, words).map((part, at) =>
        part.hit ? (
          <mark key={at} className="bg-transparent font-semibold text-accent-text">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** A hit is two lines (the heading, and the words around the match), so it stacks where a history row centres. */
const HIT = cx(
  "flex min-h-[var(--shell-row,36px)] w-full flex-col items-start justify-center rounded-[var(--shell-row-radius,10px)] py-1.5 ps-[34px] pe-2 text-[14px] text-text",
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
);

function SearchHit({
  row,
  words,
  href,
  current,
  navigate,
  onPick,
}: {
  row: SearchRow;
  words: string;
  href: string;
  current: boolean;
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
      suppressHydrationWarning
      className={cx(HIT, "relative transition-colors", rowFill(current))}
    >
      <Glyph name="compose" size={18} className="absolute left-[var(--shell-row-pad,8px)] top-[9px] text-text2" />
      <span className={cx("block w-full min-w-0 truncate", row.quoted && !current && "text-text2")}>
        <span className="sr-only">Conversation: </span>
        <Marked text={row.heading} words={words} />
      </span>
      {row.snippet !== null && (
        <span className="block w-full min-w-0 truncate text-[12px] font-normal leading-4 text-text3">
          <Marked text={row.snippet} words={words} />
        </span>
      )}
      <span className="sr-only">, {row.state}</span>
    </Link>
  );
}
