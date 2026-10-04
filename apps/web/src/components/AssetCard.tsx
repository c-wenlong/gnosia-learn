"use client";

import Link from "next/link";
import { useCallback } from "react";

import {
  assetDisplayTitle,
  assetKindLabel,
  assetMetaLine,
  familyOf,
  type AssetCardRef,
} from "@/components/asset-meta";
import { RowMenu } from "@/components/library/RowMenu";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { Chip } from "@/components/ui/Chip";
import { cardClasses, cx } from "@/components/ui/classes";
import { useImageReveal } from "@/components/ui/use-image-reveal";
import { useAssetFailure } from "@/components/use-asset-failure";
import { WidgetFailure } from "@/components/WidgetFailure";
import type { MasteryBucket } from "@/lib/mastery-bucket";
import type { RowMenuSections } from "@/lib/row-menu";

/**
 * One row of the catalog's asset table, as a card in the library grid
 * (hi-fi 10: a thumbnail, the kind chip and a meta line, the title, and the
 * concept it explains with a mastery dot).
 *
 * The asset comes in as a prop, already read by whoever is listing them; the
 * thumbnail, the concept and the link come in already resolved. The
 * component's whole job is to say what this thing is and let the reader open
 * it.
 *
 * **One shape for every kind.** A video shows its poster and a diagram shows
 * itself; everything else, and a video or diagram with no picture to show,
 * gets an empty `--surface2` box of the same size, so the grid lines up
 * whatever it holds. The box does not print the kind: the chip under it
 * already does, and a card saying "note" three times (box, chip and meta
 * line) was the kind of repetition the owner asked to remove on 2026-09-29.
 *
 * **It has to degrade honestly**, because the catalog holds rows this app has
 * never seen. A kind with no special rendering still reads as itself. An
 * asset with no title falls back to its filename, in mono, because that is
 * what it is actually called, and to `Untitled <kind>` only when there is no
 * name at all. A preview that fails to load says so where the picture would
 * have been, and says why: the compact form of the shared Widget placeholder
 * failure, with the reason asked of `thumbnailStatusHref` after the image
 * fails. An asset linked to no concept shows its topic instead of a concept
 * chip, without a dot, since there is no mastery to colour.
 *
 * **The naming and sizing live in `./asset-meta`**, which is React-free and
 * carries no `"use client"`. They were in this file and had to move: a
 * `"use client"` module's exports are client references, functions included, so
 * a server component that imported `assetKindLabel` from here compiled, built
 * without a word and threw *Attempted to call assetKindLabel() from the server*
 * on the first request. The pure half belongs where both sides may call it.
 *
 * **The more button** (L5 of docs/proposals/library-by-type-and-day.md) sits
 * at the right of the title's row when the Library hands over `menu`, as
 * Manus's grid card has it, shown on the card's hover and focus (`RowMenu`).
 * A button cannot live inside a link, so a linked card is not one link: the
 * title is, and its `::after` is stretched over the whole card, so a press
 * anywhere on it still opens the asset and the focus ring still rings the
 * card; the menu sits above that layer.
 */

/** The concept a card names: the first one the asset explains, and how many more. */
export interface CardConcept {
  title: string;
  bucket: MasteryBucket;
  /** Further concepts the asset explains beyond this one. */
  more: number;
}

