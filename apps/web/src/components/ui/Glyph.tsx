import { cx } from "./classes";

/**
 * The kit's glyphs: 20px outline paths in the current text colour, drawn the
 * way `NavIcon` draws the tab bar's. Moved here from the course page
 * (`course-home/icons.tsx`, which re-exports them) so the studio's @ menu,
 * its chips and its suggestion buttons draw the same `diagram` and `video`
 * without importing from another page (docs/STUDIO-MENTIONS.md, phase 2b).
 * No state and no hooks, so a server component can render them too.
 */
const PATHS = {
  // A bulleted list: the module's topics.
  topics: "M8 5.5h8.5M8 10h8.5M8 14.5h8.5M4 5.5h.01M4 10h.01M4 14.5h.01",
  // A light bulb, as the Learn tab draws it.
  concepts: "M7.5 14.5h5M8 17h4M10 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z",
  // Four tiles, as the Library tab draws them.
  assets: "M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z",
  // A tick in a circle.
  done: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM7 10.2l2 2 4-4.4",
  // A screen with a play mark.
  video: "M3.5 5h13v10h-13zM8.5 7.8v4.4l3.6-2.2z",
  // Three joined nodes.
  diagram: "M5 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM15 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM6.3 5.8l7.4 3.4M6.3 14.2l7.4-3.4",
  // A page with lines.
  text: "M5.5 3h6l3 3v11h-9zM11.5 3v3h3M8 10h4.5M8 13h4.5",
  // Two chain links.
  link: "M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8",
  // An open book, as the Courses tab draws it.
  book: "M10 6.5C8.5 5 6 4.5 3 4.8v10.4c3-.3 5.5.2 7 1.8 1.5-1.6 4-2.1 7-1.8V4.8c-3-.3-5.5.2-7 1.7zm0 0V17",
  // A plus.
  add: "M10 4.5v11M4.5 10h11",
  // A padlock.
  lock: "M6 9V7a4 4 0 0 1 8 0v2M5 9h10v8H5z",
  // Arrows for the previous and next module.
  previous: "M12 5l-5 5 5 5",
  next: "M8 5l5 5-5 5",
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, size = 20, className }: { name: GlyphName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={cx("shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
