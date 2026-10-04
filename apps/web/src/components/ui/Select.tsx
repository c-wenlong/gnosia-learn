"use client";

import { FilterMenu } from "./FilterMenu";
import type { FilterOption } from "./filter-menu";

/**
 * Kit `Select`: a form's dropdown, `FilterMenu` with `face="field"`. The
 * trigger looks like the kit `Input` and prints the value; the list is the
 * filter menus' own (check, highlight, keyboard, typeahead), drawn in the top
 * layer so the card, fold or dialog around the field cannot clip it.
 *
 * `label` names the trigger and the list to a screen reader ("Motion:
 * Respect system"); the visible label is the form's own `<label htmlFor={id}>`.
 */
export function Select<V extends string>({
  id,
  label,
  options,
  value,
  onChange,
  size = "md",
  placeholder,
  busy,
  invalid,
  describedBy,
  dataField,
  className,
}: {
  id?: string;
  label: string;
  options: readonly FilterOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: "md" | "inline";
  placeholder?: string;
  busy?: boolean;
  invalid?: boolean;
  describedBy?: string;
  dataField?: string;
  className?: string;
}) {
  return (
    <FilterMenu
      face="field"
      id={id}
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      size={size}
      placeholder={placeholder}
      busy={busy}
      invalid={invalid}
      describedBy={describedBy}
      dataField={dataField}
      className={className}
    />
  );
}
