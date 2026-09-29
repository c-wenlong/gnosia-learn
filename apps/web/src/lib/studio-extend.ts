import type { Refusal } from "@/lib/studio-drafts";

/**
 * Extend from a tile (docs/STUDIO-CHAT-FIRST.md, phase 2): the words, the
 * refusals and the hand-off between the press and the conversation.
 *
 * Pure apart from the `Storage` the caller passes in, so the judgements are
 * tested here rather than inside a component (`apps/web/src/components` is
 * view code and untested by design).
 *
 * The flow is three steps, and the URL says which one a person is in:
 *
 * 1. Extend is a link to `?extend=<name>`, so the panel opens the moment it is
 *    pressed, with the diagram pinned and a pending line, rather than a button
 *    that sits still through a Chromium launch.
 * 2. That panel posts `POST /api/drafts { source }`, which checks the diagram
 *    out and runs `canvas inspect` before it answers.
 * 3. On a draft, the panel is replaced by `?draft=<id>`, and the conversation
 *    sends the opening message it was handed, so the planner's first reply
 *    names what it sees in the diagram and asks what to add.
 */

/**
 * The first thing an extend conversation says, on the person's behalf.
 *
 * Sent rather than waited for, because the design's promise is that the
 * planner's first reply names what is in the diagram and asks what to add,
 * and the planner only ever answers a person's turn. It is the person's turn
 * in the thread, in words they could have typed, and a message they typed
 * while the diagram was being read goes instead of it.
 */
export const EXTEND_OPENER = "I'd like to add to this diagram. What's in it now?";

/**
 * The studio's unpaid opening turn on an extend conversation with nothing in
 * it, which is what a person sees when the opener could not be sent (the day's
 * cap, a turn already running) or when they come back to an empty one.
 */
export const EXTEND_OPENING_TURN =
  "I've read this diagram. Tell me what it should gain, or ask me what's in it first.";

/** The pending line, which grows a second sentence once the wait is long enough to wonder about. */
export function readingWords(elapsedMs: number): { lead: string; more: string | null } {
  const lead = "Reading the diagram";
  if (elapsedMs < 6_000) return { lead, more: null };
  if (elapsedMs < 30_000) {
    return {
      lead,
      more: "The studio opens it on a canvas to list its shapes and arrows. The first open starts a browser, which is the slow part.",
    };
  }
  return {
    lead,
    more: "Still going. A large diagram, or a busy machine, can take a minute.",
  };
}

export type ExtendAction = "retry" | "canvas" | "close";

export interface ExtendRefusal {
  headline: string;
  detail: string | null;
  actions: ExtendAction[];
}

/**
 * What a refused `POST /api/drafts { source }` means, keyed on the status the
 * runner gives for a source (phase 1a): 400 a name it will not take, 404 no
 * such diagram, 502 the checkout or `inspect` failed, 503 the topic list could
 * not be read. Status 0 is the fetch itself failing: the runner is down.
 */
export function extendRefusal(status: number, refusal: Refusal, title: string): ExtendRefusal {
  const detail = detailText(refusal);
  switch (status) {
    case 400:
      return {
        headline: `${title} cannot be extended from here.`,
        detail: sentence(refusal.error),
        actions: ["close"],
      };
    case 404:
      return {
        headline: `There is no diagram called ${title} any more.`,
        detail: "It may have been deleted or renamed since the grid was drawn.",
        actions: ["close"],
      };
    case 502:
      return {
        headline: `The studio could not read ${title}.`,
        detail:
          `The runner said: ${stop(refusal.error)}${detail === null ? "" : ` ${stop(detail)}`} ` +
          "The planner learns what is in a diagram only by opening it. " +
          "Opening it on the canvas shows whether the document itself is the problem.",
        actions: ["retry", "canvas", "close"],
      };
    case 503:
      return {
        headline: "The topic list could not be read.",
        detail:
          "The planner files every diagram under a topic, so it cannot start without the list. " +
          `Check the catalog's database is up, then try again. The runner said: ${stop(refusal.error)}`,
        actions: ["retry", "close"],
      };
    case 0:
      return {
        headline: "The studio runner is not answering.",
        detail: "Start it with npm run studio from the repository root, then try again.",
        actions: ["retry", "close"],
      };
    default:
      return {
        headline: `The runner answered ${status}.`,
        detail: sentence(refusal.error),
        actions: ["retry", "close"],
      };
  }
}

