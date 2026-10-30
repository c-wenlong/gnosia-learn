import { newSessionId, SESSION_TEXT_LIMIT } from "@/lib/session-core";
import { CHAT_ANSWER_LIMIT, type RecordedResult } from "@/lib/tutor-check";
import { randomToken } from "@/lib/random-token";
import { sessionKey } from "@/lib/tutor-thread";

/**
 * The browser half of recall in the chat (docs/proposals/recall-in-chat.md),
 * shared by the two tutors that record answers: the concept tutor on
 * `/learn/<concept>` and the course topic tutor (phase 3). Each keeps its own
 * thread and draws its own verdict rows; what they share is here, so a fix to
 * how an answer is judged, written or closed reaches both.
 *
 * A "scope" is one thread's session: the concept slug for the concept tutor,
 * `topic-<topic id>` for a course topic. The session id lives in
 * `sessionStorage` beside the thread, with memory behind a refused store.
 */

/** A request id for one recorded answer, as the session page makes them. */
export function chatRequestId(): string {
  return `chat-${randomToken()}`;
}

const sessionMemory = new Map<string, string | null>();

function readSession(scope: string): string | null {
  const k = sessionKey(scope);
  if (sessionMemory.has(k)) return sessionMemory.get(k) ?? null;
  try {
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

function writeSession(scope: string, id: string | null): void {
  const k = sessionKey(scope);
  sessionMemory.set(k, id);
  try {
    if (id === null) window.sessionStorage.removeItem(k);
    else window.sessionStorage.setItem(k, id);
  } catch {
    // Memory still holds it for this page.
  }
}

/**
 * The observe payload of an answer still saving, per scope. Its request can
 * reach the server after a close does, and the first answer is what opens the
 * session, so a close sent alone could find no session and the answer then
 * open one nobody closes. A close while an answer is saving therefore resends
 * that answer with `closeSession`: its request id makes it a replay, and the
 * answer and the close commit together, as the session page does.
 */
const savingAnswer = new Map<string, Record<string, unknown>>();

/**
 * The write in flight per scope. Saves on one thread run one at a time, so
 * `savingAnswer` only ever holds the one in flight, and a close always
 * resends the answer that might open the session.
 */
const saveQueue = new Map<string, Promise<void>>();

/**
 * How many times each scope's session has been closed. A save notes it when
 * it starts; one that only gets to send after a close (it waited in the queue
 * while the page went away) is dropped rather than opening a session nobody
 * will close.
 */
const closedTimes = new Map<string, number>();

/** How long an answer's write may take before the row says so and the queue moves on. */
const SAVE_TIMEOUT_MS = 20_000;

/** Close the scope's session, if an answer opened one, and forget it. Idempotent on the server; best-effort (R6). */
export function closeChatSession(scope: string): void {
  closedTimes.set(scope, (closedTimes.get(scope) ?? 0) + 1);
  const id = readSession(scope);
  if (id === null) return;
  writeSession(scope, null);
  sendClose(scope, id);
}

/**
 * Close the scope's session and wait for the server to say so, retrying once
 * after a pause: the session page does this on its close screen, where the
 * learner sees the result. True once it is closed, or when no answer opened
 * one; false when both tries failed, which leaves a running row and no lost
 * evidence, since every answer is already recorded.
 */
export function closeSessionNow(scope: string, retryAfterMs = 1_500): Promise<boolean> {
  const run = closeAndConfirm(scope, retryAfterMs);
  closing.set(scope, run);
  void run.finally(() => {
    if (closing.get(scope) === run) closing.delete(scope);
  });
  return run;
}

/**
 * Closes the scope's session is waiting on, per scope, so `releaseScope`
 * keeps the scope until they finish.
 */
const closing = new Map<string, Promise<boolean>>();

async function closeAndConfirm(scope: string, retryAfterMs: number): Promise<boolean> {
  const id = readSession(scope);
  if (id === null) return true;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch("/api/learner/session/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      if (res.ok) {
        closedTimes.set(scope, (closedTimes.get(scope) ?? 0) + 1);
        if (readSession(scope) === id) writeSession(scope, null);
        return true;
      }
    } catch {
      // Tried once more below.
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
  }
  return false;
}

/**
 * Forget a scope once its saves and closes have finished: its session id
 * (memory and `sessionStorage`), its close count and its pending answer. The
 * session page makes a scope per visit, so without this every visit would
 * leave its entries behind for the life of the tab. A scope used again after
 * this starts afresh, as a new visit would.
 */
export function releaseScope(scope: string): void {
  const pending = [saveQueue.get(scope), closing.get(scope)].filter((p) => p !== undefined);
  if (pending.length > 0) {
    void Promise.allSettled(pending).then(() => releaseScope(scope));
    return;
  }
  const k = sessionKey(scope);
  sessionMemory.delete(k);
  try {
    window.sessionStorage.removeItem(k);
  } catch {
    // Nothing kept there.
  }
  closedTimes.delete(scope);
  savingAnswer.delete(scope);
}

/** How many scopes this page still keeps anything for; for tests. */
export function keptScopes(): number {
  return new Set([
    ...[...sessionMemory.keys()],
    ...[...closedTimes.keys(), ...savingAnswer.keys(), ...saveQueue.keys(), ...closing.keys()].map(sessionKey),
  ]).size;
}

/** The close request for a page going away: the answer still saving resent with `closeSession`, else a bare close. */
function sendClose(scope: string, id: string): void {
  const saving = savingAnswer.get(scope);
  const [url, body] =
    saving !== undefined && saving.sessionId === id
      ? ["/api/learner/observe", { ...saving, closeSession: true }]
      : ["/api/learner/session/close", { sessionId: id }];
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Survives the page going away, which is when this is usually sent.
    keepalive: true,
  }).catch(() => {
    // An open session costs an honest row, and `learn session close` closes it.
  });
}

