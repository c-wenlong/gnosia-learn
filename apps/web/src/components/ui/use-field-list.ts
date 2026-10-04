"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

import { cx } from "./classes";
import { fieldPlacement } from "./filter-menu";

/** Where a field's list sits, in viewport px, and whether it opened above the field. */
export interface FieldListPlace {
  top: number;
  left: number;
  above: boolean;
  maxHeight: number;
  minWidth: number;
}

/**
 * A form field's list in the top layer: `Select`'s and `Combobox`'s. A field
 * sits in cards, folds and dialogs that clip their overflow, so the list is a
 * manual popover at fixed coordinates (`fieldPlacement`), at least as wide as
 * the field, under it or over it when there is more room above.
 *
 * While `open`, a layout effect shows the popover (a popover that is not
 * showing has no size), measures, and measures again on a resize and on a
 * scroll of anything around the field, since a fixed list does not move with
 * it, and whenever the list's own size changes: a combobox filtering changes
 * its rows, and a list opened above the field has to stay flush on it. A
 * layout effect, so the list never paints at the corner before it moves; a
 * caller that focuses the list does it in a layout effect declared after this
 * hook, which runs after it.
 */
export function useFieldList(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  list: RefObject<HTMLElement | null>,
): FieldListPlace | null {
  const [place, setPlace] = useState<FieldListPlace | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const box = list.current;
    // jsdom has no popovers, and showing one that is still on its way out
    // (open again mid-exit) throws, harmlessly.
    if (box !== null && typeof box.showPopover === "function") {
      try {
        box.showPopover();
      } catch {
        // Already showing.
      }
    }
    const measure = () => {
      const at = anchor.current?.getBoundingClientRect();
      if (at === undefined || box === null) return;
      const root = document.documentElement;
      const width = Math.max(box.offsetWidth, at.width);
      // The list's own cap, min(30rem, 70vh), as FIELD_LIST's max-h has it.
      const cap = Math.min(30 * parseFloat(getComputedStyle(root).fontSize), 0.7 * window.innerHeight);
      // The whole box: `scrollHeight` leaves out the 2px borders, which put a
      // list opened above the field 4px into the gap under it.
      const height = box.scrollHeight + box.offsetHeight - box.clientHeight;
      const next = {
        ...fieldPlacement({ trigger: at, width, height, cap, viewport: { width: root.clientWidth, height: root.clientHeight } }),
        minWidth: at.width,
      };
      // The same place again is no change: the observer below sees the list
      // settle after each placement, and must not render it for nothing.
      setPlace((held) =>
        held !== null && (Object.keys(next) as (keyof FieldListPlace)[]).every((key) => held[key] === next[key]) ? held : next,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    // Capture: any scroller, not only the page.
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    // jsdom has no ResizeObserver; a browser always does.
    const sized = typeof ResizeObserver === "function" && box !== null ? new ResizeObserver(measure) : null;
    if (box !== null) sized?.observe(box);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
      sized?.disconnect();
    };
  }, [open, anchor, list]);

  return place;
}

/**
 * The list's coordinates. Never `visibility: hidden` before the first
 * measure: a caller may focus the list in that same pass, and a hidden
 * element refuses focus.
 */
export function fieldListStyle(place: FieldListPlace | null): CSSProperties {
  return place === null
    ? { top: 0, left: 0 }
    : { top: place.top, left: place.left, minWidth: place.minWidth, maxHeight: `min(30rem, 70vh, ${place.maxHeight}px)` };
}

/** Fixed in the top layer, growing from the field's corner it opened at. */
export function fieldListClasses(place: FieldListPlace | null): string {
  return cx("fixed inset-auto m-0 text-text", place?.above ? "origin-bottom-left" : "origin-top-left");
}
