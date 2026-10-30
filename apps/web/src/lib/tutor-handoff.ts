import type { MentionOption, MentionValue } from "@/lib/mentions";
import { isConceptSlug } from "@/lib/concept-workspace-core";
import { mentionOptions } from "@/lib/studio-cards";
import { capFrom } from "@/lib/studio-chat";
import {
  diagramAvailability,
  RUNNER_DOWN,
  TAG_KINDS,
  videoAvailability,
  type TagKind,
} from "@/lib/studio-drafts";
import { extendRefusal } from "@/lib/studio-extend";
import { chatTurns, type ThreadItem, type TutorTurn } from "@/lib/tutor-thread";

/**
 * A tagged message in the concept tutor, handed to a new studio conversation
 * (docs/STUDIO-TUTOR-HANDOFF.md, D64 to D70): the menu's entries from a
 * health answer, what the server action takes and gives back, and the words
 * for each way it can be refused.
 *
 * React-free, so the rules are tested here. The browser half reaches it only
 * through the tutor's lazy composer chunk (`TutorStudioKit.tsx`), which a
 * concept page fetches after a good health read; the server half is
 * `openConceptConversation` in `app/(app)/studio/actions.ts`.
 */

type Value = MentionValue<TagKind>;

/** The tutor's field once tags can work. */
export const TUTOR_MENTION_PLACEHOLDER = "Ask about this concept, or type @ to make something";

/** Under the locked field while the conversation is being made. */
export const OPENING_THE_STUDIO = "Opening the studio";

/** A spent daily cap: the first planner turn would be refused, so neither kind can be asked for. */
export const CAP_SPENT = "Today's studio spend is used up";

/** A later health read that got no answer, after the menu was already showing. */
export const STUDIO_NOT_ANSWERING = "The studio runner is not answering";

/**
 * The @ menu's entries for a tutor, from the newest health answer.
 *
 * A new draft carries every kind, so `plannerKinds` is all of them and only
 * the machine decides: Video from the video doctor (`mentionOptions`, T5),
 * Diagram from `diagramAgent` (#206), since a diagram brief nobody can draw
 * is not worth a planner turn, and SVG from nothing — a reply draws it
 * itself (D105). A spent cap disables all three (the first turn would be
 * refused), and a read with no answer disables all three with that reason,
 * rather than swapping the field back under the person's caret (D67).
 */
export function tutorMentionOptions(health: unknown): MentionOption<TagKind>[] {
  const offered = mentionOptions({ plannerKinds: [...TAG_KINDS] }, videoAvailability(healthPart(health, "video")));
  if (typeof health !== "object" || health === null) {
    return offered.map((option) => ({ ...option, disabledReason: STUDIO_NOT_ANSWERING }));
  }
  const raw = health as { ok?: unknown; note?: unknown };
  if (raw.ok !== true) {
    const note = typeof raw.note === "string" && raw.note.trim() !== "" ? raw.note.trim() : null;
    return offered.map((option) => ({ ...option, disabledReason: note === null ? "The studio cannot run now" : `The studio cannot run now: ${note}` }));
  }
  if (capFrom(healthPart(health, "dailyCap"))?.exceeded === true) {
    return offered.map((option) => ({ ...option, disabledReason: CAP_SPENT }));
  }
  const diagram = diagramAvailability(healthPart(health, "diagramAgent"));
  return offered.map((option) =>
    option.id === "diagram" && !diagram.ok && !option.disabledReason
      ? { ...option, disabledReason: diagram.reason === null ? "Diagrams cannot be drawn on this machine" : `Diagrams are unavailable: ${diagram.reason}` }
      : option,
  );
}

function healthPart(health: unknown, key: string): unknown {
  return typeof health === "object" && health !== null ? (health as Record<string, unknown>)[key] : null;
}

/**
 * Why Send waits on a chip, or null: a chip whose kind the menu now disables
 * (the cap was spent, videos went away) would open a conversation that
 * refuses it. The words are the menu's own.
 */
export function tagSendBlock(value: Value, options: readonly MentionOption<TagKind>[]): string | null {
  for (const mention of value.mentions) {
    const reason = options.find((option) => option.id === mention.kind)?.disabledReason;
    if (reason) return reason;
  }
  return null;
}

/** How many tutor turns a hand-off carries (D69): three exchanges. */
export const HANDOFF_TURNS = 6;
/** The most characters of them it carries, the newest kept first. */
export const HANDOFF_CHARS = 6_000;

/**
 * The tutor turns a tagged message takes to the studio (D69): the last six,
 * oldest dropped first to fit 6,000 characters, and the oldest one kept cut
 * at its start when it does not fit whole. The runner's TUTOR block applies
 * the same rule (`tutorBlock`), so what is sent is what the planner reads,
 * and the studio's "last N exchanges" line counts turns the person can see
 * were sent. Markers are left out: they are not the tutor's.
 */
export function handoffTurns(
  items: readonly ThreadItem[],
  { maxTurns = HANDOFF_TURNS, maxChars = HANDOFF_CHARS }: { maxTurns?: number; maxChars?: number } = {},
): TutorTurn[] {
  const recent = chatTurns(items)
    .slice(-maxTurns)
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
    .filter((turn) => turn.content !== "");
  const kept: TutorTurn[] = [];
  let room = maxChars;
  for (let i = recent.length - 1; i >= 0 && room > 0; i -= 1) {
    const turn = recent[i];
    if (turn.content.length <= room) {
      kept.unshift(turn);
      room -= turn.content.length;
    } else {
      kept.unshift({ role: turn.role, content: turn.content.slice(turn.content.length - room) });
      room = 0;
    }
  }
  return kept;
}

