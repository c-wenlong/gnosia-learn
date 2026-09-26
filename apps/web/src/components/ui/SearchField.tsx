import type { InputHTMLAttributes } from "react";

import { cx, inputClasses } from "./classes";

/**
 * A pill `Input` with a magnifier, `type="search"`. `label` is required and
 * read by screen readers only: the placeholder is not a label.
 *
 * Works controlled (`value` and `onChange` from a client component) or inside
 * a plain GET form (`name`, default `q`).
 */
export function SearchField({
  label,
  className,
  inputClassName,
  name = "q",
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & {
  label: string;
  /** Classes for the wrapper, e.g. a width. */
  className?: string;
  inputClassName?: string;
}) {
  return (
    <label className={cx("relative block min-w-0", className)}>
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="m13 13 4 4" />
      </svg>
      <input
        type="search"
        name={name}
        className={inputClasses({ pill: true, className: cx("pl-10", inputClassName) })}
        {...rest}
      />
    </label>
  );
}
