"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { chipClasses, cx, inputClasses, MENU_GROUP, MENU_HEADING, MENU_PANEL, menuRowClasses } from "./classes";
import { Glyph } from "./Glyph";
import { Popover } from "./Popover";
import { nextIndexForKey, NO_TYPEAHEAD, sectionsOf, triggerText, typeaheadIndex, typeaheadStep, valueText, type FilterOption } from "./filter-menu";


/**
 * The list's box, a filter's and a field's alike, and `Combobox`'s: the kit
 * `MENU_PANEL`, as wide as its words and never wider than the screen.
 */
export const LIST_PANEL = cx(MENU_PANEL, "w-max max-w-[min(22rem,calc(100vw-2rem))]");

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
 * Escape closes with focus back on the trigger, and goes no further (a dialog
 * around the menu stays open); a click outside or Tab closes it too. Picking
 * the first option ("All") is how a filter is cleared, so there is no
 * separate clear button.
 *
 * Single-select only. No page's filter model holds several values of one
 * group today, so a `multiple` mode would be code with no caller.
 *
 * The list is a kit `Popover`: in the top layer at fixed coordinates under
 * the trigger (over it when there is more room above), so a scrolling thread
 * or a card around a filter cannot clip it, popping in from the trigger's
 * corner and out again (kept for 120ms, inert), with the chevron turning
 * with it. It is never hidden with `visibility` on the way in, so the layout
 * effect that focuses it still finds it focusable.
 *
 * `face="field"` is the same menu as a form's select: the trigger takes the
 * kit `Input`'s face with a chevron at the right, prints the value alone, is
 * never filled, and its list is at least as wide as the field. `Select` is
 * that face with a form's props. Every dropdown in the app is one of the two, never a
 * native `<select>`, whose list the platform draws in its own style
 * (the lint rule `gnosia/kit-select`).
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
  /** A field's height: `md` is the kit `Input`, `inline` its 28px pill for a field in a line of text. */
  size?: "md" | "inline";
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
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef(NO_TYPEAHEAD);
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const selected = options.findIndex((o) => o.value === value);
  const shown = selected < 0 && placeholder !== undefined ? placeholder : valueText(options, value);

  const show = (at: number, byKey: boolean) => {
    // A prefix typed into the last opening does not carry into this one.
    typed.current = NO_TYPEAHEAD;
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
    // A disabled row is shown, never picked: keyboard Enter lands on it all
    // the same, so the refusal lives here too.
    if (option === undefined || option.disabled === true) return;
    close(true);
    if (option.value !== value) onChange(option.value);
  };

  // Opening: give the list focus. A layout effect, which runs after the
  // `Popover`'s own (a child's run first), so the list is showing and placed
  // by the time it is focused, and never paints unfocused first.
  useLayoutEffect(() => {
    if (open) list.current?.focus({ preventScroll: true });
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
      typed.current = typeaheadStep(typed.current, event.key, event.timeStamp);
      const hit = typeaheadIndex(options.map((o) => o.label), active, typed.current.buffer);
      if (hit !== null) {
        setActive(hit);
        setKeyboard(true);
      }
    }
  };

  return (
    <div className={cx("relative", className)}>
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
                inputClasses({ size, className: size === "inline" ? "pr-2" : "pr-3" }),
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
            field ? (size === "inline" ? "size-3 text-text3" : "size-4 text-text2") : "size-3.5",
            open && "rotate-180",
          )}
        />
      </button>
      <Popover
        ref={list}
        anchorRef={trigger}
        open={open}
        onOpenChange={() => setOpen(false)}
        minWidthFromAnchor={field}
        id={listId}
        role="listbox"
        aria-label={label}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        onKeyDown={onListKey}
        className={cx(LIST_PANEL, !field && "min-w-[13rem]")}
      >
        {sectionsOf(options).map((section) => {
          const rows = section.options.map(({ option, index }) => (
            <ListOption
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
            <div key={`section-${section.heading}`} role="group" aria-label={section.heading} className={MENU_GROUP}>
              <div aria-hidden className={MENU_HEADING}>
                {section.heading}
              </div>
              {rows}
            </div>
          );
        })}
      </Popover>
    </div>
  );
}

/**
 * One row of a kit list: a tick on the chosen one, the label with its count
 * at the right, and the detail as a muted second line under it. The
 * highlighted row takes `--surface2`, with an accent outline while the
 * keyboard moved it there (`menuRowClasses`). `FilterMenu`, `Select` and
 * `Combobox` draw the same rows.
 */
export function ListOption<V extends string>({
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
      aria-disabled={option.disabled === true}
      aria-label={name}
      onMouseMove={option.disabled === true ? undefined : onHover}
      onClick={option.disabled === true ? undefined : onPick}
      className={cx(menuRowClasses({ active, keyboard }), option.disabled === true && "cursor-default opacity-50")}
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
