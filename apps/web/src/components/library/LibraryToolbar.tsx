"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useOptimistic, useRef, useTransition, type ReactNode } from "react";

import { ViewOptions } from "@/components/library/ViewOptions";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { SegmentedControl, type SegmentLink } from "@/components/ui/SegmentedControl";
import type { FilterOption } from "@/components/ui/filter-menu";
import {
  libraryHref,
  parseGroup,
  withPick,
  type LibraryFilters,
  type LibraryGroup,
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
 * What a plain click on a type link does: the toolbar's `pick`, told the link's
 * `href`. The kit's segment link takes no `onClick`, so the toolbar hands its
 * own over through this, and `TypeLink` below stays one component for the
 * life of the page (a link component made in a render would remount the row).
 */
const TypePick = createContext<(href: string) => void>(() => {});

/**
 * A type segment: the kit's page link (`next/link`, scroll kept), except that a
 * plain click on a tab other than the current one is taken in-page, as a menu
 * pick is, so the face slides at once and the results dim until the server has
 * drawn the new view. A modified click is the browser's (a new tab) and a click
 * on the current tab does nothing, as before.
 */
const TypeLink: SegmentLink = ({ href, ...rest }) => {
  const pick = useContext(TypePick);
  return (
    <Link
      href={href}
      scroll={false}
      {...rest}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        if (rest["aria-current"] !== "page") pick(href);
      }}
    />
  );
};

/**
 * The Library's header: the title and its count on the left, then the
 * filters and how to show them, and under them the strip of type tabs (L1 of
 * docs/proposals/library-by-type-and-day.md).
 *
 * **The tabs.** All, Videos, Diagrams, Notes, Sessions, Links, and Others
 * when the catalog holds a companion file: plain words with no counts, as
 * Manus's `type-tab` is, as the kit's `SegmentedControl` in its links mode
 * (32 tall, the chosen one's face sliding between them, the segments of one
 * width so choosing one shifts nothing).
 * They are links to `?kind=`, so a modified click opens one in a new tab; a
 * plain click is taken in-page like a menu pick. On a phone the strip is one
 * chip ("All", "Videos") opening the same list, as Manus's is at 390.
 *
 * **The rest of the row.** The filter menus (Course, Topic while one is set,
 * and Kind inside Others), then the search, the sort, the view options (L4:
 * group by day, course or topic, and show all or favorites only, which is
 * where #372's Favorites chip went, `ViewOptions`) and the grid or list
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
 * `?topic=`, `?q=`, `?sort=`, `?view=`, `?group=` and `?favorites=` and hands them over as `filters`,
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
  const [group, setGroup] = useOptimistic<LibraryGroup>(parseGroup(filters.group));

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

  const setFavorites = (next: boolean) => {
    latest.current = withPick(latest.current, "favorites", next ? "1" : "");
    const href = libraryHref(latest.current);
    startTransition(() => {
      setFavoritesOn(next);
      router.push(href, { scroll: false });
    });
  };

  const pickGroup = (next: LibraryGroup) => {
    latest.current = withPick(latest.current, "group", next);
    const href = libraryHref(latest.current);
    startTransition(() => {
      setGroup(next);
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
  // Each tab's link keeps every other filter, as the strip always did.
  const typeHref = (value: string) => libraryHref({ ...filters, kind: value === "" ? null : value });
  const pickType = (href: string) => {
    const hit = tabs.find((t) => typeHref(t.value) === href);
    if (hit !== undefined) pick(TYPE, "kind", hit.value);
  };
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
            {menus.map(menu)}
          </div>
          <div className="flex w-full min-w-0 items-center justify-end gap-2 md:w-auto">
            {search}
            {menu(sort)}
            <ViewOptions
              group={group}
              favorites={favoritesOn}
              busy={pending && (group !== parseGroup(filters.group) || favoritesOn !== (filters.favorites === true))}
              onGroup={pickGroup}
              onFavorites={setFavorites}
            />
            {layout}
          </div>
        </section>
      </div>

      {/* From 768px only: below it the chip above carries the same list. */}
      <div className="hidden max-w-full md:block">
        <TypePick.Provider value={pickType}>
          <SegmentedControl
            mode="links"
            label={TYPE}
            link={TypeLink}
            value={chosen}
            items={tabs.map((t) => ({
              id: t.value,
              label: t.label,
              href: typeHref(t.value),
            }))}
          />
        </TypePick.Provider>
      </div>
    </div>
  );
}
