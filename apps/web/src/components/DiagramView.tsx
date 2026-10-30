"use client";

import { useEffect, useRef, useState } from "react";

import { useAssetFailure } from "@/components/use-asset-failure";
import { CARD_TITLE, cardClasses, chipClasses, cx } from "@/components/ui/classes";
import { TextLink } from "@/components/ui/TextLink";
import { WidgetFailure } from "@/components/WidgetFailure";

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
 *
 * **A failure says why.** `onError` carries no reason, so the component asks
 * `statusHref` (the status route for this asset) and shows the answer in the
 * shared Widget placeholder failure panel, in place of the mat.
 */
export function DiagramView({
  src,
  statusHref,
  title,
  caption,
  heading = true,
  failureHeadline = "This diagram did not load.",
}: {
  /** Already resolved by the caller. */
  src: string;
  /** Where to ask why `src` failed. Without one a failure says it has no reason. */
  statusHref?: string;
  /** The alt text and the visible heading. */
  title: string;
  caption?: string;
  /**
   * Draw the title bar. Off where the page names the diagram already (the
   * library asset page, whose title sits under it), and then "Full size" is a
   * small link in the corner of the mat instead.
   */
  heading?: boolean;
  /** What the failure panel says, for a picture that is not a diagram (a video's poster). */
  failureHeadline?: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const { failure, fail, retry, attempt, observe } = useAssetFailure(src, statusHref);

  // The status describes one file, so a new `src` starts over. It has to,
  // because a failure renders the panel *instead of* the `<img>`: with the
  // old status kept there is no element left to fire `onLoad` for the new
  // file, and the component is stuck on "This diagram did not load" for every
  // diagram it is handed afterwards. A soft navigation between two library
  // assets reuses the mounted instance (the route renders no `key`), so one
  // missing file poisoned every diagram opened after it.
  //
  // Set during render rather than in an effect so the swapped-in diagram is
  // never painted through the previous file's status, and kept inside the
  // component rather than pushed onto callers as a `key`: the diagram studio
  // renders this from another route, and the next caller would have to know.
  const [renderedSrc, setRenderedSrc] = useState(src);
  if (renderedSrc !== src) {
    setRenderedSrc(src);
    setStatus("loading");
  }

  // A cached diagram can finish loading before React attaches `onLoad`, which
  // would leave the skeleton up over a picture that is already there.
  useEffect(() => {
    const img = imgRef.current;
    // Only ever an upgrade: a picture that really failed still fires `onError`,
    // and a zero-width `complete` also describes an image not yet fetched.
    if (img?.complete && img.naturalWidth > 0) setStatus("ready");
  }, [src, attempt]);

  return (
    <figure className={cardClasses({ flush: true, className: "relative" })}>
      {heading ? (
        <div className="flex items-center justify-between gap-3 border-b border-hair px-4 py-3">
          <h3 className={cx(CARD_TITLE, "truncate")}>{title}</h3>
          <TextLink href={src} external size="sm" className="shrink-0 px-1.5 py-0.5">
            Full size
          </TextLink>
        </div>
      ) : (
        // Kept when the picture fails too: opening the file itself is then
        // the one way left to see it, or to see why not.
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className={chipClasses({ size: "sm", tone: "overlay", className: "absolute top-3 right-3 z-10" })}
        >
          Full size
        </a>
      )}

      {failure !== null ? (
        <WidgetFailure
          headline={failureHeadline}
          code={failure.code}
          onRetry={() => {
            setStatus("loading");
            retry();
          }}
          inset
          className="min-h-48"
        />
      ) : (
        // A constant mat in both themes: see the note above on why the diagram
        // is never recoloured to match the page.
        <div
          className={cx("relative bg-diagram-matte p-3", status === "ready" ? "" : "min-h-48")}
        >
          {/* Behind the picture, never over it: the diagram must be visible on
              its own, so that a page where this script never runs still shows
              one rather than a permanently empty frame. Kept mounted, so it
              fades away under the picture as it lands instead of vanishing. */}
          <div
            aria-hidden
            data-skeleton={status}
            className={cx(
              "absolute inset-3 rounded-lg bg-black/[0.06] transition-opacity duration-150 ease-out motion-reduce:transition-none",
              status === "loading" ? "opacity-100 motion-safe:animate-pulse" : "opacity-0",
            )}
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- an SVG the
              app serves as-is: next/image would rasterise a vector drawing
              whose whole job is to stay sharp at any zoom. */}
          <img
            key={attempt}
            ref={(element) => {
              imgRef.current = element;
              observe(element);
            }}
            src={src}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus("ready")}
            onError={fail}
            className="relative mx-auto block max-h-[70vh] w-full object-contain"
          />
        </div>
      )}

      {caption && (
        <figcaption className="border-t border-hair px-4 py-2.5 text-[12px] text-text2">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
