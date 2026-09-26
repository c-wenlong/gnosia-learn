/**
 * The Gnosia mark, redrawn flat from the owner's logo sheet
 * (docs/design/brand/logo-sheet.png): a ribbon G whose lower half fans out
 * into an open book, with a four-point star in the counter.
 *
 * Three fills on a 64 unit grid, no strokes, so it holds at a 16px favicon:
 *
 * - the ribbon, `currentColor`, so the caller picks it (`text-brand-teal`);
 * - the pages, `--brand-cream`, cream in both themes, always inside the
 *   ribbon so they never sit directly on a cream ground;
 * - the star, `--brand-gold`.
 *
 * Sized with `size`, or with a class (`size-[1.9em]`), which wins over the
 * attributes. Construction notes: docs/design/BRAND.md. No hooks: safe in a
 * server component.
 */

/**
 * The ribbon: the flag-cut terminal at the top right, the thick bowl round the
 * left, the two leaves meeting in a point at the bottom, and the arm that
 * comes in from the right with a pointed tip. The counter is part of the one
 * contour, so no fill rule is needed.
 */
export const MARK_G =
  "M62 4L36 4C18 4 4 15 4 31L4 40C4 48 12 52 21 55L32 61L43 55C52 52 60 48 60 40L60 33" +
  "C60 27 55 23 46 21L51 34C44 40 37 44 32 48C26 43 20 39 17 35C12 24 20 13 34 13L54 13Z";
/** The book: two fanned pages a side, thin at the spine and wide at the outer edge. */
export const MARK_BOOK =
  "M32 48.5C23 41 14 36 5.5 34.5L6 40C14 41.5 23 45.5 32 51Z" +
  "M32 48.5C41 41 50 36 58.5 34.5L58 40C50 41.5 41 45.5 32 51Z" +
  "M32 53C23.5 47.5 15 44 8 43.5L8.5 47.5C16 48.5 24 51.5 32 55.5Z" +
  "M32 53C40.5 47.5 49 44 56 43.5L55.5 47.5C48 48.5 40 51.5 32 55.5Z";
/** The star: four points, concave sides, centred in the counter at (32, 29). */
export const MARK_STAR = "M32 19Q33.8 27.3 41.5 29Q33.8 30.7 32 39Q30.2 30.7 22.5 29Q30.2 27.3 32 19Z";

export function GnosiaMark({
  size = 32,
  className,
  title,
}: {
  size?: number;
  className?: string;
  /** An accessible name. Without it the mark is decorative and hidden. */
  title?: string;
}) {
  const a11y = title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true, focusable: "false" } as const);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...a11y}
    >
      {title ? <title>{title}</title> : null}
      <path d={MARK_G} fill="currentColor" />
      <path d={MARK_BOOK} fill="var(--brand-cream)" />
      <path d={MARK_STAR} fill="var(--brand-gold)" />
    </svg>
  );
}
