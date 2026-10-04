import { cx } from "./classes";

/**
 * The kit's glyphs: 20px outline paths in the current text colour, every one
 * at the same stroke width. Moved here from the course page
 * (`course-home/icons.tsx`, which re-exports them) so the studio's @ menu,
 * its chips and its suggestion buttons draw the same `diagram` and `video`
 * without importing from another page (docs/STUDIO-MENTIONS.md, phase 2b).
 * A mark drawn by hand in more than one place belongs here instead (the tick,
 * the close cross, the chevron, the magnifier), and so do the tab bar's
 * (`shell/NavIcon.tsx` maps its destinations onto these). No state and no
 * hooks, so a server component can render them too.
 *
 * Outline only: a filled mark (the video player's play) passes
 * `className="fill-current"`, which the stroke then rounds at the corners.
 */
const PENCIL = "M12.8 4.7l2.5 2.5-7.6 7.6-3.2.7.7-3.2zM11.3 6.2l2.5 2.5";

const PATHS = {
  // A house: Home in the sidebar.
  home: "M3.5 9.5 10 4l6.5 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-4V17H4.5a1 1 0 0 1-1-1z",
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
  // A pencil: a problem to work.
  practice: PENCIL,
  // The same pencil, as an edit button's mark.
  pencil: PENCIL,
  // A plus.
  add: "M10 4.5v11M4.5 10h11",
  // An arrow, for the box composer's round Send.
  send: "M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5",
  // A padlock.
  lock: "M6 9V7a4 4 0 0 1 8 0v2M5 9h10v8H5z",
  // A clipboard with a tick: a module's week check.
  check: "M7 4H5v13h10V4h-2M7.5 3h5v2.5h-5zM7.5 11.5l1.8 1.8 3.4-3.6",
  // Arrows for the previous and next module.
  previous: "M12 5l-5 5 5 5",
  next: "M8 5l5 5-5 5",
  // A bare tick: what a menu has selected, a step that passed, a video watched.
  tick: "M4.5 10.5l3.5 3.5 7.5-8.5",
  // A cross: close a dialog or a drawer, remove a chip.
  close: "M5 5l10 10M15 5 5 15",
  // A chevron pointing down: a fold or a menu that opens. Rotate it for up.
  chevron: "M5 7.5l5 5 5-5",
  // A magnifier: search.
  search: "M9 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM13.2 13.2l3.3 3.3",
  // A triangle pointing right: play. Filled by the caller (`fill-current`).
  play: "M6.5 4.5v11l9-5.5z",
  // Three bars, the last one short: open the sidebar on a phone.
  menu: "M3.5 5.5h13M3.5 10h13M3.5 14.5h8",
  // Two sliders: the Settings page's General tab.
  sliders: "M4 6.5h6M14 6.5h2M4 13.5h2M10 13.5h6M12 4.5v4M8 11.5v4",
  // A head and shoulders: the Settings page's Profile tab.
  person: "M10 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 16.5c.8-2.8 3.2-4.3 6-4.3s5.2 1.5 6 4.3",
  // A speech bubble: the Settings page's Tutor tab.
  chat: "M4 4.5h12v8.5H9.5L6 16v-3H4z",
  // A stack of disks: the Settings page's Data tab.
  data: "M4 5.5c0-1.1 2.7-2 6-2s6 .9 6 2-2.7 2-6 2-6-.9-6-2zM4 5.5v9c0 1.1 2.7 2 6 2s6-.9 6-2v-9M4 10c0 1.1 2.7 2 6 2s6-.9 6-2",
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
