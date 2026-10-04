import { isDraftKind, type DraftKind, type DraftState, type DraftSummary } from "@/lib/studio-drafts";

/**
 * The studio's conversation history, down its sidebar (phase 3 of
 * docs/STUDIO-CHAT-FIRST.md, and "Home and the full-screen conversation"
 * there): every conversation a person can open again.
 *
 * Pure, so the judgements (which drafts are worth a row, what a row is
 * called, how its state reads, which day it falls under) are tests rather
 * than view code.
 */

/**
 * The states the list asks for: every conversation but one closed for good
 * with Start over. A conversation whose diagram or video was made stays,
 * since it is where a change to it is asked for.
 */
export const LISTED_STATES: readonly DraftState[] = ["open", "briefed", "drawing", "done"];

/** How many drafts the list asks for. */
export const LIST_LIMIT = 50;

/**
 * The runner's path for the list, as the page reads it on the server; the
 * panel's own re-read asks `listDrafts` for the same thing.
 */
export function listPath(): string {
  return `/api/drafts?state=${LISTED_STATES.join(",")}&nonEmpty=1&limit=${LIST_LIMIT}`;
}

/**
 * Said on `window` when an open conversation's title, turns or state moved,
 * so the sidebar reads the list again. `detail` is `{ draftId }`.
 */
export const DRAFT_CHANGED_EVENT = "studio:draft-changed";

export function announceDraftChange(draftId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DRAFT_CHANGED_EVENT, { detail: { draftId } }));
}

export interface DraftRow {
  draftId: string;
  /** The brief's title, else the person's first message, else what it extends. */
  heading: string;
  /** True when the heading is the person's own words rather than a title. */
  quoted: boolean;
  /** The state in plain words. */
  state: string;
  briefed: boolean;
  updated: string;
  /** The kinds the draft has briefs or jobs of (STUDIO-MENTIONS.md, API), for the row's glyphs. */
  kinds: DraftKind[];
}

/** A draft's state, as the list says it. */
export function stateWords(state: DraftState, kinds: readonly DraftKind[] = []): string {
  switch (state) {
    case "briefed":
      // A video is made, not drawn; with both, the one word that covers both.
      return kinds.includes("video") ? "Ready to make" : "Ready to draw";
    case "open":
      return "In conversation";
    case "drawing":
      return "Drawing";
    case "done":
      return "Done";
    case "abandoned":
      return "Closed";
  }
}

/**
 * The rows, newest first.
 *
 * A draft in any other state is left out, whatever the runner sent: one
 * closed with Start over is gone on purpose. A draft nobody has said anything
 * in is left out by the runner (`nonEmpty=1`), not here: Start over and New
 * conversation make one, and filtering them after the runner's limit would
 * let a run of them push real rows off the list.
 */
export function draftRows(
  drafts: readonly DraftSummary[],
  titles: Readonly<Record<string, string>> = {},
): DraftRow[] {
  return drafts
    .filter((draft) => LISTED_STATES.includes(draft.state))
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .map((draft) => {
      const title = draft.title?.trim() ?? "";
      const first = draft.firstMessage?.trim() ?? "";
      const extending = draft.source === null ? null : (titles[draft.source] ?? draft.source);
      // A conversation opened from the concept tutor is about that concept,
      // which says more than its first message, often a bare "@diagram".
      const concept = typeof draft.concept?.title === "string" ? draft.concept.title.trim() : "";
      const heading =
        title !== ""
          ? title
          : concept !== ""
            ? concept
            : first !== ""
              ? first
              : extending !== null
                ? `Extending ${extending}`
                : "A conversation with no brief yet";
      const kinds = Array.isArray(draft.kinds) ? [...new Set(draft.kinds.filter(isDraftKind))] : [];
      return {
        draftId: draft.draftId,
        heading,
        quoted: title === "" && concept === "" && first !== "",
        state: stateWords(draft.state, kinds),
        briefed: draft.state === "briefed",
        updated: draft.updated,
        kinds,
      };
    });
}

/**
 * A search text as the runner compares it (`searchText` in the runner's
 * `drafts.ts`): whitespace runs as one space, trimmed, lower-cased.
 */
export function searchText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Whether a draft is a hit for `q`: its title, first message or concept
 * title contains it, in any case. The runner filters by the same rule before
 * its limit; applying it here as well means a runner that predates `q`, which
 * ignores it, still shows only matches (of the page it sent).
 */
export function draftMatches(draft: Pick<DraftSummary, "title" | "firstMessage" | "concept">, q: string): boolean {
  const needle = searchText(q);
  if (needle === "") return true;
  return [draft.title, draft.firstMessage, draft.concept?.title].some(
    (field) => typeof field === "string" && searchText(field).includes(needle),
  );
}

/** A search hit: the row, and the words around the match when its heading does not hold it. */
export interface SearchRow extends DraftRow {
  /** The first message or the concept's title, cut around the match, when the heading is something else. Null when the heading holds the match. */
  snippet: string | null;
}

