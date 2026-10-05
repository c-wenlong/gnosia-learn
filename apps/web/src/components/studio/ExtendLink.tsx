"use client";

import Link, { useLinkStatus } from "next/link";

import { preloadMentionComposer } from "@/components/studio/preload-composer";
import { cx } from "@/components/ui/classes";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";

/**
 * Extend, wherever it appears: a link to `?extend=<name>`, which opens the
 * panel that starts the conversation.
 *
 * `/studio` renders on the server from several runner reads, one of them
 * `/api/health` with its doctor check, so the panel can take a few seconds to
 * arrive after the press. The label says so meanwhile (`useLinkStatus`)
 * rather than leaving a control that looks as if it did nothing, and
 * `data-pending` lets a hover row stay visible while it waits. No prefetch:
 * every visible tile would otherwise make those reads for a panel nobody
 * opened. Hover, focus and press start loading the composer the panel will
 * type in, so it is there when the panel is.
 *
 * Make a video of this (D86 of docs/STUDIO-CHAT-FIRST.md) is the same press
 * with `&make=video` and its own `label`, so it waits the same way.
 */
export function ExtendLink({
  href,
  className,
  diagram,
  label = "Extend",
  icon,
}: {
  href: string;
  className?: string;
  /** The visible words: Extend unless the press is another one. */
  label?: string;
  /** A kit glyph ahead of the words, decorative: the words name the press. */
  icon?: GlyphName;
  /**
   * The diagram's title, heard after "Extend" by a screen reader and not
   * shown: on a grid of tiles a list of links all named "Extend" says
   * nothing about which is which.
   */
  diagram?: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      className={className}
      onPointerEnter={preloadMentionComposer}
      onFocus={preloadMentionComposer}
      onClick={preloadMentionComposer}
    >
      {icon !== undefined && <Glyph name={icon} size={16} className="shrink-0" />}
      <Label diagram={diagram} label={label} />
    </Link>
  );
}

function Label({ diagram, label }: { diagram?: string | undefined; label: string }) {
  const { pending } = useLinkStatus();
  // Both words in one cell, the idle one hidden, so the control keeps the
  // wider word's width and nothing beside it moves when it changes.
  return (
    <span data-pending={pending ? "" : undefined} aria-live="polite" className="grid">
      <span className={cx("col-start-1 row-start-1", pending ? "invisible" : "")}>
        {/* Heard as "Extend: <title>": the visible word first (label in name). */}
        {label}
        {diagram !== undefined && <span className="sr-only">: {diagram}</span>}
      </span>
      <span aria-hidden={!pending} className={cx("col-start-1 row-start-1", pending ? "animate-pulse motion-reduce:animate-none" : "invisible")}>
        Opening…
      </span>
    </span>
  );
}
