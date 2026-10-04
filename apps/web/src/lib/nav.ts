/**
 * The sidebar's destinations, and which one a path belongs to.
 *
 * The sidebar opens with New chat when this deployment has a studio
 * (`STUDIO_DESTINATION`, which is `/studio`, the studio's home and its
 * composer), then the four learning destinations (`DESTINATIONS`), then the
 * studio's conversations. Studio is not one of the four because it is where
 * things are made, drawn as the first action rather than as a peer of the
 * pages that support learning, and because it 404s without `STUDIO_ENABLED`.
 * Settings is not a destination: it lives behind the account menu at the
 * foot of the sidebar (docs/design/DESIGN.md, "Information architecture").
 *
 * Review is not a destination either (2026-10-04). `/review` still exists,
 * reached from a concept page's Review now and Home's Recall these, but the
 * sidebar does not offer the whole queue: the chat, the studio and the
 * videos never make a review card, so a top-level Review was a window onto
 * something the product's main surfaces cannot fill
 * (docs/proposals/recall-in-chat.md).
 *
 * React-free so the shell's client components and a test can share it.
 */

/** The four learning destinations, each with an icon. */
export type DestinationKey = "home" | "courses" | "learn" | "library";

/** Every key `activeDestination` can answer with: the four, and Studio. */
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
 * public landing page and belongs to no destination, and so does `/review`,
 * which opens in focus layout with no sidebar to highlight.
 */
export function activeDestination(pathname: string | null | undefined): NavKey | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0];
  for (const d of [...DESTINATIONS, STUDIO_DESTINATION]) {
    if (path === d.href || path.startsWith(`${d.href}/`)) return d.key;
  }
  return null;
}

/** A path with its escapes undone, or as it is when one is malformed. */
function decoded(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Whether a row in the sidebar's Courses, Pinned or Recent sections is the
 * page on screen, which draws it on `--surface2` as the current destination
 * is drawn. Compared with the escapes undone on both sides, since a row's
 * link escapes an asset id (`/library/video%3Aabc`) and a path may arrive
 * either way.
 *
 * `within` also counts the pages under the row's: a module's row stays
 * current on its week check. A course page's row and a library or concept
 * row are current on that page alone, so opening a module does not leave its
 * course's row lit as well.
 *
 * A studio conversation is not decided here: `/studio?draft=` is one path
 * for every conversation, and the studio page says which is open
 * (`StudioChats.active`).
 */
export function isCurrentRow(href: string, pathname: string | null | undefined, within = false): boolean {
  if (!pathname) return false;
  const path = decoded(pathname.split(/[?#]/)[0]);
  const target = decoded(href.split(/[?#]/)[0]);
  return path === target || (within && path.startsWith(`${target}/`));
}
