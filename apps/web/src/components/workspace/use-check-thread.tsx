"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { chatRequestId, closeChatSession, judgeAnswer, recordAnswer } from "@/lib/chat-recall";
import {
  choiceAnswerText,
  choiceOrder,
  gradeChoice,
  isCardCheck,
  isChoiceCheck,
  isRecallCheck,
  recallAnswerText,
  settleChoice,
  type ChoiceAnswer,
  type ChoicePick,
  type RecallPick,
} from "@gnosia/tutor/check-block";
import {
  checkSource,
  newVerdict,
  pendingCheck,
  settleInterrupted,
  type TurnCheck,
  type Verdict,
} from "@gnosia/tutor/tutor-check";

import { ChoiceCheckCard } from "./ChoiceCheckCard";
import { RecallCheckCard } from "./RecallCheckCard";
import { VerdictRow } from "./VerdictRow";

/**
 * The check machinery a tutor thread shares (docs/proposals/recall-in-chat.md
 * and structured-checks.md): a prose check's verdict row and the learner's
 * tap, a choice card graded on submit and recorded at once, a recall card
 * judged against the tutor's commitment and recorded on the tap, the judge
 * call, the guard against a doubled write, the settle of whatever a reload
 * cut off, and the chat session closed when the page goes away.
 *
 * The concept tutor (`TutorChat`, a thread in `sessionStorage`) and the
 * course topic tutor (`AgentSession`, a thread in state) used to carry a
 * copy each, and the copies drifted. What still differs is passed in: where
 * the thread lives (`store`), which concept a check records against
 * (`conceptOf`), and how a new turn is made (`newTurn`).
 */

/** A thread item as this hook reads it: a turn, or something else (a studio marker) it steps over. */
export interface CheckItem {
  role: "user" | "assistant" | "studio";
  content?: string;
  check?: TurnCheck | null;
  verdict?: Verdict | null;
  choice?: ChoiceAnswer | null;
  recall?: RecallPick | null;
}

/** The fields of a learner turn this hook builds; `newTurn` makes a thread item of them. */
export interface AnswerFields {
  role: "user";
  content: string;
  verdict?: Verdict;
  choice?: ChoiceAnswer;
  recall?: RecallPick;
}

/** Where the thread lives. `read` is the thread right now, never a render's copy: async work writes onto it. */
export interface ThreadStore<T extends CheckItem> {
  read: () => readonly T[];
  write: (items: T[]) => void;
}

export interface CheckThreadOptions<T extends CheckItem> {
  store: ThreadStore<T>;
  /** The chat session's scope (R6): one per thread, closed when the page goes away. */
  scope: string;
  /** The label a new session carries. */
  sessionLabel: string;
  /** The session's title and goal, when the thread spans several concepts. */
  sessionTitle?: string;
  sessionGoal?: string;
  /** The concept a check asked by this tutor turn records against, or null when it names none this thread may record. */
  conceptOf: (asked: T) => string | null;
  /** A learner turn as the store keeps it; `concept` is the one it answers. */
  newTurn: (fields: AnswerFields, concept: string) => T;
}

/** What `checkSlots` draws a card or a row with. */
export interface SlotOptions<T extends CheckItem> {
  /** Busy: a reply on its way, or the page leaving. */
  disabled: boolean;
  /** The seed a choice card's option order is shuffled from. */
  orderSeed: (askedAt: number, asked: T) => string;
  /** The concept as the recorded card names it. */
  concept: (slug: string) => { title: string; noteHref: string };
  /** The answer turn built by a card's submit: store it and send it to the tutor. */
  send: (turn: T, items: readonly T[]) => void;
}

/**
 * A thread kept in memory for the life of the page (the topic tutor's): the
 * items to render, and a store whose `read` is the thread right now, so a
 * write that lands after a re-render never works on a stale copy.
 */
