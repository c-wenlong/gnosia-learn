"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useTransition, type ReactNode } from "react";

import { FilterMenu } from "@/components/ui/FilterMenu";
import { chipClasses, cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import type { FilterOption } from "@/components/ui/filter-menu";
import {
  libraryHref,
  withPick,
  type LibraryFilters,
  type LibraryParam,
  type LibraryTab,
} from "@/lib/library";
import { isPlainClick } from "@/lib/plain-click";

export interface LibraryMenu {
  /** "Kind", "Course", "Topic", "Sort": the trigger's label, and the key the menus are told apart by. */
  label: string;
  /** The URL parameter the menu sets. */
  param: LibraryParam;
  /** The current value, read from the URL by the page. */
  value: string;
  /** The value that means "no filter" and leaves the trigger unfilled. `""` unless said. */
  defaultValue?: string;
  /** The trigger prints the value alone ("Newest"), for a menu whose options name themselves. */
  bare?: boolean;
  options: FilterOption[];
}

/** The optimistic key the type tabs and the phone's type chip share. */
const TYPE = "Type";

/**
 * The Library's header: the title and its count on the left, then the
 * filters and how to show them, and under them the strip of type tabs (L1 of
 * docs/proposals/library-by-type-and-day.md).
 *
 * **The tabs.** All, Videos, Diagrams, Notes, Sessions, Links, and Others
 * when the catalog holds a companion file: plain words with no counts, as
 * Manus's `type-tab` is (32 tall, radius 8, the chosen one filled), each
 * label drawn twice so the bolder chosen weight does not shift the strip.
 * They are links to `?kind=`, so a modified click opens one in a new tab; a
 * plain click is taken in-page like a menu pick. On a phone the strip is one
 * chip ("All", "Videos") opening the same list, as Manus's is at 390.
 *
 * **The rest of the row.** The Favorites toggle (a chip with a star: on
 * shows only the assets the owner starred), the filter menus (Course, Topic
 * while one is set, and Kind inside Others), then the search, the sort and the grid or list
 * switch, all at a chip's 34px, at the right of the title's line. From
 * 768px the title, the filters and the controls share that line, the search
 * shrinking from 260px to 120px before the filters and controls wrap whole
 * onto a line of their own; below 768px the filters and then the controls
 * take lines of their own, with the search stretching. The search and the layout switch
 * arrive as elements from the page (a GET form and two links, neither needing
 * client code); the menus and tabs are drawn here, because a pick pushes a
 * URL.
 *
 * The URL stays the whole state: the page reads `?kind=`, `?course=`,
 * `?topic=`, `?q=`, `?sort=` and `?view=` and hands them over as `filters`,
 * and a pick pushes the `libraryHref` of those filters with the one parameter
 * changed. `router.push` rather than `replace`, so the back button still
 * undoes a filter. The chosen tab or trigger shows the pick at once
 * (`useOptimistic`) and the results dim until the server has rendered the new
 * view: this element carries `data-pending` meanwhile, which the page reads.
 * So switching tabs never blanks the list; the old rows stay, dimmed, until
 * the new ones fade in.
 *
 * **The next URL is built from the latest picks, not the last render.** A
 * second pick made while the first navigation is still in flight would
 * otherwise start from the filters the page rendered before the first, and
 * drop it. `latest` holds every pick since the last settled render; it is
 * reset from the page's filters only once no navigation is pending.
 */
export function LibraryToolbar({
  heading,
  filters,
  tabs,
  tab,
  menus,
  sort,
  search,
  layout,
}: {
  /** The title and the count, drawn first in the row. */
  heading: ReactNode;
  filters: LibraryFilters;
  /** The strip's tabs, `libraryTabs(counts)`. */
  tabs: readonly LibraryTab[];
  /** The chosen tab's value, `tabOf(kind)`. */
  tab: string;
  menus: LibraryMenu[];
  sort: LibraryMenu;
  search: ReactNode;
  layout: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useOptimistic<Record<string, string>, { label: string; value: string }>(
    Object.fromEntries([...menus, sort, { label: TYPE, value: tab }].map((m) => [m.label, m.value])),
    (current, pick) => ({ ...current, [pick.label]: pick.value }),
  );

  const [favoritesOn, setFavoritesOn] = useOptimistic(filters.favorites === true);

  const latest = useRef(filters);
  useEffect(() => {
    if (!pending) latest.current = filters;
  }, [filters, pending]);

  const pick = (label: string, param: LibraryParam, next: string) => {
    latest.current = withPick(latest.current, param, next);
    const href = libraryHref(latest.current);
    startTransition(() => {
      setValues({ label, value: next });
      router.push(href, { scroll: false });
    });
  };

  const toggleFavorites = () => {
    const next = !favoritesOn;
    latest.current = withPick(latest.current, "favorites", next ? "1" : "");
    const href = libraryHref(latest.current);
    startTransition(() => {
      setFavoritesOn(next);
      router.push(href, { scroll: false });
    });
  };

  const menu = (m: LibraryMenu) => {
    const value = values[m.label] ?? m.value;
    return (
      <FilterMenu
        key={m.label}
        label={m.label}
        options={m.options}
        value={value}
        defaultValue={m.defaultValue ?? ""}
        bare={m.bare}
        // A long topic title ("Frontend toolchains: UI engine, compiler,
        // bundler, meta-framework") truncates in its pill rather than pushing
        // the row past the screen; the menu itself shows it whole.
        className="max-w-[240px]"
        busy={pending && value !== m.value}
        onChange={(next) => pick(m.label, m.param, next)}
      />
    );
  };

  const chosen = values[TYPE] ?? tab;
  const typeOptions: FilterOption[] = tabs.map((t) => ({ value: t.value, label: t.label }));

  return (
    <div data-pending={pending || undefined} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-baseline gap-x-3">{heading}</div>
        <section
          aria-label="Filters"
          className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto md:min-w-min md:flex-1 md:flex-nowrap md:justify-end"
        >
          {/* From 768px it never shrinks: a squeezed group would let its pills
              spill over the search, so when the title and the controls cannot
              share a line the controls wrap instead. It is never wider than the
              row, so on a phone its pills wrap inside it rather than scrolling
              the page. */}
          <div
            role="group"
            aria-label="Filter by type and course"
            className="flex max-w-full flex-wrap items-center gap-2 md:shrink-0"
          >
            <div className="md:hidden">
              <FilterMenu
                label={TYPE}
                options={typeOptions}
                value={chosen}
                defaultValue=""
                bare
                busy={pending && chosen !== tab}
                onChange={(next) => pick(TYPE, "kind", next)}
              />
            </div>
            <button
              type="button"
              aria-pressed={favoritesOn}
              onClick={toggleFavorites}
              className={cx(
                chipClasses({ active: favoritesOn }),
                pending && favoritesOn !== (filters.favorites === true) && "opacity-60",
              )}
            >
              <Glyph
                name="star"
                size={16}
                className={cx("transition-[fill] duration-150 motion-reduce:transition-none", favoritesOn && "fill-current")}
              />
              Favorites
            </button>
            {menus.map(menu)}
          </div>
          <div className="flex w-full min-w-0 items-center justify-end gap-2 md:w-auto">
            {search}
            {menu(sort)}
            {layout}
          </div>
        </section>
      </div>

      <nav aria-label="Type" className="hidden flex-wrap items-center gap-1 md:flex">
        {tabs.map((t) => {
          const current = t.value === chosen;
          return (
            <Link
              key={t.value}
              href={libraryHref({ ...filters, kind: t.value === "" ? null : t.value })}
              aria-current={current ? "page" : undefined}
              scroll={false}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                if (!current) pick(TYPE, "kind", t.value);
              }}
              className={cx(
                "grid h-8 items-center rounded-lg px-2.5 text-[14px] leading-5 transition-colors duration-150 ease-out motion-reduce:transition-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                current ? "bg-surface2 font-semibold text-text" : "text-text2 hover:bg-surface2/60 hover:text-text",
              )}
            >
              {/* The bolder copy reserves the width, so choosing a tab does not shift the strip. */}
              <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold">
                {t.label}
              </span>
              <span className="col-start-1 row-start-1 text-center">{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