function detailText(refusal: Refusal): string | null {
  if (typeof refusal.detail === "string" && refusal.detail.trim() !== "") return refusal.detail.trim();
  return null;
}

/** End with a full stop, leaving the runner's own words (and a slug's case) alone. */
function stop(text: string): string {
  const trimmed = text.trim();
  return trimmed === "" || /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return trimmed;
  const capital = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

/* -------------------------------------------------------------------------- */
/* The hand-off, through sessionStorage                                        */
/* -------------------------------------------------------------------------- */

/**
 * How long a pending press's idempotency key is reused. A reload while the
 * diagram is being read posts again, and the same key makes the runner answer
 * with the draft the first post made rather than a second one. Past this, a
 * key left behind by a panel closed mid-read is not reused for a new press.
 */
export const EXTEND_KEY_TTL_MS = 5 * 60_000;

const KEY_PREFIX = "studio:extend-key:";
const OPENER_PREFIX = "studio:extend-opener:";

/** A read or write that throws (a private window, blocked site data) is a convenience lost, never an error. */
function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

/** The key for this press: the one a recent press on the same diagram left, or a new one. */
export function extendKey(storage: Storage | null, name: string, fresh: () => string, now = Date.now()): string {
  if (storage === null) return fresh();
  const held = safely(() => storage.getItem(KEY_PREFIX + name), null);
  if (held !== null) {
    const parsed = safely(() => JSON.parse(held) as { key?: unknown; at?: unknown }, {});
    if (typeof parsed.key === "string" && typeof parsed.at === "number" && now - parsed.at < EXTEND_KEY_TTL_MS) {
      return parsed.key;
    }
  }
  const key = fresh();
  safely(() => storage.setItem(KEY_PREFIX + name, JSON.stringify({ key, at: now })), undefined);
  return key;
}

/** The press became a draft: its key has done its job. */
export function forgetExtendKey(storage: Storage | null, name: string): void {
  if (storage === null) return;
  safely(() => storage.removeItem(KEY_PREFIX + name), undefined);
}

/**
 * What the conversation does on arrival: send `send` as the person's first
 * turn when there is one, and put `compose` in the composer.
 */
export interface ExtendOpener {
  send: string | null;
  compose: string;
}

export function leaveOpener(storage: Storage | null, draftId: string, opener: ExtendOpener): void {
  if (storage === null) return;
  safely(() => storage.setItem(OPENER_PREFIX + draftId, JSON.stringify(opener)), undefined);
}

/**
 * Read the opener once and remove it, so a reload of the conversation never
 * sends it a second time. Anything malformed is no opener.
 */
export function takeOpener(storage: Storage | null, draftId: string): ExtendOpener | null {
  if (storage === null) return null;
  const held = safely(() => storage.getItem(OPENER_PREFIX + draftId), null);
  if (held === null) return null;
  safely(() => storage.removeItem(OPENER_PREFIX + draftId), undefined);
  const parsed = safely(() => JSON.parse(held) as { send?: unknown; compose?: unknown }, {});
  const send = typeof parsed.send === "string" && parsed.send.trim() !== "" ? parsed.send : null;
  const compose = typeof parsed.compose === "string" ? parsed.compose : "";
  return { send, compose };
}

/** `window.sessionStorage`, or null where reading it throws or there is no window. */
export function sessionStore(): Storage | null {
  return safely(() => (typeof window === "undefined" ? null : window.sessionStorage), null);
}

/* -------------------------------------------------------------------------- */
/* The picture across the hand-off                                            */
/* -------------------------------------------------------------------------- */

/**
 * The diagram each just-created draft was opened on, in this tab's memory.
 *
 * The conversation reads its record before it knows it is an extend one, and
 * without this its first frame would drop the pinned picture and the header
 * the person was just looking at. Memory rather than storage on purpose: a
 * reload renders on the server first, where this is always empty, and in a
 * fresh tab it is empty too, so the two renders cannot disagree.
 */
const arriving = new Map<string, string>();

export function noteArrival(draftId: string, name: string): void {
  arriving.set(draftId, name);
}

export function arrivingSource(draftId: string): string | null {
  return arriving.get(draftId) ?? null;
}