export function useMemoryThread<T extends CheckItem>(): [readonly T[], ThreadStore<T>] {
  const [store] = useState(() => {
    let items: T[] = [];
    const listeners = new Set<() => void>();
    return {
      read: () => items,
      write: (next: T[]) => {
        items = next;
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  });
  const items = useSyncExternalStore(store.subscribe, store.read, store.read);
  return [items, store];
}

const failed = (e: unknown) => (e instanceof Error ? e.message : "The answer was not recorded.");

/**
 * The thread's handlers, outside React: they read the options the hook last
 * configured, so a write that lands after a re-render works on the thread
 * as it is now.
 */
function createCheckThread<T extends CheckItem>() {
  let opts: CheckThreadOptions<T> & { refresh: () => void };
  /** Request ids with a write in flight from this page: a second tap waits on the first, whatever the store says. */
  const recording = new Set<string>();
  const configure = (next: CheckThreadOptions<T> & { refresh: () => void }) => {
    opts = next;
  };

  /** The tutor turn a learner turn answered: the last one before it. */
  const askedBefore = (items: readonly T[], at: number) =>
    items.slice(0, Math.max(at, 0)).findLast((item) => item.role === "assistant");

  /** Change the verdict with this request id, wherever its turn now sits. */
  function patchVerdict(requestId: string, patch: Partial<Verdict>) {
    const { store } = opts;
    store.write(
      store.read().map((item) =>
        item.role === "user" && item.verdict?.requestId === requestId ? { ...item, verdict: { ...item.verdict, ...patch } } : item,
      ),
    );
  }

  /** Change the choice answer with this request id, wherever its turn now sits. */
  function patchChoice(requestId: string, patch: Partial<ChoiceAnswer>) {
    const { store } = opts;
    store.write(
      store.read().map((item) =>
        item.role === "user" && item.choice?.requestId === requestId ? { ...item, choice: { ...item.choice, ...patch } } : item,
      ),
    );
  }

  /** The judge's suggestion onto a verdict row; a judge that cannot answer leaves the row to the learner. */
  async function judge(verdict: Verdict, concept: string, answer: string, commitment: string | null = null) {
    const suggested = await judgeAnswer(concept, verdict.question, answer, commitment);
    patchVerdict(
      verdict.requestId,
      suggested === null
        ? { judged: "unavailable", suggested: null }
        : { judged: "ready", suggested: suggested.correct, feedback: suggested.feedback },
    );
  }

  const session = () => {
    const { scope, sessionLabel, sessionTitle, sessionGoal } = opts;
    return {
      scope,
      sessionLabel,
      ...(sessionTitle !== undefined ? { sessionTitle } : {}),
      ...(sessionGoal !== undefined ? { sessionGoal } : {}),
    };
  };

  /** The learner's tap: one observation, replayed rather than doubled on a retry by its request id. */
  async function record(requestId: string, tappedNow: boolean) {
    const items = opts.store.read();
    const at = items.findIndex((item) => item.role === "user" && item.verdict?.requestId === requestId);
    const turn = items[at];
    const verdict = turn?.verdict;
    const asked = askedBefore(items, at);
    const concept = asked === undefined ? null : opts.conceptOf(asked);
    if (!turn || !verdict || concept === null || verdict.state === "saving" || verdict.state === "recorded") return;
    if (recording.has(requestId)) return;
    // A recall card's answer records its words against the tutor's commitment, with its confidence and reasoning.
    const recall = turn.recall && isRecallCheck(asked?.check) ? { pick: turn.recall, check: asked.check } : null;
    // Once tapped, the verdict is fixed: a retry resends the same one (see `Verdict.tapped`).
    const correct = verdict.tapped ?? tappedNow;
    recording.add(requestId);
    patchVerdict(requestId, { state: "saving", tapped: correct, error: null });
    try {
      const recorded = await recordAnswer({
        ...session(),
        conceptSlug: concept,
        correct,
        source: verdict.source,
        requestId,
        question: verdict.question,
        answer: turn.content ?? "",
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
      // The page's mastery and the shell's learner snapshot read the new state.
      opts.refresh();
    } catch (e) {
      // `recordAnswer` names a timeout and a write dropped after a close itself.
      patchVerdict(requestId, { state: "failed", error: failed(e) });
    } finally {
      recording.delete(requestId);
    }
  }

  /** Write a choice card's answer: one observation, replayed rather than doubled on a retry by its request id. */
  async function recordChoice(requestId: string) {
    const items = opts.store.read();
    const at = items.findIndex((item) => item.role === "user" && item.choice?.requestId === requestId);
    const turn = items[at];
    const choice = turn?.choice;
    const asked = askedBefore(items, at);
    const concept = asked === undefined ? null : opts.conceptOf(asked);
    if (!turn || !choice || !asked || concept === null || !isChoiceCheck(asked.check)) return;
    if (choice.state === "recorded" || recording.has(requestId)) return;
    const check = asked.check;
    recording.add(requestId);
    patchChoice(requestId, { state: "saving", error: null });
    try {
      const recorded = await recordAnswer({
        ...session(),
        conceptSlug: concept,
        correct: choice.correct,
        source: choice.source,
        requestId,
        question: check.question,
        answer: turn.content ?? "",
        card: {
          key: check.answer,
          chosen: choice.picked === null ? null : (check.options[choice.picked] ?? null),
          confidence: choice.confidence,
          thinking: choice.thinking,
        },
      });
      patchChoice(requestId, { state: "recorded", error: null, recorded });
      opts.refresh();
    } catch (e) {
      patchChoice(requestId, { state: "failed", error: failed(e) });
    } finally {
      recording.delete(requestId);
    }
  }

  /**
   * The learner turn for a message typed in reply to the pending check: an
   * answer with a verdict row when that check is a prose one on a concept
   * this thread records, else a plain message (a card check is answered on
   * its card). The judge is asked at once; `send` stores the turn first.
   */
  function typedTurn(items: readonly T[], text: string): T {
    const askedAt = pendingCheck(items);
    const asked = askedAt === null ? undefined : items[askedAt];
    const concept = asked === undefined ? null : opts.conceptOf(asked);
    if (askedAt === null || !asked?.check || isCardCheck(asked.check) || concept === null) {
      return opts.newTurn({ role: "user", content: text }, concept ?? "");
    }
    const verdict = newVerdict(asked.check.question, chatRequestId(), checkSource(items, askedAt));
    return opts.newTurn({ role: "user", content: text, verdict }, concept);
  }

  /** Ask the judge for a typed answer's verdict, once its turn is stored. */
  function judgeTyped(turn: T, items: readonly T[]) {
    const verdict = turn.verdict;
    if (!verdict || verdict.judged !== "pending" || turn.recall) return;
    const at = items.indexOf(turn);
    const asked = askedBefore(items, at === -1 ? items.length : at);
    const concept = asked === undefined ? null : opts.conceptOf(asked);
    if (concept !== null) void judge(verdict, concept, turn.content ?? "");
  }

  /** Submit on a choice card: graded against the key, sent to the tutor, and recorded at once. */
  function submitChoice(askedAt: number, pick: ChoicePick, send: SlotOptions<T>["send"]) {
    const items = opts.store.read();
    const asked = items[askedAt];
    const concept = asked === undefined ? null : opts.conceptOf(asked);
    if (asked?.role !== "assistant" || !isChoiceCheck(asked.check) || concept === null) return;
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
    // `send` stores the turn before it awaits anything, so the write below finds it.
    send(opts.newTurn({ role: "user", content: choiceAnswerText(asked.check, pick), choice }, concept), items);
    void recordChoice(choice.requestId);
  }

  /** Submit on a recall card: judged against the commitment, sent to the tutor, and recorded on the learner's tap. */
  function submitRecall(askedAt: number, pick: RecallPick, send: SlotOptions<T>["send"]) {
    const items = opts.store.read();
    const asked = items[askedAt];
    const concept = asked === undefined ? null : opts.conceptOf(asked);
    if (asked?.role !== "assistant" || !isRecallCheck(asked.check) || concept === null) return;
    if (pendingCheck(items) !== askedAt) return;
    const verdict = newVerdict(asked.check.question, chatRequestId(), checkSource(items, askedAt));
    // `send` stores the turn before it awaits anything, so the judge's verdict finds it.
    send(opts.newTurn({ role: "user", content: recallAnswerText(pick), recall: pick, verdict }, concept), items);
    void judge(verdict, concept, pick.answer, asked.check.answer);
  }

  /** Settle whatever a reload cut off: a judge still pending, a write still saving. */
  function settle() {
    const { store } = opts;
    let changed = false;
    const settled = store.read().map((item) => {
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
    if (changed) store.write(settled);
  }

  return { configure, settle, record, recordChoice, submitChoice, submitRecall, typedTurn, judgeTyped };
}

export function useCheckThread<T extends CheckItem>(options: CheckThreadOptions<T>) {
  const router = useRouter();
  const { scope } = options;
  const [thread] = useState(() => createCheckThread<T>());
  // Before any effect or handler below runs, so they see this render's options.
  useLayoutEffect(() => {
    thread.configure({ ...options, refresh: () => router.refresh() });
  });

  // Once per thread: whatever a reload cut off (a judge still pending, a
  // write still saving) is settled, so a row is never left waiting on a
  // request this page did not send. Never per render, or a live save would
  // reopen. A thread kept in memory starts empty and has nothing to settle.
  useEffect(() => {
    thread.settle();
  }, [thread, scope]);

  // R6: the thread's session closes when the page goes away, by navigation
  // inside the app (unmount) or out of it (`pagehide`). Best-effort.
  useEffect(() => {
    const onHide = () => closeChatSession(scope);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      closeChatSession(scope);
    };
  }, [scope]);

  return thread;
}

/** The handlers `useCheckThread` returns. */
export type CheckThread<T extends CheckItem> = ReturnType<typeof createCheckThread<T>>;

/**
 * The card under each tutor turn that asked a card check, and the verdict
 * row under each typed answer: under the tutor's reply to it, or under the
 * answer itself while that reply is missing. Only the newest answer's row
 * stays open; an older untapped one folds.
 */
/** Where a thread's cards and rows go, worked out once per render in one pass over the thread. */
export interface SlotPlan {
  /** The tutor turn whose check is still waiting for an answer. */
  pendingAt: number | null;
  /** The newest answer with a verdict row: only its row stays open. */
  lastVerdict: number;
  /** Each verdict row by the item it is drawn after, with the answer's place and its concept. */
  rowsAfter: Map<number, { at: number; verdict: Verdict; concept: string | null }>;
}

export function slotPlan<T extends CheckItem>(items: readonly T[], conceptOf: (asked: T) => string | null): SlotPlan {
  const rowsAfter: SlotPlan["rowsAfter"] = new Map();
  let lastVerdict = -1;
  let asked: T | undefined;
  items.forEach((t, i) => {
    if (t.role === "assistant") asked = t;
    if (t.role !== "user" || !t.verdict) return;
    lastVerdict = i;
    // A recall card draws its own answer's row.
    if (t.recall) return;
    rowsAfter.set(items[i + 1]?.role === "assistant" ? i + 1 : i, {
      at: i,
      verdict: t.verdict,
      concept: asked === undefined ? null : conceptOf(asked),
    });
  });
  return { pendingAt: pendingCheck(items), lastVerdict, rowsAfter };
}

export function checkSlots<T extends CheckItem>(
  items: readonly T[],
  thread: CheckThread<T>,
  conceptOf: (asked: T) => string | null,
  slot: SlotOptions<T>,
  { pendingAt, lastVerdict, rowsAfter }: SlotPlan = slotPlan(items, conceptOf),
) {
  const { record, recordChoice, submitChoice, submitRecall } = thread;

  const rowAfter = (i: number): ReactNode => {
    const row = rowsAfter.get(i);
    return row ? (
      <VerdictRow
        key={`v${row.at}`}
        verdict={row.verdict}
        live={row.at === lastVerdict}
        onRecord={(correct) => void record(row.verdict.requestId, correct)}
        concept={row.concept === null ? undefined : slot.concept(row.concept)}
      />
    ) : null;
  };

  const cardAfter = (i: number): ReactNode => {
    const turn = items[i];
    if (turn?.role !== "assistant" || !isCardCheck(turn.check)) return null;
    const concept = conceptOf(turn);
    if (concept === null) return null;
    const nextAt = items.findIndex((t, j) => j > i && t.role !== "studio");
    const next = nextAt === -1 ? undefined : items[nextAt];
    if (isRecallCheck(turn.check)) {
      const answered = next?.role === "user" && next.recall ? next : null;
      return (
        <RecallCheckCard
          key={`c${i}`}
          check={turn.check}
          pick={answered?.recall ?? null}
          verdict={answered?.verdict ?? null}
          live={pendingAt === i}
          rowLive={answered !== null && nextAt === lastVerdict}
          disabled={slot.disabled}
          onSubmit={(pick) => !slot.disabled && submitRecall(i, pick, slot.send)}
          onRecord={(correct) => answered?.verdict && void record(answered.verdict.requestId, correct)}
          concept={slot.concept(concept)}
        />
      );
    }
    const answer = next?.role === "user" ? (next.choice ?? null) : null;
    const answerId = answer?.requestId;
    return (
      <ChoiceCheckCard
        key={`c${i}`}
        check={turn.check}
        order={choiceOrder(turn.check, slot.orderSeed(i, turn))}
        answer={answer}
        live={pendingAt === i}
        disabled={slot.disabled}
        onSubmit={(pick) => !slot.disabled && submitChoice(i, pick, slot.send)}
        onRetry={() => answerId !== undefined && void recordChoice(answerId)}
        concept={slot.concept(concept)}
      />
    );
  };

  return { cardAfter, rowAfter };
}

interface SlotProps<T extends CheckItem> {
  items: readonly T[];
  /** The thread item the slot sits after. */
  at: number;
  thread: CheckThread<T>;
  conceptOf: (asked: T) => string | null;
  slot: SlotOptions<T>;
  /** The thread's slot plan, built once per render (`slotPlan`), not once per slot. */
  plan: SlotPlan;
}

/** The card under the tutor turn at `at`, when it asked a card check. */
export function CheckCard<T extends CheckItem>({ items, at, thread, conceptOf, slot, plan }: SlotProps<T>) {
  return checkSlots(items, thread, conceptOf, slot, plan).cardAfter(at);
}

/** The verdict row drawn after the item at `at`, if one belongs there. */
export function CheckRow<T extends CheckItem>({ items, at, thread, conceptOf, slot, plan }: SlotProps<T>) {
  return checkSlots(items, thread, conceptOf, slot, plan).rowAfter(at);
}
