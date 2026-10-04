"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { chipClasses, cx, FIELD_TEXT, inputClasses } from "./classes";
import { Glyph } from "./Glyph";
import { usePresence } from "./use-presence";
import {
  fieldPlacement,
  nextIndexForKey,
  popoverShift,
  sectionsOf,
  triggerText,
  typeaheadIndex,
  valueText,
  type FilterOption,
} from "./filter-menu";

/** A pause this long between keys starts a new typeahead prefix. */
const TYPEAHEAD_RESET_MS = 700;

/** A field in a line of text: a `Chip`'s 28px pill holding a value (the confirm card's arrow ends). */
const CHIP_FIELD = cx(
  "h-7 min-w-[5ch] max-w-full rounded-full border border-border bg-surface pr-2 pl-2.5 text-text outline-none",
  FIELD_TEXT.px13,
  "transition-colors duration-100 focus-visible:border-accent",
);

/**
 * Kit `FilterMenu`: one filter group as a chip that opens a list of its
 * options. It replaced the rows of filter chips on Courses, Learn and
 * Library once the option count outgrew a row (DESIGN.md, Deviations).
 *
 * The trigger is a `Chip` reading "Type: Video", filled with the accent while
 * a value other than `defaultValue` is chosen. Behind it is an ARIA listbox:
 * the list takes focus and points at the highlighted row with
 * `aria-activedescendant`. Arrow keys, Home and End move; Enter or Space
 * picks; typing jumps to the next option starting with what was typed;
 * Escape closes with focus back on the trigger, the way `AccountMenu` does, and
 * so does a click outside or Tab. Picking the first option ("All") is how a
 * filter is cleared, so there is no separate clear button.
 *
 * Single-select only. No page's filter model holds several values of one
 * group today, so a `multiple` mode would be code with no caller.
 *
 * The list pops in (`animate-pop-in`, from the trigger's corner) and out
 * (`usePresence`: kept for 120ms, inert, fading and shrinking a little), and
 * the chevron turns with it. It is never hidden with `visibility` on the way
 * in, so the layout effect that focuses it still finds it focusable.
 *
 * `face="field"` is the same menu as a form's select: the trigger takes the
 * kit `Input`'s face with a chevron at the right, prints the value alone, is
 * never filled, and its list (at least as wide as the field) goes in the top
 * layer as a manual popover at fixed coordinates (`fieldPlacement`), since a
 * field sits in cards, folds and dialogs that clip. `Select` is that face
 * with a form's props. Every dropdown in the app is one of the two, never a
 * native `<select>`, whose list the platform draws in its own style
 * (`select-kit.test.ts`).
 *
 * A client component (it has open state and listeners), unlike the rest of
 * the kit. Its option model is the React-free `./filter-menu`.
 */
