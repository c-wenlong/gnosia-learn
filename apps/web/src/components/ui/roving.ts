/**
 * Arrow-key movement through a row of options where one is in the tab order
 * and the arrows move it (WAI-ARIA's roving tabindex): the kit's `Tabs`,
 * Settings' tabs and the theme switch's radio group.
 *
 * React-free, as `composer-keys.ts` is, so the rule is testable on its own.
 */

/**
 * Which arrows move: `horizontal` takes Left and Right, `vertical` Up and
 * Down, and `both` either pair, for a row that becomes a column at some width
 * or a radio group (where every arrow moves).
 */
export type RovingOrientation = "horizontal" | "vertical" | "both";

/**
 * The index a key moves to from `index` among `count` options, or -1 when the
 * key does not move (a caller then leaves the event alone). The arrows step
 * and wrap at either end. With `homeEnd`, Home and End go to the first and the
 * last, as the tabs pattern asks; a radio group has no Home or End.
 */
export function tabKeyIndex(
  key: string,
  index: number,
  count: number,
  orientation: RovingOrientation,
  homeEnd: boolean,
): number {
  if (count <= 0) return -1;
  const across = orientation !== "vertical";
  const down = orientation !== "horizontal";
  if ((across && key === "ArrowRight") || (down && key === "ArrowDown")) return (index + 1) % count;
  if ((across && key === "ArrowLeft") || (down && key === "ArrowUp")) return (index - 1 + count) % count;
  if (homeEnd && key === "Home") return 0;
  if (homeEnd && key === "End") return count - 1;
  return -1;
}
