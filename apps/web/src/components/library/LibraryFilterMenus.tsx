"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { FilterMenu } from "@/components/ui/FilterMenu";
import type { FilterOption } from "@/components/ui/filter-menu";

/** A menu option with the library URL picking it navigates to, built on the server by `libraryHref`. */
export type LibraryMenuOption = FilterOption & { href: string };

export interface LibraryMenu {
  /** "Type", "Course", "Topic". Also the key the menus are told apart by. */
  label: string;
  /** The current value, read from the URL by the page; `""` is the menu's "All". */
  value: string;
  options: LibraryMenuOption[];
}

/**
 * The Library's filter menus, and the only client code in its filter row.
 *
 * The URL stays the whole state: the page reads `?kind=`, `?course=` and
 * `?topic=`, builds every option's destination with `libraryHref`, and this
 * component only pushes the one that was picked. `router.push` rather than
 * `replace`, so the back button still undoes a filter as it did when each
 * choice was a link. The trigger shows the pick at once (`useOptimistic`) and
 * dims until the server has rendered the new view.
 */
export function LibraryFilterMenus({ menus }: { menus: LibraryMenu[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useOptimistic<Record<string, string>, { label: string; value: string }>(
    Object.fromEntries(menus.map((m) => [m.label, m.value])),
    (current, pick) => ({ ...current, [pick.label]: pick.value }),
  );

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
              const href = menu.options.find((o) => o.value === next)?.href;
              if (href === undefined) return;
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
