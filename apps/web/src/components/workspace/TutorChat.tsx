"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent } from "react";

import { NoteProse } from "@/components/NoteProse";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/classes";
import { Cite } from "@/components/ui/Cite";
import { Composer } from "@/components/ui/Composer";
import { MathText } from "@/components/Math";
import { MentionChip } from "@/components/ui/MentionChip";
import type { MentionComposerHandle } from "@/components/ui/MentionComposer";
import type { MentionValue } from "@/components/ui/mention-text";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import type { CitationSource } from "@/lib/agent/prompt";
import { prefersReducedMotion, scrollBehavior } from "@/lib/motion";
import type { DraftKind } from "@/lib/studio-drafts";
import { useHydrated } from "@/lib/use-hydrated";
import { HEALTH_READ_MS, readHealth, studioCanTag, whenIdle } from "@/lib/tutor-studio";
import {
  chatTurns,
  citedNumbers,
  markerPieces,
  parseThread,
  threadKey,
  RECALL_SEED,
  requestTurns,
  sessionKey,
  type HandoffMarker,
  type ThreadItem,
  type TutorTurn,
} from "@/lib/tutor-thread";
import { newSessionId, SESSION_TEXT_LIMIT } from "@/lib/session-core";
import {
  CHAT_ANSWER_LIMIT,
  checkSource,
  newVerdict,
  pendingCheck,
  recallOpening,
  settleInterrupted,
  type TurnCheck,
  type Verdict,
} from "@/lib/tutor-check";

import { VerdictRow } from "./VerdictRow";

/**
 * The workspace's centre panel: a chat with the concept tutor
 * (`POST /api/agent/chat` with `conceptSlug`).
 *
 * The thread is kept per concept in `sessionStorage`: it survives a reload and
 * a trip to another page in the same tab, and goes when the tab closes. That
 * is enough while chat writes no evidence; mastery moves through the session
 * and the CLI, not through this thread.
 *
 * Tutor turns render through `NoteProse`, the same renderer the note uses, so
 * a list or a formula in a reply reads the way it does in the note. A `[n]`
 * the reply uses becomes a `Cite` chip under the turn when `n` is one of the
 * numbered sources; anything else stays as the text it was.
 *
 * **Tags, where the studio can take them** (docs/STUDIO-TUTOR-HANDOFF.md).
 * With `studio` (the server's `studioEnabled()`), the page reads the studio's
 * health once it is idle, and again on focus at most every 30 seconds. A good
 * answer fetches `TutorStudioKit`, the @ composer and the hand-off in one
 * chunk, and swaps it in for the plain field only while the field is empty
 * and not focused, so nothing is swapped under a caret or an IME composition
 * (D68). Until then, and for good when the studio is off, down or the chunk
 * will not load, the field is the plain `Composer`, and an `@video` typed
 * there is words to the tutor (H18).
 *
 * A message with no chip goes to the tutor as before. A message with a chip
 * goes to a new studio conversation about this concept, in this tab, and is
 * sent there on arrival (D64); the thread keeps it as a marker linking to
 * that conversation (D70), which is never sent to the tutor.
 *
 * **A check is evidence once the learner says so**
 * (docs/proposals/recall-in-chat.md, phase 1). A tutor turn that asked a
 * check arrives with `check`; the learner's next message is its answer, and
 * gets a verdict row. The judge (`POST /api/agent/judge`) runs beside the
 * tutor's reply and pre-selects a button; a tap writes the answer through
 * `POST /api/learner/observe`, the session page's write, so mastery, the map
 * and the review card move. No tap, nothing written (R2). "Why?" is a
 * question about the last turn, never an answer to its check.
 *
 * **Recall first, and the thread is a session** (phase 2). With `recall`
 * (the server's word that this concept's review card is due), an empty
 * thread opens on the tutor: the note's own check when it has one, built
 * here at no model cost, or a question the model is asked for (R3). The
 * first answer this thread records opens a `session` row, `chat-<date>-...`,
 * kept beside the thread in `sessionStorage`; the page closes it through
 * `POST /api/learner/session/close` when it goes away or the thread starts
 * over, best-effort as the session page's is (R6).
 *
 * **Motion.** A turn added here rises in (`animate-enter`); turns restored
 * from storage, which arrive in the render after hydration, only fade in, as
 * the greeting does, and the greeting is not drawn at all until the client
 * knows whether a thread replaces it, so neither flashes for a frame. The
 * thread glides to its newest turn, except on its first paint and under
 * reduced motion, where it jumps.
 */

