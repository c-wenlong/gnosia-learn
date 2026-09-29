/**
 * Which courses have a cover photo, and where it is served from.
 *
 * A cover is `apps/web/public/course-covers/<slug>.webp` (960x540, 16:9), with
 * its source and licence in `CREDITS.md` beside it. The set is written down
 * rather than read off the folder at request time: a page that opens a file
 * under a computed path makes Turbopack trace the whole repository into the
 * server bundle (AGENTS.md, Gotchas), and on a host that serves `public/`
 * from a CDN the folder is not there to read. `course-covers.test.ts` fails
 * when the set and the folder disagree, so adding a photo means adding its
 * slug here.
 *
 * A course with no cover draws the code placeholder in its place.
 */
export const COURSE_COVERS: ReadonlySet<string> = new Set<string>([
  "cp4281",
  "cp4282",
  "cp4283",
  "cp4284",
  "cp4285",
  "cs2111",
  "cs3216",
  "cs3227",
  "cs3249",
  "cs4263",
]);

export const COVER_DIR = "/course-covers";

/** The cover's public path, or null when the course has none. */
export function coverSrc(slug: string): string | null {
  return COURSE_COVERS.has(slug) ? `${COVER_DIR}/${slug}.webp` : null;
}
