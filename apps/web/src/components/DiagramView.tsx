"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One exported teaching diagram.
 *
 * Presentational: `src` arrives already resolved, and the component neither
 * reads the file nor knows where it came from.
 *
 * **`<img>`, not inline SVG.** Four reasons, in the order they matter:
 *
 * 1. **Weight.** A committed export runs 200kB to 300kB. As an `<img>` the
 *    browser caches it across pages and fetches it lazily; inline, every byte
 *    goes into the HTML of every page that shows it, uncached, and twice if
 *    the same diagram appears twice.
 * 2. **Collisions.** A tldrawkc export is self-contained, which means it
 *    carries its own `<style>`, its own `<defs>` and its own ids. Inlined, all
 *    of that lands in the page's one global namespace, and two diagrams on one
 *    page start borrowing each other's clip paths and fonts.
 * 3. **Ownership.** The SVG is the artefact the diagram tool lints, stamps a
 *    title onto and verifies by rendering back to a PNG. Reaching into its
 *    markup from the app would make what is on screen something neither the
 *    tool's `verify` nor the committed file can vouch for.
 * 4. Inlining buys exactly one thing, restyling the diagram from CSS, and
 *    that thing is the wrong thing here. See below.
 *
 * **Dark mode: a light mat, never a filter.** The exports are self-contained
 * and drawn for a light ground: their own fills, strokes and label colours are
 * baked in. `filter: invert()` would "fix" the ground by destroying the one
 * thing a teaching diagram uses colour for, which is meaning, and a red
 * warning box would come back cyan. So the diagram is given a constant
 * near-white mat in both themes and framed like a plate in a book: the same
 * drawing in both themes, legible in both, glare-free because the mat is not
 * pure white and the frame separates it from the page.
 */
export function DiagramView({
  src,
  title,
  caption,
}: {
  /** Already resolved by the caller. */
  src: string;
  /** The alt text and the visible heading. */
  title: string;
  caption?: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  // A cached diagram can finish loading before React attaches `onLoad`, which
  // would leave the skeleton up over a picture that is already there.
  useEffect(() => {
    const img = imgRef.current;
    // Only ever an upgrade: a picture that really failed still fires `onError`,
    // and a zero-width `complete` also describes an image not yet fetched.
    if (img?.complete && img.naturalWidth > 0) setStatus("ready");
  }, [src]);

  return (
    <figure className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <h3 className="truncate text-sm font-medium text-[var(--foreground)]">{title}</h3>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-strong)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Full size
        </a>
      </div>

      {status === "failed" ? (
        <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
          <p className="text-sm font-medium text-[var(--foreground)]">
            This diagram did not load.
          </p>
          <p className="max-w-prose text-xs text-[var(--muted)]">
            The file may have moved since the catalog last indexed it.
          </p>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 break-all font-mono text-[11px] text-[var(--accent-strong)] hover:underline"
          >
            {src}
          </a>
        </div>
      ) : (
        // A constant mat in both themes: see the note above on why the diagram
        // is never recoloured to match the page.
        <div
          className={`relative bg-[#f7f6f3] p-3 ${status === "ready" ? "" : "min-h-48"}`}
        >
          {status === "loading" && (
            // Behind the picture, never over it: the diagram must be visible on
            // its own, so that a page where this script never runs still shows
            // one rather than a permanently empty frame.
            <div
              aria-hidden
              className="absolute inset-3 rounded-lg bg-black/[0.06] motion-safe:animate-pulse"
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- an SVG the
              app serves as-is: next/image would rasterise a vector drawing
              whose whole job is to stay sharp at any zoom. */}
          <img
            ref={imgRef}
            src={src}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("failed")}
            className="relative mx-auto block max-h-[70vh] w-full object-contain"
          />
        </div>
      )}

      {caption && (
        <figcaption className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-strong)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