/** The longest question the input takes, well inside the route's payload bound, and the longest answer the judge grades. */
const INPUT_LIMIT = CHAT_ANSWER_LIMIT;

interface ChatReply {
  message?: { content?: string };
  check?: TurnCheck | null;
  sources?: CitationSource[];
  error?: string;
  code?: string;
}

/**
 * The thread store: `sessionStorage` under `threadKey(slug)`, mirrored in
 * memory so a tab whose storage is refused (a private window, a policy) still
 * keeps its conversation until it navigates away. Read through
 * `useSyncExternalStore`, whose server snapshot is empty, so the first client
 * render matches the server's HTML and the stored thread appears right after.
 */
const memory = new Map<string, string | null>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeTurns(key: string, turns: ThreadItem[]): void {
  const raw = turns.length === 0 ? null : JSON.stringify(turns);
  memory.set(key, raw);
  try {
    if (raw === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, raw);
  } catch {
    // A full or refused store costs persistence, not the conversation.
  }
  for (const listener of listeners) listener();
}

function errorFor(status: number, data: ChatReply): string {
  if (data.code === "MISSING_API_KEY") {
    // The server says which case it is: no key anywhere, or a model list
    // whose providers have none (docs/TUTOR-MODELS.md, T4).
    return data.error ?? "The tutor has no model provider key yet. Add one in Settings, under Provider keys.";
  }
  if (data.code === "CONCEPT_UNAVAILABLE") return "The knowledge base is unreachable, so the tutor has no note to read.";
  if (status === 429) return "That was a lot of questions in a minute. Wait a moment and try again.";
  return data.error ?? `The tutor did not answer (HTTP ${status}).`;
}

type Value = MentionValue<DraftKind>;

