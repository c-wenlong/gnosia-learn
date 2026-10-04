"use client";

import { useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";

import { usePanelHost } from "@/components/studio/panel-host";
import { PanelLink } from "@/components/studio/PanelLink";
import { buttonClasses, chipClasses, cx, MENU_GROUP, MENU_HEADING, MENU_PANEL, menuRowClasses } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { Popover } from "@/components/ui/Popover";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { PopoverPlacement } from "@/components/ui/popover-place";
import { isPlainClick } from "@/lib/plain-click";
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
 * (D85 of docs/STUDIO-CHAT-FIRST.md), the kit's in its links mode. Three
 * links, like every other control here, so the choice is `?kind=` in the URL
 * and, through `PanelLink`, the grid redraws in the browser. Choosing one
 * closes a tile's panel, as a topic chip does.
 */
export function KindSegments({ view }: { view: StudioView }) {
  const words: Record<KindFilter, string> = { all: "All", diagram: "Diagrams", video: "Videos" };
  return (
    <SegmentedControl
      mode="links"
      label="Kind"
      link={PanelLink}
      value={view.kind}
      items={KINDS.map((kind) => ({ id: kind, label: words[kind], href: studioHref(view, { kind, selected: null }) }))}
    />
  );
}

/**
 * The kit's search field at the strip's 32px, 240px wide as the design gives
 * it, in a plain form so it needs no JS. Where the toolbar stacks its two
 * halves (`StudioToolbar`), it takes the rest of the row beside the kind.
 */
export function StudioSearch({ view }: { view: StudioView }) {
  const host = usePanelHost();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    if (host?.navigate(studioHref(view, { query, selected: null }))) event.preventDefault();
  }
  return (
    <form action="/studio" method="get" onSubmit={onSubmit} className="min-w-0 flex-1 @[52rem]:flex-none">
      <ViewFields view={view} />
      <SearchField
        size="compact"
        key={view.query}
        defaultValue={view.query}
        placeholder={SEARCH_WORDS[view.kind]}
        label={SEARCH_WORDS[view.kind]}
        className="w-full @[52rem]:w-60"
      />
    </form>
  );
}

/**
 * The topic chips: what is in this directory, not the whole vocabulary.
 *
 * Past five they go into an overflow menu, because the strip's height is
 * fixed and a wrapping row of chips is the one thing that would change it.
 * The menu is in the top layer, so the row's own clipping (it never wraps)
 * cannot cut it off. `No topic` is never in the overflow: its whole job is
 * to be noticed.
 *
 * The chips scroll sideways when they have less room than they need, and
 * "+N" sits after them outside the scrolling box, so it is always on screen;
 * the row used to clip both, and on a phone "+N" sat under the search field
 * where no press could reach it. `No topic` leads the scrolling run, so it
 * is in view before any scroll. The padding keeps a chip's focus ring inside
 * the scrolling box, which clips.
 *
 * Each chip is the kit's small `Chip` drawn on a `PanelLink` (`chipClasses`),
 * so a press moves the URL in the browser as every control here does. A
 * chosen topic is `aria-current`, as its row in the overflow menu is.
 */
export function TopicChips({ chips, view }: { chips: TopicChip[]; view: StudioView }) {
  const named = chips.filter((chip) => chip.slug !== NO_TOPIC);
  const untopiced = chips.find((chip) => chip.slug === NO_TOPIC);
  const shown = named.slice(0, 5);
  const overflow = named.slice(5);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <div className="-mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        {/* First, so it is on screen however many topics follow and however
            narrow the row: its whole job is to be noticed, and it is never in
            the overflow. At zero it would filter to nothing; shown while on,
            so it can be turned off. */}
        {untopiced !== undefined && (untopiced.count > 0 || view.topics.includes(NO_TOPIC)) && (
          <TopicChip
            href={studioHref(toggleTopic(view, NO_TOPIC), { selected: null })}
            active={view.topics.includes(NO_TOPIC)}
            title={`${untopiced.count} diagram${untopiced.count === 1 ? "" : "s"} with no topic`}
          >
            No topic ({untopiced.count})
          </TopicChip>
        )}
        {shown.map((chip) => (
          <TopicChip
            key={chip.slug}
            href={studioHref(toggleTopic(view, chip.slug), { selected: null })}
            active={view.topics.includes(chip.slug)}
            title={`${chip.label} (${chip.count})`}
          >
            {chip.label}
          </TopicChip>
        ))}
      </div>
      {overflow.length > 0 && (
        <StripMenu label={`+${overflow.length}`} name={`${overflow.length} more ${overflow.length === 1 ? "topic" : "topics"}`} placement="bottom-start">
          <MenuGroup title="More topics">
            {overflow.map((chip) => (
              <MenuRow
                key={chip.slug}
                href={studioHref(toggleTopic(view, chip.slug), { selected: null })}
                on={view.topics.includes(chip.slug)}
                count={chip.count}
              >
                {chip.label}
              </MenuRow>
            ))}
          </MenuGroup>
        </StripMenu>
      )}
    </div>
  );
}

