"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cx, MENU_HEADING, MENU_PANEL, menuRowClasses } from "./classes";
import { typeaheadIndex } from "./filter-menu";
import { Glyph, type GlyphName } from "./Glyph";
import { Popover } from "./Popover";
import { tabKeyIndex } from "./roving";

/** A pause this long between keys starts a new typeahead prefix. */
const TYPEAHEAD_RESET_MS = 700;

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
 * press outside or the focus leaving closes. Every item is `tabIndex={-1}`,
 * so the list is one stop for Tab, as the pattern asks. Escape is the kit
 * `Popover`'s: it closes this menu only, so a dialog around it stays open.
 *
 * **Where it opens.** The list is a kit `Popover` in the kit's menu box
 * (`MENU_PANEL`, rows from `menuRowClasses`): in the top layer at fixed
 * coordinates, so the card or list row it belongs to cannot clip it. Under
 * the button, its edge on the button's (`align`, the end by default, for a
 * more button at a row's right), above when there is more room there, kept
 * inside the screen, and placed again on a scroll or a resize.
 *
 * **Motion.** It pops in from the corner it opened at and out again (kept
 * 120ms, inert), and goes at once under reduced motion.
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
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Which item opening focuses: the first, the last (Up on the button), or the checked one.
  const opening = useRef<"first" | "last">("first");
  const typed = useRef({ buffer: "", at: 0 });
  const id = useId();

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

  // Opening: focus an item. A layout effect, which runs after the
  // `Popover`'s own (a child's run first), so the list is showing and placed
  // by then, and never paints with nothing focused.
  useLayoutEffect(() => {
    if (!open) return;
    const all = items();
    const checked = all.find((item) => item.getAttribute("aria-checked") === "true");
    const first = opening.current === "last" ? all[all.length - 1] : (checked ?? all[0]);
    first?.focus({ preventScroll: true });
  }, [open]);

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
    // Escape never gets here: the `Popover` takes it first, closes this
    // menu only and puts focus back on the button.
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
        <Popover
          ref={list}
          anchorRef={button}
          open={open}
          onOpenChange={() => close(false)}
          placement={align === "end" ? "bottom-end" : "bottom-start"}
          minWidth={minWidth}
          id={listId}
          role="menu"
          aria-label={menuLabel ?? label}
          aria-orientation="vertical"
          onKeyDown={onListKey}
          className={cx(MENU_PANEL, "max-w-[calc(100vw-2rem)]")}
        >
          {children}
        </Popover>
      </div>
    </MenuContext.Provider>
  );
}

/** A menu row: the kit's (`menuRowClasses`), a row that takes the focus itself, the glyph then the words. */
const ITEM = menuRowClasses({ className: "shrink-0 leading-5 whitespace-nowrap" });

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
 * A run of items under a small grey heading ("Group by"), the kit's menu
 * heading (`MENU_HEADING`), named to a screen reader as the group's label.
 */
export function MenuGroup({ label, children }: { label?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={label === undefined ? undefined : id} className="flex flex-col gap-0.5">
      {label !== undefined && (
        <p id={id} className={MENU_HEADING}>
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

/** A rule between groups of items. */
export function MenuDivider() {
  return <div role="separator" className="mx-2 my-1 h-px shrink-0 bg-hair" />;
}
