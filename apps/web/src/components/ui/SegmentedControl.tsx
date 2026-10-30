"use client";

import Link from "next/link";
import { useRef, type ComponentType, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "./classes";
import { Glyph, type GlyphName } from "./Glyph";
import { tabKeyIndex } from "./roving";

export type SegmentSize = "sm" | "md";

export type SegmentItem<T extends string = string> = {
  id: T;
  /** The words on the segment; with `iconOnly`, its accessible name and its tooltip instead. */
  label: string;
  /** A mark before the words, or in place of them with `iconOnly`. */
  icon?: GlyphName;
};

type SegmentLinkProps = {
  href: string;
  className?: string;
  title?: string;
  "aria-label"?: string;
  "aria-current"?: "page";
  children?: ReactNode;
};

/** The link a segment renders in `links` mode: `next/link` by default, or one that moves in the browser (the studio's `PanelLink`). */
export type SegmentLink = ComponentType<SegmentLinkProps>;

type Common<T extends string> = {
  /** The group's accessible name. A visible caption can name it instead, through `labelledBy`. */
  label: string;
  /** The id of a visible caption; when given it names the group and `label` is not read. */
  labelledBy?: string;
  /** The segment in use. In `links` mode it may be none of them, and then no segment is marked. */
  value: T;
  size?: SegmentSize;
  /** Icons alone: every item needs an `icon`, and its `label` becomes the name a screen reader reads and the hover's tooltip. */
  iconOnly?: boolean;
  /** As wide as its container, the segments sharing it equally; otherwise as wide as its widest segment times the count. */
  block?: boolean;
  className?: string;
};

type RadioProps<T extends string> = Common<T> & {
  /** Buttons in a radio group (the default): one in the tab order, the arrows move and choose. */
  mode?: "radio";
  items: readonly SegmentItem<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
};

type LinksProps<T extends string> = Common<T> & {
  /** Links, each in the tab order, the current one marked `aria-current`: for a choice that is a URL. */
  mode: "links";
  items: readonly (SegmentItem<T> & { href: string })[];
  link?: SegmentLink;
};

export type SegmentedControlProps<T extends string> = RadioProps<T> | LinksProps<T>;

/**
 * Each size's row height, words, padding and gap. The track adds 2px around
 * the rows, so `sm` is 32px tall, the studio strip's and the compact search
 * field's height, and `md` is 44px, a form field's and a button's.
 */
const SIZE: Record<SegmentSize, { row: string; pad: string; icon: string; gap: string; px: number; glyph: number }> = {
  sm: { row: "h-7 text-[12px]", pad: "px-2.5", icon: "px-1.5", gap: "gap-0.5", px: 2, glyph: 16 },
  md: { row: "h-10 text-[14px]", pad: "px-3.5", icon: "px-3", gap: "gap-1", px: 4, glyph: 18 },
};

/** A plain `next/link` that keeps the scroll where it is, since a segment changes a view of the same page. */
function PageLink(props: SegmentLinkProps) {
  return <Link scroll={false} {...props} />;
}

/**
 * Kit `SegmentedControl`: a choice of one among two to four named options,
 * drawn as a track (`--surface2`, radius 12) with the chosen option's face
 * (`--surface`, radius 10) sliding under it, 200ms on `ease-soft`, and not at
 * all under reduced motion. The segments share the width equally, so the face
 * moves by whole segments and its place needs no measuring: the server draws
 * it where it belongs.
 *
 * Two modes, for the two kinds of choice:
 *
 * - `radio` (the default) is buttons in a `radiogroup`, for a choice held in
 *   the page's state (the theme, the Learn page's view): the chosen one is in
 *   the tab order, every arrow moves to the next option and chooses it, and
 *   there is no Home or End, the WAI-ARIA radio group pattern.
 * - `links` is links in a `group`, for a choice that is a URL (the library's
 *   layout, the studio's kind): each is in the tab order, as links are, the
 *   current one is `aria-current="page"`, and a modified click opens a tab.
 *
 * A row of options that each switch a panel is a `TabList`; options that can
 * be on together are `Chip` toggles.
 */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { label, labelledBy, value, size = "sm", iconOnly = false, block = false, className, items } = props;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const s = SIZE[size];
  const index = items.findIndex((item) => item.id === value);
  const count = items.length;

  const face = (item: SegmentItem<T>) => {
    const icon = item.icon === undefined ? null : <Glyph name={item.icon} size={s.glyph} />;
    if (iconOnly && icon !== null) return icon;
    return (
      <>
        {icon}
        {item.label}
      </>
    );
  };

  const segment = (on: boolean) =>
    cx(
      "relative inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap select-none",
      "transition-colors duration-100 motion-reduce:transition-none",
      // Inset, so the track does not crowd the ring and a neighbour does not cover it.
      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
      "disabled:cursor-not-allowed disabled:opacity-60",
      s.row,
      iconOnly ? s.icon : s.pad,
      on ? "text-text" : "text-text2 not-disabled:hover:text-text",
    );

  const named = labelledBy === undefined ? { "aria-label": label } : { "aria-labelledby": labelledBy };
  const track = cx(
    "relative grid-flow-col auto-cols-fr rounded-xl bg-surface2 p-0.5",
    block ? "grid w-full" : "inline-grid shrink-0",
    s.gap,
    className,
  );

  // The chosen option's face: one segment's width, moved by whole segments
  // and gaps. Absent while no segment is current, as a link row can be. Its
  // fill is about 1.1:1 on the track in every palette, so a 1px ring in
  // `--text3` draws its edge; the chosen option is told by its outline as
  // well as by its words' colour.
  const thumb =
    index < 0 ? null : (
      <span
        aria-hidden
        data-segment-thumb=""
        className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[10px] bg-surface shadow-[0_1px_0_var(--lip-shade)] ring-1 ring-text3 transition-[translate] duration-200 ease-soft motion-reduce:transition-none"
        style={{
          width: `calc((100% - 4px - ${s.px * (count - 1)}px) / ${count})`,
          translate: `calc(${index} * (100% + ${s.px}px)) 0`,
        }}
      />
    );

  if (props.mode === "links") {
    const Anchor = props.link ?? PageLink;
    return (
      <div role="group" {...named} className={track}>
        {thumb}
        {props.items.map((item) => {
          const on = item.id === value;
          return (
            <Anchor
              key={item.id}
              href={item.href}
              aria-current={on ? "page" : undefined}
              aria-label={iconOnly ? item.label : undefined}
              title={iconOnly ? item.label : undefined}
              className={segment(on)}
            >
              {face(item)}
            </Anchor>
          );
        })}
      </div>
    );
  }

  const { onChange, disabled = false } = props;
  // The radio in the tab order: the chosen one, or the first while none is.
  const stop = index < 0 ? 0 : index;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    // Every arrow moves and chooses, and there is no Home or End: the radio group pattern.
    const next = tabKeyIndex(event.key, at, count, "both", false);
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <div role="radiogroup" {...named} className={track}>
      {thumb}
      {items.map((item, i) => {
        const on = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={iconOnly ? item.label : undefined}
            title={iconOnly ? item.label : undefined}
            tabIndex={i === stop ? 0 : -1}
            disabled={disabled}
            data-option={item.id}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, i)}
            className={segment(on)}
          >
            {face(item)}
          </button>
        );
      })}
    </div>
  );
}