/** How many characters of a snippet come before the match, so a long first message shows it. */
const SNIPPET_LEAD = 24;

/**
 * The drafts that match `q` as rows, newest first and in one run (a search
 * has no day headings): each with a snippet when the match is in words the
 * heading is not showing, such as a first message under a brief's title.
 */
export function searchRows(
  drafts: readonly DraftSummary[],
  titles: Readonly<Record<string, string>>,
  q: string,
): SearchRow[] {
  const needle = searchText(q);
  const hits = drafts.filter((draft) => draftMatches(draft, needle));
  const byId = new Map(hits.map((draft) => [draft.draftId, draft]));
  return draftRows(hits, titles).map((row) => {
    const draft = byId.get(row.draftId);
    if (draft === undefined || searchText(row.heading).includes(needle)) return { ...row, snippet: null };
    const field = [draft.concept?.title, draft.firstMessage].find(
      (text): text is string => typeof text === "string" && searchText(text).includes(needle),
    );
    return { ...row, snippet: field === undefined ? null : excerpt(field, needle) };
  });
}

/** `text` on one line, starting a little before the first match, with an ellipsis when that cut something. */
function excerpt(text: string, needle: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  const at = line.toLowerCase().indexOf(needle);
  return at > SNIPPET_LEAD ? `…${line.slice(at - SNIPPET_LEAD)}` : line;
}

/** A run of text, and whether it is the part that matched. */
export interface TextPart {
  text: string;
  hit: boolean;
}

/**
 * `text` cut into the parts that match `q` (in any case) and the parts that
 * do not, in order, so a row can mark what was found. No match gives the
 * whole text as one part that is not a hit.
 */
export function matchParts(text: string, q: string): TextPart[] {
  const needle = searchText(q);
  if (needle === "") return [{ text, hit: false }];
  // Each space in the search is any run of whitespace in the text, as the
  // runner's comparison treats it.
  const source = needle
    .split(" ")
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const parts: TextPart[] = [];
  let from = 0;
  for (const found of text.matchAll(new RegExp(source, "gi"))) {
    if (found[0] === "") continue;
    if (found.index > from) parts.push({ text: text.slice(from, found.index), hit: false });
    parts.push({ text: found[0], hit: true });
    from = found.index + found[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts.length === 0 ? [{ text, hit: false }] : parts;
}

/** A run of rows under one heading: the day they were last touched. */
export interface HistoryGroup {
  label: string;
  rows: DraftRow[];
}

const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"] as const;

/**
 * The rows under day headings, as a chat app's history reads: Today,
 * Yesterday, the previous 7 days, the previous 30, and Older, by the local
 * calendar day of `updated` against `now`. Keeps the rows' order, so the
 * groups come newest first; an empty group is left out.
 */
export function historyGroups(rows: readonly DraftRow[], now: Date): HistoryGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86_400_000;
  const groups = new Map<string, DraftRow[]>();
  for (const row of rows) {
    const at = new Date(row.updated);
    const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
    // Calendar days, rounded: a day across a clock change is 23 or 25 hours.
    const ago = Number.isNaN(day) ? Infinity : Math.round((today - day) / DAY);
    const label = ago <= 0 ? GROUPS[0] : ago === 1 ? GROUPS[1] : ago <= 7 ? GROUPS[2] : ago <= 30 ? GROUPS[3] : GROUPS[4];
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return GROUPS.flatMap((label) => {
    const grouped = groups.get(label);
    return grouped === undefined ? [] : [{ label, rows: grouped }];
  });
}

/** One page of the runner's list, after `before` (or the newest), or null when it did not answer. */
export type HistoryPage = (before: { updated: string; draftId: string } | undefined) => Promise<DraftSummary[] | null>;

/**
 * The newest `pages` pages of the history, read again from the top, each
 * page starting after the last row of the one before. Read whole on every
 * refresh rather than refreshing the first page and keeping the rest: a
 * conversation that moved up pushes the old last row of a page onto the
 * next, and one closed with Start over has to leave whichever page held it.
 * `more` is whether the last page read was full, so the runner may have
 * older rows still. Null when any page fails: what is shown stays.
 */
export async function readHistory(pages: number, page: HistoryPage, limit = LIST_LIMIT): Promise<{ drafts: DraftSummary[]; more: boolean } | null> {
  const drafts: DraftSummary[] = [];
  let before: { updated: string; draftId: string } | undefined;
  for (let at = 0; at < Math.max(pages, 1); at += 1) {
    const rows = await page(before);
    if (rows === null) return null;
    drafts.push(...rows);
    const last = rows.at(-1);
    if (rows.length < limit || last === undefined) return { drafts, more: false };
    before = { updated: last.updated, draftId: last.draftId };
  }
  return { drafts, more: true };
}
