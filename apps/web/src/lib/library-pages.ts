import type { MasteryBucket } from "@/lib/mastery-bucket";
import { compareSortKeys, type LibrarySort, type SortKey } from "@/lib/library";

/**
 * The Library in pages (L9 of docs/proposals/library-by-type-and-day.md).
 *
 * The page draws the first page of rows with the real headings and counts,
 * and hands the reader a cursor; scrolling (or Show older) asks the server
 * for the page after it. A page is `PAGE_SIZE` rows, rounded up to finish
 * the group (the day, course, topic or conversation) it ends in, so a heading
 * is not split, unless that would take the page past `PAGE_MAX`: a day of
 * two hundred imports is split, and its rows go on under the one heading on
 * the next page.
 *
 * **The cursor is the last row's place, never an offset.** It names the
 * group and the course module the row sat in and the row's sort key
 * (`sortKeyOf`), so a row added or removed above it does not shift the next
 * page onto rows already drawn or past ones never drawn. The next page starts
 * at the first row after that place: after the row itself when it is still
 * there, else after where it would sort. A cursor whose group has gone (the
 * last asset of a day deleted, a topic renamed) cannot be placed, and the
 * answer says the Library changed rather than guessing.
 *
 * **The groups keep the order the first page saw.** A conversation written
 * to, or a topic whose prerequisites changed, can move ahead of the group
 * the cursor sits in, and the rows it holds would then be behind the cursor
 * and never drawn. So the first page hands over its groups' order (`order`),
 * the reader sends it back with every cursor, and later pages follow it: a
 * group that moved stays where the reader expects it, and a group that did
 * not exist then (a new day) is left for the next visit, like any row added
 * above the cursor.
 *
 * Pure and React-free: the page and the server function both call it, and so
 * does a test.
 */

/** Rows a page aims for. */
export const PAGE_SIZE = 50;

/** The most rows a page may hold when it is rounded up to finish its last group. */
export const PAGE_MAX = 100;

/** A group as the page draws it: a day's (`dayGroups`) or one of `@/lib/library-groups`'. */
export interface PageGroup<T> {
  key: string;
  label: string;
  detail?: string;
  bucket?: MasteryBucket;
  rows: T[];
  sections?: { key: string; label: string; rows: T[] }[];
}

/** Where the last row drawn sits: its group, its course module when the grouping has them, and its sort key. */
export interface PageCursor {
  group: string;
  section: string | null;
  key: SortKey;
}

/** A heading's words and its whole count, which a page that holds part of the group still shows. */
export interface PieceHeading {
  key: string;
  label: string;
  detail?: string;
  bucket?: MasteryBucket;
  count: number;
}

/**
 * A run of one page's rows that share a group (and a module): the client
 * folds the pieces of every page it holds into one heading per group, so a
 * group split across two pages goes on under its heading rather than
 * repeating it.
 */
export interface PagePiece<T> {
  group: PieceHeading;
  /** The module inside a course group, or null for a grouping without them. */
  section: PieceHeading | null;
  rows: T[];
}

export interface LibraryPage<T> {
  state: "ok";
  pieces: PagePiece<T>[];
  /** Every group's key in the order drawn, on the first page only: what later pages follow. */
  order?: string[];
  /** The cursor for the page after this one, or null when this was the last. */
  next: string | null;
  /** Rows after this page, for the skeletons the next one shows while it loads. */
  remaining: number;
}

/** The cursor's place cannot be found: the Library changed under the reader. */
export interface StalePage {
  state: "stale";
}

interface Slot<T> {
  group: number;
  section: number;
  row: T;
  key: SortKey;
}

/**
 * The page of `given` after `after` (the first page when null), its rows'
 * order and grouping exactly as drawn in full. `keyOf` is `sortKeyOf`, and
 * `sort` the order the rows inside each group were sorted by; `order`, when
 * the reader sent the first page's back, puts the groups in that order.
 */
