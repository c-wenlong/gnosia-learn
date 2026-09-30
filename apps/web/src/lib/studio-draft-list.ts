import { isDraftKind, type DraftKind, type DraftState, type DraftSummary } from "@/lib/studio-drafts";

/**
 * The drafts list above the studio's grid (phase 3 of
 * docs/STUDIO-CHAT-FIRST.md): the conversations a person can pick up again.
 *
 * Pure, so the judgements (which drafts are worth a row, what a row is
 * called, how its state reads) are tests rather than view code.
 */

/** The states the list asks for: a conversation still talking, or holding a brief nobody drew. */
export const LISTED_STATES: readonly DraftState[] = ["open", "briefed"];

/** How many drafts the list asks for. */
export const LIST_LIMIT = 50;

/**
 * The runner's path for the list, as the page reads it on the server; the
 * panel's own re-read asks `listDrafts` for the same thing.
 */
export function listPath(): string {
  return `/api/drafts?state=${LISTED_STATES.join(",")}&nonEmpty=1&limit=${LIST_LIMIT}`;
}

/** How many rows show before "Show more". */
export const LIST_ROWS = 4;

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
 * A draft in any other state is left out, whatever the runner sent, since
 * the list is for conversations that can still go somewhere. A draft nobody
 * has said anything in is left out by the runner (`nonEmpty=1`), not here:
 * pressing the plus card and closing the panel makes one, and filtering them
 * after the runner's limit would let a run of them push real rows off the
 * list.
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