/** One topic filter: a small kit chip that is a panel link, filled while it is on. */
function TopicChip({ href, active, title, children }: { href: string; active: boolean; title: string; children: ReactNode }) {
  return (
    <PanelLink href={href} title={title} aria-current={active ? "true" : undefined} className={chipClasses({ active, size: "sm" })}>
      {children}
    </PanelLink>
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
    <StripMenu label="Display">
      <MenuGroup title="Group by">
        {groups.map(([value, label]) => (
          <MenuRow key={value} href={studioHref(view, { group: value })} on={view.group === value}>
            {label}
          </MenuRow>
        ))}
      </MenuGroup>
      <MenuGroup title="Layout">
        {layouts.map(([value, label]) => (
          <MenuRow key={value} href={studioHref(view, { layout: value })} on={view.layout === value}>
            {label}
          </MenuRow>
        ))}
      </MenuGroup>
      <MenuGroup title="Fields">
        {/* A toggle among choices: checked while the chips show, and pressing it flips them. */}
        <MenuRow href={studioHref(view, { chips: !view.chips })} on={view.chips}>
          Concept chips
        </MenuRow>
      </MenuGroup>
    </StripMenu>
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
    <StripMenu label="Sort">
      <MenuGroup title="Sort by">
        {sorts.map(([value, label, direction]) => (
          <MenuRow key={value} href={studioHref(view, { sort: value, direction })} on={view.sort === value}>
            {label}
          </MenuRow>
        ))}
      </MenuGroup>
      <MenuGroup title="Order">
        {directions.map(([value, label]) => (
          <MenuRow key={value} href={studioHref(view, { direction: value })} on={view.direction === value}>
            {label}
          </MenuRow>
        ))}
      </MenuGroup>
    </StripMenu>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One of the strip's menus: a secondary kit `Button` at `xs` and a kit
 * `Popover` of links under it, the account menu's disclosure pattern (Tab
 * walks from the button into the rows; no arrow keys are promised). A row is a `PanelLink`, so a plain
 * click moves the URL in the browser and a modified one opens a new tab.
 *
 * A plain click on a row closes the menu with the focus back on the button.
 * Choosing one is a client navigation and React keeps the menu, so before
 * this it stayed open over the grid it had just changed, which read as
 * nothing having happened. A modified click keeps it open. One is open at a
 * time: pressing another's button is a press outside this one.
 *
 * A row can also be a form's submit button (the canvas page's verbs, which
 * are server actions): submitting it closes the menu the same way. Closed on
 * the submit event rather than the click, so React has read the form's data
 * before the row goes.
 */
export function StripMenu({
  label,
  name,
  placement = "bottom-end",
  children,
}: {
  label: string;
  /** The button's accessible name, where `label` alone says too little ("+5"). */
  name?: string;
  placement?: PopoverPlacement;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  function onChoose(event: MouseEvent<HTMLDivElement>) {
    if (!isPlainClick(event) || (event.target as Element).closest("a") === null) return;
    close();
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={name}
        onClick={() => setOpen((was) => !was)}
        className={buttonClasses({ variant: "secondary", size: "xs", className: "aria-expanded:bg-surface2" })}
      >
        {label}
        <Glyph
          name="chevron"
          size={14}
          className={cx("text-text3 transition-[rotate] duration-150 ease-soft motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      <Popover
        anchorRef={trigger}
        open={open}
        onOpenChange={() => setOpen(false)}
        placement={placement}
        id={id}
        onClick={onChoose}
        onSubmit={close}
        className={cx(MENU_PANEL, "w-max min-w-[13rem] max-w-[min(22rem,calc(100vw-2rem))]")}
      >
        {children}
      </Popover>
    </div>
  );
}

/** A run of rows under a heading that names it to a screen reader too. */
function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  const heading = useId();
  return (
    <div role="group" aria-labelledby={heading} className={MENU_GROUP}>
      <p id={heading} className={MENU_HEADING}>
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * One row: a tick on the choice in force, the label, and a count at the
 * right for a topic. The chosen one is `aria-current`, as the kind segments'
 * link is: a link cannot be `aria-pressed`, which ARIA allows on a button
 * only, and these stay links so they open in a new tab.
 */
function MenuRow({ href, on, count, children }: { href: string; on: boolean; count?: number; children: ReactNode }) {
  return (
    <PanelLink href={href} aria-current={on ? "true" : undefined} className={menuRowClasses()}>
      <Glyph name="tick" size={16} className={cx("shrink-0 text-accent-text", !on && "invisible")} />
      <span className={cx("min-w-0 flex-1 truncate", on && "font-semibold")}>{children}</span>
      {count !== undefined && <span className="shrink-0 text-[12px] text-text3 tabular-nums">{count}</span>}
    </PanelLink>
  );
}
