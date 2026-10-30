"use client";

import { StudioTime, useStudioZone } from "@/components/studio/StudioZone";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ExtendLink } from "@/components/studio/ExtendLink";
import { KindBadge, KindWord } from "@/components/studio/KindBadge";
import { FOLD_MS } from "@/components/studio/motion";
import { FadeImg } from "@/components/studio/motion-parts";
import { VideoChangeButton } from "@/components/studio/video/VideoGridJob";
import { Button } from "@/components/ui/Button";
import { buttonClasses, cx } from "@/components/ui/classes";
import { Collapse, CollapseChevron } from "@/components/ui/Collapse";
import { Glyph } from "@/components/ui/Glyph";
import {
  madeListLabel,
  madeOpenHref,
  madePath,
  madeThumbHref,
  madeTitle,
  parseMade,
  type MadeItem,
} from "@/lib/conversation-made";
import { scrollBehavior } from "@/lib/motion";
import { dayAndTime } from "@/lib/studio-grid";
import { extendFromHref } from "@/lib/studio-url";

/**
 * What a conversation made, in its thread (D89 of docs/STUDIO-CHAT-FIRST.md):
 * a card per asset where the job's story ended, and "Everything made in this
 * conversation" at the end of the thread. After Manus's deliverable card and
 * its "View all files in this task".
 *
 * Both are drawn from the catalog (`GET /studio/made/<draft>`), not from the
 * runner's job state, so a conversation reopened later shows them too.
 */

/**
 * The conversation's assets, read on opening and again whenever `version`
 * moves: the panel passes something that changes when the thread does, and
 * the runner writes the asset before the studio line that says it landed, so
 * the read after that line has it. `seen` is the ids the first read held:
 * those were there on opening and do not animate.
 */
export function useConversationMade(draftId: string, version: string): { made: MadeItem[]; seen: ReadonlySet<string> | null } {
  const [made, setMade] = useState<MadeItem[]>([]);
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);
  const issued = useRef(0);
  const read = useCallback(async () => {
    issued.current += 1;
    const ticket = issued.current;
    try {
      const response = await fetch(madePath(draftId), { cache: "no-store" });
      const items = response.ok ? parseMade(await response.json()) : null;
      // An older answer landing after a newer one is dropped; a failed read keeps what is shown.
      if (ticket !== issued.current || items === null) return;
      setMade(items);
      setSeen((held) => held ?? new Set(items.map((item) => item.id)));
    } catch {
      // The cards are a view of the catalog; a read that failed costs them, never the thread.
    }
  }, [draftId]);
  useEffect(() => {
    // From an effect, as the panel's own first read is: the cards come from a
    // route the browser calls, after the thread it sits in has been read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read();
  }, [read, version]);
  return { made, seen };
}

/** One asset the conversation made: its picture, its title and when, Open, and Extend or Change. */
export function MadeCard({ item, path }: { item: MadeItem; path: string }) {
  const zone = useStudioZone();
  const title = madeTitle(item);
  const thumb = madeThumbHref(item);
  const kind = item.kind === "video" ? "video" : "diagram";
  const open = madeOpenHref(item.id);
  return (
    <article
      data-made={item.id}
      aria-label={title}
      className="flex w-full max-w-[34rem] min-w-0 items-stretch gap-3 rounded-xl border border-border bg-surface p-2.5"
    >
      <Link
        href={open}
        tabIndex={-1}
        aria-hidden
        className={cx(
          "relative flex aspect-[4/3] w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border sm:w-32",
          kind === "video" ? "bg-black" : "bg-diagram-matte",
        )}
      >
        <MadeThumb src={thumb} kind={kind} glyph={24} className={kind === "video" ? "object-cover" : "object-contain p-1.5"} />
        <KindBadge kind={kind} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-5 text-text">
            <KindWord kind={kind} />
            {title}
          </h3>
          <p className="mt-0.5 text-[12px] leading-4 text-text3">
            <time dateTime={item.madeAt} title={dayAndTime(item.madeAt, undefined, zone)}>
              <StudioTime at={item.madeAt} />
            </time>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="xs" href={open} aria-label={`Open ${title}`}>
            Open
          </Button>
          {item.name !== null &&
            (kind === "diagram" ? (
              <ExtendLink href={extendFromHref(path, item.name)} className={buttonClasses({ variant: "secondary", size: "xs" })} diagram={title} />
            ) : (
              <VideoChangeButton slug={item.name} title={title} path={path} className={buttonClasses({ variant: "secondary", size: "xs" })} />
            ))}
        </div>
      </div>
    </article>
  );
}

/**
 * "Everything made in this conversation (N)" at the foot of the thread: a fold
 * listing every asset the read returned, newest first, each a link to the
 * Library's previewer. Nothing when the conversation made nothing.
 */
export function MadeList({ made }: { made: readonly MadeItem[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLElement | null>(null);
  // The list opens at the thread's foot, under the composer's edge: once it
  // has glided open, the thread scrolls just far enough to show it.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => box.current?.scrollIntoView?.({ block: "nearest", behavior: scrollBehavior() }), FOLD_MS);
    return () => clearTimeout(timer);
  }, [open]);
  const label = madeListLabel(made.length);
  if (label === null) return null;
  return (
    <section ref={box} aria-label="Everything made in this conversation" className="flex w-full flex-col px-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
        className="inline-flex items-center gap-1 self-start rounded-sm text-[13px] font-medium text-text2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {label}
        <CollapseChevron open={open} className="h-4 w-4" />
      </button>
      <Collapse open={open} id={id} className="w-full">
        <ul className="mt-2 flex w-full max-w-[34rem] flex-col divide-y divide-hair rounded-xl border border-border bg-surface">
          {made.map((item) => (
            <MadeRow key={item.id} item={item} />
          ))}
        </ul>
      </Collapse>
    </section>
  );
}

function MadeRow({ item }: { item: MadeItem }) {
  const title = madeTitle(item);
  const thumb = madeThumbHref(item);
  const kind = item.kind === "video" ? "video" : "diagram";
  return (
    <li>
      <Link
        href={madeOpenHref(item.id)}
        className="flex min-w-0 items-center gap-3 px-3 py-2 text-[13px] text-text first:rounded-t-xl last:rounded-b-xl hover:bg-surface2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span
          className={cx(
            "flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border",
            kind === "video" ? "bg-black" : "bg-diagram-matte",
          )}
        >
          <MadeThumb src={thumb} kind={kind} glyph={16} className={kind === "video" ? "object-cover" : "object-contain p-0.5"} />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          <KindWord kind={kind} />
          {title}
        </span>
        <KindBadge kind={kind} inline />
        <time dateTime={item.madeAt} className="shrink-0 text-[12px] text-text3">
          <StudioTime at={item.madeAt} />
        </time>
      </Link>
    </li>
  );
}

/**
 * The picture, or the kind's glyph when there is none stored or the route
 * would not serve it (a blob gone missing, file serving off): a broken image
 * says less than the glyph does.
 */
function MadeThumb({ src, kind, glyph, className }: { src: string | null; kind: "diagram" | "video"; glyph: number; className: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src === null || failed === src) {
    return <Glyph name={kind} size={glyph} className={kind === "video" ? "text-white/70" : "text-text3"} />;
  }
  return <FadeImg src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} className={cx("h-full w-full", className)} />;
}
