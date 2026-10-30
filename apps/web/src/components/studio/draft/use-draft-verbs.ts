"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { SaveOutcome } from "@/components/studio/ConfirmCard";
import { askToNotify } from "@/components/studio/JobsProvider";
import { usePanelHost } from "@/components/studio/panel-host";
import { cardKey, type CardKey, type Value } from "@/components/studio/draft/thread";
import { EMPTY_MENTION_VALUE, isEmptyValue, trimValue, valueOf } from "@/components/ui/mention-text";
import { kindDrawKey, valueBack, type LiveCard, type makeBoth } from "@/lib/studio-cards";
import { drawRefusal, sendRefusal, startOverStep, type DrawRefusal } from "@/lib/studio-chat";
import {
  abandonDraft,
  declineSuggestion,
  drawBoth,
  drawDraft,
  isDraftKind,
  refusalReason,
  releaseHold,
  saveBrief,
  sendMessage,
  setDraftTrust,
  stopWaiting,
  type DraftKind,
  type DraftView,
  type TagKind,
  type TranscriptBrief,
} from "@/lib/studio-drafts";
import type { Brief } from "@/lib/studio-jobs";
import { panelHref } from "@/lib/studio-view";

/** A card's refused press, kept against its card until the record says why. */
export type CardRefusals = Partial<Record<CardKey, DrawRefusal & { seq: number }>>;

/**
 * The conversation's verbs: a person turn, the consent card's answers, the
 * cards' presses, Start over, a brief's edit or release, and Stop waiting.
 * Each calls `studio-drafts.ts` and then reads the record again; the state
 * here is only what the record cannot hold: which presses are under way, and
 * the refusals each verb shows where its press was.
 */
