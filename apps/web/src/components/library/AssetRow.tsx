import Link from "next/link";
import type { ReactNode } from "react";

import { assetDisplayTitle, assetKindLabel, familyOf, type AssetRowRef } from "@/components/asset-meta";
import { RowMenu } from "@/components/library/RowMenu";
import { Glyph } from "@/components/ui/Glyph";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { cx } from "@/components/ui/classes";
import type { RowSource } from "@/lib/library-source";
import { masteryCaption } from "@/lib/mastery-bucket";
import type { RowMenuSections } from "@/lib/row-menu";

/**
 * One asset as a row of the Library's list view, under its day's heading
 * (L2 and L3 of docs/proposals/library-by-type-and-day.md, Manus's
 * `file-row`): the family's glyph, the title, and under it in grey where the
 * asset came from (`rowSource`: the course and module, the concept with its
 * mastery dot, the studio conversation, or the tutor session); at the right,
 * the time it was made and, when it changed more than a day later, the day
 * it was edited. The day itself is the heading above, so the row never
 * repeats it.
 *
 * Its corner and start padding are the shell's density tokens
 * (`--shell-row-radius`, `--shell-row-pad` in globals.css), and its height
 * is `--shell-row` plus the second line, so the Library and the sidebar keep
 * one rhythm. The hover fill is the whole row, rounded; the rule under it is
 * drawn inside the padding, as Manus draws it, and a group's last row has
 * none (its `<li>` is `group/item`).
 *
 * No thumbnail on purpose: the list is for scanning many rows, and a poster
 * per row would load the grid's images at a size too small to read. Without
 * one there is no image to fail, so this needs none of the card's client
 * state and renders on the server. On a phone the time column goes, as
 * Manus's does at 390.
 *
 * **The more button** (L5) sits at the right, after the time: 32px, shown on
 * the row's hover and while anything in it has focus, opening the row's
 * menu (`RowMenu`). A button cannot live inside a link, so the row is not one
 * link any more: the title is, and its `::after` is stretched over the whole
 * row (the row is `relative`), so a press anywhere on it still opens the
 * asset and the focus ring still rings the row; the menu sits above that
 * layer (`z-10`). The row is `group/asset`, which the button reads.
 */
export function AssetRow({
  asset,
  source,
  topic,
  time,
  edited,
  href,
  menu,
}: {
  asset: AssetRowRef;
  /** Where it came from; null names `topic` instead, or nothing. */
  source: RowSource | null;
  /** The topic it is filed under, as a label: the line for an asset with no parent. */
  topic?: string;
  /** "18:12", in the owner's zone. */
  time: string | null;
  /** "edited 2 Oct", or null. */
  edited: string | null;
  href: string;
  /** The more menu's items (`rowMenuItems`); no button without them. */
  menu?: RowMenuSections;
}) {
  const family = familyOf(asset.kind);
  const name = assetDisplayTitle(asset);

  const nameClass =
    name.source === "title"
      ? "font-medium text-text"
      : name.source === "none"
        ? "font-medium text-text2"
        : "font-mono text-[13px] font-medium text-text2";

  const line =
    sourceLine(source, name.text) ?? (topic === undefined ? null : <span className="min-w-0 truncate">{topic}</span>);
  // Both lines truncate, and the title's stretched link covers the row, so
  // the link's tooltip carries the whole of each.
  const tooltip = [name.text, sourceText(source, name.text) ?? topic].filter((t) => t !== undefined && t !== "").join("\n");

  return (
    <div
      className={cx(
        "group/asset relative rounded-[var(--shell-row-radius)] px-[var(--shell-row-pad)] transition-colors duration-100 hover:bg-surface2 motion-reduce:transition-none",
        // An open menu keeps its row lit, as Manus's does.
        "has-[[aria-expanded=true]]:bg-surface2",
      )}
    >
      <div
        className={cx(
          "flex min-h-[calc(var(--shell-row)+24px)] min-w-0 items-center gap-3 border-b border-hair py-2.5",
          "group-last/item:border-transparent",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface2 text-text2" aria-hidden>
          <Glyph name={family} size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* `next/link`: an in-app navigation, not a reload of the whole document. */}
          <Link
            href={href}
            title={tooltip}
            className={cx(
              "block truncate text-[14px] leading-5 outline-none",
              nameClass,
              "after:absolute after:inset-0 after:rounded-[var(--shell-row-radius)] after:content-['']",
              "focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent",
            )}
          >
            {/* The glyph is a family (a note and a session log share one), so the kind is said. */}
            <span className="sr-only">{assetKindLabel(asset.kind)}: </span>
            {name.text}
          </Link>
          {line !== null && (
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] text-text2">{line}</span>
          )}
        </span>
        {(time !== null || edited !== null) && (
          <span className="hidden shrink-0 flex-col items-end text-[12px] leading-4 text-text2 tabular-nums sm:flex">
            {time !== null && <time dateTime={asset.createdAt}>{time}</time>}
            {edited !== null && <time dateTime={asset.updatedAt}>{edited}</time>}
          </span>
        )}
        {menu !== undefined && <RowMenu assetId={asset.id} title={name.text} sections={menu} className="z-10" />}
      </div>
    </div>
  );
}

/**
 * The source line as plain text, for the row's tooltip; undefined when there
 * is none. A concept named as the row's title is its mastery, as the line
 * prints it, and the "+N" follows either way.
 */
export function sourceText(source: RowSource | null, title: string): string | undefined {
  if (source === null) return undefined;
  if (source.origin !== undefined) return source.origin.title;
  const concept = source.concept;
  let conceptText: string | undefined;
  if (concept !== undefined) {
    const isTitle = concept.title.trim().toLowerCase() === title.trim().toLowerCase();
    conceptText = isTitle ? masteryCaption(concept.bucket) : concept.title;
    if (concept.more > 0) conceptText += ` +${concept.more}`;
  }
  const parts = [source.place, conceptText].filter((t): t is string => t !== undefined);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

/**
 * The source line's content: "CS3230 · Week 3 · ● Master theorem", the
 * concept alone with its dot, or a conversation's or session's title. A note
 * explains its own concept, so a concept named exactly as the row's title is
 * not printed again; its dot carries the mastery on its own label, as the
 * card's does.
 */
function sourceLine(source: RowSource | null, title: string): ReactNode | null {
  if (source === null) return null;
  if (source.origin !== undefined) {
    return (
      <span className="min-w-0 truncate">
        <span className="sr-only">
          {source.origin.kind === "conversation" ? "From the studio conversation " : "From the tutor session "}
        </span>
        {source.origin.title}
      </span>
    );
  }
  const concept = source.concept;
  const conceptIsTitle =
    concept !== undefined && concept.title.trim().toLowerCase() === title.trim().toLowerCase();
  return (
    <>
      {/* The place keeps up to 60% of the line and the concept gives way first;
          past that the module title ends in an ellipsis, and the tooltip has it whole. */}
      {source.place !== undefined && <span className="max-w-[60%] shrink-0 truncate">{source.place}</span>}
      {source.place !== undefined && concept !== undefined && (
        <span aria-hidden className="shrink-0">
          ·
        </span>
      )}
      {concept !== undefined &&
        (conceptIsTitle ? (
          <MasteryDot bucket={concept.bucket} size={12} showLabel />
        ) : (
          <>
            <MasteryDot bucket={concept.bucket} size={12} />
            <span className="min-w-0 truncate">{concept.title}</span>
          </>
        ))}
      {concept !== undefined && concept.more > 0 && <span className="shrink-0 text-text3">+{concept.more}</span>}
    </>
  );
}
