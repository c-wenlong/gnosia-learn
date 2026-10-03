/**
 * The top bar's destinations and the phone tab bar's, and which one a path
 * belongs to. Five destinations are always there (`DESTINATIONS`, the tab
 * bar's whole list). Studio is a sixth in the top bar only, and only when this
 * deployment has a studio (`topBarDestinations`), because it is an author tool
 * that is desktop first and 404s without `STUDIO_ENABLED`. Settings is not a
 * destination: it lives behind the avatar menu (docs/design/DESIGN.md,
 * "Information architecture").
 *
 * React-free so the shell's client components and a test can share it.
 */

/** The five destinations the phone tab bar draws, each with an icon. */
export type DestinationKey = "home" | "courses" | "learn" | "library" | "review";

/** Every key `activeDestination` can answer with: the five, and Studio. */
export type NavKey = DestinationKey | "studio";

export interface Destination<K extends string = DestinationKey> {
  key: K;
  label: string;
  href: string;
}

/** The phone tab bar's list. Studio is deliberately not in it. */
export const DESTINATIONS: readonly Destination[] = [
  { key: "home", label: "Home", href: "/home" },
  { key: "courses", label: "Courses", href: "/courses" },
  { key: "learn", label: "Learn", href: "/learn" },
  { key: "library", label: "Library", href: "/library" },
  { key: "review", label: "Review", href: "/review" },
];

/** The sixth destination, shown from 768px up when the studio is enabled. */
export const STUDIO_DESTINATION: Destination<"studio"> = { key: "studio", label: "Studio", href: "/studio" };

/**
 * What the top bar's primary nav lists: the five, then Studio when `studio`
 * (the server's `studioEnabled()`, passed down as a prop).
 */
export function topBarDestinations(studio: boolean): readonly Destination<NavKey>[] {
  return studio ? [...DESTINATIONS, STUDIO_DESTINATION] : DESTINATIONS;
}

/**
 * The destination a path sits under, or null for one outside all of them.
 * Studio is matched whether or not the deployment has one: the top bar only
 * draws it when it does, and a disabled studio's routes 404 anyway.
 *
 * A prefix match on a whole segment, so `/courses/cp4281/m1` is still Courses
 * (a nav item that unhighlights the moment you open something from it reads as
 * having navigated away) and `/learning` would not be Learn. `/` itself is the
 * public landing page and belongs to no destination.
 */
export function activeDestination(pathname: string | null | undefined): NavKey | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0];
  for (const d of topBarDestinations(true)) {
    if (path === d.href || path.startsWith(`${d.href}/`)) return d.key;
  }
  return null;
}