export function pageOf<T>(
  given: readonly PageGroup<T>[],
  keyOf: (row: T) => SortKey,
  sort: LibrarySort,
  after: PageCursor | null,
  options: { size?: number; max?: number; order?: readonly string[] | null } = {},
): LibraryPage<T> | StalePage {
  const size = Math.max(1, options.size ?? PAGE_SIZE);
  const max = Math.max(size, options.max ?? PAGE_MAX);
  const groups = options.order == null ? given : inOrder(given, options.order);
  const slots: Slot<T>[] = [];
  // The first and last slot of each group, to finish one and to say where a heading starts.
  const spans: { first: number; last: number }[] = [];
  groups.forEach((group, g) => {
    const first = slots.length;
    if (group.sections === undefined) {
      for (const row of group.rows) slots.push({ group: g, section: -1, row, key: keyOf(row) });
    } else {
      group.sections.forEach((section, s) => {
        for (const row of section.rows) slots.push({ group: g, section: s, row, key: keyOf(row) });
      });
    }
    spans.push({ first, last: slots.length - 1 });
  });

  let start = 0;
  if (after !== null) {
    const found = startAfter(groups, slots, after, sort);
    if (found === null) return { state: "stale" };
    start = found;
  }

  let end = Math.min(start + size, slots.length);
  if (end < slots.length && end > start) {
    const groupEnd = spans[slots[end - 1].group].last + 1;
    if (groupEnd - start <= max) end = groupEnd;
  }

  const pieces: PagePiece<T>[] = [];
  for (let i = start; i < end; i++) {
    const slot = slots[i];
    const last = pieces[pieces.length - 1];
    const sameRun =
      last !== undefined && last.group.key === groups[slot.group].key && (last.section?.key ?? null) === sectionKey(groups, slot);
    if (sameRun) {
      last.rows.push(slot.row);
      continue;
    }
    const group = groups[slot.group];
    const section = slot.section === -1 ? undefined : group.sections?.[slot.section];
    pieces.push({
      group: heading(group),
      section: section === undefined ? null : { key: section.key, label: section.label, count: section.rows.length },
      rows: [slot.row],
    });
  }

  const lastSlot = end > start ? slots[end - 1] : undefined;
  const next =
    end < slots.length && lastSlot !== undefined
      ? encodeCursor({ group: groups[lastSlot.group].key, section: sectionKey(groups, lastSlot), key: lastSlot.key })
      : null;
  return {
    state: "ok",
    pieces,
    ...(after === null ? { order: groups.map((group) => group.key) } : {}),
    next,
    remaining: slots.length - end,
  };
}

/** `groups` in the order the first page saw them; one it did not see is left out. */
function inOrder<T>(groups: readonly PageGroup<T>[], order: readonly string[]): PageGroup<T>[] {
  const byKey = new Map(groups.map((group) => [group.key, group]));
  return [...new Set(order)].flatMap((key) => {
    const group = byKey.get(key);
    return group === undefined ? [] : [group];
  });
}

/**
 * The most group keys an order from the reader may hold, and the longest key.
 *
 * A group holds at least one row, so the Library can draw no more groups than
 * the rows it reads, and this is the same figure as its read limit
 * (`LIBRARY_ROW_CAP` in `@/lib/asset-library`, which this pure module cannot
 * import). Grouped by conversation, ten thousand rows can be five thousand
 * groups, and an order any shorter than the rows would be refused as stale.
 */
export const MAX_ORDER = 20_000;
const MAX_KEY = 1_000;

/**
 * The groups' order back from the reader, checked, since it came from the
 * browser: undefined when none was sent, null when what was sent is not a
 * list of distinct keys.
 */
export function parseOrder(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ORDER) return null;
  if (!value.every((key) => typeof key === "string" && key.length <= MAX_KEY)) return null;
  // A key twice would draw its group twice, and make the page's work grow
  // with the list rather than with the library.
  if (new Set(value).size !== value.length) return null;
  return value as string[];
}

