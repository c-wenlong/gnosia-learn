"use client";

import { useState } from "react";

import { FadeImg } from "@/components/studio/motion-parts";
import { cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { TextLink } from "@/components/ui/TextLink";
import { tutorTurnsWords, videoPosterHref } from "@/lib/studio-cards";
import { thumbnailHref } from "@/lib/studio-url";

/**
 * The diagram an extend conversation is about, pinned at the top of its
 * thread at 160px tall (docs/STUDIO-CHAT-FIRST.md, "Extend from a tile").
 *
 * Shared by the conversation and by the moment before it exists, while the
 * runner checks the diagram out and inspects it, so the picture the person
 * pressed Extend on stays put when the draft arrives.
 *
 * The light mat is the constant `DiagramTile` and `DiagramView` use: a
 * diagram drawn on white stays legible on it in every theme. A diagram with
 * no stored SVG answers the image with a 404, which is said in words, on the
 * theme's own surface, rather than left as a broken-image glyph.
 */
export function PinnedDiagram({ name, title }: { name: string; title: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <div
      className={cx(
        "flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-border",
        missing ? "bg-surface2" : "bg-diagram-matte",
      )}
    >
      {missing ? (
        <span className="max-w-[44ch] px-4 text-center text-[13px] text-text3">
          {title} has no exported picture yet. The planner reads its shapes and arrows all the same.
        </span>
      ) : (
        // The runner streams the stored SVG; see DiagramTile.
        <FadeImg
          src={thumbnailHref(name)}
          alt={title}
          onError={() => setMissing(true)}
          className="h-full w-full object-contain p-2"
        />
      )}
    </div>
  );
}

/**
 * The video a Change conversation is about, pinned the same way: its stored
 * poster on a dark mat, since a frame is a picture rather than a drawing on
 * white. A video with no stored poster is said in words, as a diagram with no
 * SVG is.
 */
export function PinnedVideo({ slug, title }: { slug: string; title: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <div
      className={cx(
        "flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-border",
        missing ? "bg-surface2" : "bg-black",
      )}
    >
      {missing ? (
        <span className="max-w-[44ch] px-4 text-center text-[13px] text-text3">
          {title} has no poster yet. The planner reads its brief all the same.
        </span>
      ) : (
        // The library's asset route streams the stored JPEG.
        <FadeImg src={videoPosterHref(slug)} alt={title} onError={() => setMissing(true)} className="h-full w-full object-contain" />
      )}
    </div>
  );
}

/**
 * The concept a conversation from the concept tutor is about, pinned above
 * its thread (docs/STUDIO-TUTOR-HANDOFF.md, "The studio side"): the title as
 * a link back to its page, and how many of the tutor's turns came along, so
 * nothing reached the planner that the person cannot see was sent (D69). No
 * label over it: the link already says where the conversation came from.
 */
export function PinnedConcept({ slug, title, tutorTurns }: { slug: string; title: string; tutorTurns: number }) {
  const turns = tutorTurnsWords(tutorTurns);
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-xl border-2 border-border px-4 py-2.5 text-[13px] leading-5 text-text2">
      <Glyph name="book" size={16} className="shrink-0 text-text3" />
      <TextLink href={`/learn/${encodeURIComponent(slug)}`}>{title}</TextLink>
      {turns !== null && <span>{turns}</span>}
    </p>
  );
}
