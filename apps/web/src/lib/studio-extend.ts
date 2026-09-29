import { runnerDown, type Refusal } from "@/lib/studio-drafts";

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
 * not be read. A runner that is down comes first whatever the status: the
 * studio proxy answers that as a 502 too, and "could not read the diagram"
 * with an Open canvas would send the person looking in the wrong place.
 *
 * The runner's own words are quoted rather than recased: they carry slugs and
 * paths, and a capital letter on a slug is a different slug.
 */
export function extendRefusal(status: number, refusal: Refusal, title: string): ExtendRefusal {
  if (runnerDown(status, refusal)) {
    return {
      headline: "The studio runner is not answering.",
      detail: "Start it with npm run studio from the repository root, then try again.",
      actions: ["retry", "close"],
    };
  }
  switch (status) {
    case 400:
      return { headline: `${title} cannot be extended from here.`, detail: said(refusal), actions: ["close"] };
    case 404:
      // Usually a diagram deleted or renamed since the grid was drawn, but
      // with the catalog down and no local checkout the runner cannot tell,
      // and its detail says so. Its words decide which, so they are shown and
      // a retry is offered.
      return {
        headline: `The studio cannot find ${title}.`,
        detail: `It may have been deleted or renamed since the grid was drawn. ${said(refusal)}`,
        actions: ["retry", "close"],
      };
    case 502:
      return {
        headline: `The studio could not read ${title}.`,
        detail:
          `${said(refusal)} The planner learns what is in a diagram only by opening it. ` +
          "Opening it on the canvas shows whether the document itself is the problem.",
        actions: ["retry", "canvas", "close"],
      };
    case 503:
      return {
        headline: "The topic list could not be read.",
        detail:
          "The planner files every diagram under a topic, so it cannot start without the list. " +
          `Check the catalog's database is up, then try again. ${said(refusal)}`,
        actions: ["retry", "close"],
      };
    default:
      return { headline: `The runner answered ${status}.`, detail: said(refusal), actions: ["retry", "close"] };
  }
}

/** `The runner said: "<error>; <detail>".`, the detail only when it is a sentence. */
function said(refusal: Refusal): string {
  const parts = [refusal.error, typeof refusal.detail === "string" ? refusal.detail : ""]
    .map((part) => part.trim().replace(/[.]$/, ""))
    .filter((part) => part !== "");
  return parts.length === 0 ? "" : `The runner said: "${parts.join("; ")}".`;
}

/* -------------------------------------------------------------------------- */
/* Talking a failed job through                                               */
/* -------------------------------------------------------------------------- */

/**
 * What a new conversation's composer holds when it is opened from a failed
 * job that had no conversation of its own (a job the brief form started).
 * Prefilled, never sent: the person reads it and edits it before paying for
 * a turn. Short on purpose: the intent, what it was meant to draw, and what
 * went wrong in the runner's words, which is what the planner needs to
 * propose a changed brief.
 */
export function talkItThroughText(
  brief: { title: string; slug: string; mode: "new" | "extend"; intent: string },
  failure: string | null,
): string {
  const what = brief.mode === "extend" ? `an extension of ${brief.slug}` : `a new diagram, ${brief.slug}`;
  const lines = [
    `A drawing of "${brief.title}" (${what}) failed and I want to change its brief.`,
    `It was meant to show: ${brief.intent.trim()}`,
  ];
  if (failure !== null && failure.trim() !== "") lines.push(`What went wrong: ${failure.trim()}`);
  return lines.join("\n");
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

/** The press's conversation arrived: its key has done its job. */
export function forgetExtendKey(storage: Storage | null, name: string): void {
  if (storage === null) return;
  safely(() => storage.removeItem(KEY_PREFIX + name), undefined);
}

/**
 * What a conversation does on arrival: send `send` as the person's first
 * turn when there is one, then put `compose` in the composer. `source` is the
 * diagram an Extend press was for, whose idempotency key is forgotten once
 * the conversation has arrived (not before: a reload of the press until then
 * must find the same draft).
 */
export interface ExtendOpener {
  send: string | null;
  compose: string;
  source: string | null;
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
  const parsed = safely(() => JSON.parse(held) as { send?: unknown; compose?: unknown; source?: unknown }, {});
  const send = typeof parsed.send === "string" && parsed.send.trim() !== "" ? parsed.send : null;
  const compose = typeof parsed.compose === "string" ? parsed.compose : "";
  const source = typeof parsed.source === "string" && parsed.source !== "" ? parsed.source : null;
  return { send, compose, source };
}

/** `window.sessionStorage`, or null where reading it throws or there is no window. */
export function sessionStore(): Storage | null {
  return safely(() => (typeof window === "undefined" ? null : window.sessionStorage), null);
}

/**
 * The diagram a Talk it through conversation should open on, or null for a
 * new one. An extend job was about a diagram that exists, and the planner is
 * only told what is in a diagram through a draft opened with `source` (the
 * EXTENDING block). A failed `new` job drew nothing that landed, so there is
 * no diagram to open.
 */
export function talkTarget(brief: { mode: "new" | "extend"; slug: string }): string | null {
  return brief.mode === "extend" ? brief.slug : null;
}

const PREFILL_PREFIX = "studio:extend-prefill:";

/**
 * Words for an Extend press's composer, left by Talk it through before it
 * opens `?extend=<name>`. With a prefill the press sends no opener: the
 * person reads and edits the words first, and nothing is paid for until they
 * press Send.
 */
export function leavePrefill(storage: Storage | null, name: string, text: string): void {
  if (storage === null) return;
  safely(() => storage.setItem(PREFILL_PREFIX + name, text), undefined);
}

/** The prefill for `name`, read once and removed; null when there is none. */
export function takePrefill(storage: Storage | null, name: string): string | null {
  if (storage === null) return null;
  const held = safely(() => storage.getItem(PREFILL_PREFIX + name), null);
  if (held === null) return null;
  safely(() => storage.removeItem(PREFILL_PREFIX + name), undefined);
  return held.trim() === "" ? null : held;
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
