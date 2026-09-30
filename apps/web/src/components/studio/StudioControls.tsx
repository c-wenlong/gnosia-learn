import Link from "next/link";
import type { ReactNode } from "react";

import { ChipLink } from "@/components/studio/StudioChrome";
import {
  DEFAULT_VIEW,
  NO_TOPIC,
  studioHref,
  toggleTopic,
  type Direction,
  type Grouping,
  type Layout,
  type Sort,
  type StudioView,
  type TopicChip,
} from "@/lib/studio-view";

/**
 * Search, the topic chips, Display and Sort.
 *
 * All of it server-rendered, and none of it a client component. Every control
 * here writes to the URL — the search box is a `GET` form, every option is a
 * link, and the popovers are `<details>` — which is the Linear rule the
 * research table adopted ("the set is encoded in the URL") taken to its
 * conclusion: if the view lives in the query string, nothing needs local state
 * to hold it, the back button works for free, and a filtered grid is a link
 * somebody can send.
 *
 * `<details>` as the popover is the same trade. It opens on click and on
 * Enter, it is in the tab order, and it closes when an option is chosen
 * because choosing one navigates. What it does not do is close on an outside
 * click, which is a real loss and a small one next to a client boundary around
 * every control on the strip.
 */

/** The hidden inputs that make a `GET` form preserve the rest of the view. */
function ViewFields({ view }: { view: StudioView }) {
  const fields: [string, string][] = [];
  if (view.topics.length > 0) fields.push(["topic", view.topics.join(",")]);
  if (view.group !== DEFAULT_VIEW.group) fields.push(["group", view.group]);
  if (view.sort !== DEFAULT_VIEW.sort) fields.push(["sort", view.sort]);
  if (view.direction !== DEFAULT_VIEW.direction) fields.push(["dir", view.direction]);
  if (view.chips !== DEFAULT_VIEW.chips) fields.push(["chips", view.chips ? "1" : "0"]);
  if (view.layout !== DEFAULT_VIEW.layout) fields.push(["view", view.layout]);
  if (view.panel !== DEFAULT_VIEW.panel) fields.push(["panel", view.panel ? "1" : "0"]);
  return (
    <>
      {fields.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

/** 240px, the width the design gives it, and a plain form so it needs no JS. */
export function SearchField({ view }: { view: StudioView }) {
  return (
    <form action="/studio" method="get" className="shrink-0">
      <ViewFields view={view} />
      <input
        type="search"
        name="q"
        defaultValue={view.query}
        placeholder="Search diagrams"
        aria-label="Search diagrams"
        className="h-8 w-40 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-base placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none sm:w-60 md:text-xs"
      />
    </form>
  );
}

/**
 * The topic chips: what is in this directory, not the whole vocabulary.
 *
 * Past six they go into an overflow popover, because the strip's height is
 * fixed and a wrapping row of chips is the one thing that would change it.
 * `No topic` is never in the overflow: its whole job is to be noticed.
 */
export function TopicChips({ chips, view }: { chips: TopicChip[]; view: StudioView }) {
  const named = chips.filter((chip) => chip.slug !== NO_TOPIC);
  const untopiced = chips.find((chip) => chip.slug === NO_TOPIC);
  const shown = named.slice(0, 5);
  const overflow = named.slice(5);

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {shown.map((chip) => (
        <ChipLink
          key={chip.slug}
          href={studioHref(toggleTopic(view, chip.slug), { selected: null })}
          active={view.topics.includes(chip.slug)}
          title={`${chip.label} (${chip.count})`}
        >
          {chip.label}
        </ChipLink>
      ))}
      {overflow.length > 0 && (
        <Popover label={`+${overflow.length}`}>
          <MenuSection title="More topics">
            {overflow.map((chip) => (
              <MenuLink
                key={chip.slug}
                href={studioHref(toggleTopic(view, chip.slug), { selected: null })}
                active={view.topics.includes(chip.slug)}
              >
                <span className="min-w-0 flex-1 truncate">{chip.label}</span>
                <span className="text-[var(--muted)]">{chip.count}</span>
              </MenuLink>
            ))}
          </MenuSection>
        </Popover>
      )}
      {untopiced !== undefined && (
        <ChipLink
          href={studioHref(toggleTopic(view, NO_TOPIC), { selected: null })}
          active={view.topics.includes(NO_TOPIC)}
          title={`${untopiced.count} diagram${untopiced.count === 1 ? "" : "s"} with no topic`}
        >
          No topic ({untopiced.count})
        </ChipLink>
      )}
    </div>
  );
}

/** Group by, concept chips, grid or list. One popover, the Linear pattern. */
export function DisplayMenu({ view }: { view: StudioView }) {
  const groups: [Grouping, string][] = [
    ["none", "No grouping"],
    ["topic", "Topic"],
    ["domain", "Domain"],
  ];
  const layouts: [Layout, string][] = [
    ["grid", "Grid"],
    ["list", "List"],
  ];
  return (
    <Popover label="Display">
      <MenuSection title="Group by">
        {groups.map(([value, label]) => (
          <MenuLink key={value} href={studioHref(view, { group: value })} active={view.group === value}>
            {label}
          </MenuLink>
        ))}
      </MenuSection>
      <MenuSection title="Layout">
        {layouts.map(([value, label]) => (
          <MenuLink key={value} href={studioHref(view, { layout: value })} active={view.layout === value}>
            {label}
          </MenuLink>
        ))}
      </MenuSection>
      <MenuSection title="Fields">
        <MenuLink href={studioHref(view, { chips: !view.chips })} active={view.chips}>
          Concept chips
        </MenuLink>
      </MenuSection>
    </Popover>
  );
}

/**
 * Name, created, modified — the three the file browser research settled on.
 *
 * Title links with `dir=asc` because ascending is A→Z and that is what picking
 * "Title" means; the two dates keep the default, where descending is newest
 * first. The direction is still its own control underneath, so either can be
 * flipped afterwards.
 */
export function SortMenu({ view }: { view: StudioView }) {
  const sorts: [Sort, string, Direction][] = [
    ["modified", "Last modified", "desc"],
    ["created", "Created", "desc"],
    ["title", "Title", "asc"],
  ];
  const directions: [Direction, string][] = [
    ["desc", view.sort === "title" ? "Z to A" : "Newest first"],
    ["asc", view.sort === "title" ? "A to Z" : "Oldest first"],
  ];
  return (
    <Popover label="Sort">
      <MenuSection title="Sort by">
        {sorts.map(([value, label, direction]) => (
          <MenuLink
            key={value}
            href={studioHref(view, { sort: value, direction })}
            active={view.sort === value}
          >
            {label}
          </MenuLink>
        ))}
      </MenuSection>
      <MenuSection title="Order">
        {directions.map(([value, label]) => (
          <MenuLink
            key={value}
            href={studioHref(view, { direction: value })}
            active={view.direction === value}
          >
            {label}
          </MenuLink>
        ))}
      </MenuSection>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */

function Popover({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="relative shrink-0">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] [&::-webkit-details-marker]:hidden">
        {label}
        <span aria-hidden className="text-[var(--muted)]">
          ▾
        </span>
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-lg">
        {children}
      </div>
    </details>
  );
}

function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-2 py-1 text-xs font-semibold text-[var(--muted-strong)]">
        {title}
      </p>
      {children}
    </div>
  );
}

function MenuLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`flex h-8 items-center gap-2 rounded-md px-2 text-xs transition-colors ${
        active
          ? "bg-[var(--nav-active-bg)] font-medium text-[var(--accent-strong)]"
          : "hover:bg-[var(--surface-hover)]"
      }`}
    >
      <span aria-hidden className="w-3 shrink-0">
        {active ? "✓" : ""}
      </span>
      {children}
    </Link>
  );
}
