"use client";

import Link, { useLinkStatus } from "next/link";

import { preloadMentionComposer } from "@/components/studio/preload-composer";

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
 */
export function ExtendLink({
  href,
  className,
  diagram,
}: {
  href: string;
  className?: string;
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
      <Label diagram={diagram} />
    </Link>
  );
}

function Label({ diagram }: { diagram?: string | undefined }) {
  const { pending } = useLinkStatus();
  // Both words in one cell, the idle one hidden, so the control keeps the
  // wider word's width and nothing beside it moves when it changes.
  return (
    <span data-pending={pending ? "" : undefined} aria-live="polite" className="grid">
      <span className={`col-start-1 row-start-1 ${pending ? "invisible" : ""}`}>
        {/* Heard as "Extend: <title>": the visible word first (label in name). */}
        Extend{diagram !== undefined && <span className="sr-only">: {diagram}</span>}
      </span>
      <span aria-hidden={!pending} className={`col-start-1 row-start-1 ${pending ? "animate-pulse motion-reduce:animate-none" : "invisible"}`}>
        Opening…
      </span>
    </span>
  );
}
