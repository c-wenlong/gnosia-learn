"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useTransition } from "react";

import { FilterMenu } from "@/components/ui/FilterMenu";
import type { FilterOption } from "@/components/ui/filter-menu";
import { libraryHref, type LibraryFilters } from "@/lib/library";

export interface LibraryMenu {
  /** "Type", "Course", "Topic": the trigger's label, and the key the menus are told apart by. */
  label: string;
  /** The URL parameter the menu sets. */
  param: "kind" | "course" | "topic";
  /** The current value, read from the URL by the page; `""` is the menu's "All". */
  value: string;
  options: FilterOption[];
}

/**
 * The Library's filter menus, and the only client code in its filter row.
 *
 * The URL stays the whole state: the page reads `?kind=`, `?course=`,
 * `?topic=`, `?q=` and `?sort=` and hands them over as `filters`, and a pick
 * pushes the `libraryHref` of those filters with the one parameter changed.
 * `router.push` rather than `replace`, so the back button still undoes a
 * filter as it did when each choice was a link. The trigger shows the pick at
 * once (`useOptimistic`) and dims until the server has rendered the new view.
 *
 * **The next URL is built from the latest picks, not the last render.** A
 * second pick made while the first navigation is still in flight would
 * otherwise start from the filters the page rendered before the first, and
 * drop it. `latest` holds every pick since the last settled render; it is
 * reset from the page's filters only once no navigation is pending, since
 * until then the picks are ahead of what the server has shown.
 */
export function LibraryFilterMenus({ filters, menus }: { filters: LibraryFilters; menus: LibraryMenu[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useOptimistic<Record<string, string>, { label: string; value: string }>(
    Object.fromEntries(menus.map((m) => [m.label, m.value])),
    (current, pick) => ({ ...current, [pick.label]: pick.value }),
  );

  const latest = useRef(filters);
  useEffect(() => {
    if (!pending) latest.current = filters;
  }, [filters, pending]);

  return (
    <div role="group" aria-label="Filter by kind and course" className="flex flex-wrap items-center gap-2">
      {menus.map((menu) => {
        const value = values[menu.label] ?? menu.value;
        return (
          <FilterMenu
            key={menu.label}
            label={menu.label}
            options={menu.options}
            value={value}
            defaultValue=""
            busy={pending && value !== menu.value}
            onChange={(next) => {
              latest.current = { ...latest.current, [menu.param]: next === "" ? null : next };
              const href = libraryHref(latest.current);
              startTransition(() => {
                setValues({ label: menu.label, value: next });
                router.push(href, { scroll: false });
              });
            }}
          />
        );
      })}
    </div>
  );
}
