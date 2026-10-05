import { cx } from "@/components/ui/classes";
import type { GlyphName } from "@/components/ui/Glyph";
import type { RecentKind } from "@/lib/recent-core";

/**
 * One row of the sidebar: New chat, a destination, a course, a pinned or a
 * recent row. 36px tall with a 10px radius and an 8px start padding, read
 * from the shell's density variables (L8 of
 * docs/proposals/library-by-type-and-day.md) with those values as the
 * fallback, so the rows, the section labels and the menus keep one rhythm and
 * a compact setting later is one override. The 8px start padding inside the
 * scroller's 13px gutter puts an 18px glyph at the middle of the 60px rail,
 * so a glyph stays where it is as the sidebar folds and only the words fade.
 */
export const ROW = cx(
  "flex h-[var(--shell-row,36px)] w-full items-center gap-2.5 overflow-hidden rounded-[var(--shell-row-radius,10px)] ps-[var(--shell-row-pad,8px)] pe-2 text-[14px] text-text",
  "transition-colors duration-100 motion-reduce:transition-none",
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
);

/**
 * A row with a second line under its title: `ROW` 8px taller, its height
 * transitioned with its fill, so it can settle back to one row's height on
 * the folded rail, where the words are gone. `cx` joins classes without
 * merging them, so this is its own string rather than `ROW` with overrides.
 */
export const ROW_TWO_LINE = cx(
  "flex w-full items-center gap-2.5 overflow-hidden rounded-[var(--shell-row-radius,10px)] ps-[var(--shell-row-pad,8px)] pe-2 text-[14px] text-text",
  "transition-[height,color,background-color] duration-200 ease-out motion-reduce:transition-none",
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
);

/** The current row rests on `--surface2`; any other takes the translucent fill on hover. */
export function rowFill(current: boolean): string {
  return current ? "bg-surface2 font-medium" : "hover:bg-surface2/60";
}

/**
 * Each Recent kind's 18px glyph, Home's thread glyphs where Home has one,
 * and the word a screen reader hears before the title. A conversation is the
 * studio's compose glyph, as New chat is; a tutor session is the chat glyph.
 */
export const RECENT_GLYPHS: Record<RecentKind, { glyph: GlyphName; word: string }> = {
  module: { glyph: "book", word: "Course module" },
  video: { glyph: "video", word: "Video" },
  draft: { glyph: "compose", word: "Conversation" },
  concept: { glyph: "concepts", word: "Concept" },
  session: { glyph: "chat", word: "Tutor session" },
};