export function AssetCard({
  asset,
  concept,
  topic,
  thumbnailSrc,
  thumbnailStatusHref,
  href,
  menu,
}: {
  asset: AssetCardRef;
  /** The first concept this asset explains, resolved against the knowledge base. */
  concept?: CardConcept;
  /** The topic this asset is filed under, as a label. Shown when there is no concept. */
  topic?: string;
  /** A poster for a video, or the diagram itself. Already resolved. */
  thumbnailSrc?: string | null;
  /** Where to ask why the thumbnail failed. Without one the reason is unknown. */
  thumbnailStatusHref?: string;
  /** Where clicking goes. Without one the card is a description, not a link. */
  href?: string;
  /** The more menu's items (`rowMenuItems`); no button without them. */
  menu?: RowMenuSections;
}) {
  // The failure belongs to the thumbnail that failed, so a new one gets its own
  // attempt: a failed preview swaps the `<img>` out for the panel, so nothing
  // would be left to load the next file and the card would stay unavailable
  // for every asset it is later given. Every list in the app keys its cards by
  // asset id today, which is the kind of guarantee the next caller does not
  // inherit; `useAssetFailure` resets on a new `src` instead.
  const { failure, fail, observe } = useAssetFailure(thumbnailSrc, thumbnailStatusHref);
  const thumbFailed = failure !== null;
  // The picture fades in when it arrives; one ref callback for both hooks,
  // stable across renders, as `observe` needs.
  const reveal = useImageReveal(thumbnailSrc);
  const revealAttach = reveal.attach;
  const thumbRef = useCallback(
    (img: HTMLImageElement | null) => {
      observe(img);
      revealAttach(img);
    },
    [observe, revealAttach],
  );

  const family = familyOf(asset.kind);
  const label = assetKindLabel(asset.kind);
  const name = assetDisplayTitle(asset);
  const meta = assetMetaLine(asset);
  const previewable = family === "video" || family === "diagram";
  const showThumb = previewable && Boolean(thumbnailSrc) && !thumbFailed;
  // A note explains its own concept, so the concept line would repeat the
  // title word for word; the dot then carries the mastery on its own label.
  const conceptIsTitle =
    concept !== undefined && concept.title.trim().toLowerCase() === name.text.trim().toLowerCase();

  const nameClass =
    name.source === "title"
      ? "font-semibold text-text"
      : name.source === "none"
        ? "font-semibold text-text2"
        : "font-mono text-[13px] font-medium text-text2";

  const body = (
    <>
      <div
        className={cx(
          "flex h-[110px] shrink-0 items-center justify-center overflow-hidden rounded-xl",
          // The diagram's own ground, held constant in both themes; see
          // DiagramView for why an exported drawing is never recoloured.
          showThumb && family === "diagram" ? "bg-diagram-matte" : "bg-surface2",
        )}
      >
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- the poster and the diagram are files the app serves as-is, and a vector drawing must not be rasterised.
          <img
            ref={thumbRef}
            src={thumbnailSrc ?? undefined}
            alt=""
            loading="lazy"
            decoding="async"
            onError={fail}
            onLoad={reveal.onLoad}
            className={cx("h-full w-full", family === "diagram" ? "object-contain p-2" : "object-cover", reveal.className)}
          />
        ) : thumbFailed ? (
          <WidgetFailure
            compact
            headline="Preview unavailable"
            code={failure.code}
            sourceRepo={asset.sourceRepo}
            className="h-full w-full"
          />
        ) : (
          <span data-thumbnail="placeholder" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Chip size="sm">{label}</Chip>
        {meta && <span className="min-w-0 truncate text-[12px] text-text2">{meta}</span>}
      </div>
      <div className="flex min-w-0 items-start gap-1">
        <h3 className={cx("min-w-0 flex-1 line-clamp-2 break-words text-[14px] leading-snug", nameClass)}>
          {href ? (
            // `next/link`, so opening an asset is an in-app navigation: the
            // shell stays and the loading frame shows, where a plain anchor
            // reloaded the whole document and flashed white between pages.
            <Link
              href={href}
              className={cx(
                "outline-none after:absolute after:-inset-[2px] after:rounded-[20px] after:content-['']",
                "focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent",
              )}
            >
              {name.text}
            </Link>
          ) : (
            name.text
          )}
        </h3>
        {menu !== undefined && (
          <RowMenu assetId={asset.id} title={name.text} sections={menu} className="relative z-10 -mt-1.5 -mr-1.5" />
        )}
      </div>
      {concept !== undefined ? (
        <p className="flex min-w-0 items-center gap-2 text-[12px] text-text2">
          {conceptIsTitle ? (
            <MasteryDot bucket={concept.bucket} size={12} showLabel />
          ) : (
            <>
              <MasteryDot bucket={concept.bucket} size={12} />
              <span className="min-w-0 truncate">{concept.title}</span>
            </>
          )}
          {concept.more > 0 && <span className="shrink-0 text-text3">+{concept.more}</span>}
        </p>
      ) : topic !== undefined ? (
        <p className="min-w-0 truncate text-[12px] text-text2">{topic}</p>
      ) : null}
    </>
  );

  const shell = cardClasses({ tight: true, className: "h-full w-full gap-2" });

  if (!href) {
    return <article className={shell}>{body}</article>;
  }

  return (
    <article
      className={cx(
        shell,
        "group/asset relative transition-colors duration-100 hover:border-text3 has-[[aria-expanded=true]]:border-text3",
      )}
    >
      {body}
    </article>
  );
}
