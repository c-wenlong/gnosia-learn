"use client";

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
import { TextLink } from "@/components/ui/TextLink";
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
  type HandoffMarker,
  type ThreadItem,
  type TutorTurn,
} from "@/lib/tutor-thread";
import { chatRequestId, closeChatSession, judgeAnswer, recordAnswer } from "@/lib/chat-recall";
import {
  choiceAnswerText,
  choiceOrder,
  gradeChoice,
  isCardCheck,
  isChoiceCheck,
  isRecallCheck,
  recallAnswerText,
  restoreCardCheck,
  settleChoice,
  type ChoiceAnswer,
  type ChoicePick,
  type RecallPick,
} from "@/lib/check-block";
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

import { ChoiceCheckCard } from "./ChoiceCheckCard";
import { RecallCheckCard } from "./RecallCheckCard";
import { VerdictRow } from "./VerdictRow";
import { NOTE_HASH } from "./WorkspacePanels";

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
 * **A choice check records on submit**
 * (docs/proposals/structured-checks.md, phase 1). A tutor turn that ended
 * with a choice block arrives with a `check` carrying its options and key,
 * and gets a card instead of the composer as its answer box. Submit grades
 * the pick against the key, records it at once with the confidence and the
 * reasoning (K4, K5), and sends the tutor a `<check_answer>` block as the
 * learner's turn, which the thread keeps but does not draw: the card shows
 * the answer. A message typed instead folds the card to "Not answered".
 *
 * **A recall check is judged against the tutor's own answer** (phase 2). A
 * turn that ended with a recall block gets a card with a box for the
 * learner's words. Submit shows the answer the tutor committed to under
 * theirs, asks the judge with that answer as its first reference, and sends
 * the tutor a `<check_answer>` block with the words, the confidence and the
 * reasoning; the request puts the asking turn's block back (`requestTurns`),
 * so the tutor grades against what it committed to. The verdict row under
 * the card records with one tap, as for a `CHECK:` line (R2).
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
    return data.error ?? "The tutor has no model provider key yet. Add one in Settings, under Providers.";
  }
  if (data.code === "CONCEPT_UNAVAILABLE") return "The knowledge base is unreachable, so the tutor has no note to read.";
  if (status === 429) return "That was a lot of questions in a minute. Wait a moment and try again.";
  return data.error ?? `The tutor did not answer (HTTP ${status}).`;
}

type Value = MentionValue<DraftKind>;


type Kit = typeof import("./TutorStudioKit");

