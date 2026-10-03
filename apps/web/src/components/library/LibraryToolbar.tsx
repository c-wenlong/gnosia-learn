"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useTransition, type ReactNode } from "react";

import { FilterMenu } from "@/components/ui/FilterMenu";
import type { FilterOption } from "@/components/ui/filter-menu";
import { libraryHref, withPick, type LibraryFilters, type LibraryParam } from "@/lib/library";

export interface LibraryMenu {
  /** "Type", "Course", "Topic", "Sort": the trigger's label, and the key the menus are told apart by. */
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

/**
 * The Library's toolbar: what to show on the left, how to show it on the
 * right.
 *
 * The left holds the filter menus (Type, Course, and Topic when one is set).
 * The right holds the search, the sort and the grid or list switch, all at a
 * chip's 34px so the row reads as one set of controls. From 768px the two
 * halves share a line: the right half takes whatever the filters leave, and
 * the search inside it shrinks (to 120px, up to 260px) before anything wraps,
 * so three filter menus at 768px still fit. The filters never shrink: if the
 * two halves still cannot share a line, the right half wraps whole. Below 768px the right half takes
 * a line of its own, with the search stretching to fill it.
 *
 * The search and the layout switch arrive as elements from the page (a GET
 * form and two links, neither needing client code); the menus are drawn here,
 * because a pick pushes a URL.
 *
 * The URL stays the whole state: the page reads `?kind=`, `?course=`,
 * `?topic=`, `?q=`, `?sort=` and `?view=` and hands them over as `filters`,
 * and a pick pushes the `libraryHref` of those filters with the one parameter
 * changed. `router.push` rather than `replace`, so the back button still
 * undoes a filter as it did when each choice was a link. The trigger shows
 * the pick at once (`useOptimistic`) and dims until the server has rendered
 * the new view.
 *
 * **The next URL is built from the latest picks, not the last render.** A
 * second pick made while the first navigation is still in flight would
 * otherwise start from the filters the page rendered before the first, and
 * drop it. `latest` holds every pick since the last settled render, the sort
 * included, which is why the sort menu lives in this component rather than
 * its own; it is reset from the page's filters only once no navigation is
 * pending, since until then the picks are ahead of what the server has shown.
 */
export function LibraryToolbar({
  filters,
  menus,
  sort,
  search,
  layout,
}: {
  filters: LibraryFilters;
  menus: LibraryMenu[];
  sort: LibraryMenu;
  search: ReactNode;
  layout: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useOptimistic<Record<string, string>, { label: string; value: string }>(
    Object.fromEntries([...menus, sort].map((m) => [m.label, m.value])),
    (current, pick) => ({ ...current, [pick.label]: pick.value }),
  );

  const latest = useRef(filters);
  useEffect(() => {
    if (!pending) latest.current = filters;
  }, [filters, pending]);

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
        onChange={(next) => {
          latest.current = withPick(latest.current, m.param, next);
          const href = libraryHref(latest.current);
          startTransition(() => {
            setValues({ label: m.label, value: next });
            router.push(href, { scroll: false });
          });
        }}
      />
    );
  };

  return (
    <section aria-label="Filters" className="flex flex-wrap items-center gap-2">
      {/* Never shrinks: a squeezed group would let its pills spill over the
          search. When the two halves cannot share a line, the right one wraps. */}
      <div role="group" aria-label="Filter by kind and course" className="flex shrink-0 flex-wrap items-center gap-2">
        {menus.map(menu)}
      </div>
      <div className="flex w-full min-w-0 items-center justify-end gap-2 md:w-auto md:min-w-min md:flex-1">
        {search}
        {menu(sort)}
        {layout}
      </div>
    </section>
  );
}
