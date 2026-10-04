import { cx } from "./classes";

/**
 * The loading block as classes: the `--surface2` fill at radius 6, pulsing
 * unless motion is reduced. For a block that has to be another element than
 * `Skeleton`'s `<div>` (a `<span>` inside a button, say).
 */
export const SKELETON = "rounded-md bg-surface2 animate-pulse motion-reduce:animate-none";

/** The same block with no radius, for one that fills a frame which clips it already. */
const SKELETON_FILL = "bg-surface2 animate-pulse motion-reduce:animate-none";

/**
 * Kit `Skeleton`: one grey block standing for something still being read, in
 * the shape and size the caller gives it (`className`: a height and a width).
 * Every loading frame draws its blocks with this one, so a skeleton is the
 * same colour, radius and pulse on every page, the studio's included.
 *
 * One radius, 6, whatever the block stands for: a skeleton says "something
 * goes here", not what. `fill` drops the radius for a block that fills a
 * framed area edge to edge (a tile's picture, the canvas), where the frame's
 * own corners clip it.
 *
 * It does not wait before it shows: the frame around it does (`PageLoading`),
 * so a quick read never flashes grey blocks.
 */
export function Skeleton({ className, fill = false }: { className?: string; fill?: boolean }) {
  return <div className={cx(fill ? SKELETON_FILL : SKELETON, className)} />;
}
