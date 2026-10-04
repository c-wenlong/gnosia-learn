"use client";

import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type Ref } from "react";

import { cx, inputClasses } from "./classes";
import { isImeKey } from "./composer-keys";
import { nextSuggestion, suggestionsFor } from "./suggestions";
import type { FilterOption } from "./filter-menu";
import { LIST_PANEL, ListOption } from "./FilterMenu";
import { Glyph } from "./Glyph";
import { fieldListClasses, fieldListStyle, useFieldList } from "./use-field-list";
import { usePresence } from "./use-presence";

/**
 * Kit `Combobox`: a text field with suggestions, for a value that may be one
 * of a list or anything else typed (the Settings model box: a provider lists
 * its models, and any model id is still a valid answer). It replaced a native
 * `<datalist>`, whose list the platform draws in its own style.
 *
 * Focus stays in the field the whole time (ARIA's combobox with list
 * autocomplete): typing filters the list (`suggestionsFor`), the arrows move a
 * highlight the field points at with `aria-activedescendant`, Enter on a
 * highlighted row takes it, and Enter with no row highlighted is the form's
 * own, so the words typed are what is submitted. Escape closes the list and
 * goes no further, so a dialog around the field stays open; with the list
 * shut it is the page's again. Tab, a blur and a click outside close it too.
 * Keys an input method is composing with are left alone (`isImeKey`). The
 * chevron at the right opens the whole list for a pointer; it takes no focus.
 *
 * The rows are `FilterMenu`'s (`ListOption`: a tick on the value typed, the
 * detail as a second line), in the same top-layer list as `Select`
 * (`useFieldList`), popping in and out (`usePresence`).
 */
export function Combobox<V extends string>({
  id,
  label,
  value,
  onChange,
  options,
  invalid = false,
  describedBy,
  className,
  ref,
  disabled,
  ...rest
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "onChange" | "type" | "role" | "className" | "size" | "aria-invalid" | "aria-describedby" | "list"
> & {
  /** The field's id, for the form's `<label htmlFor>`. */
  id?: string;
  /** Names the list to a screen reader ("Model"). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The suggestions. A row's `detail` is its second line ("free"). */
  options: readonly FilterOption<V>[];
  /** A check refused the value: the danger border, and `describedBy` says why. */
  invalid?: boolean;
  describedBy?: string;
  /** Classes for the wrapper, e.g. a width. */
  className?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const [open, setOpen] = useState(false);
  // What the list is filtered by: the words typed since the field was last
  // filled from the list, so opening it again after a pick shows every row
  // rather than only the one picked.
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState(-1);
  // True while the highlight was last moved by a key: the row then carries a
  // focus outline, as in `FilterMenu`.
  const [keyboard, setKeyboard] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const base = useId();
  const listId = `${base}-list`;
  const optionId = (index: number) => `${base}-option-${index}`;

  const suggestions = useMemo(() => suggestionsFor(options, typed), [options, typed]);
  const showList = open && suggestions.length > 0 && !disabled;
  // The rows last shown, kept while the list leaves, so a list closed by
  // typing its last match away does not empty before it fades.
  const [kept, setKept] = useState(suggestions);
  if (showList && kept !== suggestions) setKept(suggestions);
  const rows = showList ? suggestions : kept;
  const presence = usePresence(showList, 120);
  const place = useFieldList(showList, anchor, list);

  // Keep the highlighted row in view in a list long enough to scroll.
  useEffect(() => {
    if (!showList || active < 0) return;
    document.getElementById(`${base}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [showList, active, base]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const pick = (index: number) => {
    const option = rows[index];
    if (option === undefined) return;
    setTyped("");
    close();
    if (option.value !== value) onChange(option.value);
  };
  /** Opens every row, with the highlight on the value the field holds if it is one of them. */
  const showAll = () => {
    setTyped("");
    setActive(options.findIndex((o) => o.value === value));
    setKeyboard(false);
    setOpen(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    rest.onKeyDown?.(event);
    // An input method's arrows move between its candidates and its Enter
    // confirms a word: neither is ours.
    if (event.defaultPrevented || isImeKey(event.nativeEvent)) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      if (!showList) {
        // Opening: on what was typed, or on every row when nothing was typed
        // or nothing typed matches. Down lands on the value the field holds
        // (else the first row) and Up on the last, as `FilterMenu`'s trigger.
        const all = typed === "" || suggestions.length === 0;
        const count = all ? options.length : suggestions.length;
        const held = all ? options.findIndex((o) => o.value === value) : -1;
        if (all) setTyped("");
        setActive(event.key === "ArrowUp" ? count - 1 : Math.max(held, 0));
        setKeyboard(true);
        setOpen(true);
        return;
      }
      const next = nextSuggestion(event.key, active, rows.length);
      if (next !== null) {
        setActive(next);
        setKeyboard(true);
      }
      return;
    }
    if (event.key === "Enter") {
      if (showList && active >= 0) {
        // A row is highlighted: that is the choice, not the form's submit.
        event.preventDefault();
        pick(active);
      } else if (showList) {
        close();
      }
      return;
    }
    if (event.key === "Escape" && showList) {
      // Closes the list only. Inside a modal `<dialog>` an Escape nobody
      // cancels is also the dialog's close request.
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab" && showList) close();
  };

  return (
    <div ref={anchor} className={cx("relative min-w-0", className)}>
      <input
        {...rest}
        ref={ref}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={presence.mounted && !presence.leaving ? listId : undefined}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          setTyped(event.target.value);
          setActive(-1);
          setKeyboard(false);
          setOpen(true);
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          rest.onBlur?.(event);
          close();
        }}
        className={inputClasses({ className: options.length > 0 ? "pr-11" : undefined })}
      />
      {options.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} suggestions`}
          aria-expanded={showList}
          aria-controls={presence.mounted && !presence.leaving ? listId : undefined}
          disabled={disabled}
          // Keeps the focus in the field: the list is the field's.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            if (showList) close();
            else showAll();
            // A click straight on the chevron of a field without focus.
            const field = event.currentTarget.previousElementSibling;
            if (field instanceof HTMLInputElement && document.activeElement !== field) field.focus();
          }}
          className={cx(
            "absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text2",
            "transition-colors duration-100 not-disabled:hover:text-text motion-reduce:transition-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Glyph
            name="chevron"
            size={16}
            stroke={2.25}
            className={cx("size-4 transition-[rotate] duration-150 ease-soft motion-reduce:transition-none", showList && "rotate-180")}
          />
        </button>
      )}
      {presence.mounted && (
        <div
          ref={list}
          id={presence.leaving ? undefined : listId}
          role="listbox"
          popover="manual"
          inert={presence.leaving}
          aria-label={label}
          // A press on a row would take the focus from the field, and the
          // blur would close the list before the click could pick.
          onMouseDown={(event) => event.preventDefault()}
          style={fieldListStyle(place)}
          className={cx(
            fieldListClasses(place),
            LIST_PANEL,
            presence.leaving ? "pointer-events-none animate-pop-out" : "animate-pop-in",
            "motion-reduce:animate-none",
          )}
        >
          {rows.map((option, index) => (
            <ListOption
              key={option.value}
              id={optionId(index)}
              option={option}
              selected={option.value === value}
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
          ))}
        </div>
      )}
    </div>
  );
}