/** A request id for one recorded answer, as the session page makes them. */
function requestToken(): string {
  // `randomUUID` needs a secure context; a LAN address over http is not one.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `chat-${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `chat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

interface ObserveReply {
  ok?: boolean;
  error?: string;
  result?: { correct: boolean; pLBefore: number; pLAfter: number; card: { intervalDays: number } | null };
}
type Kit = typeof import("./TutorStudioKit");

const EMPTY: Value = { text: "", mentions: [] };

/** The thread's session id (R6), in `sessionStorage` beside the thread, with memory behind a refused store. */
const sessionMemory = new Map<string, string | null>();
function readSession(slug: string): string | null {
  const k = sessionKey(slug);
  if (sessionMemory.has(k)) return sessionMemory.get(k) ?? null;
  try {
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeSession(slug: string, id: string | null): void {
  const k = sessionKey(slug);
  sessionMemory.set(k, id);
  try {
    if (id === null) window.sessionStorage.removeItem(k);
    else window.sessionStorage.setItem(k, id);
  } catch {
    // Memory still holds it for this page.
  }
}

/** Close the thread's session, if an answer opened one, and forget it. Idempotent on the server. */
function closeSession(slug: string): void {
  const id = readSession(slug);
  if (id === null) return;
  writeSession(slug, null);
  void fetch("/api/learner/session/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: id }),
    // Survives the page going away, which is when this is usually sent.
    keepalive: true,
  }).catch(() => {
    // Best-effort (R6): an open session costs an honest row, and `learn session close` closes it.
  });
}

export function TutorChat({
  slug,
  title,
  sources: initialSources,
  suggestions,
  initialDraft,
  studio = false,
  recall = null,
}: {
  slug: string;
  title: string;
  sources: CitationSource[];
  suggestions: string[];
  /** Put in the input, not sent: a session's "Ask the tutor" (`?ask=`). H16: words, never a chip. */
  initialDraft?: string;
  /** `studioEnabled()` on the server: whether to ask the studio at all (D67). */
  studio?: boolean;
  /** Set when the concept's review card is due (R3): the note's first check to open on, or null to ask the model. */
  recall?: { question: string | null } | null;
}) {
  const router = useRouter();
  const key = threadKey(slug);
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  const turns = useMemo(() => parseThread(raw), [raw]);
  const hydrated = useHydrated();
  /**
   * How many turns were already stored when the page opened: those were said
   * before, and fade in; a turn at this index or later is new, and rises in.
   * Read from storage once, on the client, where the server's empty thread is
   * not the truth. "Start a new thread" puts it back to zero.
   */
  const [restored, setRestored] = useState(() => (typeof window === "undefined" ? 0 : parseThread(readRaw(key)).length));
  const setTurns = (next: ThreadItem[]) => writeTurns(key, next);
  const [sources, setSources] = useState(initialSources);
  // `?ask=` fills the field once. Its first send takes it off the URL
  // (`dropAsk`), so Back to this page, whose cached render still carries the
  // prefill, finds a URL without it and leaves the field empty.
  const [value, setValueState] = useState<Value>(() => ({
    text: initialDraft !== undefined && askInUrl() ? initialDraft : "",
    mentions: [],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  /* The studio's half: health, the lazy chunk, the swap and the hand-off. */
  const [health, setHealth] = useState<unknown>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  /** The @ composer is in the plain field's place; once in, it stays. */
  const [swapped, setSwapped] = useState(false);
  /** Whether the swapped-in field takes focus when it mounts: only when the plain one had it, after a send. */
  const [focusOnSwap, setFocusOnSwap] = useState(false);
  const [opening, setOpening] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const richRef = useRef<MentionComposerHandle | null>(null);
  // Read by the swap, which runs from callbacks that outlive the render that made them.
  const valueNow = useRef(value);
  const focused = useRef(false);
  const kitNow = useRef<Kit | null>(null);
  const setValue = useCallback((next: Value) => {
    valueNow.current = next;
    setValueState(next);
  }, []);

  /**
   * Swap the @ composer in if the field is idle: loaded, empty and not
   * focused (D68). `afterSend` is the one moment a focused field may be
   * swapped, since it has just been emptied and nothing is being composed;
   * the new field then takes the focus.
   */
  const swapIfIdle = useCallback((afterSend = false) => {
    if (kitNow.current === null) return;
    const held = valueNow.current;
    if (held.text !== "" || held.mentions.length > 0) return;
    if (focused.current && !afterSend) return;
    setFocusOnSwap(afterSend && focused.current);
    setSwapped(true);
  }, []);

  const readAt = useRef(0);
  const kitAsked = useRef(false);
  const check = useCallback(async () => {
    readAt.current = Date.now();
    const answer = await readHealth();
    setHealth(answer);
    if (!studioCanTag(answer) || kitAsked.current) return;
    kitAsked.current = true;
    try {
      const loaded = await import("./TutorStudioKit");
      kitNow.current = loaded;
      setKit(loaded);
      swapIfIdle();
    } catch {
      // A chunk that will not load costs the tags, never the tutor: the
      // plain field stays, as the studio's own fallback does (D68).
    }
  }, [swapIfIdle]);

  useEffect(() => {
    if (!studio) return;
    // One read once the page is idle, so the page never waits on the runner,
    // then on focus at most every 30 seconds (D67).
    const cancel = whenIdle(() => void check());
    const onFocus = () => {
      if (Date.now() - readAt.current >= HEALTH_READ_MS) void check();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancel();
      window.removeEventListener("focus", onFocus);
    };
  }, [studio, check]);

  const onFieldFocus = () => {
    focused.current = true;
  };
  const onFieldBlur = (event: FocusEvent<HTMLDivElement>) => {
    // Focus moving to Send, or into the menu, is still the field's.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    // The window lost focus (another app, another tab): the field keeps it
    // and its caret, and gets it back with the window, so nothing is swapped.
    if (!document.hasFocus()) return;
    focused.current = false;
    swapIfIdle();
  };

  const scrolledOnce = useRef(false);
  useEffect(() => {
    // The thread box scrolls, never the page: on a phone the page is where the
    // learner is reading.
    const box = threadRef.current;
    if (!box) return;
    const glide = scrolledOnce.current && turns.length > 0 && !prefersReducedMotion();
    scrolledOnce.current = turns.length > 0;
    if (glide) box.scrollTo({ top: box.scrollHeight, behavior: scrollBehavior() });
    else box.scrollTop = box.scrollHeight;
  }, [turns.length, busy]);

  /** The thread as stored right now: async work writes onto this, never onto a render's copy. */
  const current = () => parseThread(readRaw(key));

  /** Change the verdict with this request id, wherever its turn now sits. */
  function patchVerdict(requestId: string, patch: Partial<Verdict>) {
    writeTurns(
      key,
      current().map((item) =>
        item.role === "user" && item.verdict?.requestId === requestId ? { ...item, verdict: { ...item.verdict, ...patch } } : item,
      ),
    );
  }

  async function judge(verdict: Verdict, answer: string) {
    try {
      const res = await fetch("/api/agent/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptSlug: slug, question: verdict.question, answer: answer.slice(0, CHAT_ANSWER_LIMIT) }),
      });
      const data = (await res.json().catch(() => ({}))) as { verdict?: { correct?: unknown; feedback?: unknown } };
      if (res.ok && typeof data.verdict?.correct === "boolean") {
        patchVerdict(verdict.requestId, {
          judged: "ready",
          suggested: data.verdict.correct,
          feedback: typeof data.verdict.feedback === "string" ? data.verdict.feedback : null,
        });
        return;
      }
    } catch {
      // Unreachable or refused: the learner still chooses, with nothing pre-selected.
    }
    patchVerdict(verdict.requestId, { judged: "unavailable", suggested: null });
  }

  /** Request ids with a write in flight from this page: a second tap waits on the first, whatever the store says. */
  const recording = useRef(new Set<string>());

  /** The learner's tap: one observation, replayed rather than doubled on a retry by its request id. */
  async function record(requestId: string, tappedNow: boolean) {
    const turn = current().find(
      (item): item is TutorTurn => item.role === "user" && item.verdict?.requestId === requestId,
    );
    const verdict = turn?.verdict;
    if (!turn || !verdict || verdict.state === "saving" || verdict.state === "recorded") return;
    if (recording.current.has(requestId)) return;
    // Once tapped, the verdict is fixed: a retry resends the same one (see `Verdict.tapped`).
    const correct = verdict.tapped ?? tappedNow;
    recording.current.add(requestId);
    patchVerdict(requestId, { state: "saving", tapped: correct, error: null });
    // The thread's session (R6): the first recorded answer opens it, on the server, in its own transaction.
    const session = () => {
      const held = readSession(slug);
      if (held !== null) return held;
      const id = newSessionId(slug, new Date(), requestToken().slice(5), "chat");
      writeSession(slug, id);
      return id;
    };
    const send = (sessionId: string) =>
      fetch("/api/learner/observe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptSlug: slug,
          correct,
          source: verdict.source,
          requestId,
          sessionId,
          question: verdict.question,
          // `chosen` is what the learner gave; `answer` is the right one, which a chat check has no key for.
          chosen: turn.content.slice(0, SESSION_TEXT_LIMIT),
        }),
        keepalive: true,
      });
    try {
      let res = await send(session());
      let data = (await res.json().catch(() => null)) as ObserveReply | null;
      // A session closed elsewhere (another tab, `learn session close`) refuses the answer with
      // nothing written; the thread starts a fresh one and sends the same answer once more.
      if (res.status === 400 && /session/i.test(data?.error ?? "")) {
        writeSession(slug, null);
        res = await send(session());
        data = (await res.json().catch(() => null)) as ObserveReply | null;
      }
      if (!res.ok || !data?.ok || !data.result) {
        throw new Error(
          res.status === 429 ? "Too many answers in a minute." : (data?.error ?? `The answer was not recorded (HTTP ${res.status}).`),
        );
      }
      const r = data.result;
      patchVerdict(requestId, {
        state: "recorded",
        error: null,
        recorded: { correct: r.correct, pLBefore: r.pLBefore, pLAfter: r.pLAfter, intervalDays: r.card?.intervalDays ?? null },
      });
      // The page's mastery dot, Recent answers and checks read the new state.
      router.refresh();
    } catch (e) {
      patchVerdict(requestId, { state: "failed", error: e instanceof Error ? e.message : "The answer was not recorded." });
    } finally {
      recording.current.delete(requestId);
    }
  }

  // Once per mount: whatever a reload cut off (a judge still pending, a write
  // still saving) is settled, so a row is never left waiting on a request
  // this page did not send. Never per render, or a live save would reopen.
  useEffect(() => {
    const items = parseThread(readRaw(key));
    let changed = false;
    const settled = items.map((item) => {
      if (item.role !== "user" || !item.verdict) return item;
      const next = settleInterrupted(item.verdict);
      if (next === null) return item;
      changed = true;
      return { ...item, verdict: next };
    });
    if (changed) writeTurns(key, settled);
  }, [key]);

  // R6: the thread's session closes when the page goes away, by navigation
  // inside the app (unmount) or out of it (`pagehide`). Best-effort.
  useEffect(() => {
    const onHide = () => closeSession(slug);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      closeSession(slug);
    };
  }, [slug]);

  // R3: a due concept opens on the tutor. Once per mount, after hydration,
  // and only into an empty thread: a thread the learner already has is theirs.
  const opened = useRef(false);
  useEffect(() => {
    if (!hydrated || recall === null || opened.current) return;
    opened.current = true;
    if (parseThread(readRaw(key)).length > 0) return;
    if (recall.question) {
      writeTurns(key, [recallOpening(title, recall.question)]);
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conceptSlug: slug, messages: [{ role: "user", content: RECALL_SEED }] }),
        });
        const data = (await res.json().catch(() => ({}))) as ChatReply;
        const content = data.message?.content?.trim();
        // Only a reply that asked a check opens the thread; anything else leaves the greeting.
        if (res.ok && content && data.check?.question && parseThread(readRaw(key)).length === 0) {
          writeTurns(key, [{ role: "assistant", content, check: { question: data.check.question } }]);
        }
      } catch {
        // The greeting stays; the learner can still ask for a check.
      } finally {
        setBusy(false);
      }
    })();
  }, [hydrated, recall, key, slug, title]);

  async function ask(
    question: string,
    history: ThreadItem[] = turns,
    { answering = true, carried }: { answering?: boolean; carried?: TutorTurn } = {},
  ) {
    const text = question.trim();
    if (!text || busy || opening) return;
    // The learner's reply to a turn that asked a check is its answer, and gets a row.
    const asked = answering && carried === undefined ? pendingCheck(history) : null;
    const askedTurn = asked === null ? null : (history[asked] as TutorTurn);
    const userTurn: TutorTurn =
      carried ??
      (askedTurn?.check
        ? {
            role: "user",
            content: text,
            verdict: newVerdict(askedTurn.check.question, requestToken(), checkSource(history, asked as number)),
          }
        : { role: "user", content: text });
    const next: ThreadItem[] = [...history, userTurn];
    setTurns(next);
    if (userTurn.verdict && userTurn.verdict.judged === "pending") void judge(userTurn.verdict, text);
    setValue(EMPTY);
    setRefusal(null);
    dropAsk();
    swapIfIdle(true);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Markers are the person's record of a hand-off, not the tutor's turns.
        // A thread that opened on the tutor's recall question is sent with the seed before it.
        body: JSON.stringify({ conceptSlug: slug, messages: requestTurns(next) }),
      });
      const data = (await res.json().catch(() => ({}))) as ChatReply;
      if (!res.ok) throw new Error(errorFor(res.status, data));
      const content = data.message?.content?.trim();
      if (!content) throw new Error("The tutor sent an empty reply. Try asking again.");
      if (Array.isArray(data.sources) && data.sources.length > 0) setSources(data.sources);
      // Onto the stored thread, not `next`: the judge may have written the verdict meanwhile.
      const reply: TutorTurn = { role: "assistant", content };
      if (data.check?.question) reply.check = { question: data.check.question };
      setTurns([...current(), reply]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }

  /** Ask the last question again after a failure, without a second copy of it. */
  function retry() {
    // The unanswered question, past any hand-off marker after it: asked
    // again from where it was, so the thread never holds it twice.
    const at = turns.findLastIndex((item) => item.role !== "studio");
    const unanswered = turns[at];
    if (unanswered?.role !== "user") return;
    // The same turn goes back, verdict and all, so an answer keeps its row and request id.
    void ask(unanswered.content, [...turns.slice(0, at), ...turns.slice(at + 1)], { carried: unanswered });
  }

  function prefill(question: string) {
    // The field is locked with the message going to the studio in it.
    if (opening) return;
    setValue({ text: question, mentions: [] });
    if (swapped) richRef.current?.focus();
    else inputRef.current?.focus();
  }

  /** A send from the @ composer: the tutor's without a chip, the studio's with one (D64). */
  function submitTagged(sent: Value) {
    if (kit === null) return;
    const body = kit.trimValue(sent);
    if (kit.isEmptyValue(body)) return;
    if (body.mentions.length === 0) void ask(body.text);
    else void handOff(body);
  }

  async function handOff(body: Value) {
    if (kit === null || busy || opening) return;
    setOpening(true);
    setRefusal(null);
    const outcome = await kit.openInStudio({ slug, title, items: parseThread(readRaw(key)), value: body });
    if (!outcome.ok) {
      // The message and its chips stay in the field; nothing reached either agent.
      setOpening(false);
      setRefusal(outcome.text);
      return;
    }
    // The field stays locked until the page has gone, so nothing typed now is lost.
    writeTurns(key, [...parseThread(readRaw(key)), outcome.marker]);
    setValue(EMPTY);
    dropAsk();
    router.push(outcome.href);
  }

  const known = sources.map((s) => s.n);
  const byNumber = new Map(sources.map((s) => [s.n, s]));
  const lastTutor = turns.map((t) => t.role).lastIndexOf("assistant");
  // The tutor's last turn, markers left out: a hand-off after an unanswered
  // question must not hide its Try again.
  const last = chatTurns(turns).at(-1);
  const note = byNumber.get(1);
  // Where each verdict row is drawn: under the tutor's reply to the answer,
  // or under the answer itself while that reply is missing. Only the newest
  // answer's row stays open; an older untapped one folds.
  const lastVerdict = turns.findLastIndex((t) => t.role === "user" && t.verdict);
  const rowsAfter = new Map<number, { at: number; verdict: Verdict }>();
  turns.forEach((t, i) => {
    if (t.role !== "user" || !t.verdict) return;
    rowsAfter.set(turns[i + 1]?.role === "assistant" ? i + 1 : i, { at: i, verdict: t.verdict });
  });
  const rowAfter = (i: number) => {
    const row = rowsAfter.get(i);
    return row ? (
      <VerdictRow
        key={`v${row.at}`}
        verdict={row.verdict}
        live={row.at === lastVerdict}
        onRecord={(correct) => void record(row.verdict.requestId, correct)}
      />
    ) : null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* From 900px up the panel is only as tall as the viewport leaves it, so
          the thread gives up height before the chips and the composer do. */}
      <div
        ref={threadRef}
        className="-mx-1 flex min-h-[280px] flex-1 flex-col gap-4 overflow-y-auto px-1 py-1 min-[900px]:min-h-32"
        aria-live="polite"
        aria-busy={busy}
      >
        {turns.length === 0 && (
          <TutorMessage
            cites={note && <Cite n={note.n} label={note.label} href={note.href} />}
            // Unseen until hydration has said there is no stored thread to show instead.
            className={hydrated ? "animate-fade-in motion-reduce:animate-none" : "opacity-0"}
          >
            <p className="max-w-[60ch]">
              Ask me anything about {title}. I answer from your note and cite it as [1], and I will check you as we
              go.
            </p>
          </TutorMessage>
        )}

        {turns.flatMap((turn, i) => {
          const enter = i < restored ? "animate-fade-in motion-reduce:animate-none" : "animate-enter motion-reduce:animate-none";
          const item = turn.role === "studio" ? (
            <Handed key={i} marker={turn} className={enter} />
          ) : turn.role === "user" ? (
            <UserMessage key={i} className={enter}>
              <MathText text={turn.content} />
            </UserMessage>
          ) : (
            <TutorMessage
              key={i}
              className={enter}
              cites={citedNumbers(turn.content, known).map((n) => {
                const s = byNumber.get(n);
                return s ? <Cite key={n} n={n} label={s.label} href={s.href} /> : null;
              })}
              actions={
                i === lastTutor && !busy ? (
                  // The hi-fi's "Save to note" joins Why? here once a turn can be
                  // written to the note (DESIGN.md: extend POST /api/learner/note).
                  <Button variant="ghost" size="sm" onClick={() => void ask("Why?", turns, { answering: false })}>
                    Why?
                  </Button>
                ) : undefined
              }
            >
              <NoteProse source={turn.content} idPrefix={`t${i}-`} />
            </TutorMessage>
          );
          return [item, rowAfter(i)];
        })}

        {busy && (
          <p className="animate-fade-in px-1.5 text-[13px] text-text3 motion-reduce:animate-none" role="status">
            The tutor is thinking…
          </p>
        )}

        {!busy && (error || last?.role === "user") && (
          // An error, or a thread restored after a reload that cut a request
          // off: either way the last question has no answer, so offer it again.
          <div
            role={error ? "alert" : "status"}
            className="flex animate-fade-in flex-wrap items-center gap-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-text motion-reduce:animate-none"
          >
            <span className="min-w-0 flex-1">{error ?? "Your last question has no answer yet."}</span>
            {last?.role === "user" && (
              <Button variant="secondary" size="sm" onClick={retry}>
                Try again
              </Button>
            )}
          </div>
        )}

        {turns.length > 0 && !busy && (
          <div className="flex animate-fade-in justify-center motion-reduce:animate-none">
            <button
              type="button"
              onClick={() => {
                // A new thread is a new session: the old one closes with what it recorded.
                closeSession(slug);
                setTurns([]);
                setRestored(0);
                setError(null);
              }}
              className="rounded-sm text-[12px] text-text3 underline-offset-4 transition-colors duration-100 hover:text-text2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Start a new thread
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
        {suggestions.map((q) => (
          <Chip key={q} onClick={() => prefill(q)}>
            {q}
          </Chip>
        ))}
      </div>

      {/* Under 768px the page scrolls, and the composer sticks to the bottom
          edge, above the home indicator, so a field that grows while the page
          is scrolled cannot end up below the screen with Send half hidden.
          The surface fill and the panel's 16px side padding keep what scrolls
          past from showing at its edges. From 768px it sits in the flow. */}
      <div
        onFocus={onFieldFocus}
        onBlur={onFieldBlur}
        className="flex flex-col gap-1.5 max-md:sticky max-md:bottom-[env(safe-area-inset-bottom)] max-md:z-10 max-md:-mx-4 max-md:bg-surface max-md:px-4 max-md:pt-1.5 max-md:pb-2"
      >
        {kit !== null && swapped ? (
          // The @ field fades in over the plain one it replaces.
          <div className="flex animate-fade-in flex-col motion-reduce:animate-none">
            <kit.TutorMentionField
              handleRef={richRef}
              value={value}
              onChange={setValue}
              onSubmit={submitTagged}
              label={`Ask the tutor about ${title}`}
              health={health}
              disabled={opening}
              sendDisabled={busy}
              disabledReason={opening ? kit.OPENING_THE_STUDIO : undefined}
              autoFocus={focusOnSwap}
            />
          </div>
        ) : (
          <Composer
            value={value.text}
            onChange={(text) => setValue({ text, mentions: [] })}
            onSubmit={(text) => void ask(text)}
            label={`Ask the tutor about ${title}`}
            placeholder="Ask about this concept"
            maxLength={INPUT_LIMIT}
            autoFocus={initialDraft !== undefined}
            inputRef={inputRef}
            sendDisabled={busy}
          />
        )}
        {refusal !== null && (
          <p role="alert" className="animate-fade-in rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-text motion-reduce:animate-none">
            {refusal}
          </p>
        )}
      </div>
    </div>
  );
}

