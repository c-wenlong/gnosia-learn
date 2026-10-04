import type { DestinationKey } from "@/lib/nav";

/**
 * The phone tab bar's icons, one per destination. The hi-fi draws a grey disc
 * in each slot as a stand-in; these are plain 20px outline glyphs in the
 * current text colour, so the active tab's colour change carries to them.
 */
const PATHS: Record<DestinationKey, string> = {
  // A house: the dashboard.
  home: "M3.5 9.5 10 4l6.5 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-4V17H4.5a1 1 0 0 1-1-1z",
  // An open book.
  courses: "M10 6.5C8.5 5 6 4.5 3 4.8v10.4c3-.3 5.5.2 7 1.8 1.5-1.6 4-2.1 7-1.8V4.8c-3-.3-5.5.2-7 1.7zm0 0V17",
  // A light bulb.
  learn: "M7.5 14.5h5M8 17h4M10 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z",
  // Four tiles.
  library: "M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z",
};

export function NavIcon({ name, className }: { name: DestinationKey; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