/**
 * The tutor's own input limit, which a tagged message keeps too: it is the
 * same field, and the plain one stops typing there (`maxLength`). The studio
 * dropped its own cap (#231), so this is the tutor's, not the planner's.
 */
export const TUTOR_INPUT_LIMIT = 4_000;

/**
 * Why Send waits on the length of what is in the @ field, or null. Only Send:
 * the field stays editable, so the person can cut it back down, which the
 * plain field's `maxLength` does not have to say.
 */
export function tutorLengthBlock(value: Value, limit = TUTOR_INPUT_LIMIT): string | null {
  if (value.text.length <= limit) return null;
  return `${value.text.length.toLocaleString("en")} of ${limit.toLocaleString("en")} characters. Cut it down to send.`;
}

/* -------------------------------------------------------------------------- */
/* The server action's input and answer                                       */
/* -------------------------------------------------------------------------- */

/** What the tutor sends the server action. The note is never among it: the server reads that (D65). */
export interface HandoffInput {
  slug: string;
  tutor: TutorTurn[];
  idempotencyKey: string;
}

/** The runner's own bound on an idempotency key. */
const KEY_LIMIT = 200;

/**
 * The action's input, checked on the server: a browser can post anything to
 * a server action's endpoint. The turns are cut again with `handoffTurns`, so
 * nothing past six turns and 6,000 characters leaves this server whatever
 * the page sent. Null when it cannot be a hand-off at all.
 */
export function checkHandoffInput(raw: unknown): HandoffInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as { slug?: unknown; tutor?: unknown; idempotencyKey?: unknown };
  if (!isConceptSlug(input.slug)) return null;
  const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (key === "" || key.length > KEY_LIMIT) return null;
  const turns = Array.isArray(input.tutor)
    ? input.tutor.filter(
        (turn): turn is TutorTurn =>
          typeof turn === "object" &&
          turn !== null &&
          ((turn as TutorTurn).role === "user" || (turn as TutorTurn).role === "assistant") &&
          typeof (turn as TutorTurn).content === "string",
      )
    : [];
  // A long list is cut to its tail before the characters are counted.
  return { slug: input.slug, idempotencyKey: key, tutor: handoffTurns(turns.slice(-HANDOFF_TURNS * 4)) };
}

/**
 * What the action answers, serialisable across the action boundary.
 * `where` says whose refusal it is: this server's (the concept could not be
 * read for the owner) or the runner's (`down` when it did not answer).
 */
export type ConceptConversation =
  | { ok: true; draftId: string }
  | {
      ok: false;
      where: "input" | "concept" | "runner";
      /** `concept`: `not-found` or `unreachable`. `runner`: `down` or the runner's `detail.reason`. */
      reason: string | null;
      status: number | null;
      /** The runner's `error`, quoted in the words when nothing better fits. */
      said: string | null;
      /**
       * On `down`: true only when the request certainly never reached the
       * runner (nothing listening). False is a timeout or a broken
       * connection, after which the runner may still make the draft.
       */
      undelivered?: boolean;
    };

/**
 * The words the tutor shows under its field for a refused hand-off. The
 * message and its chips stay in the field, and nothing was sent to either
 * agent (the flow's last row). A runner that is down gets Extend's words
 * (H3), since the fix is the same.
 */
export function handoffRefusal(answer: Extract<ConceptConversation, { ok: false }>, title: string): string {
  if (answer.where === "input") return "That message could not be handed to the studio. Reload the page and try again.";
  if (answer.where === "concept") {
    return answer.reason === "not-found"
      ? `${title} is not among your concepts any more, so the studio has nothing to open.`
      : "The knowledge base did not answer, so the note could not be read. Try again in a moment.";
  }
  if (answer.reason === "down" && answer.undelivered === false) {
    // It may be busy rather than stopped, so starting it is not the advice.
    return "The studio did not answer in time. Try again in a moment.";
  }
  if (answer.reason === "down" || answer.status === 0) {
    const down = extendRefusal(0, { error: RUNNER_DOWN, detail: null }, title);
    return `${down.headline} ${down.detail ?? ""}`.trim();
  }
  const said = answer.said === null || answer.said.trim() === "" ? "" : ` The runner said: "${answer.said.trim().replace(/[.]$/, "")}".`;
  switch (answer.reason) {
    case "no-concept":
      return `The studio cannot read ${title} as your note.${said}`;
    case "catalog-unreachable":
      return "The studio could not read the catalog. Check its database is up, then try again.";
    case "catalog":
      return `The studio could not read ${title}.${said}`;
  }
  if (answer.status === 429) return `${CAP_SPENT}, so the studio cannot take a message now.`;
  if (answer.status === 403) return `The studio runner here serves another account, so it cannot open a conversation for you.${said}`;
  if (answer.status === 400) return `The studio refused the message.${said}`;
  return `The studio answered ${answer.status ?? "with an error"}.${said}`;
}

/**
 * What a press would send, as a short print kept beside its idempotency key
 * (`extendKey`'s `print`): the message, its chips and the tutor turns. A
 * press that timed out keeps its key, since the runner may have made the
 * draft; a retry of the same press finds that draft, and a retry after the
 * message or the thread changed gets a new key and so a new draft, rather
 * than one whose CONCEPT and TUTOR blocks were built from what was sent
 * before. cyrb53, a 53-bit string hash: enough to tell two presses apart.
 */
export function handoffPrint(value: Value, turns: readonly TutorTurn[]): string {
  const text = JSON.stringify([value.text, value.mentions, turns]);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The storage name a tutor press's idempotency key lives under: `extendKey`'s store, apart from any diagram's. */
export function handoffKeyName(slug: string): string {
  return `tutor:${slug}`;
}
