import type { InputHTMLAttributes, MouseEvent, Ref } from "react";

import { cx, FIELD_TEXT, inputClasses } from "./classes";

type SearchSize = "md" | "lg" | "chip" | "compact";

/** Where the magnifier sits and how far the words start after it, per size. */
const ICON: Record<SearchSize | "filled", { icon: string; pad: string }> = {
  md: { icon: "left-4 size-4", pad: "pl-10" },
  lg: { icon: "left-4 size-4", pad: "pl-10" },
  chip: { icon: "left-3 size-3.5", pad: "pl-8" },
  compact: { icon: "left-2.5 size-3.5", pad: "pl-8" },
  filled: { icon: "left-2.5 size-[18px] text-text2", pad: "pl-9" },
};

/** The clear button's box and the room the words leave for it, per size. */
const CLEAR: Record<SearchSize | "filled", { button: string; pad: string }> = {
  md: { button: "right-2 size-7 rounded-full", pad: "pr-10" },
  lg: { button: "right-2.5 size-8 rounded-full", pad: "pr-11" },
  chip: { button: "right-1.5 size-6 rounded-full", pad: "pr-8" },
  compact: { button: "right-1 size-6 rounded-full", pad: "pr-7" },
  filled: { button: "right-1 size-7 rounded-md", pad: "pr-8" },
};

/**
 * The browser's own search furniture, gone: Chrome and Safari draw a clear
 * button in the platform's style inside a `type="search"` field, which is
 * what `onClear` replaces with the kit's.
 */
const NO_NATIVE = "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden";

/**
 * A search field: the kit `Input` as a pill with a magnifier, `type="search"`.
 * `label` is required and read by screen readers only: the placeholder is not
 * a label.
 *
 * Works controlled (`value` and `onChange` from a client component) or inside
 * a plain GET form (`name`, default `q`). `onClear` adds the kit's clear
 * button, which shows once the field holds words and puts the focus back in
 * it; it needs `value`, so a controlled field. The browser's own clear button
 * is never drawn.
 *
 * `size` is `inputClasses`' (`md`; `lg`, 48px at 15px, for the field a page is
 * about; `chip` in a row of filter menus; `compact` in the studio's strips).
 * `face="filled"` is the sidebar's: no border, a `--surface2` fill, radius 8,
 * 40px, the sidebar's own magnifier, and the focus ring around the whole
 * field rather than a border colour; it ignores `size`.
 */
export function SearchField({
  label,
  className,
  inputClassName,
  name = "q",
  size = "md",
  face = "outline",
  onClear,
  clearLabel = "Clear the search",
  ref,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type" | "size"> & {
  label: string;
  size?: SearchSize;
  face?: "outline" | "filled";
  /** Empties the field: given, the kit's clear button shows while it holds words. */
  onClear?: () => void;
  /** The clear button's name. */
  clearLabel?: string;
  /** Classes for the wrapper, e.g. a width. */
  className?: string;
  inputClassName?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const filled = face === "filled";
  const key = filled ? "filled" : size;
  const holds = rest.value !== undefined && String(rest.value) !== "";
  const clear = (event: MouseEvent<HTMLButtonElement>) => {
    onClear?.();
    event.currentTarget.parentElement?.querySelector("input")?.focus();
  };
  return (
    <div
      className={cx(
        "relative min-w-0",
        filled && "overflow-hidden rounded-lg focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-accent",
        className,
      )}
    >
      <label className="block">
        <span className="sr-only">{label}</span>
        {filled ? (
          // The sidebar's glyph (its 1.7 stroke), so the field's icon reads as
          // one of the rail's when the sidebar folds the field to its icon.
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className={cx("pointer-events-none absolute top-1/2 -translate-y-1/2", ICON.filled.icon)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.2 13.2 3.3 3.3" />
          </svg>
        ) : (
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className={cx("pointer-events-none absolute top-1/2 -translate-y-1/2 text-text3", ICON[key].icon)}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" />
          </svg>
        )}
        <input
          ref={ref}
          type="search"
          name={name}
          className={
            filled
              ? cx(
                  "h-10 w-full min-w-0 appearance-none rounded-lg bg-surface2 text-text outline-none placeholder:text-text3",
                  FIELD_TEXT.px14,
                  ICON.filled.pad,
                  onClear !== undefined && CLEAR.filled.pad,
                  NO_NATIVE,
                  inputClassName,
                )
              : inputClasses({
                  pill: true,
                  size,
                  className: cx(ICON[key].pad, onClear !== undefined && CLEAR[key].pad, NO_NATIVE, inputClassName),
                })
          }
          {...rest}
        />
      </label>
      {onClear !== undefined && holds && (
        // Fades in with the first letter typed; it goes with the last.
        <button
          type="button"
          aria-label={clearLabel}
          title={clearLabel}
          onClick={clear}
          className={cx(
            "absolute top-1/2 inline-flex -translate-y-1/2 animate-fade-in items-center justify-center text-text3",
            "transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-accent motion-reduce:animate-none",
            CLEAR[key].button,
          )}
        >
          <svg aria-hidden viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="m5.5 5.5 9 9m0-9-9 9" />
          </svg>
        </button>
      )}
    </div>
  );
}
