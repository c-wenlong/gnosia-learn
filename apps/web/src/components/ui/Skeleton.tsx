import type { CSSProperties } from "react";

import { cardClasses, cx } from "./classes";

/**
 * The loading block as classes: the `--skeleton` fill at radius 6, with the
 * sheen (a lighter band crossing it left to right, then a rest) unless motion
 * is reduced, when it is a flat block. For a block that has to be another
 * element than `Skeleton`'s `<div>` (a `<span>` inside a button, say).
 */
export const SKELETON = "skeleton rounded-md animate-sheen motion-reduce:animate-none";

/** The same block with no radius, for one that fills a frame which clips it already. */
const SKELETON_FILL = "skeleton animate-sheen motion-reduce:animate-none";

/** How far apart neighbouring blocks' sweeps start, and after how many the stagger repeats. */
export const SHEEN_STAGGER_MS = 90;
const STAGGER_CYCLE = 8;

/**
 * The style that staggers a block's sheen by its place among its siblings,
 * so a column of placeholders does not pulse in lockstep.
 */
export function sheenDelay(index: number | undefined): CSSProperties | undefined {
  if (index === undefined) return undefined;
  const at = ((Math.trunc(index) % STAGGER_CYCLE) + STAGGER_CYCLE) % STAGGER_CYCLE;
  return { ["--skeleton-delay" as string]: `${at * SHEEN_STAGGER_MS}ms` } as CSSProperties;
}

/**
 * Kit `Skeleton`: one block standing for something still being read, in the
 * shape and size the caller gives it (`className`: a height and a width).
 * Every loading frame draws its blocks with this one, so a skeleton is the
 * same colour, radius and sheen on every page, the studio's included.
 *
 * One radius, 6, whatever the block stands for: a skeleton says "something
 * goes here", not what. `fill` drops the radius for a block that fills a
 * framed area edge to edge (a tile's picture, the canvas), where the frame's
 * own corners clip it. `index` is its place among its siblings, which
 * staggers its sheen (`sheenDelay`).
 *
 * It does not wait before it shows: the frame around it does (`PageLoading`),
 * so a quick read never flashes grey blocks.
 */
export function Skeleton({ className, fill = false, index }: { className?: string; fill?: boolean; index?: number }) {
  return <div className={cx(fill ? SKELETON_FILL : SKELETON, className)} style={sheenDelay(index)} />;
}

/**
 * A list row still loading, in the Library row's geometry (`AssetRow`): the
 * shell's row height plus its padding, the 32px glyph tile and two lines of
 * text (the name, then where it came from), with the time at the end from
 * `sm`. Every block shares the row's `index`, so one row sweeps together.
 */
export function SkeletonRow({ index }: { index?: number }) {
  const style = sheenDelay(index);
  return (
    <div aria-hidden data-skeleton="row" className="px-[var(--shell-row-pad)]">
      <div className="flex min-h-[calc(var(--shell-row)+24px)] items-center gap-3 border-b border-hair py-2.5">
        <div className={cx(SKELETON, "size-8 shrink-0 rounded-lg")} style={style} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className={cx(SKELETON, "h-3.5 w-3/5 max-w-[420px]")} style={style} />
          <div className={cx(SKELETON, "h-3 w-2/5 max-w-[280px]")} style={style} />
        </div>
        <div className={cx(SKELETON, "hidden h-3 w-10 shrink-0 sm:block")} style={style} />
      </div>
    </div>
  );
}

/**
 * A card still loading, in the Library card's geometry (`AssetCard`): the
 * kit card at its tight padding, the 110px picture, then three bars (the
 * kind chip, the name, the concept).
 */
export function SkeletonCard({ index }: { index?: number }) {
  const style = sheenDelay(index);
  return (
    <div aria-hidden data-skeleton="card" className={cardClasses({ tight: true, className: "h-full w-full" })}>
      <div className={cx(SKELETON, "h-[110px] w-full rounded-xl")} style={style} />
      <div className={cx(SKELETON, "h-5 w-24")} style={style} />
      <div className={cx(SKELETON, "h-4 w-4/5")} style={style} />
      <div className={cx(SKELETON, "h-3 w-1/2")} style={style} />
    </div>
  );
}
