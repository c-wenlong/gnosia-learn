"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { chipClasses, cx } from "./classes";
import {
  nextIndexForKey,
  popoverShift,
  sectionsOf,
  triggerText,
  typeaheadIndex,
  type FilterOption,
} from "./filter-menu";

/** A pause this long between keys starts a new typeahead prefix. */
const TYPEAHEAD_RESET_MS = 700;

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
 * Escape closes with focus back on the trigger, the way `AvatarMenu` does, and
 * so does a click outside or Tab. Picking the first option ("All") is how a
 * filter is cleared, so there is no separate clear button.
 *
 * Single-select only. No page's filter model holds several values of one
 * group today, so a `multiple` mode would be code with no caller.
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
  className,
}: {
  /** The group's name: "Type", "Course", "Status". The trigger prints it before the value. */
  label: string;
  options: readonly FilterOption<V>[];
  value: V;
  /** The value that means "no filter"; any other one fills the trigger. */
  defaultValue: V;
  onChange: (value: V) => void;
  /** A navigation for the last pick is under way (the trigger dims). */
  busy?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // True while the highlight was last moved by a key: the row then carries a
  // focus outline, since the list itself draws none.
  const [keyboard, setKeyboard] = useState(false);
  const [shift, setShift] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ buffer: "", at: 0 });
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const selected = options.findIndex((o) => o.value === value);

  const show = (at: number, byKey: boolean) => {
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

  // Escape and a pointer outside, the way AvatarMenu listens for them.
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
  // effect, so the list never paints at the edge before it moves.
  useLayoutEffect(() => {
    if (!open) return;
    const at = trigger.current?.getBoundingClientRect();
    const box = list.current;
    if (at !== undefined && box !== null) {
      setShift(popoverShift({ triggerLeft: at.left, width: box.offsetWidth, viewport: document.documentElement.clientWidth }));
    }
    box?.focus({ preventScroll: true });
  }, [open]);

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
        onClick={() => (open ? close(false) : show(Math.max(selected, 0), false))}
        onKeyDown={onTriggerKey}
        className={chipClasses({
          active: value !== defaultValue,
          className: cx("pr-2.5", busy && "opacity-70"),
        })}
      >
        <span>{triggerText(label, options, value)}</span>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className={cx("size-3.5 shrink-0", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          onKeyDown={onListKey}
          onBlur={(event) => {
            if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
          style={{ left: shift }}
          className={cx(
            "absolute top-full z-40 mt-2 flex w-max min-w-[13rem] flex-col gap-0.5 overflow-y-auto overscroll-contain",
            "max-h-[min(30rem,70vh)] max-w-[min(22rem,calc(100vw-2rem))]",
            "rounded-2xl border-2 border-border bg-surface p-1.5 outline-none",
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
                <div aria-hidden className="px-3 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-text3 uppercase">
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
      aria-selected={selected}
      aria-label={name}
      onMouseMove={onHover}
      onClick={onPick}
      className={cx(
        "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl py-1.5 pr-3 pl-2 text-left select-none",
        active && "bg-surface2",
        active && keyboard && "outline-2 -outline-offset-2 outline-accent",
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className={cx("size-4 shrink-0 text-accent-text", !selected && "invisible")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
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