/** Whether the page's URL still carries `?ask=`. Server-side, where there is no URL, it is taken to. */
function askInUrl(): boolean {
  return typeof window === "undefined" || new URLSearchParams(window.location.search).has("ask");
}

/** Take `?ask=` off the URL in place, once the question it prefilled has been sent. */
function dropAsk(): void {
  if (!askInUrl() || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("ask");
  // Next folds a native replaceState into its router (the docs' "Native History API").
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

const KIND_NAMES: Record<string, string> = { diagram: "Diagram", video: "Video" };

/**
 * A tagged message the studio took (D70): the words with their chips, as the
 * studio draws a sent message, and a link to the conversation it opened.
 */
function Handed({ marker, className }: { marker: HandoffMarker; className?: string }) {
  return (
    <div className={cx("flex flex-col items-end gap-1", className)}>
      <UserMessage className="w-full">
        {markerPieces(marker).map((piece, at) =>
          "text" in piece ? (
            <span key={at}>{piece.text}</span>
          ) : (
            <MentionChip
              key={at}
              name={KIND_NAMES[piece.kind] ?? piece.kind}
              icon={piece.kind === "diagram" || piece.kind === "video" ? piece.kind : null}
            />
          ),
        )}
      </UserMessage>
      <Link
        href={`/studio?draft=${encodeURIComponent(marker.draftId)}`}
        className="rounded-sm px-1.5 text-[12px] text-text2 underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Opened in the studio
      </Link>
    </div>
  );
}
