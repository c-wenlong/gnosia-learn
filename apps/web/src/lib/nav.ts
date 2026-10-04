/**
 * The sidebar's destinations, and which one a path belongs to.
 *
 * The sidebar opens with New chat when this deployment has a studio
 * (`STUDIO_DESTINATION`, which is `/studio`, the studio's home and its
 * composer), then the five learning destinations (`DESTINATIONS`), then the
 * studio's conversations. Studio is not one of the five because it is where
 * things are made, drawn as the first action rather than as a peer of the
 * pages that support learning, and because it 404s without `STUDIO_ENABLED`.
 * Settings is not a destination: it lives behind the account menu at the
 * foot of the sidebar (docs/design/DESIGN.md, "Information architecture").
 *
 * React-free so the shell's client components and a test can share it.
 */

/** The five learning destinations, each with an icon. */
export type DestinationKey = "home" | "courses" | "learn" | "library" | "review";

/** Every key `activeDestination` can answer with: the five, and Studio. */
export type NavKey = DestinationKey | "studio";

export interface Destination<K extends string = DestinationKey> {
  key: K;
  label: string;
  href: string;
}

/** The sidebar's list under New chat. Studio is deliberately not in it. */
export const DESTINATIONS: readonly Destination[] = [
  { key: "home", label: "Home", href: "/home" },
  { key: "courses", label: "Courses", href: "/courses" },
  { key: "learn", label: "Learn", href: "/learn" },
  { key: "library", label: "Library", href: "/library" },
  { key: "review", label: "Review", href: "/review" },
];

/** The studio, which the sidebar draws as New chat when the deployment has one. */
export const STUDIO_DESTINATION: Destination<"studio"> = { key: "studio", label: "Studio", href: "/studio" };

/**
 * The destination a path sits under, or null for one outside all of them.
 * Studio is matched whether or not the deployment has one: the sidebar only
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
  for (const d of [...DESTINATIONS, STUDIO_DESTINATION]) {
    if (path === d.href || path.startsWith(`${d.href}/`)) return d.key;
  }
  return null;
}