export function useDraftVerbs({
  draftId,
  path,
  view,
  load,
  setPending,
  setValue,
  cards,
  both,
  editing,
  capRefused,
  thread,
  refreshJobs,
  startDraft,
}: {
  draftId: string;
  path: string;
  view: DraftView | null;
  load: () => Promise<DraftView | null>;
  setPending: Dispatch<SetStateAction<{ value: Value; seq: number | null } | null>>;
  setValue: Dispatch<SetStateAction<Value>>;
  cards: readonly LiveCard[];
  both: ReturnType<typeof makeBoth>;
  /** A card is being edited: its press and Send wait. */
  editing: boolean;
  capRefused: (detail: unknown) => void;
  /** The thread, where a saved edit's new press is found and focused. */
  thread: RefObject<HTMLDivElement | null>;
  refreshJobs: () => Promise<unknown>;
  startDraft: () => Promise<boolean>;
}) {
  const router = useRouter();
  const host = usePanelHost();
  const [sendError, setSendError] = useState<string | null>(null);
  /** A kind whose Always-allow write failed after its consent send landed: the error line's retry. */
  const [trustRetry, setTrustRetry] = useState<DraftKind | null>(null);
  /** The cards whose press is under way, each with its kind's job before the press. */
  const [pressing, setPressing] = useState<ReadonlyMap<DraftKind, string | null>>(new Map());
  const [refused, setRefused] = useState<CardRefusals>({});
  const [bothError, setBothError] = useState<string | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const [startOverError, setStartOverError] = useState<string | null>(null);
  const [waitError, setWaitError] = useState<string | null>(null);

  /**
   * One person turn. `keepComposer` is for a turn that was not typed in the
   * composer (the opener an Extend press hands over, a Try again, a consent
   * card's Allow), whose composer may hold a second message that sending this
   * one must not clear. `make` is the consent card's mark: the briefs this
   * turn earns start drawing themselves once they land (D107).
   */
  async function send(raw: Value, { keepComposer = false, make = false }: { keepComposer?: boolean; make?: boolean } = {}): Promise<boolean> {
    const body = trimValue(raw);
    if (isEmptyValue(body) || view === null) return false;
    setSendError(null);
    setTrustRetry(null);
    setPending({ value: body, seq: null });
    if (!keepComposer) setValue(EMPTY_MENTION_VALUE);
    const result = await sendMessage(draftId, make ? { ...body, make: true } : body);
    if (!result.ok) {
      setPending(null);
      // Give the words and the chips back: a refused turn should not cost the typing (T17).
      setValue((held) => valueBack(held, body, keepComposer));
      if (result.status === 429) capRefused(result.refusal.detail);
      setSendError(sendRefusal(result.status, result.refusal));
      void load();
      return false;
    }
    setPending({ value: body, seq: result.data.seq });
    void load();
    return true;
  }

  /**
   * The consent card's answers (D106 to D109). Allow once and Always allow
   * both send a message that is only the kind's chip (what the person would
   * have typed, so the transcript reads the same), marked `make` so the brief
   * it earns starts drawing itself. Always then trusts the kind on this
   * conversation; Deny tells the runner the offer was refused, so the card
   * collapses and the planner is told not to make it again. False on a
   * refused step, so the card re-arms instead of sticking on an answer that
   * never landed.
   */
  async function allowOffer(kind: TagKind, always: boolean): Promise<boolean> {
    // Send before trusting: awaiting the trust write first leaves a window
    // where another send takes the turn and the consent message is refused
    // while the kind was already allowed (the Greptile review). The mark on
    // the message is what launches this one; trust is for the turns after.
    const sent = await send(valueOf<TagKind>([{ type: "mention", kind }]), { keepComposer: true, make: true });
    if (!sent) return false;
    if (always) {
      if (!isDraftKind(kind)) return false;
      const result = await setDraftTrust(draftId, kind, true);
      if (!result.ok) {
        // The send landed, so the card is gone: the owed write gets a retry
        // of its own on the error line instead of another make request.
        setTrustRetry(kind);
        setSendError(sendRefusal(result.status, result.refusal));
        void load();
        return false;
      }
      void load();
    }
    return true;
  }

  /** The owed trust write's own press: no new send, just the permission. */
  async function retryTrust() {
    const kind = trustRetry;
    if (kind === null) return;
    setSendError(null);
    const result = await setDraftTrust(draftId, kind, true);
    if (!result.ok) {
      setSendError(sendRefusal(result.status, result.refusal));
      void load();
      return;
    }
    setTrustRetry(null);
    void load();
  }

  async function declineOffer(replySeq: number, kind: TagKind): Promise<boolean> {
    const result = await declineSuggestion(draftId, replySeq, [kind]);
    if (!result.ok) setSendError(sendRefusal(result.status, result.refusal));
    void load();
    return result.ok;
  }

  /** Take back an always-allowed kind (D108): later offers ask again. */
  async function revokeTrust(kind: DraftKind) {
    const result = await setDraftTrust(draftId, kind, false);
    if (!result.ok) setSendError(sendRefusal(result.status, result.refusal));
    void load();
  }

  /** One card's press: Draw, or Make video. */
  async function press(card: LiveCard) {
    if (view === null || card.block !== null || pressing.has(card.kind) || editing) return;
    // The notification prompt rides on the press that starts a job: a browser
    // will not show one without a gesture, and the job's ending is what it is
    // for. Not awaited, so the press does not wait on the person answering it.
    void askToNotify();
    const key = cardKey(card.seq, card.kind);
    const previous = view.slots?.[card.kind]?.jobId ?? (view.slots === undefined ? view.jobId : null);
    setPressing((held) => new Map(held).set(card.kind, previous));
    setRefused((held) => ({ ...held, [key]: undefined }));
    const others = cards.filter((other) => other.kind !== card.kind);
    const result = await drawDraft(draftId, kindDrawKey(draftId, card.seq, card.kind, previous), card.kind);
    setPressing((held) => {
      const next = new Map(held);
      next.delete(card.kind);
      return next;
    });
    if (!result.ok) {
      setRefused((held) => ({ ...held, [key]: { seq: card.seq, ...drawRefusal(result.status, result.refusal) } }));
      if (result.status === 429) capRefused(result.refusal.detail);
      void load();
      return;
    }
    await refreshJobs();
    // With another card still live, the panel stays on the conversation, so
    // the second card is not hidden behind the first job (D60).
    if (others.length === 0) {
      const href = panelHref(path, { job: result.data.jobId, draft: draftId });
      if (host === null || !host.navigate(href)) router.push(href, { scroll: false });
    }
    void load();
  }

  /** Make both: one press, each card started or refused on its own (D60, T26). */
  async function pressBoth() {
    if (view === null || both === null || pressing.size > 0) return;
    void askToNotify();
    setBothError(null);
    const [first, second] = both.cards;
    setPressing(new Map(both.cards.map((card) => [card.kind, view.slots?.[card.kind]?.jobId ?? null] as const)));
    setRefused((held) => ({ ...held, [cardKey(first.seq, first.kind)]: undefined, [cardKey(second.seq, second.kind)]: undefined }));
    const items = both.cards.map((card) => ({
      kind: card.kind,
      idempotencyKey: kindDrawKey(draftId, card.seq, card.kind, view.slots?.[card.kind]?.jobId ?? null),
    }));
    const result = await drawBoth(draftId, items);
    setPressing(new Map());
    if (!result.ok) {
      setBothError(drawRefusal(result.status, result.refusal).text);
      if (result.status === 429) capRefused(result.refusal.detail);
      void load();
      return;
    }
    const byKind = new Map(both.cards.map((card) => [card.kind, card]));
    const next: CardRefusals = {};
    for (const item of result.data.results) {
      const card = byKind.get(item.kind);
      if (card === undefined || "jobId" in item) continue;
      next[cardKey(card.seq, card.kind)] = { seq: card.seq, ...drawRefusal(item.status, item.refusal) };
    }
    setRefused((held) => ({ ...held, ...next }));
    await refreshJobs();
    void load();
  }

  async function startOver() {
    setConfirmStartOver(false);
    setStartOverError(null);
    const step = view === null ? "skip" : startOverStep(view.state, view.slots !== undefined);
    if (step === "refuse") {
      setStartOverError("A diagram from this conversation is drawing. Cancel or review it first, then start over.");
      return;
    }
    if (step === "abandon") {
      const closed = await abandonDraft(draftId);
      if (!closed.ok) {
        setStartOverError(`This conversation could not be closed: ${closed.refusal.error}`);
        return;
      }
    }
    // A done draft is left as it is: it made something and stays findable.
    await startDraft();
  }

  /**
   * The person's edit of a brief (phase 3), or a brief put back in force as
   * it is. Resolves once the record holds the result, so the card leaves
   * editing as the stored brief appears under the runner's note. Focus then
   * goes to the new card's press, the next thing to press.
   *
   * `base` is the seq of the entry carrying the edited brief, so the runner
   * refuses an edit of a brief that is no longer that kind's brief in force.
   */
  const saveEdit = useCallback(
    async (brief: Brief | TranscriptBrief["brief"], base: number, kind: DraftKind): Promise<SaveOutcome> => {
      const result = await saveBrief(draftId, brief, base, kind);
      if (!result.ok) {
        if (refusalReason(result.refusal) === "brief-changed") void load();
        return { ok: false, status: result.status, refusal: result.refusal };
      }
      await load();
      // The live one: a card that has just stopped being live keeps its
      // press for the moment its footer takes to fold shut, inert.
      requestAnimationFrame(() =>
        [...(thread.current?.querySelectorAll<HTMLElement>(`[data-studio-draw][data-card-kind="${kind}"]`) ?? [])]
          .find((press) => press.closest("[inert]") === null)
          ?.focus(),
      );
      return { ok: true };
    },
    [draftId, load, thread],
  );

  /** Use this brief on a card the planner put on hold: no turn (D60). */
  const takeOffHold = useCallback(
    async (kind: DraftKind, base: number): Promise<string | null> => {
      const result = await releaseHold(draftId, kind, base);
      await load();
      if (result.ok) return null;
      if (refusalReason(result.refusal) === "brief-changed") return "A newer brief replaced this one. The newest is below.";
      return `It could not be put back: ${result.refusal.error}`;
    },
    [draftId, load],
  );

  async function stopWaitingFor(kind: DraftKind) {
    setWaitError(null);
    const result = await stopWaiting(draftId, kind);
    if (!result.ok) setWaitError(`It is still waiting: ${result.refusal.error}`);
    void load();
  }

  return {
    send,
    allowOffer,
    retryTrust,
    declineOffer,
    revokeTrust,
    press,
    pressBoth,
    startOver,
    saveEdit,
    takeOffHold,
    stopWaitingFor,
    sendError,
    trustRetry,
    pressing,
    refused,
    bothError,
    confirmStartOver,
    setConfirmStartOver,
    startOverError,
    waitError,
  };
}
