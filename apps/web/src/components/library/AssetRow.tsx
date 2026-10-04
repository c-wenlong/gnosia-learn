import Link from "next/link";

import { assetDisplayTitle, assetKindLabel, assetMetaLine, familyOf, type AssetCardRef } from "@/components/asset-meta";
import type { CardConcept } from "@/components/AssetCard";
import { Glyph } from "@/components/ui/Glyph";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { cx } from "@/components/ui/classes";

/**
 * One asset as a row of the library's list view: the same facts as
 * `AssetCard` (kind, meta line, title, the concept or topic) on one line, with
 * a glyph for the family where the card has its thumbnail, and the day the row
 * entered the catalog, which the card has no room for.
 *
 * No thumbnail on purpose: the list is for scanning many rows, and a poster
 * per row would load the same images the grid does at a size too small to
 * read. Without one there is no image to fail, so this needs none of the
 * card's client state and renders on the server.
 */
export function AssetRow({
  asset,
  concept,
  topic,
  added,
  href,
}: {
  asset: AssetCardRef;
  concept?: CardConcept;
  topic?: string;
  /** When the row entered the catalog, already formatted. */
  added?: string | null;
  href: string;
}) {
  const family = familyOf(asset.kind);
  const name = assetDisplayTitle(asset);
  const meta = assetMetaLine(asset);
  // A note explains its own concept, so naming it again would repeat the
  // title; the dot's label says the mastery instead, as on the card.
  const conceptIsTitle =
    concept !== undefined && concept.title.trim().toLowerCase() === name.text.trim().toLowerCase();

  const nameClass =
    name.source === "title"
      ? "font-semibold text-text"
      : name.source === "none"
        ? "font-semibold text-text2"
        : "font-mono text-[13px] font-medium text-text2";

  // `next/link`: an in-app navigation, not a reload of the whole document.
  return (
    <Link
      href={href}
      className={cx(
        "flex min-w-0 items-center gap-3 px-3.5 py-2.5 transition-colors duration-100 hover:bg-surface2",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface2 text-text2">
        <Glyph name={family} size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cx("truncate text-[14px] leading-snug", nameClass)}>{name.text}</span>
        <span className="truncate text-[12px] text-text2">
          {assetKindLabel(asset.kind)}
          {meta && ` · ${meta}`}
        </span>
      </span>
      {concept !== undefined ? (
        <span className="hidden w-[30%] min-w-0 shrink-0 items-center gap-2 text-[12px] text-text2 md:flex">
          {conceptIsTitle ? (
            <MasteryDot bucket={concept.bucket} size={12} showLabel />
          ) : (
            <>
              <MasteryDot bucket={concept.bucket} size={12} />
              <span className="min-w-0 truncate">{concept.title}</span>
            </>
          )}
          {concept.more > 0 && <span className="shrink-0 text-text3">+{concept.more}</span>}
        </span>
      ) : (
        <span className="hidden w-[30%] min-w-0 shrink-0 truncate text-[12px] text-text2 md:block">
          {topic ?? ""}
        </span>
      )}
      <span className="hidden w-[88px] shrink-0 text-right text-[12px] text-text3 tabular-nums sm:block">
        {added ?? ""}
      </span>
    </Link>
  );
}
