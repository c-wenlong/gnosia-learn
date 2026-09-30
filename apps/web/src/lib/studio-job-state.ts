import { JOB_STATES, type JobKind, type JobState } from "@self-learn/schema/shared";

/**
 * What a job's state is called, and what a card says about it.
 *
 * The runner's states (`JOB_STATES`) are an enum, and an enum never reaches
 * the screen: `awaiting_review` once did, as a badge, and once put a card
 * saying a finished diagram was "still being drawn". Every place that shows a
 * state reads this module, which is React-free on purpose so a server
 * component, a client component and a test can all import it (AGENTS.md,
 * "A `use client` module's exports are client references").
 */

/** The word for a state wherever one is shown on its own: a badge, a strip. Sentence case. */
export const JOB_STATE_LABEL: Record<JobState, string> = {
  queued: "Queued",
  running: "Running",
  awaiting_review: "Ready for review",
  accepted: "Accepted",
  discarded: "Discarded",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

/**
 * The label for `state`. A state this build does not know (a newer runner)
 * is humanised, never printed raw: `some_new_state` reads `Some new state`.
 */
export function jobStateLabel(state: string): string {
  if ((JOB_STATES as readonly string[]).includes(state)) return JOB_STATE_LABEL[state as JobState];
  const words = state.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? "Unknown" : words[0]!.toUpperCase() + words.slice(1);
}

/** The label in running text: `ready for review`, as in `held by x (ready for review)`. */
export function jobStateInline(state: string): string {
  return jobStateLabel(state).toLowerCase();
}

/**
 * What a card says about its kind's job, as a predicate: "is still being
 * drawn", "was accepted". `queued`, `running` and `awaiting_review` are the
 * states that keep a card's press disabled; the rest are here so that no state
 * falls through to words about a job that is still going.
 */
export function jobPredicate(kind: JobKind, state: string): string {
  const made = kind === "video" ? "made" : "drawn";
  switch (state) {
    case "queued":
      return "is waiting to start";
    case "running":
      return `is still being ${made}`;
    case "awaiting_review":
      return `is ${made} and ready for review`;
    case "accepted":
      return "was accepted";
    case "discarded":
      return "was discarded";
    case "failed":
      return "failed";
    case "cancelled":
      return "was cancelled";
    case "interrupted":
      return "was interrupted";
    default:
      return `is ${jobStateInline(state)}`;
  }
}

/** The predicate as a card's sentence, with its subject and full stop: "The diagram is still being drawn." */
export function jobCardSentence(kind: JobKind, state: string): string {
  return `The ${kind === "video" ? "video" : "diagram"} ${jobPredicate(kind, state)}.`;
}
