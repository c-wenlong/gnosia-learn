/**
 * The Library's back and forward (L9 of docs/proposals/library-by-type-and-day.md):
 * how many pages the reader had drawn and where they had scrolled, kept per
 * view in session storage, and whether a list that mounts was reached by
 * back, forward or a reload and so should draw them again. Browser-side
 * helpers, apart from the server pagination in `@/lib/library-pages` (S6-16
 * of the library audit). Pure, so the list and a test both call them.
 */
/** How many pages the reader had drawn and where they had scrolled, kept per view for back and forward. */
export interface HeldPages {
  pages: number;
  y: number;
}

/** The session storage key for one view's held pages: its URL, `?open=` aside (`libraryHref` never writes it). */
export function heldPagesKey(href: string): string {
  return `library-pages:${href}`;
}

/** The most pages a restore will ask for, so a stored count cannot set off a long run of requests. */
export const MAX_RESTORED_PAGES = 40;

/** What session storage held, checked: null for anything that is not a count above one and a scroll offset. */
export function parseHeldPages(raw: string | null): HeldPages | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { pages, y } = value as Record<string, unknown>;
  if (typeof pages !== "number" || !Number.isInteger(pages) || pages < 1) return null;
  if (typeof y !== "number" || !Number.isFinite(y) || y < 0) return null;
  return { pages: Math.min(pages, MAX_RESTORED_PAGES), y };
}

/** How recent a popstate must be for a list that mounts to count as reached by back or forward. */
export const POP_WINDOW_MS = 2_000;

/**
 * Whether a URL is the Library view `href` names (`libraryHref`), whatever
 * order its parameters are in and whether a row is open in the previewer.
 */
export function sameLibraryView(url: string, href: string): boolean {
  const view = (value: string) => {
    let parsed: URL;
    try {
      parsed = new URL(value, "http://library.invalid");
    } catch {
      return null;
    }
    parsed.searchParams.delete("open");
    parsed.searchParams.sort();
    return `${parsed.pathname}?${parsed.searchParams.toString()}`;
  };
  const a = view(url);
  return a !== null && a === view(href);
}

/**
 * Whether a list that just mounted was reached by back or forward (or a
 * reload), and so should draw as many pages as it held and scroll to where
 * it was: a popstate moments ago to this very view (the app router's back),
 * or a document loaded that way when this is its first list. A link or a
 * fresh visit starts at the first page, a link followed moments after a
 * back to some other page included.
 */
export function cameBack(input: {
  now: number;
  lastPop: { at: number; url: string } | null;
  href: string;
  navigation: string | null;
  firstMount: boolean;
}): boolean {
  const pop = input.lastPop;
  if (pop !== null && input.now - pop.at >= 0 && input.now - pop.at < POP_WINDOW_MS) {
    return sameLibraryView(pop.url, input.href);
  }
  return input.firstMount && (input.navigation === "back_forward" || input.navigation === "reload");
}