function heading<T>(group: PageGroup<T>): PieceHeading {
  return {
    key: group.key,
    label: group.label,
    ...(group.detail === undefined ? {} : { detail: group.detail }),
    ...(group.bucket === undefined ? {} : { bucket: group.bucket }),
    count: group.rows.length,
  };
}

function sectionKey<T>(groups: readonly PageGroup<T>[], slot: Slot<T>): string | null {
  return slot.section === -1 ? null : (groups[slot.group].sections?.[slot.section]?.key ?? null);
}

/** The index of the first slot after the cursor's place, or null when its group or module is gone. */
function startAfter<T>(
  groups: readonly PageGroup<T>[],
  slots: readonly Slot<T>[],
  after: PageCursor,
  sort: LibrarySort,
): number | null {
  const g = groups.findIndex((group) => group.key === after.group);
  if (g === -1) return null;
  const sections = groups[g].sections;
  let s = -1;
  if (after.section !== null) {
    if (sections === undefined) return null;
    s = sections.findIndex((section) => section.key === after.section);
    if (s === -1) return null;
  } else if (sections !== undefined) {
    return null;
  }
  // The row itself, when it is still where it was.
  const at = slots.findIndex((slot) => slot.group === g && slot.section === s && slot.key.id === after.key.id);
  if (at !== -1) return at + 1;
  // Else the first row that sorts after its place.
  const later = slots.findIndex(
    (slot) =>
      slot.group > g ||
      (slot.group === g && (slot.section > s || (slot.section === s && compareSortKeys(slot.key, after.key, sort) > 0))),
  );
  return later === -1 ? slots.length : later;
}

/** The cursor as the string the page hands the reader. */
export function encodeCursor(cursor: PageCursor): string {
  const { at, title, kind, id } = cursor.key;
  return JSON.stringify({ g: cursor.group, s: cursor.section, k: [at, title, kind, id] });
}

/**
 * A cursor back from the reader, checked field by field, since it came from
 * the browser: null for anything that is not one `encodeCursor` wrote.
 */
export function parseCursor(value: unknown): PageCursor | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const { g, s, k } = raw as Record<string, unknown>;
  if (typeof g !== "string" || (s !== null && typeof s !== "string") || !Array.isArray(k) || k.length !== 4) return null;
  const [at, title, kind, id] = k as unknown[];
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (typeof title !== "string" || typeof kind !== "string" || typeof id !== "string") return null;
  return { group: g, section: s, key: { at, title, kind, id } };
}

/** One heading's rows as drawn from every page held: its modules in order, each with its rows. */
export interface FoldedGroup<T> {
  group: PieceHeading;
  sections: { section: PieceHeading | null; rows: T[] }[];
}

/**
 * The pieces of every page the reader holds, folded into one heading per
 * group and one per module, in the order they arrived: a group the second
 * page goes on with is appended to, not drawn again. Keyed rather than only
 * joined to its neighbour, so a group that turns up again after the Library
 * changed under the reader still has one heading.
 */
export function foldPieces<T>(pieces: readonly PagePiece<T>[]): FoldedGroup<T>[] {
  const folded: FoldedGroup<T>[] = [];
  const byKey = new Map<string, FoldedGroup<T>>();
  for (const piece of pieces) {
    let group = byKey.get(piece.group.key);
    if (group === undefined) {
      group = { group: piece.group, sections: [] };
      byKey.set(piece.group.key, group);
      folded.push(group);
    }
    const sectionKey = piece.section?.key ?? null;
    const section = group.sections.find((s) => (s.section?.key ?? null) === sectionKey);
    if (section === undefined) group.sections.push({ section: piece.section, rows: [...piece.rows] });
    else section.rows.push(...piece.rows);
  }
  return folded;
}

/* -------------------------------------------------------------------------- */
/* Back and forward                                                           */
/* -------------------------------------------------------------------------- */

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
