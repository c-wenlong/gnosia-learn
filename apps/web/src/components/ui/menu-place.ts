/**
 * The React-free half of the kit `Menu`: where its list goes. Kept apart, as
 * `filter-menu.ts` is from `FilterMenu`, so the rule has a test of its own
 * and a server module may import it.
 */

export interface MenuPlace {
  top: number;
  left: number;
  /** Opened above the trigger, for want of room under it. */
  above: boolean;
  /** The most the list may be tall where it opened, so a long one scrolls inside the screen. */
  maxHeight: number;
}

/**
 * The list's corner, in viewport px, for a menu opened from `trigger`.
 *
 * Under the trigger, `gap` px down, unless it does not fit there and there is
 * more room above. Its edge lines up with the trigger's on the `align` side:
 * `end` for a more button at the right of a row, whose list then grows
 * leftwards over the row as Manus's does, `start` for a button at the left.
 * It is then moved, never past the `gutter`, to stay inside the screen.
 */
export function menuPlacement({
  trigger,
  width,
  height,
  viewport,
  align = "end",
  gap = 6,
  gutter = 8,
}: {
  trigger: { top: number; bottom: number; left: number; right: number };
  width: number;
  height: number;
  viewport: { width: number; height: number };
  align?: "start" | "end";
  gap?: number;
  gutter?: number;
}): MenuPlace {
  const roomBelow = viewport.height - gutter - (trigger.bottom + gap);
  const roomAbove = trigger.top - gap - gutter;
  const above = height > roomBelow && roomAbove > roomBelow;
  const room = Math.max(above ? roomAbove : roomBelow, 0);
  const shown = Math.min(height, room);
  const wanted = align === "end" ? trigger.right - width : trigger.left;
  const left = Math.max(gutter, Math.min(wanted, viewport.width - gutter - width));
  return { top: above ? trigger.top - gap - shown : trigger.bottom + gap, left, above, maxHeight: room };
}