const EMPTY: Value = { text: "", mentions: [] };


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

  async function judge(verdict: Verdict, answer: string, commitment: string | null = null) {
    const verdictNow = await judgeAnswer(slug, verdict.question, answer, commitment);
    patchVerdict(
      verdict.requestId,
      verdictNow === null
        ? { judged: "unavailable", suggested: null }
        : { judged: "ready", suggested: verdictNow.correct, feedback: verdictNow.feedback },
    );
  }

  /** Request ids with a write in flight from this page: a second tap waits on the first, whatever the store says. */
  const recording = useRef(new Set<string>());

  /** The learner's tap: one observation, replayed rather than doubled on a retry by its request id. */
  async function record(requestId: string, tappedNow: boolean) {
    const items = current();
    const at = items.findIndex((item) => item.role === "user" && item.verdict?.requestId === requestId);
    const turn = items[at] as TutorTurn | undefined;
    const verdict = turn?.verdict;
    // A recall card's answer records its words against the tutor's commitment, with its confidence and reasoning.
    const asked = items.slice(0, Math.max(at, 0)).findLast((item): item is TutorTurn => item.role === "assistant");
    const recall = turn?.recall && isRecallCheck(asked?.check) ? { pick: turn.recall, check: asked.check } : null;
    if (!turn || !verdict || verdict.state === "saving" || verdict.state === "recorded") return;
    if (recording.current.has(requestId)) return;
    // Once tapped, the verdict is fixed: a retry resends the same one (see `Verdict.tapped`).
    const correct = verdict.tapped ?? tappedNow;
    recording.current.add(requestId);
    patchVerdict(requestId, { state: "saving", tapped: correct, error: null });
    try {
      const recorded = await recordAnswer({
        scope: slug,
        sessionLabel: slug,
        conceptSlug: slug,
        correct,
        source: verdict.source,
        requestId,
        question: verdict.question,
        answer: turn.content,
        ...(recall !== null
          ? {
              card: {
                key: recall.check.answer,
                chosen: recall.pick.answer,
                confidence: recall.pick.confidence,
                thinking: recall.pick.thinking,
              },
            }
          : {}),
      });
      patchVerdict(requestId, { state: "recorded", error: null, recorded });
      // The page's mastery dot, Recent answers and checks read the new state.
      router.refresh();
    } catch (e) {
      // `recordAnswer` names a timeout and a write dropped after a close itself.
      patchVerdict(requestId, { state: "failed", error: e instanceof Error ? e.message : "The answer was not recorded." });
    } finally {
      recording.current.delete(requestId);
    }
  }

  /** Change the choice answer with this request id, wherever its turn now sits. */
  function patchChoice(requestId: string, patch: Partial<ChoiceAnswer>) {
    writeTurns(
      key,
      current().map((item) =>
        item.role === "user" && item.choice?.requestId === requestId ? { ...item, choice: { ...item.choice, ...patch } } : item,
      ),
    );
  }

  /** Write a choice card's answer: one observation, replayed rather than doubled on a retry by its request id. */
  async function recordChoice(requestId: string) {
    const items = current();
    const at = items.findIndex((item) => item.role === "user" && item.choice?.requestId === requestId);
    const turn = items[at] as TutorTurn | undefined;
    const choice = turn?.choice;
    const asked = items.slice(0, Math.max(at, 0)).findLast((item): item is TutorTurn => item.role === "assistant");
    if (!turn || !choice || !asked || !isChoiceCheck(asked.check)) return;
    if (choice.state === "recorded" || recording.current.has(requestId)) return;
    const check = asked.check;
    recording.current.add(requestId);
    patchChoice(requestId, { state: "saving", error: null });
    try {
      const recorded = await recordAnswer({
        scope: slug,
        sessionLabel: slug,
        conceptSlug: slug,
        correct: choice.correct,
        source: choice.source,
        requestId,
        question: check.question,
        answer: turn.content,
        card: {
          key: check.answer,
          chosen: choice.picked === null ? null : (check.options[choice.picked] ?? null),
          confidence: choice.confidence,
          thinking: choice.thinking,
        },
      });
      patchChoice(requestId, { state: "recorded", error: null, recorded });
      router.refresh();
    } catch (e) {
      patchChoice(requestId, { state: "failed", error: e instanceof Error ? e.message : "The answer was not recorded." });
    } finally {
      recording.current.delete(requestId);
    }
  }

  /** Submit on a choice card: graded against the key, recorded, and sent to the tutor as the learner's turn. */
  function submitChoice(askedAt: number, pick: ChoicePick) {
    const items = current();
    const asked = items[askedAt];
    if (busy || opening || asked?.role !== "assistant" || !isChoiceCheck(asked.check)) return;
    if (pendingCheck(items) !== askedAt) return;
    const choice: ChoiceAnswer = {
      ...pick,
      requestId: chatRequestId(),
      correct: gradeChoice(asked.check, pick),
      source: checkSource(items, askedAt),
      state: "saving",
      error: null,
      recorded: null,
    };
    const answerTurn: TutorTurn = { role: "user", content: choiceAnswerText(asked.check, pick), choice };
    // `ask` stores the turn before it awaits anything, so the write below finds it.
    void ask(answerTurn.content, items, { carried: answerTurn });
    void recordChoice(choice.requestId);
  }

  /** Submit on a recall card: judged against the commitment, sent to the tutor, and recorded on the learner's tap. */
  function submitRecall(askedAt: number, pick: RecallPick) {
    const items = current();
    const asked = items[askedAt];
    if (busy || opening || asked?.role !== "assistant" || !isRecallCheck(asked.check)) return;
    if (pendingCheck(items) !== askedAt) return;
    const verdict = newVerdict(asked.check.question, chatRequestId(), checkSource(items, askedAt));
    const answerTurn: TutorTurn = { role: "user", content: recallAnswerText(pick), recall: pick, verdict };
    // `ask` stores the turn before it awaits anything, so the judge's verdict finds it.
    void ask(answerTurn.content, items, { carried: answerTurn });
    void judge(verdict, pick.answer, asked.check.answer);
  }

  // Once per mount: whatever a reload cut off (a judge still pending, a write
  // still saving) is settled, so a row is never left waiting on a request
  // this page did not send. Never per render, or a live save would reopen.
  useEffect(() => {
    const items = parseThread(readRaw(key));
    let changed = false;
    const settled = items.map((item) => {
      if (item.role !== "user") return item;
      if (item.choice) {
        const next = settleChoice(item.choice);
        if (next === null) return item;
        changed = true;
        return { ...item, choice: next };
      }
      if (!item.verdict) return item;
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
    const onHide = () => closeChatSession(slug);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      closeChatSession(slug);
    };
  }, [slug]);

  // R3: a due concept opens on the tutor. Once per mount, after hydration,
  // and only into an empty thread: a thread the learner already has is theirs.
  const opened = useRef(false);
  const [openingFailed, setOpeningFailed] = useState(false);
  /** The model opening in flight, aborted if the page goes away so a late reply never lands in the thread. */
  const openingRequest = useRef<AbortController | null>(null);
  useEffect(() => () => openingRequest.current?.abort(), []);

  /** Ask the model for the opening recall question (a note with no check). Retryable from the row it leaves on failure. */
  async function askOpening() {
    const controller = new AbortController();
    openingRequest.current = controller;
    setOpeningFailed(false);
    setBusy(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptSlug: slug, messages: [{ role: "user", content: RECALL_SEED }] }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as ChatReply;
      const content = data.message?.content?.trim();
      if (controller.signal.aborted) return;
      // Only a reply that asked a check opens the thread, and only an empty one.
      if (res.ok && content && data.check?.question) {
        if (parseThread(readRaw(key)).length === 0) {
          writeTurns(key, [{ role: "assistant", content, check: restoreCardCheck(data.check) ?? { question: data.check.question } }]);
        }
        return;
      }
      setOpeningFailed(true);
    } catch {
      if (!controller.signal.aborted) setOpeningFailed(true);
    } finally {
      if (openingRequest.current === controller) openingRequest.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    if (!hydrated || recall === null || opened.current) return;
    opened.current = true;
    if (parseThread(readRaw(key)).length > 0) return;
    if (recall.question) {
      writeTurns(key, [recallOpening(title, recall.question)]);
      return;
    }
    // Started from a callback, so the effect itself sets no state.
    void Promise.resolve().then(askOpening);
    // `askOpening` reads only what these name; listing it would re-run the opening on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, recall, key, slug, title]);

  /**
   * Recall into a thread that already has turns: the card is due, but the
   * learner came back to a conversation they had. The note's check is added
   * as the tutor's next turn; with no check, the tutor is asked for one in a
   * learner turn the thread shows.
   */
  function recallNow() {
    if (recall === null || busy) return;
    if (recall.question) {
      writeTurns(key, [...current(), recallOpening(title, recall.question)]);
      return;
    }
    void ask("Ask me one recall question about this concept.", current());
  }

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
      // A card check is answered on its card; a message typed instead is a message.
      (askedTurn?.check && !isCardCheck(askedTurn.check)
        ? {
            role: "user",
            content: text,
            verdict: newVerdict(askedTurn.check.question, chatRequestId(), checkSource(history, asked as number)),
          }
        : { role: "user", content: text });
    const next: ThreadItem[] = [...history, userTurn];
    setTurns(next);
    // A recall card's answer is judged by `submitRecall`, on the learner's words and the commitment, not on this block.
    if (userTurn.verdict && userTurn.verdict.judged === "pending" && !userTurn.recall) void judge(userTurn.verdict, text);
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
      if (data.check?.question) reply.check = restoreCardCheck(data.check) ?? { question: data.check.question };
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
    // A recall card draws its own answer's row.
    if (t.role !== "user" || !t.verdict || t.recall) return;
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
        concept={{ title, noteHref: NOTE_HASH }}
      />
    ) : null;
  };

  /** The card under a tutor turn that asked a card check, with the answer the next learner turn gave, if any. */
  const pendingAt = pendingCheck(turns);
  const cardAfter = (i: number) => {
    const turn = turns[i];
    if (turn?.role !== "assistant" || !isCardCheck(turn.check)) return null;
    const nextAt = turns.findIndex((t, j) => j > i && t.role !== "studio");
    const next = nextAt === -1 ? undefined : (turns[nextAt] as TutorTurn);
    if (isRecallCheck(turn.check)) {
      const answered = next?.role === "user" && next.recall ? next : null;
      return (
        <RecallCheckCard
          key={`c${i}`}
          check={turn.check}
          pick={answered?.recall ?? null}
          verdict={answered?.verdict ?? null}
          live={pendingAt === i}
          rowLive={nextAt === lastVerdict}
          disabled={busy || opening}
          onSubmit={(pick) => submitRecall(i, pick)}
          onRecord={(correct) => answered?.verdict && void record(answered.verdict.requestId, correct)}
          concept={{ title, noteHref: NOTE_HASH }}
        />
      );
    }
    const answer = next?.role === "user" ? (next.choice ?? null) : null;
    const answerId = answer?.requestId;
    return (
      <ChoiceCheckCard
        key={`c${i}`}
        check={turn.check}
        order={choiceOrder(turn.check, `${slug}#${i}#${turn.check.question}`)}
        answer={answer}
        live={pendingAt === i}
        disabled={busy || opening}
        onSubmit={(pick) => submitChoice(i, pick)}
        onRetry={() => answerId !== undefined && void recordChoice(answerId)}
        concept={{ title, noteHref: NOTE_HASH }}
      />
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* Where the panels fit (`ws:`) the panel is only as tall as the viewport leaves it, so
          the thread gives up height before the chips and the composer do. */}
      <div
        ref={threadRef}
        className="relative -mx-1 flex min-h-[280px] flex-1 flex-col gap-4 overflow-y-auto px-1 py-1 ws:min-h-32"
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
          // A card's answer is the card's to show; the turn holds what the tutor was sent.
          if (turn.role === "user" && (turn.choice || turn.recall)) return [rowAfter(i)];
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
          return [item, cardAfter(i), rowAfter(i)];
        })}

        {busy && (
          <p className="animate-fade-in px-1.5 text-[13px] text-text3 motion-reduce:animate-none" role="status">
            The tutor is thinking…
          </p>
        )}

        {!busy && recall !== null && turns.length > 0 && pendingCheck(turns) === null && (
          // R3 on a thread the learner already had: the card is due, so recall is one press away.
          <div className="flex animate-fade-in flex-wrap items-center gap-3 rounded-xl bg-surface2 px-4 py-3 text-[13px] text-text motion-reduce:animate-none">
            <span className="min-w-0 flex-1">This concept&apos;s review is due.</span>
            <Button variant="secondary" size="sm" onClick={recallNow}>
              Recall now
            </Button>
          </div>
        )}

        {!busy && openingFailed && turns.length === 0 && (
          // R3: the model could not open on a recall question; the learner can ask again.
          <div role="status" className="flex animate-fade-in flex-wrap items-center gap-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-text motion-reduce:animate-none">
            <span className="min-w-0 flex-1">This review is due, but the tutor could not open on a recall question.</span>
            <Button variant="secondary" size="sm" onClick={() => void askOpening()}>
              Try again
            </Button>
          </div>
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

        {turns.length > 0 &&
          !busy &&
          !turns.some((t) => t.role === "user" && (t.verdict?.state === "saving" || t.choice?.state === "saving")) && (
          <div className="flex animate-fade-in justify-center motion-reduce:animate-none">
            <TextLink
              onClick={() => {
                // A new thread is a new session: the old one closes with what it recorded.
                closeChatSession(slug);
                setTurns([]);
                setRestored(0);
                setError(null);
                // A due card opens the new thread on recall, as an empty one does on arrival (R3).
                if (recall !== null) {
                  if (recall.question) writeTurns(key, [recallOpening(title, recall.question)]);
                  else void askOpening();
                }
              }}
              tone="muted"
              size="xs"
              weight="normal"
            >
              Start a new thread
            </TextLink>
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
      <TextLink href={`/studio?draft=${encodeURIComponent(marker.draftId)}`} tone="muted" size="xs" weight="normal" className="px-1.5">
        Opened in the studio
      </TextLink>
    </div>
  );
}
