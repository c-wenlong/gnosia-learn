"use client";

import type { FormEvent, ReactNode } from "react";

import { MenuPopover } from "@/components/studio/MenuPopover";
import { usePanelHost } from "@/components/studio/panel-host";
import { PanelLink } from "@/components/studio/PanelLink";
import { ChipLink } from "@/components/studio/StudioChrome";
import { FIELD_TEXT } from "@/components/ui/classes";
import {
  DEFAULT_VIEW,
  KINDS,
  NO_TOPIC,
  studioHref,
  toggleTopic,
  type Direction,
  type Grouping,
  type KindFilter,
  type Layout,
  type Sort,
  type StudioView,
  type TopicChip,
} from "@/lib/studio-view";

/**
 * The kind filter, Search, the topic chips, Display and Sort.
 *
 * Every control writes to the URL, which is the Linear rule the research
 * table adopted ("the set is encoded in the URL"): the back button works for
 * free, and a filtered grid is a link somebody can send. Each option is a
 * `PanelLink` and the search box a `GET` form, so with no script they are
 * still links and a form. With it, `PanelHost` moves the URL in the browser
 * (`browserViewMove`) and `StudioGrid` redraws from what the page already
 * has, where each one used to be a server render of two seconds or more.
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
  if (view.kind !== DEFAULT_VIEW.kind) fields.push(["kind", view.kind]);
  if (view.panel !== DEFAULT_VIEW.panel) fields.push(["panel", view.panel ? "1" : "0"]);
  return (
    <>
      {fields.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

const SEARCH_WORDS: Record<KindFilter, string> = {
  all: "Search",
  diagram: "Search diagrams",
  video: "Search videos",
};

/**
 * All, Diagrams, Videos: a segmented control at the start of the strip
 * (D85 of docs/STUDIO-CHAT-FIRST.md). Three links, like every other control
 * here, so the choice is `?kind=` in the URL and the grid redraws in the
 * browser. Choosing one closes a tile's panel, as a topic chip does.
 */
export function KindSegments({ view }: { view: StudioView }) {
  const words: Record<KindFilter, string> = { all: "All", diagram: "Diagrams", video: "Videos" };
  return (
    <div role="group" aria-label="Kind" className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-0.5">
      {KINDS.map((kind) => {
        const active = view.kind === kind;
        return (
          <PanelLink
            key={kind}
            href={studioHref(view, { kind, selected: null })}
            aria-current={active ? "true" : undefined}
            className={`flex h-full items-center rounded-md px-2.5 text-xs transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] motion-reduce:transition-none ${
              active
                ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow-sm"
                : "font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {words[kind]}
          </PanelLink>
        );
      })}
    </div>
  );
}

/** 240px, the width the design gives it, and a plain form so it needs no JS. */
export function SearchField({ view }: { view: StudioView }) {
  const host = usePanelHost();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    if (host?.navigate(studioHref(view, { query, selected: null }))) event.preventDefault();
  }
  return (
    <form action="/studio" method="get" onSubmit={onSubmit} className="shrink-0">
      <ViewFields view={view} />
      <input
        type="search"
        name="q"
        key={view.query}
        defaultValue={view.query}
        placeholder={SEARCH_WORDS[view.kind]}
        aria-label={SEARCH_WORDS[view.kind]}
        className={`h-8 w-40 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none sm:w-60 ${FIELD_TEXT.xs}`}
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
        <MenuPopover label={`+${overflow.length}`}>
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
        </MenuPopover>
      )}
      {/* At zero it would filter to nothing; shown while on, so it can be turned off. */}
      {untopiced !== undefined && (untopiced.count > 0 || view.topics.includes(NO_TOPIC)) && (
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
    <MenuPopover label="Display">
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
    </MenuPopover>
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
    <MenuPopover label="Sort">
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
    </MenuPopover>
  );
}

/* -------------------------------------------------------------------------- */

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
    <PanelLink
      href={href}
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
    </PanelLink>
  );
}
