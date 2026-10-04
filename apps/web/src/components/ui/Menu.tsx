"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cx } from "./classes";
import { typeaheadIndex } from "./filter-menu";
import { Glyph, type GlyphName } from "./Glyph";
import { menuPlacement, type MenuPlace } from "./menu-place";
import { tabKeyIndex } from "./roving";
import { usePresence } from "./use-presence";

/** A pause this long between keys starts a new typeahead prefix. */
const TYPEAHEAD_RESET_MS = 700;

/** The leave animation's length (`animate-pop-out`). */
const EXIT_MS = 120;

interface MenuControls {
  /** Close the menu; `refocus` puts focus back on its button. */
  close: (refocus?: boolean) => void;
}

const MenuContext = createContext<MenuControls | null>(null);

function useMenu(): MenuControls {
  const controls = useContext(MenuContext);
  if (controls === null) throw new Error("MenuItem is only usable inside Menu");
  return controls;
}

/**
 * Kit `Menu`: a button that opens a short list of actions, WAI-ARIA's menu
 * button. The Library's view options and its row and card menus are built on
 * it (L4 and L5 of docs/proposals/library-by-type-and-day.md); `FilterMenu`
 * is the other popup in the kit, a listbox for picking one value, and
 * `AccountMenu` a disclosure of three links.
 *
 * **Keys.** Enter, Space or Down on the button open it on the first item
 * (the checked one in a list of choices), Up on the last. In the list, Up and
 * Down move and wrap, Home and End jump, a letter goes to the next item
 * starting with it, Enter and Space choose. Escape closes with focus back on
 * the button, and so does a choice; Tab closes and lets focus move on; a
 * press outside closes. Every item is `tabIndex={-1}`, so the list is one
 * stop for Tab, as the pattern asks.
 *
 * **Where it opens.** In the top layer, as a manual popover at fixed
 * coordinates (`menuPlacement`): a card or a list row clips what overflows
 * it, and a menu must not be cut by the card it belongs to. Under the button,
 * its edge on the button's (`align`, the end by default, for a more button at
 * a row's right), above when there is more room there, kept inside the
 * screen, and placed again on a scroll or a resize, since a fixed list does
 * not move with the page.
 *
 * **Motion.** It pops in from the corner it opened at (`animate-pop-in`) and
 * pops out (`usePresence`: kept 120ms, inert), and goes at once under reduced
 * motion.
 *
 * **It keeps its events.** A click or a key inside the button or the list
 * does not reach the elements around it (`stopPropagation`), so a menu on a
 * row that opens something on a press (the Library's previewer) is not also
 * a press on the row.
 */
export function Menu({
  label,
  menuLabel,
  trigger,
  triggerClassName,
  align = "end",
  minWidth = 192,
  onOpenChange,
  children,
}: {
  /** The button's accessible name and tooltip: "View options", "More actions for Master theorem". */
  label: string;
  /** The list's name, when it should differ from the button's. */
  menuLabel?: string;
  /** What the button shows: a glyph, usually. */
  trigger: ReactNode;
  triggerClassName: string;
  align?: "start" | "end";
  /** The list's least width in px: 192 for a short menu, 240 for a row's. */
  minWidth?: number;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [open, setOpenState] = useState(false);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Which item opening focuses: the first, the last (Up on the button), or the checked one.
  const opening = useRef<"first" | "last">("first");
  const typed = useRef({ buffer: "", at: 0 });
  const id = useId();
  const presence = usePresence(open, EXIT_MS);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const close = useCallback(
    (refocus = true) => {
      setOpen(false);
      if (refocus) button.current?.focus();
    },
    [setOpen],
  );

  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  // Escape and a press outside, as FilterMenu and AccountMenu listen for them.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, close]);

  // Opening: show the popover, place it, then focus an item. A layout effect,
  // so the list never paints at the corner of the screen before it moves.
  useLayoutEffect(() => {
    if (!open) return;
    const box = list.current;
    if (box !== null && typeof box.showPopover === "function") {
      try {
        box.showPopover();
      } catch {
        // Already showing: opened again on its way out.
      }
    }
    const measure = () => {
      const at = button.current?.getBoundingClientRect();
      if (at === undefined || box === null) return;
      const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
      const height = box.scrollHeight + box.offsetHeight - box.clientHeight;
      const next = menuPlacement({ trigger: at, width: box.offsetWidth, height, viewport, align });
      setPlace((held) =>
        held !== null && held.top === next.top && held.left === next.left && held.above === next.above && held.maxHeight === next.maxHeight
          ? held
          : next,
      );
    };
    measure();
    const all = items();
    const checked = all.find((item) => item.getAttribute("aria-checked") === "true");
    const first = opening.current === "last" ? all[all.length - 1] : (checked ?? all[0]);
    first?.focus({ preventScroll: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
    };
  }, [open, align]);

  const show = (from: "first" | "last") => {
    opening.current = from;
    typed.current = { buffer: "", at: 0 };
    setOpen(true);
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowUp" ? "last" : "first");
    }
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      // The menu's Escape only: inside a modal dialog an Escape nobody
      // cancels would close the dialog too.
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const next = tabKeyIndex(event.key, at < 0 ? (event.key === "ArrowUp" ? 0 : -1) : at, all.length, "vertical", true);
    if (next !== -1) {
      event.preventDefault();
      all[next]?.focus();
      return;
    }
    if (event.key === " " && at >= 0 && all[at]?.tagName === "A") {
      // A link takes Enter on its own; Space is the menu pattern's too.
      event.preventDefault();
      all[at]?.click();
      return;
    }
    if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const t = typed.current;
      t.buffer = event.timeStamp - t.at > TYPEAHEAD_RESET_MS ? event.key : t.buffer + event.key;
      t.at = event.timeStamp;
      const hit = typeaheadIndex(
        all.map((item) => item.textContent?.trim() ?? ""),
        at,
        t.buffer,
      );
      if (hit !== null) all[hit]?.focus();
    }
  };

  const listId = `${id}-menu`;
  return (
    <MenuContext.Provider value={{ close }}>
      <div
        ref={root}
        className="relative inline-flex"
        // The menu's events are its own: a row around it that opens on a press must not hear them.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          ref={button}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={label}
          title={label}
          onClick={() => (open ? close(false) : show("first"))}
          onKeyDown={onButtonKey}
          className={triggerClassName}
        >
          {trigger}
        </button>
        {presence.mounted && (
          <div
            ref={list}
            id={presence.leaving ? undefined : listId}
            role="menu"
            aria-label={menuLabel ?? label}
            aria-orientation="vertical"
            popover="manual"
            inert={presence.leaving}
            onKeyDown={onListKey}
            onBlur={(event) => {
              if (!root.current?.contains(event.relatedTarget as Node | null) && event.relatedTarget !== null) close(false);
            }}
            style={
              place === null
                ? { top: 0, left: 0, minWidth }
                : { top: place.top, left: place.left, minWidth, maxHeight: `min(30rem, ${place.maxHeight}px)` }
            }
            className={cx(
              "fixed inset-auto m-0 flex flex-col gap-0.5 overflow-y-auto overscroll-contain text-text",
              "max-w-[calc(100vw-1rem)] rounded-2xl border-2 border-border bg-surface p-1.5 shadow-lg outline-none",
              place?.above
                ? align === "end"
                  ? "origin-bottom-right"
                  : "origin-bottom-left"
                : align === "end"
                  ? "origin-top-right"
                  : "origin-top-left",
              presence.leaving ? "pointer-events-none animate-pop-out" : "animate-pop-in",
              "motion-reduce:animate-none",
            )}
          >
            {children}
          </div>
        )}
      </div>
    </MenuContext.Provider>
  );
}

