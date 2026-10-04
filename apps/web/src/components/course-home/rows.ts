import { cx } from "@/components/ui/classes";

/**
 * The class strings a module page's rows share, React-free so any of its
 * components (and a test) can compose them.
 *
 * Coursera's item row: at least 60px, 8px padding and gap, radius 8, a 20px
 * icon, a 16/24 title over a 14/20 grey meta line, 2px between rows, and the
 * tint on hover. Colours are our tokens: `--tint` for the hover and the
 * current row, `--text2` for the meta line.
 *
 * `ROW_BOX` is the box alone, for a row that lays out its own children (a
 * topic row is a grid); `ROW` is the box as a flex row.
 */
export const ROW_BOX = "relative min-h-[60px] rounded-lg p-2";

export const ROW = cx(ROW_BOX, "flex items-center gap-2");

/** A row that is a link or a toggle as a whole: tinted under the pointer. */
export const ROW_HOVER = "transition-colors duration-100 hover:bg-tint";

export const ROW_TITLE = "block text-[16px] leading-6 text-text";

export const ROW_META = "block text-[14px] leading-5 text-text2";

/**
 * A control that stretches its hit area over the whole row (an `::after` at
 * inset 0), so the row reads as one target while a button inside it, raised
 * with `relative z-10`, keeps its own click. The focus ring goes on the
 * stretched box, so it outlines the row.
 */
export const STRETCHED = cx(
  "after:absolute after:inset-0 after:rounded-lg after:content-['']",
  "focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent",
);

/** A list of rows, 2px apart. */
export const ROW_LIST = "flex flex-col gap-0.5";
