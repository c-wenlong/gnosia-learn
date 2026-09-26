"use client";

import {
  assetDisplayTitle,
  assetKindLabel,
  assetMetaLine,
  familyOf,
  type AssetCardRef,
} from "@/components/asset-meta";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { Chip } from "@/components/ui/Chip";
import { cardClasses, cx } from "@/components/ui/classes";
import { useAssetFailure } from "@/components/use-asset-failure";
import { WidgetFailure } from "@/components/WidgetFailure";
import type { MasteryBucket } from "@/lib/mastery-bucket";

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
 * gets the labelled `Placeholder` box the hi-fi draws, so the grid lines up
 * whatever it holds.
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
}) {
  // The failure belongs to the thumbnail that failed, so a new one gets its own
  // attempt: a failed preview swaps the `<img>` out for the panel, so nothing
  // would be left to load the next file and the card would stay unavailable
  // for every asset it is later given. Every list in the app keys its cards by
  // asset id today, which is the kind of guarantee the next caller does not
  // inherit; `useAssetFailure` resets on a new `src` instead.
  const { failure, fail, observe } = useAssetFailure(thumbnailSrc, thumbnailStatusHref);
  const thumbFailed = failure !== null;

  const family = familyOf(asset.kind);
  const label = assetKindLabel(asset.kind);
  const name = assetDisplayTitle(asset);
  const meta = assetMetaLine(asset);
  const previewable = family === "video" || family === "diagram";
  const showThumb = previewable && Boolean(thumbnailSrc) && !thumbFailed;

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
          showThumb && family === "diagram" ? "bg-[#f7f6f3]" : "bg-surface2",
        )}
      >
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- the poster and the diagram are files the app serves as-is, and a vector drawing must not be rasterised.
          <img
            ref={observe}
            src={thumbnailSrc ?? undefined}
            alt=""
            loading="lazy"
            decoding="async"
            onError={fail}
            className={cx("h-full w-full", family === "diagram" ? "object-contain p-2" : "object-cover")}
          />
        ) : thumbFailed ? (
          <WidgetFailure
            compact
            headline="Preview unavailable"
            code={failure.code}
            className="h-full w-full"
          />
        ) : (
          <span data-thumbnail="placeholder" className="text-[12px] text-text3">
            {label.toLowerCase()}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {/* Lowercase by style only, so the chip reads "video" as the hi-fi
            draws it while its text stays the kind's name. */}
        <Chip size="sm" className="lowercase">
          {label}
        </Chip>
        {meta && <span className="min-w-0 truncate text-[12px] text-text2">{meta}</span>}
      </div>
      <h3 className={cx("line-clamp-2 break-words text-[14px] leading-snug", nameClass)}>{name.text}</h3>
      {concept !== undefined ? (
        <p className="flex min-w-0 items-center gap-2 text-[12px] text-text2">
          <MasteryDot bucket={concept.bucket} size={12} />
          <span className="min-w-0 truncate">{concept.title}</span>
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
    <a
      href={href}
      className={cx(
        shell,
        "transition-colors duration-100 hover:border-text3",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      {body}
    </a>
  );
}
