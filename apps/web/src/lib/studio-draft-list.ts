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