export function FilterMenu<V extends string>({
  label,
  options,
  value,
  defaultValue,
  onChange,
  busy = false,
  bare = false,
  invalid = false,
  describedBy,
  className,
  face = "chip",
  size = "md",
  id: triggerId,
  placeholder,
  dataField,
}: {
  /** The group's name: "Type", "Course", "Status". The trigger prints it before the value. */
  label: string;
  options: readonly FilterOption<V>[];
  value: V;
  /** The value that means "no filter"; any other one fills the trigger. A field's trigger is never filled. */
  defaultValue?: V;
  onChange: (value: V) => void;
  /** A navigation for the last pick is under way (the trigger dims). */
  busy?: boolean;
  /**
   * The trigger prints the value alone, for a menu that sits beside a label
   * of its own (a form row): "Topic: Consensus" next to "Topic" would say it
   * twice. The label still names the trigger and the list to a screen reader.
   */
  bare?: boolean;
  /** A check refused the value: the trigger takes the danger border, and `describedBy` says why. */
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  /** `chip` for a filter, `field` for a form's select (see above). */
  face?: "chip" | "field";
  /** A field's height: `md` is the kit `Input`, `chip` a `Chip`'s 28px for a field in a line of text. */
  size?: "md" | "chip";
  /** The trigger's id, for a `<label htmlFor>`. */
  id?: string;
  /** What a field prints while its value is none of the options ("Pick one"). */
  placeholder?: string;
  /** Put on the trigger as `data-field`, for a form that finds its fields by it. */
  dataField?: string;
}) {
  const field = face === "field";
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // True while the highlight was last moved by a key: the row then carries a
  // focus outline, since the list itself draws none.
  const [keyboard, setKeyboard] = useState(false);
  const [shift, setShift] = useState(0);
  // A field's list: fixed coordinates in the top layer (`fieldPlacement`).
  const [place, setPlace] = useState<{ top: number; left: number; above: boolean; maxHeight: number; minWidth: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ buffer: "", at: 0 });
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const selected = options.findIndex((o) => o.value === value);
  const shown = selected < 0 && placeholder !== undefined ? placeholder : valueText(options, value);
  const presence = usePresence(open, 120);

  const show = (at: number, byKey: boolean) => {
    // A prefix typed into the last opening does not carry into this one.
    typed.current = { buffer: "", at: 0 };
    setActive(at);
    setKeyboard(byKey);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const pick = (index: number) => {
    const option = options[index];
    close(true);
    if (option !== undefined && option.value !== value) onChange(option.value);
  };

  // Escape and a pointer outside, the way AccountMenu listens for them.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Opening: keep the list inside the viewport, then give it focus. A layout
  // effect, so the list never paints at the edge before it moves. Measured
  // again on a resize, since a narrower window narrows the list too.
  useLayoutEffect(() => {
    if (!open) return;
    const box = list.current;
    // Into the top layer first: a popover that is not showing has no size.
    // jsdom has no popovers, and showing one that is still on its way out
    // (open again mid-exit) throws, harmlessly.
    if (field && box !== null && typeof box.showPopover === "function") {
      try {
        box.showPopover();
      } catch {
        // Already showing.
      }
    }
    const measure = () => {
      const at = trigger.current?.getBoundingClientRect();
      if (at === undefined || box === null) return;
      const root = document.documentElement;
      if (!field) {
        setShift(popoverShift({ triggerLeft: at.left, width: box.offsetWidth, viewport: root.clientWidth }));
        return;
      }
      const width = Math.max(box.offsetWidth, at.width);
      // The list's own cap, min(30rem, 70vh), as max-h-[min(30rem,70vh)] has it.
      const cap = Math.min(30 * parseFloat(getComputedStyle(root).fontSize), 0.7 * window.innerHeight);
      setPlace({
        ...fieldPlacement({ trigger: at, width, height: box.scrollHeight, cap, viewport: { width: root.clientWidth, height: root.clientHeight } }),
        minWidth: at.width,
      });
    };
    measure();
    box?.focus({ preventScroll: true });
    window.addEventListener("resize", measure);
    // A field's list is fixed to the viewport, so it follows its trigger
    // when anything around it scrolls (capture: any scroller, not only the page).
    if (field) window.addEventListener("scroll", measure, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
    };
  }, [open, field]);

  // Keep the highlighted row in view in a list long enough to scroll.
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowUp" ? options.length - 1 : Math.max(selected, 0), true);
    }
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Closes the list only. Inside a modal `<dialog>` an Escape nobody
      // cancels is also the dialog's close request, and would take the whole
      // panel with it; the document listener below does the closing.
      event.preventDefault();
      return;
    }
    const next = nextIndexForKey(event.key, active, options.length);
    if (next !== null) {
      event.preventDefault();
      setActive(next);
      setKeyboard(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (active >= 0) pick(active);
      return;
    }
    if (event.key === "Tab") {
      // Let the focus move on; the list closes behind it.
      setOpen(false);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // The event's own time rather than Date.now(): the same clock, and
      // the React compiler's purity rule cannot tell a handler from render.
      const now = event.timeStamp;
      const t = typed.current;
      t.buffer = now - t.at > TYPEAHEAD_RESET_MS ? event.key : t.buffer + event.key;
      t.at = now;
      const hit = typeaheadIndex(options.map((o) => o.label), active, t.buffer);
      if (hit !== null) {
        setActive(hit);
        setKeyboard(true);
      }
    }
  };

  return (
    <div ref={root} className={cx("relative", className)}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-busy={busy || undefined}
        id={triggerId}
        data-field={dataField}
        data-value={value}
        aria-label={bare || field ? `${label}: ${shown}` : undefined}
        // No aria-invalid: ARIA does not support it on a button. A refused
        // value is heard through describedBy, the message the check printed.
        aria-describedby={describedBy}
        onClick={() => (open ? close(false) : show(Math.max(selected, 0), false))}
        onKeyDown={onTriggerKey}
        className={
          field
            ? cx(
                size === "chip" ? CHIP_FIELD : inputClasses({ className: "pr-3" }),
                "flex cursor-pointer items-center justify-between gap-2 text-left",
                busy && "opacity-70",
                invalid && "border-danger",
              )
            : chipClasses({
                active: defaultValue !== undefined && value !== defaultValue,
                className: cx("max-w-full pr-2.5", busy && "opacity-70", invalid && "border-danger"),
              })
        }
      >
        <span className={cx("min-w-0 truncate", field && selected < 0 && "text-text3")}>
          {field || bare ? shown : triggerText(label, options, value)}
        </span>
        <Glyph
          name="chevron"
          className={cx(
            "transition-[rotate] duration-150 ease-soft motion-reduce:transition-none",
            field ? (size === "chip" ? "size-3 text-text3" : "size-4 text-text2") : "size-3.5",
            open && "rotate-180",
          )}
        />
      </button>
      {presence.mounted && (
        <div
          ref={list}
          id={presence.leaving ? undefined : listId}
          role="listbox"
          tabIndex={-1}
          popover={field ? "manual" : undefined}
          inert={presence.leaving}
          aria-label={label}
          aria-activedescendant={active >= 0 && !presence.leaving ? optionId(active) : undefined}
          onKeyDown={onListKey}
          onBlur={(event) => {
            if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
          style={
            field
              ? // Placed by the layout effect before the first paint. Never
                // `visibility: hidden` meanwhile: the effect focuses the list
                // in that same pass, and a hidden element refuses focus.
                place === null
                ? { top: 0, left: 0 }
                : { top: place.top, left: place.left, minWidth: place.minWidth, maxHeight: `min(30rem, 70vh, ${place.maxHeight}px)` }
              : { left: shift }
          }
          className={cx(
            field
              ? cx("fixed inset-auto m-0 text-text", place?.above ? "origin-bottom-left" : "origin-top-left")
              : "absolute top-full z-40 mt-2 min-w-[13rem] origin-top-left",
            "flex w-max flex-col gap-0.5 overflow-y-auto overscroll-contain",
            "max-h-[min(30rem,70vh)] max-w-[min(22rem,calc(100vw-2rem))]",
            "rounded-2xl border-2 border-border bg-surface p-1.5 outline-none",
            presence.leaving
              ? "pointer-events-none animate-pop-out"
              : "animate-pop-in",
            "motion-reduce:animate-none",
          )}
        >
          {sectionsOf(options).map((section) => {
            const rows = section.options.map(({ option, index }) => (
              <Option
                key={option.value}
                id={optionId(index)}
                option={option}
                selected={index === selected}
                active={index === active}
                keyboard={keyboard}
                onHover={() => {
                  if (index !== active || keyboard) {
                    setActive(index);
                    setKeyboard(false);
                  }
                }}
                onPick={() => pick(index)}
              />
            ));
            if (section.heading === null) return rows;
            return (
              <div key={`section-${section.heading}`} role="group" aria-label={section.heading} className="mt-1 flex flex-col gap-0.5 border-t border-hair pt-1.5 first:mt-0 first:border-t-0 first:pt-0">
                <div aria-hidden className="px-3 pt-1 pb-0.5 text-[12px] font-semibold text-text2">
                  {section.heading}
                </div>
                {rows}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Option<V extends string>({
  id,
  option,
  selected,
  active,
  keyboard,
  onHover,
  onPick,
}: {
  id: string;
  option: FilterOption<V>;
  selected: boolean;
  active: boolean;
  keyboard: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  // The accessible name spelled out, so the count is not read glued to the
  // label ("Video30") and the second line is heard after a pause.
  const name = [option.label, option.detail, option.count === undefined ? undefined : String(option.count)]
    .filter((part) => part !== undefined)
    .join(", ");
  return (
    <div
      id={id}
      role="option"
      data-value={option.value}
      aria-selected={selected}
      aria-label={name}
      onMouseMove={onHover}
      onClick={onPick}
      className={cx(
        "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl py-1.5 pr-3 pl-2 text-left select-none",
        "transition-colors duration-100 motion-reduce:transition-none",
        active && "bg-surface2",
        active && keyboard && "outline-2 -outline-offset-2 outline-accent",
      )}
    >
      <Glyph name="tick" size={16} className={cx("text-accent-text", !selected && "invisible")} />
      <span className="flex min-w-0 flex-1 flex-col">
        {/* The count sits on the label's line, not centred on the row, so it
            reads with the name it counts when a second line is under it. */}
        <span className="flex items-baseline justify-between gap-4">
          <span className={cx("text-[14px] text-text", selected ? "font-semibold" : "font-medium")}>{option.label}</span>
          {option.count !== undefined && <span className="shrink-0 text-[12px] text-text3 tabular-nums">{option.count}</span>}
        </span>
        {option.detail !== undefined && <span className="text-[12px] leading-snug text-text2">{option.detail}</span>}
      </span>
    </div>
  );
}
