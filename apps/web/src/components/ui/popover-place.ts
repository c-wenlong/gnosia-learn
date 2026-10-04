/**
 * Where a kit `Popover` goes, in viewport px. React-free, so a test can call
 * it without a browser.
 *
 * A popover sits in the top layer at fixed coordinates, so no card, fold,
 * dialog or scrolling thread that clips its overflow can cut it off. It opens
 * on the side its `placement` names, or on the opposite side when it would
 * not fit there and the opposite has more room, and shifts along the other
 * axis just enough to stay inside the screen's gutter. `maxHeight` is the
 * room it has, so a long one scrolls rather than leaving the screen.
 */

/**
 * Which side of the anchor, and which of its edges the popover lines up with.
 * `bottom-start` is under it, left edges flush (a filter, a field);
 * `bottom-end` under it, right edges flush (a menu at a strip's end);
 * `top-start` over it (the account row at the sidebar's foot); `right-end`
 * beside it, bottom edges flush (the account avatar on the folded rail).
 */
export type PopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "right-end";

export type PopoverSide = "top" | "bottom" | "left" | "right";

export interface PopoverPlace {
  top: number;
  left: number;
  /** The side it opened on: the one asked for, or its opposite after a flip. */
  side: PopoverSide;
  align: "start" | "end";
  /** The room on that side, which the popover's height must not pass. */
  maxHeight: number;
}

/**
 * How far to shift a popover left, in px, so it stays inside the viewport.
 *
 * It opens left-aligned with its trigger; when that would run past the right
 * edge it moves left just enough, and never so far that its left edge passes
 * the gutter. The result is zero or negative.
 */
export function popoverShift({
  triggerLeft,
  width,
  viewport,
  gutter = 16,
}: {
  triggerLeft: number;
  width: number;
  viewport: number;
  gutter?: number;
}): number {
  const overflow = triggerLeft + width - (viewport - gutter);
  if (overflow <= 0) return 0;
  return -Math.min(overflow, Math.max(triggerLeft - gutter, 0));
}

/**
 * Where a box `size` long goes on one axis when it lines up with the far edge
 * of a span ending at `end` (the right edge, or the bottom): `end - size`,
 * moved towards the far side just enough to clear the near gutter, and never
 * so far that its far edge passes the far gutter. `popoverShift` mirrored.
 */
function endAligned(end: number, size: number, extent: number, gutter: number): number {
  const start = end - size;
  const under = gutter - start;
  if (under <= 0) return start;
  return start + Math.min(under, Math.max(extent - gutter - end, 0));
}

export function popoverPlacement({
  anchor,
  placement,
  width,
  height,
  cap = Infinity,
  viewport,
  gap = 8,
  gutter = 16,
}: {
  anchor: { top: number; bottom: number; left: number; right: number };
  placement: PopoverPlacement;
  /** The popover's width as laid out. */
  width: number;
  /** Its full content height, before any cap. */
  height: number;
  /** The tallest its own CSS lets it be, so one opening above sits flush on the anchor. */
  cap?: number;
  viewport: { width: number; height: number };
  /** Between the anchor and the popover. */
  gap?: number;
  /** Kept clear at every screen edge. */
  gutter?: number;
}): PopoverPlace {
  const tall = Math.min(height, cap);

  if (placement === "right-end") {
    const roomRight = viewport.width - gutter - (anchor.right + gap);
    const roomLeft = anchor.left - gap - gutter;
    const side: PopoverSide = width > roomRight && roomLeft > roomRight ? "left" : "right";
    const room = Math.max(viewport.height - 2 * gutter, 0);
    const shown = Math.min(tall, room);
    return {
      top: endAligned(anchor.bottom, shown, viewport.height, gutter),
      left: side === "right" ? anchor.right + gap : anchor.left - gap - width,
      side,
      align: "end",
      maxHeight: room,
    };
  }

  const roomBelow = viewport.height - gutter - (anchor.bottom + gap);
  const roomAbove = anchor.top - gap - gutter;
  const wanted: PopoverSide = placement === "top-start" ? "top" : "bottom";
  const [here, there] = wanted === "bottom" ? [roomBelow, roomAbove] : [roomAbove, roomBelow];
  const side: PopoverSide = tall > here && there > here ? (wanted === "bottom" ? "top" : "bottom") : wanted;
  const room = Math.max(side === "bottom" ? roomBelow : roomAbove, 0);
  const shown = Math.min(tall, room);
  const align = placement === "bottom-end" ? "end" : "start";
  return {
    top: side === "top" ? anchor.top - gap - shown : anchor.bottom + gap,
    left:
      align === "start"
        ? anchor.left + popoverShift({ triggerLeft: anchor.left, width, viewport: viewport.width, gutter })
        : endAligned(anchor.right, width, viewport.width, gutter),
    side,
    align,
    maxHeight: room,
  };
}

/**
 * The corner a popover grows from as it pops in: the one touching its
 * anchor, so it reads as coming out of what opened it.
 */
export function popoverOrigin(side: PopoverSide, align: "start" | "end"): string {
  switch (side) {
    case "bottom":
      return align === "start" ? "origin-top-left" : "origin-top-right";
    case "top":
      return align === "start" ? "origin-bottom-left" : "origin-bottom-right";
    case "right":
      return align === "start" ? "origin-top-left" : "origin-bottom-left";
    case "left":
      return align === "start" ? "origin-top-right" : "origin-bottom-right";
  }
}

/** The side and edge a placement asks for, before anything is measured. */
export function placementParts(placement: PopoverPlacement): { side: PopoverSide; align: "start" | "end" } {
  const [side, align] = placement.split("-") as [PopoverSide, "start" | "end"];
  return { side, align };
}
