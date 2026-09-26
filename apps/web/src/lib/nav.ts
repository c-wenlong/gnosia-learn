/**
 * The five destinations of the top bar and the phone tab bar, and which one a
 * path belongs to. Settings and Studio are not destinations: they live behind
 * the avatar menu (docs/design/DESIGN.md, "Information architecture").
 *
 * React-free so the shell's client components and a test can share it.
 */

export type DestinationKey = "today" | "courses" | "learn" | "library" | "review";

export interface Destination {
  key: DestinationKey;
  label: string;
  href: string;
}

export const DESTINATIONS: readonly Destination[] = [
  { key: "today", label: "Today", href: "/today" },
  { key: "courses", label: "Courses", href: "/courses" },
  { key: "learn", label: "Learn", href: "/learn" },
  { key: "library", label: "Library", href: "/library" },
  { key: "review", label: "Review", href: "/review" },
];

/**
 * The destination a path sits under, or null for one outside all five.
 *
 * A prefix match on a whole segment, so `/courses/cp4281/m1` is still Courses
 * (a nav item that unhighlights the moment you open something from it reads as
 * having navigated away) and `/learning` would not be Learn. `/` itself is the
 * public landing page and belongs to no destination.
 */
export function activeDestination(pathname: string | null | undefined): DestinationKey | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0];
  for (const d of DESTINATIONS) {
    if (path === d.href || path.startsWith(`${d.href}/`)) return d.key;
  }
  return null;
}