/**
 * The judge's verdict on an answer (`POST /api/agent/judge`), or null when
 * it could not give one: the row then offers both buttons with neither chosen.
 * `commitment` is a recall check's committed answer, which the judge reads
 * first (docs/proposals/structured-checks.md, phase 2).
 */
export async function judgeAnswer(
  conceptSlug: string,
  question: string,
  answer: string,
  commitment: string | null = null,
): Promise<{ correct: boolean; feedback: string | null } | null> {
  try {
    const res = await fetch("/api/agent/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conceptSlug,
        question,
        answer: answer.slice(0, CHAT_ANSWER_LIMIT),
        ...(commitment !== null ? { commitment } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { verdict?: { correct?: unknown; feedback?: unknown } };
    if (res.ok && typeof data.verdict?.correct === "boolean") {
      return {
        correct: data.verdict.correct,
        feedback: typeof data.verdict.feedback === "string" ? data.verdict.feedback : null,
      };
    }
  } catch {
    // Unreachable or refused: the learner still chooses.
  }
  return null;
}

/** What the observe route recorded; the session page shows more of it than a tutor's row does. */
export interface ObserveResult {
  correct: boolean;
  pLBefore: number;
  pLAfter: number;
  card: { intervalDays: number } | null;
}

interface ObserveReply {
  ok?: boolean;
  error?: string;
  result?: ObserveResult;
}

export interface RecordInput {
  /** The thread's session scope (see the module comment). */
  scope: string;
  /** What the session id names after its date: the concept slug, or the topic id. */
  sessionLabel: string;
  conceptSlug: string;
  correct: boolean;
  source: "probe" | "teach";
  requestId: string;
  question: string;
  /** The learner's answer; the observation stores its first `SESSION_TEXT_LIMIT` characters as `chosen`. */
  answer: string;
  /**
   * A check card's answer (docs/proposals/structured-checks.md): the answer
   * the tutor committed to (a choice check's key, a recall check's full
   * answer), what the learner gave (the option picked, null for "I don't
   * know", or their words), the confidence and the reasoning. With it,
   * `chosen` is what they gave and `answer` the commitment, as the session
   * page sends them; `answer` above is ignored.
   */
  card?: { key: string; chosen: string | null; confidence: number | null; thinking: string | null };
  /** What the session is called and aims at when this answer opens it; the concept's when absent. */
  sessionTitle?: string;
  sessionGoal?: string;
}

/**
 * Write one answer through `POST /api/learner/observe`, the session page's
 * write, under the scope's session (R6): the first recorded answer opens it
 * in its own transaction. An answer refused because its session was closed
 * elsewhere (another tab, `learn session close`) wrote nothing, so it is sent
 * once more under a fresh session. Throws with a message to show.
 */
/**
 * Whether a 400 from the observe route is the catalog refusing the session
 * itself (closed, or its id taken), the one refusal a fresh session fixes.
 * The two sentences `openTutorSession` in `services/catalog/src/state/observe.ts`
 * writes, matched whole: a field's validation error such as `"sessionTitle"
 * must be 1 to 200 characters.` also names a session, and a fresh session
 * would only be refused the same way.
 */
export function sessionRefused(error: string | undefined): boolean {
  return /^session "[^"]*" is [a-z]+; start a new one\.$|^session id "[^"]*" is already in use; start a new session\.$/.test(
    error ?? "",
  );
}

export async function recordAnswer(input: RecordInput): Promise<RecordedResult> {
  const r = await saveObservation({
    scope: input.scope,
    requestId: input.requestId,
    newSession: () => newSessionId(input.sessionLabel, new Date(), chatRequestId().slice(5), "chat"),
    fields: {
      conceptSlug: input.conceptSlug,
      correct: input.correct,
      source: input.source,
      question: input.question,
      // `chosen` is what the learner gave; `answer` is the committed one, which only a check card has.
      ...(input.card
        ? {
            answer: input.card.key.slice(0, SESSION_TEXT_LIMIT),
            chosen: input.card.chosen === null ? null : input.card.chosen.slice(0, SESSION_TEXT_LIMIT),
            ...(input.card.confidence !== null ? { confidence: input.card.confidence } : {}),
            ...(input.card.thinking !== null ? { thinking: input.card.thinking.slice(0, SESSION_TEXT_LIMIT) } : {}),
          }
        : { chosen: input.answer.slice(0, SESSION_TEXT_LIMIT) }),
      ...(input.sessionTitle ? { sessionTitle: input.sessionTitle } : {}),
      ...(input.sessionGoal ? { sessionGoal: input.sessionGoal } : {}),
    },
  });
  return { correct: r.correct, pLBefore: r.pLBefore, pLAfter: r.pLAfter, intervalDays: r.card?.intervalDays ?? null };
}

export interface SaveInput {
  /** The session scope the answer is recorded under (see the module comment). */
  scope: string;
  /** The answer's request id: a resend under it is a replay, never a second observation. */
  requestId: string;
  /** A new session id, for the first answer in the scope and after a refused session. */
  newSession: () => string;
  /** The rest of the observe body; the request id and the session id are added to it. */
  fields: Record<string, unknown>;
}

/**
 * Write one answer through `POST /api/learner/observe` under the scope's
 * session (R6): the first recorded answer opens it in its own transaction.
 * Saves in one scope run one at a time and give up after 20 seconds; one
 * that only gets to send after its scope closed is dropped; an answer
 * refused because its session was closed elsewhere (another tab,
 * `learn session close`) wrote nothing, so it is sent once more under a
 * fresh session. The concept tutors and the session page all write this
 * way. Resolves with what the catalog recorded; throws with a message to show.
 */
export async function saveObservation<R extends ObserveResult = ObserveResult>(input: SaveInput): Promise<R> {
  const session = () => {
    const held = readSession(input.scope);
    if (held !== null) return held;
    const id = input.newSession();
    writeSession(input.scope, id);
    return id;
  };
  const send = (sessionId: string) => {
    const payload = { ...input.fields, requestId: input.requestId, sessionId };
    savingAnswer.set(input.scope, payload);
    return fetch("/api/learner/observe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      // A request that never answers would hold the queue; this one gives up, and its retry replays.
      signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
    });
  };
  const { requestId } = input;
  // One save at a time per scope (see `saveQueue`).
  const closedAtStart = closedTimes.get(input.scope) ?? 0;
  const ahead = saveQueue.get(input.scope);
  let release: () => void = () => {};
  const mine = new Promise<void>((resolve) => (release = resolve));
  saveQueue.set(input.scope, mine);
  if (ahead) await ahead;
  // Whether the server answered the last send. Until it has (a timeout, a dropped connection),
  // the answer may still be saving there, so its payload stays for a close to resend.
  let answered = false;
  try {
    if ((closedTimes.get(input.scope) ?? 0) !== closedAtStart) {
      throw new Error("The thread's session closed before this answer was sent.");
    }
    let res = await send(session());
    let data = (await res.json().catch(() => null)) as ObserveReply | null;
    answered = true;
    if (res.status === 400 && sessionRefused(data?.error) && (closedTimes.get(input.scope) ?? 0) === closedAtStart) {
      writeSession(input.scope, null);
      answered = false;
      res = await send(session());
      data = (await res.json().catch(() => null)) as ObserveReply | null;
      answered = true;
    }
    if (!res.ok || !data?.ok || !data.result) {
      throw new Error(
        res.status === 429 ? "Too many answers in a minute." : (data?.error ?? `The answer was not recorded (HTTP ${res.status}).`),
      );
    }
    // The route's whole result; a caller that shows more of it names its shape.
    return data.result as R;
  } catch (e) {
    throw e instanceof DOMException && e.name === "TimeoutError" ? new Error("The answer took too long to save.") : e;
  } finally {
    release();
    if (saveQueue.get(input.scope) === mine) saveQueue.delete(input.scope);
    if (answered && (savingAnswer.get(input.scope) as { requestId?: string } | undefined)?.requestId === requestId) {
      savingAnswer.delete(input.scope);
    }
  }
}
