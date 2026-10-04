"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
  type RefObject,
} from "react";

import { cx } from "./classes";
import { placementParts, popoverOrigin, popoverPlacement, type PopoverPlace, type PopoverPlacement } from "./popover-place";
import { isImeKey } from "./composer-keys";
import { usePresence } from "./use-presence";

/** Why a popover asked to close: Escape, a press outside it, or the focus leaving it. */
export type PopoverCloseReason = "escape" | "outside" | "blur";

/** How long a closing popover stays, inert, for its way out. */
const EXIT_MS = 120;

/* -------------------------------------------------------------------------- */
/* Escape, one layer at a time                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The open popovers, the last opened last. Escape closes the last one only:
 * a list opened inside a menu closes and leaves the menu open, and neither a
 * `<dialog>` nor the phone drawer around them hears that press.
 *
 * One listener for all of them, in the capture phase on the window, which is
 * the first thing a key press reaches: it cancels the press (an Escape nobody
 * cancels is a modal `<dialog>`'s close request) and stops it there, so the
 * drawer's window listener, a card's own handler and React's handlers never
 * see it. A press an input method is composing with is its own.
 */
const layers: Array<{ escape: () => void }> = [];

function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || isImeKey(event)) return;
  const top = layers.at(-1);
  if (top === undefined) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  top.escape();
}

function pushLayer(layer: { escape: () => void }): () => void {
  if (layers.length === 0) window.addEventListener("keydown", onEscape, true);
  layers.push(layer);
  return () => {
    const at = layers.indexOf(layer);
    if (at >= 0) layers.splice(at, 1);
    if (layers.length === 0) window.removeEventListener("keydown", onEscape, true);
  };
}

/* -------------------------------------------------------------------------- */
/* Placement                                                                   */
/* -------------------------------------------------------------------------- */

interface Placed extends PopoverPlace {
  minWidth: number | undefined;
}

/**
 * Shows the popover and places it while `open`. A layout effect, so it never
 * paints at the corner before it moves; it shows the popover first, since a
 * popover that is not showing has no size. It measures again on a resize, on
 * a scroll of anything around the anchor (a fixed popover does not move with
 * it), and whenever the popover's or the anchor's size changes: a combobox
 * filtering changes its rows, a popover opened above its anchor has to stay
 * flush on it, and the sidebar's account row widens as the rail unfolds.
 */
function usePlace(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  placement: PopoverPlacement,
  minWidthFromAnchor: boolean,
): Placed | null {
  const [place, setPlace] = useState<Placed | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const box = panel.current;
    // jsdom has no popovers, and showing one that is still on its way out
    // (opened again mid-exit) throws, harmlessly.
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
      const minWidth = minWidthFromAnchor ? at.width : undefined;
      // The panel's own cap, min(30rem, 70vh), as MENU_PANEL's max-h has it.
      const cap = Math.min(30 * parseFloat(getComputedStyle(root).fontSize), 0.7 * window.innerHeight);
      // The whole box: `scrollHeight` leaves out the 2px borders, which put a
      // popover opened above its anchor 4px into the gap under it.
      const height = box.scrollHeight + box.offsetHeight - box.clientHeight;
      const next: Placed = {
        ...popoverPlacement({
          anchor: at,
          placement,
          width: Math.max(box.offsetWidth, minWidth ?? 0),
          height,
          cap,
          viewport: { width: root.clientWidth, height: root.clientHeight },
        }),
        minWidth,
      };
      // The same place again is no change: the observer below sees the box
      // settle after each placement, and must not render it for nothing.
      setPlace((held) =>
        held !== null && (Object.keys(next) as (keyof Placed)[]).every((key) => held[key] === next[key]) ? held : next,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    // Capture: any scroller, not only the page.
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    // jsdom has no ResizeObserver; a browser always does.
    const sized = typeof ResizeObserver === "function" && box !== null ? new ResizeObserver(measure) : null;
    if (box !== null) sized?.observe(box);
    if (anchor.current !== null) sized?.observe(anchor.current);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
      sized?.disconnect();
    };
  }, [open, anchor, panel, placement, minWidthFromAnchor]);

  return place;
}

