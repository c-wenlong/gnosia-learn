import type { DraftState, DraftSummary } from "@/lib/studio-drafts";

/**
 * The drafts list above the studio's grid (phase 3 of
 * docs/STUDIO-CHAT-FIRST.md): the conversations a person can pick up again.
 *
 * Pure, so the judgements (which drafts are worth a row, what a row is
 * called, how its state reads) are tests rather than view code.
 */

/** The states the list asks for: a conversation still talking, or holding a brief nobody drew. */
export const LISTED_STATES: readonly DraftState[] = ["open", "briefed"];

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
}

/** A draft's state, as the list says it. */
export function stateWords(state: DraftState): string {
  switch (state) {
    case "briefed":
      return "Ready to draw";
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
 * A draft nobody has said anything in is left out: pressing the plus card and
 * closing the panel makes one, and a row for it would reopen an empty
 * conversation that the plus card opens just as well. A draft in any other
 * state is left out too, whatever the runner sent, since the list is for
 * conversations that can still go somewhere.
 */
export function draftRows(
  drafts: readonly DraftSummary[],
  titles: Readonly<Record<string, string>> = {},
): DraftRow[] {
  return drafts
    .filter((draft) => LISTED_STATES.includes(draft.state))
    .filter((draft) => draft.turns > 0 || (draft.title ?? "").trim() !== "")
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .map((draft) => {
      const title = draft.title?.trim() ?? "";
      const first = draft.firstMessage?.trim() ?? "";
      const extending = draft.source === null ? null : (titles[draft.source] ?? draft.source);
      const heading =
        title !== ""
          ? title
          : first !== ""
            ? first
            : extending !== null
              ? `Extending ${extending}`
              : "A conversation with no brief yet";
      return {
        draftId: draft.draftId,
        heading,
        quoted: title === "" && first !== "",
        state: stateWords(draft.state),
        briefed: draft.state === "briefed",
        updated: draft.updated,
      };
    });
}
