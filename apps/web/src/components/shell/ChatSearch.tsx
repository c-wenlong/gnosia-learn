"use client";

import Link from "next/link";
import type { RefObject } from "react";

import { SEARCH_MAX, type HistorySearch } from "@/components/studio/history-search";
import { cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { TextLink } from "@/components/ui/TextLink";

import { FADE, FADE_IN } from "./motion";
import { matchParts, searchRows, type SearchRow } from "@/lib/studio-draft-list";
import { conversationHref, relativeTime } from "@/lib/studio-view";

import { rowClick } from "./row-click";

/**
 * The sidebar's conversation search (D87 of docs/STUDIO-CHAT-FIRST.md): the
 * field under New chat, and the matches that take the place of the day groups
 * while it holds words. The reads, the debounce and the paging are
 * `useHistorySearch`; this is how they are drawn.
 *
 * What is drawn here is marked `data-peek-hold`: the folded sidebar slid out
 * over the page stays out while focus is in the field or a match, and slides
 * back once focus and the pointer have both left (`AppSidebar`).
 */

/** A magnifying glass, the field's and the rail's. */
export function SearchIcon({ className = "size-[18px] shrink-0 text-text2" }: { className?: string }) {
  return <Glyph name="search" size={18} className={className} />;
}

/**
 * The field. Escape clears it when it holds words and does nothing else, so a
 * drawer or a slid-out sidebar is not closed by the same press; with the field
 * empty Escape goes on to close them.
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
    <div
      data-peek-hold=""
      className={cx(
        "relative flex h-10 items-center overflow-hidden rounded-lg text-text2 transition-colors duration-150 motion-reduce:transition-none",
        compact ? "bg-transparent" : "bg-surface2",
        "focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-accent",
      )}
    >
      <SearchIcon className="pointer-events-none absolute left-2.5 size-[18px] shrink-0" />
      <input
        ref={inputRef}
        type="search"
        name="history-search"
        value={search.query}
        maxLength={SEARCH_MAX}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search conversations"
        aria-label="Search conversations"
        onChange={(event) => search.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || search.query === "") return;
          event.stopPropagation();
          search.clear();
        }}
        className={cx(
          "h-full min-w-0 flex-1 appearance-none rounded-lg bg-transparent pl-9 pr-8 text-[16px] text-text outline-none md:text-[14px]",
          // The words fade with the sidebar's labels; the icon beside them stays.
          FADE,
          compact ? "opacity-0" : FADE_IN,
          "placeholder:text-text3 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
        )}
      />
      {/* Not on the folded rail: it would sit on the icon, under the rail's search button. */}
      {search.query !== "" && !compact && (
        // Fades in with the first letter typed; it goes with the last.
        <button
          type="button"
          aria-label="Clear the search"
          title="Clear the search"
          onClick={() => {
            search.clear();
            inputRef.current?.focus();
          }}
          className="absolute right-1 inline-flex size-7 animate-fade-in items-center justify-center rounded-md text-text3 transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-accent motion-reduce:animate-none"
        >
          <svg aria-hidden viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="m5.5 5.5 9 9m0-9-9 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** What the field found, in place of the grouped history: one flat list, or why there is none. */
export function SearchResults({
  search,
  titles,
  path,
  active,
  navigate,
  onPick,
}: {
  search: HistorySearch;
  titles: Readonly<Record<string, string>>;
  path: string;
  active: string | null;
  /** The studio page's browser move, or null off the studio. */
  navigate: ((href: string) => boolean) | null;
  onPick: () => void;
}) {
  const rows = search.found === null ? [] : searchRows(search.found.drafts, titles, search.words);
  // Fades in over the history it replaces, once, as the search starts; the
  // words that follow redraw it in place.
  return (
    <div data-peek-hold="" className="animate-fade-in pt-1 motion-reduce:animate-none">
      {search.error !== null && (
        <p role="alert" className="px-2.5 pt-1 text-[13px] leading-5 text-danger">
          {search.error}
        </p>
      )}
      {search.searching && (
        <p role="status" className="px-2.5 pt-1 text-[13px] leading-5 text-text3">
          Searching…
        </p>
      )}
      {search.found !== null && rows.length === 0 && !search.found.more && (
        <p role="status" className="px-2.5 pt-1 text-[13px] leading-5 text-text3">
          No conversations match
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p role="status" className="sr-only">
            {rows.length} {rows.length === 1 ? "conversation matches" : "conversations match"}
          </p>
          <ul className="flex flex-col">
            {rows.map((row) => (
              <li key={row.draftId}>
                <SearchHit
                  row={row}
                  words={search.words}
                  href={conversationHref(path, row.draftId)}
                  current={row.draftId === active}
                  navigate={navigate}
                  onPick={onPick}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {search.found?.more === true && (
        <div className="px-1 pt-2">
          <TextLink onClick={search.showMore} pending={search.loadingMore} size="sm" className="px-1.5 py-1">
            {search.loadingMore ? "Reading more matches…" : "Show more matches"}
          </TextLink>
          {search.moreError !== null && (
            <p role="alert" className="px-1.5 text-[12px] text-danger">
              {search.moreError}
            </p>
          )}
        </div>
      )}
    </div>
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
  "flex min-h-9 w-full flex-col items-start justify-center rounded-lg px-2.5 py-1.5 text-[14px] text-text",
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
      className={cx(HIT, "transition-colors", current ? "bg-surface2 font-medium" : "hover:bg-surface2")}
    >
      <span className={cx("block w-full min-w-0 truncate", row.quoted && !current && "text-text2")}>
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