/* -------------------------------------------------------------------------- */
/* Popover                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Kit `Popover`: the box every menu opens in. `FilterMenu`'s list (chip and
 * field faces, so `Select` too), `Combobox`'s suggestions, the account menu
 * and the studio's Sort, Display and topic menus.
 *
 * It owns where the box is and when it goes, and nothing about what is in
 * it: the caller renders the trigger, the rows and their keyboard, and holds
 * `open`. The box is a sibling of whatever the caller puts it beside, so a
 * test, a card's key handler or a `closest()` still finds it inside the
 * component, but it is shown in the top layer (a manual popover at fixed
 * coordinates, `popoverPlacement`), so no card, fold, dialog or scrolling
 * thread around it clips it. It opens on `placement`'s side, flips when there
 * is no room there and more on the other, and with `minWidthFromAnchor` is at
 * least as wide as its anchor.
 *
 * It asks to close (`onOpenChange(false, reason)`) on:
 * - Escape: the innermost open popover only, the press cancelled and stopped
 *   so a surrounding `<dialog>` or the phone drawer does not close too. The
 *   focus goes back to `returnFocusRef` (the anchor by default) when it was
 *   inside the box or nowhere; a field that kept the focus keeps it.
 * - a press outside both the anchor and the box;
 * - the focus moving out of both (Tab past the last row, Shift+Tab before
 *   the trigger, the window losing focus). The box takes `tabIndex={-1}`
 *   unless told otherwise, so a click on its padding or a heading lands the
 *   focus inside rather than on the page.
 *
 * It pops in from the corner touching the anchor and, closed, stays 120ms
 * inert on its way out (`usePresence`), unless motion is reduced. While it
 * leaves it drops its `id` and `aria-activedescendant`, so nothing points at
 * a box that is going; a trigger's `aria-controls` should be set only while
 * `open`, for the same reason.
 *
 * Focus on opening is the caller's: a listbox takes it (`FilterMenu`, in a
 * layout effect, which runs after this one has shown and placed the box), a
 * disclosure of links leaves it on its trigger, a combobox keeps it in its
 * field.
 */
export function Popover({
  anchorRef,
  open,
  onOpenChange,
  placement = "bottom-start",
  minWidthFromAnchor = false,
  returnFocusRef,
  ref,
  id,
  className,
  tabIndex = -1,
  "aria-activedescendant": activeDescendant,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "popover" | "style"> & {
  /** What it opens from: placed against, and not "outside" for a press or the focus. */
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  /** Called with `false` and the reason when it should close; the caller sets `open`. */
  onOpenChange: (open: boolean, reason: PopoverCloseReason) => void;
  placement?: PopoverPlacement;
  /** At least as wide as the anchor: a field's list. */
  minWidthFromAnchor?: boolean;
  /** Where Escape sends the focus back to, when the anchor is not focusable itself (a field's wrapper). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  ref?: Ref<HTMLDivElement>;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const setPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panel.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref !== null && ref !== undefined) ref.current = node;
    },
    [ref],
  );
  const presence = usePresence(open, EXIT_MS);
  const place = usePlace(open, anchorRef, panel, placement, minWidthFromAnchor);

  const close = useEffectEvent((reason: PopoverCloseReason) => onOpenChange(false, reason));
  const escape = useEffectEvent(() => {
    const focused = document.activeElement;
    const lost = focused === null || focused === document.body || panel.current?.contains(focused) === true;
    onOpenChange(false, "escape");
    if (lost) (returnFocusRef ?? anchorRef).current?.focus();
  });

  useEffect(() => {
    if (!open) return;
    const inside = (node: EventTarget | null) =>
      node instanceof Node && (anchorRef.current?.contains(node) === true || panel.current?.contains(node) === true);
    const onPointer = (event: PointerEvent) => {
      if (!inside(event.target)) close("outside");
    };
    const onFocusOut = (event: FocusEvent) => {
      if (inside(event.target) && !inside(event.relatedTarget)) close("blur");
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusout", onFocusOut);
    const pop = pushLayer({ escape: () => escape() });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusout", onFocusOut);
      pop();
    };
  }, [open, anchorRef]);

  if (!presence.mounted) return null;
  const asked = placementParts(placement);
  const style: CSSProperties =
    place === null
      ? { top: 0, left: 0 }
      : {
          top: place.top,
          left: place.left,
          minWidth: place.minWidth,
          maxHeight: `min(30rem, 70vh, ${place.maxHeight}px)`,
        };
  return (
    <div
      {...rest}
      ref={setPanel}
      id={presence.leaving ? undefined : id}
      aria-activedescendant={presence.leaving ? undefined : activeDescendant}
      tabIndex={tabIndex}
      popover="manual"
      inert={presence.leaving}
      data-side={place?.side ?? asked.side}
      // Never `visibility: hidden` before the first measure: a caller may
      // focus the box in that same pass, and a hidden element refuses focus.
      style={style}
      className={cx(
        // z-50 for a browser with no popovers, where it is only fixed.
        "fixed inset-auto z-50 m-0",
        popoverOrigin(place?.side ?? asked.side, place?.align ?? asked.align),
        className,
        presence.leaving ? "pointer-events-none animate-pop-out" : "animate-pop-in",
        "motion-reduce:animate-none",
      )}
    >
      {children}
    </div>
  );
}
