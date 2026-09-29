"use client";

import { useState } from "react";

import { thumbnailHref } from "@/lib/studio-view";

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
      className={`flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-border ${
        missing ? "bg-surface2" : "bg-[#f7f6f3]"
      }`}
    >
      {missing ? (
        <span className="max-w-[44ch] px-4 text-center text-[13px] text-text3">
          {title} has no exported picture yet. The planner reads its shapes and arrows all the same.
        </span>
      ) : (
        // The runner streams the stored SVG; see DiagramTile.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailHref(name)}
          alt={title}
          onError={() => setMissing(true)}
          className="h-full w-full object-contain p-2"
        />
      )}
    </div>
  );
}