/** A menu row's face: Manus's `menu-item`, 36px (`--shell-row`), the glyph then the words. */
const ITEM = cx(
  "flex min-h-[var(--shell-row)] w-full shrink-0 items-center gap-2.5 rounded-[var(--shell-row-radius)] px-[var(--shell-row-pad)]",
  "text-left text-[14px] leading-5 whitespace-nowrap text-text transition-colors duration-100 motion-reduce:transition-none",
  "outline-none hover:bg-surface2 focus-visible:bg-surface2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
);

/**
 * One action. A `href` makes it a link (`next/link`, or a plain anchor with
 * `download` for a file to save); otherwise a button calling `onSelect`.
 * Choosing it closes the menu, focus back on the button, unless `onSelect`
 * returns `"keep"`, for an item that says something in place first
 * ("Copied") and closes itself after.
 *
 * `checked` makes it one of a set of choices (`menuitemradio`): a tick at the
 * right of the chosen one, and `aria-checked` for a screen reader.
 */
export function MenuItem({
  icon,
  href,
  download,
  checked,
  onSelect,
  children,
}: {
  icon?: GlyphName;
  href?: string;
  /** With `href`: a file to save, through a plain anchor rather than a navigation. */
  download?: boolean;
  checked?: boolean;
  onSelect?: () => void | "keep";
  children: ReactNode;
}) {
  const { close } = useMenu();
  const radio = checked !== undefined;
  const body = (
    <>
      {icon !== undefined && <Glyph name={icon} size={16} className="text-text2" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {radio && (
        <Glyph
          name="tick"
          size={16}
          className={cx("text-text transition-opacity duration-150 motion-reduce:transition-none", !checked && "opacity-0")}
        />
      )}
    </>
  );
  const choose = (event: MouseEvent) => {
    const kept = onSelect?.();
    if (kept === "keep") return;
    // A link navigates (or saves) on its own; the menu just goes.
    close(!(href !== undefined && !download && !event.defaultPrevented));
  };
  const role = radio ? "menuitemradio" : "menuitem";
  if (href !== undefined && download) {
    return (
      <a role={role} tabIndex={-1} href={href} download className={ITEM} onClick={choose}>
        {body}
      </a>
    );
  }
  if (href !== undefined) {
    return (
      <Link role={role} tabIndex={-1} href={href} className={ITEM} onClick={choose}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role={role}
      tabIndex={-1}
      aria-checked={radio ? checked : undefined}
      className={ITEM}
      onClick={choose}
    >
      {body}
    </button>
  );
}

/**
 * A run of items under a small grey heading ("Group by"), Manus's view
 * options heading: 13px in `--text2`, named to a screen reader as the group's
 * label.
 */
export function MenuGroup({ label, children }: { label?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={label === undefined ? undefined : id} className="flex flex-col gap-0.5">
      {label !== undefined && (
        <p id={id} className="px-[var(--shell-row-pad)] pt-1.5 pb-1 text-[13px] leading-5 text-text2">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

/** A rule between groups of items. */
export function MenuDivider() {
  return <div role="separator" className="mx-[var(--shell-row-pad)] my-1 h-px shrink-0 bg-hair" />;
}
