"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { PanelLink } from "@/components/studio/PanelLink";
import { usePanelHost } from "@/components/studio/panel-host";
import { NoteProse } from "@/components/NoteProse";
import { ConfirmCard, type SaveOutcome } from "@/components/studio/ConfirmCard";
import { ConfirmCardVideo } from "@/components/studio/ConfirmCardVideo";
import { JobPanel } from "@/components/studio/JobPanel";
import { askToNotify, useStudioJobs } from "@/components/studio/JobsProvider";
import { PinnedConcept, PinnedDiagram, PinnedVideo } from "@/components/studio/PinnedDiagram";
import { PANE_GUTTER, usePaneLayout } from "@/components/studio/pane-context";
import { Sentence } from "@/components/studio/Sentence";
import { useStartDraft } from "@/components/studio/useStartDraft";
import { focusIsStill } from "@/components/studio/dialog-focus";
import { ENTER, FADE_IN } from "@/components/studio/motion";
import { Arrive } from "@/components/studio/motion-parts";
import { DialogHeader } from "@/components/studio/StudioDialog";
import { MentionComposer } from "@/components/studio/StudioComposer";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { chipClasses, cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import type { MentionComposerHandle } from "@/components/ui/MentionComposer";
import {
  EMPTY_MENTION_VALUE,
  isEmptyValue,
  prependValue,
  trimValue,
  type MentionValue,
} from "@/components/ui/mention-text";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import { TextLink } from "@/components/ui/TextLink";
import type { TopicOption } from "@/data/topics";
import {
  askAgainValue,
  entryBriefs,
  entryValue,
  jobKind,
  KIND_NAME,
  kindCardStatus,
  kindDrawKey,
  kindPendingTopic,
  kindUnavailable,
  lastPersonValue,
  liveCards,
  openerSend,
  openerValue,
  makeBoth,
  MENTION_HINT,
  CHANGE_OPENING_TURN,
  conceptOpeningTurn,
  MENTION_OPENING_TURN,
  mentionOptions,
  modEnterPlan,
  pressUnderWay,
  suggestionName,
  suggestionsFor,
  topicSuggestionValue,
  TWO_READY,
  valueBack,
  valueSendBlock,
  waitingKinds,
  waitingLine,
  type KindCardStatus,
  type LiveCard,
} from "@/lib/studio-cards";
import {
  capFrom,
  CHECKING_BRIEF,
  composerState,
  costLabel,
  drawRefusal,
  EDITING_BRIEF,
  GONE,
  isEmptyConversation,
  jobPatch,
  refusalNoted,
  sendRefusal,
  splitReply,
  startOverStep,
  STILL_ANSWERING,
  THINKING,
  threadProblem,
  turnIndicator,
  visibleEntries,
  type CapStatus,
  type DrawBlock,
  type DrawRefusal,
  type Suggestion,
  type ThreadProblem,
} from "@/lib/studio-chat";
import {
  abandonDraft,
  drawBoth,
  drawDraft,
  getDraft,
  openDraftEvents,
  readStudioHealth,
  refusalReason,
  saveBrief,
  sendMessage,
  stopWaiting,
  releaseHold,
  videoAvailability,
  diagramAvailability,
  type DraftKind,
  type DraftView,
  type TranscriptBrief,
  type TranscriptEntry,
  type VideoAvailability,
} from "@/lib/studio-drafts";
import { switchedTool, type VideoToolOption } from "@/lib/studio-brief-video";
import {
  arrivingPurpose,
  arrivingSource,
  EXTEND_OPENING_TURN,
  forgetExtendKey,
  MAKE_VIDEO_OPENING_TURN,
  makeVideoTitle,
  OPENER_EVENT,
  sessionStore,
  takeOpener,
} from "@/lib/studio-extend";
import { isTerminal, type Brief, type Job } from "@/lib/studio-jobs";
import { prefersReducedMotion } from "@/lib/motion";
import { announceDraftChange } from "@/lib/studio-draft-list";
import { panelHref, titleOf } from "@/lib/studio-view";

/**
 * The conversation, in the studio's panel (docs/STUDIO-CHAT-FIRST.md, "UI",
 * and docs/STUDIO-MENTIONS.md for tags and cards per kind).
 *
 * Two bodies under one header, and the URL says which: the chat
 * (`?draft=`), and the job a press started with a bar back to the chat
 * (`?draft=&job=`). One component holds both so the conversation's state and
 * its event stream live through the trip to the job and back.
 *
 * An extend conversation (a draft with `source`) pins the diagram at the top
 * of the thread, and on arrival from Extend sends the opening message
 * `ExtendStart` handed it, so the planner's first reply says what it sees.
 *
 * **Tags.** The composer is the kit's `MentionComposer`: `@`, or the plus at
 * its left, opens a menu of Diagram and Video, and a pick is a chip in the
 * sentence. A message goes as `{ text, mentions }`. An untagged message is
 * conversation; the planner may end its reply with a suggestion, drawn as a
 * button under the newest reply that puts the chip in the composer and sends
 * nothing (D58).
 *
 * **One live card per kind** (D60). A reply may carry a diagram brief and a
 * video brief, each its own card with its own press, keyed by `(seq, kind)`;
 * a newer brief greys only the older card of its kind. A diagram and a video
 * asked for in one message get Make both under the later of the two.
 *
 * **The runner owns the draft; this is a cache of it**, as `JobsProvider` is
 * of the jobs. `GET /api/drafts/{id}` is the record. The event stream adds
 * the one thing the record cannot, a reply growing as it is written (`delta`),
 * and every other event is a cue to read the record again, so a missed event
 * or a dropped stream costs a moment and nothing else. Every call goes
 * through `studio-drafts.ts`; every judgement about what to show is in
 * `studio-chat.ts` and `studio-cards.ts`.
 */

/** The polled record while a turn is in flight, for when the stream is down. */
const POLL_IN_FLIGHT_MS = 4_000;
/**
 * How often focus may re-read health. `/api/health` runs `doctor`, which the
 * runner caches for 30 seconds, and `claude --version`, so this is the
 * cheapest rate at which each read can still be new.
 */
const CAP_READ_MS = 30_000;
type Status = "loading" | "ready" | "gone" | "down";
type Value = MentionValue<DraftKind>;
/** A card's identity: its reply and its kind. */
type CardKey = `${number}:${DraftKind}`;

const cardKey = (seq: number, kind: DraftKind): CardKey => `${seq}:${kind}`;

export function DraftPanel({
  draftId,
  jobId,
  path,
  topics,
  titles,
  videoTitles = {},
  suggestions,
  cap: initialCap,
  video: initialVideo = null,
  diagramAgent: initialDiagram = null,
}: {
  draftId: string;
  /** `?job=`: the job view, with the bar back to the chat. */
  jobId: string | null;
  /** The page's own URL, which every link here patches. */
  path: string;
  topics: TopicOption[];
  /** Each diagram's display title by name, for an extend conversation's header and picture. */
  titles: Readonly<Record<string, string>>;
  /**
   * Each video's title by slug, for a Change conversation's header and poster.
   * Its own map: a diagram and a video can share a slug.
   */
  videoTitles?: Readonly<Record<string, string>>;
  suggestions: Suggestion[];
  /** `dailyCap` from `/api/health` at render time. A 429 replaces it. */
  cap: CapStatus | null;
  /** The video doctor from `/api/health` at render time: whether Video can be tagged and made. */
  video?: VideoAvailability | null;
  /** Health's `diagramAgent` at render time (#206): whether Draw can queue a job at all. */
  diagramAgent?: VideoAvailability | null;
}) {
  const router = useRouter();
  const host = usePanelHost();
  const { jobs, refresh: refreshJobs } = useStudioJobs();
  const [view, setView] = useState<DraftView | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [downReason, setDownReason] = useState<string | null>(null);
  /** The reply being written, as the last `delta` had it. */
  const [stream, setStream] = useState<{ turn: number; text: string } | null>(null);
  /** The person's turn between Send and the record having it. */
  const [pending, setPending] = useState<{ value: Value; seq: number | null } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [value, setValue] = useState<Value>(EMPTY_MENTION_VALUE);
  const [cap, setCap] = useState<CapStatus | null>(initialCap);
  const [video, setVideo] = useState<VideoAvailability | null>(initialVideo);
  const [diagramAgent, setDiagramAgent] = useState<VideoAvailability | null>(initialDiagram);
  /** The cards whose press is under way, each with its kind's job before the press. */
  const [pressing, setPressing] = useState<ReadonlyMap<DraftKind, string | null>>(new Map());
  const [refused, setRefused] = useState<Partial<Record<CardKey, DrawRefusal & { seq: number }>>>({});
  const [bothError, setBothError] = useState<string | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const [startOverError, setStartOverError] = useState<string | null>(null);
  const [waitError, setWaitError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  /** A card is being edited: its press and Send wait. */
  const [editing, setEditing] = useState(false);
  /**
   * The newest seq the first read of the record held. Entries after it are
   * new while the panel is open and animate in; the ones it opened with do
   * not, so reopening a conversation does not replay it. Null until read.
   */
  const [baseline, setBaseline] = useState<number | null>(null);
  const composer = useRef<MentionComposerHandle | null>(null);
  const thread = useRef<HTMLDivElement | null>(null);
  const focused = useRef(false);
  const { start: startDraft, busy: starting, error: startError } = useStartDraft(path);
  const { inline } = usePaneLayout();
  // Full screen, the thread and the composer keep to a column in the middle.
  const gutter = inline ? PANE_GUTTER : "px-5";

  const arriving = arrivingSource(draftId);
  // Opened by Make a video of this in this tab (D86): the header and the
  // opening turn speak of the video, not of extending the diagram.
  const forVideo = arrivingPurpose(draftId) === "video";

  // The sidebar lists this conversation by its title, its first message and
  // its state, so each change to those is news to it (`ChatHistory`).
  const listed = view === null ? null : `${view.state}|${view.title ?? ""}|${view.transcript.length}`;
  useEffect(() => {
    if (listed !== null) announceDraftChange(draftId);
  }, [draftId, listed]);

  /**
   * Focus the composer once it is on screen: it loads lazily, and is not
   * rendered while the panel shows a job, so this tries for a couple of
   * seconds' worth of frames rather than once.
   */
  const focusComposerSoon = useCallback(() => {
    let frames = 0;
    const attempt = () => {
      if (composer.current !== null) {
        composer.current.focus();
        return;
      }
      if ((frames += 1) < 120) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }, []);

  /* ---------------------------------------------------------------- */
  /* The record                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Reads can overlap (an event, the poll, focus), and an older answer
   * landing after a newer one would put the thread back a step. Each read
   * takes a number, and an answer older than the last one shown is dropped.
   */
  const issued = useRef(0);
  const shown = useRef(0);
  const load = useCallback(async (): Promise<DraftView | null> => {
    issued.current += 1;
    const ticket = issued.current;
    const result = await getDraft(draftId);
    if (ticket < shown.current) return null;
    shown.current = ticket;
    if (!result.ok) {
      if (result.status === 404) setStatus("gone");
      else {
        // A runner that went away mid-conversation keeps what is on screen
        // and says so; a first read that failed has nothing to keep.
        setDownReason(result.refusal.error);
        setStatus((held) => (held === "ready" ? held : "down"));
      }
      return null;
    }
    const fresh = result.data;
    setView(fresh);
    setBaseline((held) => held ?? topSeq(fresh.transcript));
    setStatus("ready");
    setDownReason(null);
    if (!fresh.inFlight) setStream(null);
    setPending((held) => {
      if (held === null) return null;
      if (held.seq !== null && fresh.transcript.some((entry) => entry.seq === held.seq)) return null;
      return held;
    });
    return fresh;
  }, [draftId]);

  // Several events in one burst (a reply, its briefs, the state) are one read.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void load();
    }, 60);
  }, [load]);

  useEffect(() => {
    // The first read runs from an effect because the record lives on the
    // runner, reached through the browser's proxy; the page cannot read it
    // for the first paint without a second implementation of this panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [load]);

  /* ---------------------------------------------------------------- */
  /* The stream                                                        */
  /* ---------------------------------------------------------------- */

  const ready = status === "ready";
  const lastSeq = useRef(0);
  useEffect(() => {
    lastSeq.current = view === null ? 0 : topSeq(view.transcript);
  }, [view]);

  useEffect(() => {
    if (!ready) return;
    return openDraftEvents(draftId, () => lastSeq.current, {
      // The browser gave up on the stream and it was opened again: whatever
      // happened meanwhile is in the record.
      onReopen: () => void load(),
      onEvent: (event) => {
        if (event.type === "delta") {
          setStream({ turn: event.data.turn, text: event.data.text });
          return;
        }
        // A reply that ended, or one the runner refused and is retrying, is
        // no longer the text being written: the retry's deltas start again.
        if (event.type === "reply" || event.type === "brief-invalid" || event.type === "error") setStream(null);
        if (event.type === "state" && (event.data.state === "drawing" || event.data.jobId !== null || event.data.slots !== undefined)) {
          void refreshJobs();
        }
        reload();
      },
    });
  }, [draftId, ready, reload, refreshJobs, load]);

  // The record is the truth, so a turn in flight is also polled: with the
  // stream down, the reply still arrives, only without growing on screen.
  const inFlight = (view?.inFlight ?? false) || pending !== null;
  useEffect(() => {
    if (!inFlight) return;
    const every = setInterval(() => void load(), POLL_IN_FLIGHT_MS);
    return () => clearInterval(every);
  }, [inFlight, load]);

  // The presses' disabled reasons are re-checked when the panel regains
  // focus: a job held elsewhere may have been accepted meanwhile, the day's
  // spend may have aged out, and the video doctor may have recovered.
  const capReadAt = useRef(0);
  const readHealth = useCallback(async () => {
    capReadAt.current = Date.now();
    const health = await readStudioHealth();
    if (health === null) return;
    const next = capFrom(health.dailyCap);
    if (next !== null) setCap(next);
    setVideo(videoAvailability(health.video));
    setDiagramAgent(diagramAvailability(health.diagramAgent));
  }, []);
  // Once on opening too: the page that drew the grid read health, and a
  // conversation opened in the browser (`PanelHost`) can be minutes
  // younger than that read.
  useEffect(() => {
    const timer = setTimeout(() => void readHealth(), 0);
    return () => clearTimeout(timer);
  }, [readHealth]);
  useEffect(() => {
    const wake = () => {
      void refreshJobs();
      void load();
      if (Date.now() - capReadAt.current >= CAP_READ_MS) void readHealth();
    };
    window.addEventListener("focus", wake);
    return () => window.removeEventListener("focus", wake);
  }, [refreshJobs, load, readHealth]);

  // A spent cap frees when its oldest spend leaves the 24-hour window, which
  // the runner names; read it again then rather than waiting for a focus.
  const freesAt = cap?.exceeded ? Date.parse(cap.oldestAgesOutAt ?? "") : Number.NaN;
  useEffect(() => {
    if (!Number.isFinite(freesAt)) return;
    const wait = Math.max(1_000, Math.min(freesAt - Date.now() + 1_000, 2 ** 31 - 1));
    const timer = setTimeout(() => void readHealth(), wait);
    return () => clearTimeout(timer);
  }, [freesAt, readHealth]);

  /* ---------------------------------------------------------------- */
  /* Focus and scroll                                                  */
  /* ---------------------------------------------------------------- */

  const mode: "chat" | "job" = jobId !== null ? "job" : "chat";

  // Where focus was when the panel opened. The panel is keyed by its draft,
  // so mounting is opening.
  const openedWith = useRef<Element | null>(null);
  useEffect(() => {
    openedWith.current = document.activeElement;
  }, []);

  useEffect(() => {
    // Opening focuses the composer, once it exists. It loads lazily, so the
    // first try may find nothing, and the next frames try again. By then the
    // person may have clicked somewhere else, such as the sidebar's search,
    // and typing there must not land in the composer.
    if (!ready || mode !== "chat" || focused.current) return;
    let frames = 0;
    let handle = 0;
    const attempt = () => {
      if (composer.current !== null) {
        focused.current = true;
        if (focusIsStill(document.activeElement, openedWith.current)) composer.current.focus();
        return;
      }
      if ((frames += 1) < 120) handle = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(handle);
  }, [ready, mode]);

  const entries = useMemo(() => (view === null ? [] : visibleEntries(view.transcript)), [view]);
  /** The thread box the last scroll moved: a new one (opening, back from a job) jumps to its foot. */
  const scrolledBox = useRef<HTMLDivElement | null>(null);
  // What sits at the thread's foot besides the entries: the reply being
  // written, and a problem or refusal in its place when a turn fails
  // without adding an entry.
  const foot = view === null ? null : `${view.inFlight}|${threadProblem(view)?.case ?? ""}|${sendError !== null}`;
  useEffect(() => {
    // The thread scrolls, never the page. Something new in it (a message, a
    // reply, a banner) glides into view; the thread's first drawing jumps
    // straight to its foot, since gliding through a whole conversation on
    // opening would be a wait.
    const box = thread.current;
    if (box === null) return;
    const glide = scrolledBox.current === box && !prefersReducedMotion();
    scrolledBox.current = box;
    if (typeof box.scrollTo === "function") box.scrollTo({ top: box.scrollHeight, behavior: glide ? "smooth" : "auto" });
    else box.scrollTop = box.scrollHeight;
  }, [entries.length, pending, mode, foot]);
  const streamText = stream?.text ?? null;
  useEffect(() => {
    // A reply growing as it is written follows at once: a glide per word
    // would always be behind. Only while it grows: a reply that has landed
    // clears the stream in the same read that adds its entry, and jumping
    // then would cut short the glide above.
    if (streamText === null) return;
    const box = thread.current;
    if (box !== null) box.scrollTop = box.scrollHeight;
  }, [streamText]);

  /* ---------------------------------------------------------------- */
  /* Verbs                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * One person turn. `keepComposer` is for a turn that was not typed in the
   * composer (the opener an Extend press hands over, a Try again), whose
   * composer may hold a second message that sending this one must not clear.
   */
  async function send(raw: Value, { keepComposer = false }: { keepComposer?: boolean } = {}) {
    const body = trimValue(raw);
    if (isEmptyValue(body) || view === null) return;
    setSendError(null);
    setPending({ value: body, seq: null });
    if (!keepComposer) setValue(EMPTY_MENTION_VALUE);
    const result = await sendMessage(draftId, body);
    if (!result.ok) {
      setPending(null);
      // Give the words and the chips back: a refused turn should not cost the typing (T17).
      setValue((held) => valueBack(held, body, keepComposer));
      if (result.status === 429) setCap(capFrom({ ...(result.refusal.detail as object), exceeded: true }) ?? cap);
      setSendError(sendRefusal(result.status, result.refusal));
      void load();
      return;
    }
    setPending({ value: body, seq: result.data.seq });
    void load();
  }

  // The opener effect below is a callback made once per draft, so it reaches
  // `send` through this, which always holds the latest render's (whose
  // `view` is the record, not the first render's null).
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const cards = useMemo(
    () => (view === null ? [] : liveCards(view, jobs, cap, video, diagramAgent)),
    [view, jobs, cap, video, diagramAgent],
  );
  const both = useMemo(() => (editing ? null : makeBoth(cards)), [cards, editing]);

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
      if (result.status === 429) setCap(capFrom({ ...(result.refusal.detail as object), exceeded: true }) ?? cap);
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
      if (result.status === 429) setCap(capFrom({ ...(result.refusal.detail as object), exceeded: true }) ?? cap);
      void load();
      return;
    }
    const byKind = new Map(both.cards.map((card) => [card.kind, card]));
    const next: Partial<Record<CardKey, DrawRefusal & { seq: number }>> = {};
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
    [draftId, load],
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

  // Arriving from Extend, from Talk it through on a failed job, or from a
  // video's Change: the opener left for this draft, taken once so a reload
  // never sends it again, and sent only into a conversation that is still
  // empty. A page that leaves one while this conversation is already open
  // says so with `OPENER_EVENT`, and it is taken then.
  const takeWaitingOpener = useCallback(
    (current: DraftView) => {
      const store = sessionStore();
      const opener = takeOpener(store, draftId);
      if (opener === null) return;
      // Arrived: a reload of the press that made this draft may now mint a new one.
      if (opener.source !== null) forgetExtendKey(store, opener.source);
      const composed = openerValue(opener);
      if (composed !== null) {
        // The composer first, chips ahead of the words, and a send that leaves
        // it alone: a message queued during the read and a second one still
        // being typed both survive. The composer may not be on screen yet (the
        // panel is showing a job, or the field is still loading); it builds
        // itself from this value when it mounts.
        // In front of anything already typed, never over it.
        setValue((held) => prependValue(composed, held));
        focusComposerSoon();
      }
      const first = openerSend(opener);
      if (first !== null && isEmptyConversation(current.transcript) && !current.inFlight) {
        void sendRef.current(first, { keepComposer: true });
      }
    },
    [draftId, focusComposerSoon],
  );

  const opened = useRef(false);
  useEffect(() => {
    if (!ready || view === null || opened.current) return;
    opened.current = true;
    takeWaitingOpener(view);
  }, [ready, view, takeWaitingOpener]);

  const viewRef = useRef<DraftView | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    const onOpener = (event: Event) => {
      const detail = (event as CustomEvent<{ draftId?: unknown }>).detail;
      if (detail?.draftId !== draftId || viewRef.current === null) return;
      takeWaitingOpener(viewRef.current);
    };
    window.addEventListener(OPENER_EVENT, onOpener);
    return () => window.removeEventListener(OPENER_EVENT, onOpener);
  }, [draftId, takeWaitingOpener]);

  /**
   * Cmd or Ctrl+Enter (T9). From inside a card it presses that card. From
   * the composer, words are sent; from an empty composer the one live card is
   * pressed, and with two nothing is pressed: focus moves to Make both (or the
   * first card) and a screen reader hears that two briefs are ready.
   */
  function modEnter(from: EventTarget | null) {
    const inCard = from instanceof Element ? from.closest<HTMLElement>("[data-card]") : null;
    if (inCard !== null) {
      const kind = inCard.dataset.card;
      const card = cards.find((candidate) => candidate.kind === kind && String(candidate.seq) === inCard.dataset.seq);
      if (card !== undefined && card.block === null) void press(card);
      return;
    }
    const plan = modEnterPlan(isEmptyValue(value), cards);
    if (plan.action === "send") void send(value);
    else if (plan.action === "press") void press(plan.card);
    else if (plan.action === "announce") {
      // Focus stays where it is: a paid button with focus is one stray Space
      // from a job. Said again even when the words have not changed.
      setAnnounce("");
      requestAnimationFrame(() => setAnnounce(TWO_READY));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The composer handles its own and marks the event, so nothing is pressed twice.
    if (event.defaultPrevented || event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    if (cards.length === 0) return;
    event.preventDefault();
    modEnter(event.target);
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const cost = view === null ? null : costLabel(view.costUsd, view.costSource);
  const costTitle =
    view?.costSource === "stream"
      ? "What this conversation has cost so far. A turn cut off before it reported is rebuilt from its stream, which runs low."
      : "What this conversation has cost so far";

  if (status === "gone") {
    return (
      <>
        <DialogHeader title="New conversation" />
        <Empty>
          <p className="text-[15px] text-text">{GONE}</p>
          <Button onClick={() => void startDraft()} disabled={starting}>
            New conversation
          </Button>
          <Failure text={startError} />
        </Empty>
      </>
    );
  }

  if (status === "loading" && arriving !== null) {
    // Straight from Extend: the picture and the header stay where they were
    // while the record is read, rather than blinking to a blank panel.
    const arrivingTitle = titleOf(titles, arriving) ?? arriving;
    return (
      <>
        <DialogHeader title={forVideo ? makeVideoTitle(arrivingTitle) : `Extending ${arrivingTitle}`} />
        <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-5">
          <PinnedDiagram name={arriving} title={arrivingTitle} />
          <p className="text-center text-[13px] text-text3" role="status">
            Opening the conversation…
          </p>
        </div>
      </>
    );
  }

  if (status !== "ready" || view === null) {
    return (
      <>
        <DialogHeader title="New conversation" />
        <Empty>
          {status === "loading" ? (
            <p className="text-[14px] text-text3" role="status">
              Opening the conversation…
            </p>
          ) : (
            <>
              <p className="text-[15px] text-text">The studio runner did not answer, so this conversation cannot be read.</p>
              {downReason !== null && <p className="text-[13px] text-text2">{downReason}</p>}
              <Button variant="secondary" onClick={() => void load()}>
                Try again
              </Button>
            </>
          )}
        </Empty>
      </>
    );
  }

  const diagramSource = view.sourceKind === undefined || view.sourceKind === "diagram";
  const sourceTitle =
    view.source === null ? null : ((diagramSource ? titleOf(titles, view.source) : titleOf(videoTitles, view.source)) ?? view.source);
  const newestTitle = cards.at(-1)?.brief.title ?? null;
  const title =
    view.title ??
    newestTitle ??
    (sourceTitle === null
      ? "New conversation"
      : diagramSource
        ? forVideo
          ? makeVideoTitle(sourceTitle)
          : `Extending ${sourceTitle}`
        : `Changing ${sourceTitle}`);

  if (mode === "job" && jobId !== null) {
    const job = jobs.find((entry) => entry.jobId === jobId) ?? null;
    const settled = job !== null && (isTerminal(job.state) || job.state === "awaiting_review");
    const ended = job !== null && isTerminal(job.state);
    const kind = job === null ? "diagram" : jobKind(job);
    return (
      <>
        {/* No cost here: the job's own line under it carries the job's, and the
            conversation's beside it read as one confusing total (phase 2). The
            conversation's cost is in the conversation. */}
        <DialogHeader title={job?.title ?? title} />
        <BackBar href={panelHref(path, { job: null })} />
        <div className={cx("min-h-0 flex-1 overflow-y-auto", FADE_IN)}>
          {ended && (
            <div className="flex flex-wrap items-center gap-3 border-b border-hair px-5 py-3">
              <p className="min-w-0 flex-1 text-[14px] text-text2">
                {job.state === "accepted"
                  ? "Accepted. Ask for a change or something new in the same conversation."
                  : job.state === "failed" || job.state === "interrupted"
                    ? `${kind === "video" ? "The video" : "The drawing"} did not pass. What the checks found is in the conversation.`
                    : "Ask for a change, or start something new."}
              </p>
              <Button size="sm" href={panelHref(path, { job: null })}>
                Back to the conversation
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void startDraft()} disabled={starting}>
                New conversation
              </Button>
              <Failure text={startError} className="basis-full" />
            </div>
          )}
          <div className={inline ? "mx-auto w-full max-w-4xl" : undefined}>
            <JobPanel jobId={jobId} path={path} embedded inConversation />
          </div>
          {settled && !ended && (
            <p className="px-5 pb-5 text-[13px] text-text3">
              Accept or Discard above. Either way, the conversation is where the next one starts.
            </p>
          )}
        </div>
      </>
    );
  }

  const problem = threadProblem(view);
  const problemKind = problemKindOf(view);
  const empty = isEmptyConversation(view.transcript) && pending === null;
  const composing = composerState(view, cap, pending !== null, empty, editing);
  const concept = view.concept ?? null;
  // H8: a conversation opened on a concept takes a bare tag, which means "of this concept".
  const valueBlock = valueSendBlock(value, empty && concept === null);
  const busy = view.inFlight || pending !== null;
  // A turn taken since the panel opened: what it brings (the reply being
  // written, a problem, the turn limit) arrives as news. On opening they are
  // part of the conversation as it stood, and stand still.
  const liveTurn = baseline !== null && (pending !== null || topSeq(view.transcript) > baseline);
  const lastPerson = pending?.value ?? lastPersonValue(view.transcript);
  const waiting = waitingKinds(view);
  const suggested = suggestionsFor(view);
  const options = mentionOptions(view, video);
  const kinds = view.slots !== undefined;
  const opening =
    concept !== null
      ? conceptOpeningTurn(concept.title)
      : kinds
        ? MENTION_OPENING_TURN
        : view.source === null
          ? MENTION_OPENING_TURN
          : EXTEND_OPENING_TURN;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <DialogHeader title={title} meta={cost === null ? undefined : <span title={costTitle}>{cost}</span>} />

      <div
        ref={thread}
        role="log"
        aria-live="polite"
        aria-busy={busy}
        aria-label="Conversation"
        className={cx("flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-5", gutter, FADE_IN)}
      >
        {view.source !== null && sourceTitle !== null && (diagramSource ? <PinnedDiagram name={view.source} title={sourceTitle} /> : <PinnedVideo slug={view.source} title={sourceTitle} />)}
        {concept !== null && <PinnedConcept slug={concept.slug} title={concept.title} tutorTurns={concept.tutorTurns} />}

        {empty && (
          <TutorMessage label="Planner">
            <p className="max-w-[60ch]">{view.source === null ? opening : diagramSource ? (forVideo ? MAKE_VIDEO_OPENING_TURN : EXTEND_OPENING_TURN) : CHANGE_OPENING_TURN}</p>
          </TutorMessage>
        )}
        {/* The corpus's topics are a way into a new diagram; an extend
            conversation, or one opened on a concept, already has its subject. */}
        {empty && view.source === null && concept === null && suggestions.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-2 px-1.5" aria-label="Suggestions">
            {suggestions.map((suggestion) => (
              <Chip
                key={suggestion.label}
                onClick={() => {
                  setValue(topicSuggestionValue(suggestion.label));
                  focusComposerSoon();
                }}
              >
                {suggestion.label}
              </Chip>
            ))}
          </div>
        )}

        {entries.map((entry) => (
          // A person's turn does not animate: it replaces the bubble that
          // already rose in at Send (below), in the same place.
          <Arrive key={entry.seq} animate={baseline !== null && entry.seq > baseline && entry.role !== "person"}>
            <Entry
              entry={entry}
              view={view}
              topics={topics}
              jobs={jobs}
              cards={cards}
              both={both !== null && both.seq === entry.seq ? both : null}
              makeBothLive={both !== null}
              pressing={pressing}
              refused={refused}
              entries={entries}
              answering={view.inFlight || pending !== null}
              onSave={saveEdit}
              onUse={takeOffHold}
              onEditingChange={setEditing}
              onPress={(card) => void press(card)}
              onPressBoth={() => void pressBoth()}
              bothError={bothError}
              waiting={waiting}
              path={path}
              suggest={suggested !== null && suggested.seq === entry.seq ? suggested.kinds : null}
              unavailable={(kind) => kindUnavailable(kind, view, video)}
              onSuggest={(kind) => composer.current?.insertMention(kind)}
              singleCard={cards.length <= 1}
              videoTools={video?.tools ?? []}
              charsPerSecond={video?.charsPerSecond}
            />
          </Arrive>
        ))}

        {pending !== null && !view.transcript.some((entry) => entry.seq === pending.seq) && (
          <UserMessage className={ENTER}>
            <Sentence value={pending.value} />
          </UserMessage>
        )}

        {/* One box for the whole turn, so the reply's change from thinking
            to words to checking moves nothing. */}
        {busy && (
          <Arrive animate={liveTurn}>
            <Streaming
              text={stream?.text ?? null}
              checking={pending === null && turnIndicator(view, stream !== null) === "checking"}
            />
          </Arrive>
        )}

        {problem !== null && !busy && (
          <Arrive animate={liveTurn}>
            <Problem
              problem={problem}
              kind={problemKind}
              onRetry={lastPerson === null ? null : () => void send(lastPerson, { keepComposer: true })}
              onAskAgain={problem.case === "E6" ? () => void send(askAgainValue(problem, kinds ? problemKind : null), { keepComposer: true }) : null}
              blocked={editing ? EDITING_BRIEF : null}
              onStartOver={() => setConfirmStartOver(true)}
              cutOffShown={entries.at(-1)?.interrupted === true}
            />
          </Arrive>
        )}

        {sendError !== null && (
          <Callout role="alert" className={ENTER}>
            {sendError}
          </Callout>
        )}

        {view.turnCap > 0 && view.turns >= view.turnCap && (
          <Arrive animate={liveTurn}>
            <Callout
              actions={
                <Button size="sm" variant="secondary" onClick={() => void startDraft()} disabled={starting}>
                  New conversation
                </Button>
              }
            >
              This conversation has reached its {view.turnCap}-turn limit.
              {cards.length > 0 ? " The last brief can still be made." : ""}
            </Callout>
          </Arrive>
        )}
      </div>

      <div
        className={cx(
          "shrink-0 pb-[max(12px,env(safe-area-inset-bottom))] pt-3",
          inline ? PANE_GUTTER : "border-t border-hair px-4 md:px-5",
        )}
      >
        {waiting.length > 0 && (
          <div className={cx("mb-2 flex flex-col gap-1 px-1", FADE_IN)}>
            {waiting.map((item) => (
              <p key={item.kind} className="flex flex-wrap items-center gap-x-3 text-[12px] leading-4 text-text2">
                <span className="font-semibold">{waitingLine(item.kind)}</span>
                <TextLink onClick={() => void stopWaitingFor(item.kind)}>Stop waiting</TextLink>
              </p>
            ))}
            {waitError !== null && (
              <p role="alert" className="text-[12px] text-danger">
                {waitError}
              </p>
            )}
          </div>
        )}
        <MentionComposer
          handleRef={composer}
          value={value}
          onChange={setValue}
          onSubmit={(next) => void send(next)}
          label="Tell the planner about your idea"
          placeholder={composing.placeholder}
          mentions={options}
          mentionHint={MENTION_HINT}
          disabled={composing.disabled}
          sendDisabled={composing.sendDisabled || valueBlock !== null}
          disabledReason={composing.reason ?? valueBlock ?? undefined}
          onModEnter={cards.length > 0 ? () => modEnter(null) : undefined}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-text3">
          {/* The question and the press swap in place, each fading in. The
              problem card's Start over opens the question too. */}
          {(confirmStartOver || view.transcript.length > 0) && (
            <InlineConfirm
              size="text"
              label="Start over"
              question="Close this conversation for good?"
              confirmLabel="Start over"
              onConfirm={() => void startOver()}
              open={confirmStartOver}
              onOpenChange={setConfirmStartOver}
            />
          )}
          {downReason !== null && <span className="text-danger">The runner stopped answering: {downReason}</span>}
          <Failure text={startOverError ?? (startError === null ? null : `A new conversation could not start: ${startError}`)} className="basis-full" />
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** The newest seq in a transcript, or 0 for an empty one. */
function topSeq(transcript: readonly Pick<TranscriptEntry, "seq">[]): number {
  return transcript.reduce((max, entry) => Math.max(max, entry.seq), 0);
}

/** The kind E6 is about: the refused brief's own, when the runner names one. */
function problemKindOf(view: Pick<DraftView, "transcript" | "error">): DraftKind | null {
  if (view.error?.briefKind !== undefined) return view.error.briefKind;
  const last = visibleEntries(view.transcript).at(-1);
  const kind = last?.briefInvalid?.kind ?? last?.briefsInvalid?.find((item) => !item.retried)?.kind;
  return kind ?? null;
}

function Entry({
  entry,
  view,
  topics,
  jobs,
  cards,
  both,
  makeBothLive,
  pressing,
  refused,
  entries,
  answering,
  onSave,
  onUse,
  onEditingChange,
  onPress,
  onPressBoth,
  bothError,
  waiting,
  path,
  suggest,
  unavailable,
  onSuggest,
  singleCard,
  videoTools,
  charsPerSecond,
}: {
  entry: TranscriptEntry;
  view: DraftView;
  topics: readonly TopicOption[];
  jobs: readonly Job[];
  cards: readonly LiveCard[];
  /** Make both, on the entry it sits under. */
  both: ReturnType<typeof makeBoth>;
  /** Whether Make both is shown anywhere in the thread. */
  makeBothLive: boolean;
  pressing: ReadonlyMap<DraftKind, string | null>;
  refused: Partial<Record<CardKey, DrawRefusal & { seq: number }>>;
  entries: readonly TranscriptEntry[];
  /** A person turn is in flight: sent, or being answered. */
  answering: boolean;
  onSave: (brief: Brief | TranscriptBrief["brief"], base: number, kind: DraftKind) => Promise<SaveOutcome>;
  onUse: (kind: DraftKind, base: number) => Promise<string | null>;
  onEditingChange: (editing: boolean) => void;
  onPress: (card: LiveCard) => void;
  onPressBoth: () => void;
  bothError: string | null;
  waiting: readonly { kind: DraftKind; requestSeq: number }[];
  path: string;
  /** The kinds the newest reply suggests, on that reply only. */
  suggest: readonly DraftKind[] | null;
  unavailable: (kind: DraftKind) => string | null;
  onSuggest: (kind: DraftKind) => void;
  /** Whether at most one card is live, so Cmd+Enter presses it. */
  singleCard: boolean;
  /** Health's `video.tools`, for the video card's tool row (D73). */
  videoTools: readonly VideoToolOption[];
  /** Health's `video.narration.charsPerSecond`, for the video card's predicted lengths. */
  charsPerSecond: number | undefined;
}) {
  if (entry.role === "person") {
    const tagged = waiting.filter((item) => item.requestSeq === entry.seq).map((item) => item.kind);
    return (
      <UserMessage>
        <Sentence value={entryValue(entry)} waiting={tagged} />
      </UserMessage>
    );
  }

  const briefs = entryBriefs(entry);
  // With a pair live, Make both is the press the person most likely wants, so
  // it is the one primary button and each card's own press steps back.
  const pairedHere = cards.length === 2 && makeBothLive;
  const renderCard = (item: TranscriptBrief) => {
    const status: KindCardStatus = kindCardStatus(view, entry.seq, item.kind, jobs);
    const live = cards.find((card) => card.kind === item.kind && card.seq === entry.seq) ?? null;
    const block: DrawBlock | null = live?.block ?? null;
    const key = cardKey(entry.seq, item.kind);
    const refusal = refused[key];
    const shownRefusal =
      refusal === undefined ? null : { text: refusalNoted(refusal, entries) ? null : refusal.text, holder: refusal.holder };
    const slot = view.slots?.[item.kind] ?? null;
    const jobIdOf = slot?.jobId ?? (view.slots === undefined ? view.jobId : null);
    const job = jobIdOf === null ? undefined : jobs.find((candidate) => candidate.jobId === jobIdOf);
    const jobHref = jobIdOf === null ? null : panelHref(path, { job: jobIdOf });
    const running = job !== undefined && !isTerminal(job.state);
    const pendingTopic = kindPendingTopic(status, item.kind, entry, view);
    const holdReason = slot?.held?.reason ?? null;
    const underWay = pressUnderWay(pressing, view, item.kind);
    const editBlock = answering ? STILL_ANSWERING : underWay ? "The press is under way." : null;
    const paired = pairedHere;
    const holderHref = (holder: string) => panelHref(path, jobPatch(holder, { draftId: view.draftId, jobId: jobIdOf }, jobs));
    const inner =
      item.kind === "diagram" ? (
        <ConfirmCard
          brief={item.brief}
          pendingTopic={pendingTopic}
          status={status}
          topics={topics}
          block={block}
          busy={underWay}
          refusal={shownRefusal}
          onDraw={() => live !== null && onPress(live)}
          onSave={(brief) => onSave(brief, entry.seq, "diagram")}
          onEditingChange={onEditingChange}
          editBlock={editBlock}
          jobHref={jobHref}
          jobRunning={running}
          holderHref={holderHref}
          sourceChanged={view.sourceChanged === true}
          holdReason={holdReason}
          onUse={() => onUse("diagram", entry.seq)}
          paired={paired}
          keyShortcut={singleCard}
        />
      ) : (
        <ConfirmCardVideo
          brief={item.brief}
          pendingTopic={pendingTopic}
          status={status}
          topics={topics}
          block={block}
          busy={underWay}
          refusal={shownRefusal}
          onPress={() => live !== null && onPress(live)}
          onUse={() => onUse("video", entry.seq)}
          onPutBack={async () => {
            const outcome = await onSave(item.brief, entry.seq, "video");
            return outcome.ok ? null : `It could not be put back: ${outcome.refusal.error}`;
          }}
          holdReason={holdReason}
          jobHref={jobHref}
          jobRunning={running}
          holderHref={holderHref}
          runnerAbbreviations={item.abbreviations}
          keyShortcut={singleCard}
          editBlock={editBlock}
          paired={paired}
          replacing={live?.replaces != null}
          tools={videoTools}
          charsPerSecond={charsPerSecond}
          onSwitchTool={async (tool) => {
            const outcome = await onSave(switchedTool(item.brief, tool), entry.seq, "video");
            return outcome.ok ? null : `The tool could not be switched: ${outcome.refusal.error}`;
          }}
        />
      );
    return (
      <div key={item.kind} data-card={item.kind} data-seq={entry.seq}>
        {inner}
      </div>
    );
  };

  // A partly refused reply: the kind being retried shows where its card will be.
  const retrying = view.inFlight
    ? [...(entry.briefsInvalid ?? []), ...(entry.briefInvalid !== undefined ? [entry.briefInvalid] : [])]
        .filter((item) => item.retried && item.kind !== undefined && !briefs.some((brief) => brief.kind === item.kind))
        .map((item) => item.kind as DraftKind)
    : [];
  const cardsHere =
    briefs.length === 0 && retrying.length === 0 && both === null ? null : (
      <div className="flex flex-col gap-3">
        {briefs.map(renderCard)}
        {both !== null && (
          <MakeBothButton
            label={both.label}
            busy={both.cards.some((card) => pressUnderWay(pressing, view, card.kind))}
            error={bothError}
            onPress={onPressBoth}
          />
        )}
        {retrying.map((kind) => (
          <p key={kind} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-[14px] text-text3" role="status">
            Checking the {kind} brief
            <Dots />
          </p>
        ))}
      </div>
    );

  if (entry.role === "studio") {
    // The runner speaking: a centred line, not a bubble and not a third voice.
    // A person's own edit of a brief is one of these, and carries the stored
    // brief as the card under it (phase 3).
    return (
      <div className="flex flex-col gap-3">
        {/* An edit's note lists its changes one to a line, which reads as a
            list only when the lines start together. */}
        <p
          className={cx(
            "mx-auto max-w-[56ch] whitespace-pre-wrap text-[13px] leading-5 text-text3",
            cardsHere === null ? "text-center" : "w-fit text-left",
          )}
        >
          <span className="sr-only">Studio: </span>
          {entry.text}
        </p>
        {cardsHere !== null && <div className="px-1.5">{cardsHere}</div>}
      </div>
    );
  }
  const reply = splitReply(entry.text);
  return (
    <TutorMessage label="Planner">
      {reply.prose !== "" && <NoteProse source={reply.prose} idPrefix={`p${entry.seq}-`} images="link" />}
      {entry.interrupted === true && <p className="mt-2 text-[13px] text-text3">The reply was cut off.</p>}
      {cardsHere !== null && <div className="mt-3">{cardsHere}</div>}
      {suggest !== null && suggest.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested">
          {suggest.map((kind) => {
            const reason = unavailable(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onSuggest(kind)}
                disabled={reason !== null}
                title={reason ?? undefined}
                aria-label={suggestionName(kind)}
                className={chipClasses({ size: "sm" })}
              >
                <Glyph name={kind} size={16} className="text-accent-text" />
                {KIND_NAME[kind]}
              </button>
            );
          })}
        </div>
      )}
    </TutorMessage>
  );
}

/** Make both: a primary button under the later card of a pair asked for together (D60). */
function MakeBothButton({ label, busy, error, onPress }: { label: string; busy: boolean; error: string | null; onPress: () => void }) {
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div>
        <Button onClick={onPress} disabled={busy} data-make-both>
          {busy ? "Queuing both…" : label}
        </Button>
      </div>
      {error === null ? (
        <p className="text-[12px] leading-4 text-text3">Starts the diagram and the video together. Nothing is spent until you press it.</p>
      ) : (
        <p role="alert" className="text-[13px] leading-5 text-text">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A reply being written: "The planner is thinking" until the first words
 * arrive, and "Checking the brief" once a reply has landed while the turn is
 * still open, as the runner validates its brief (and may ask for a fix).
 */
function Streaming({ text, checking }: { text: string | null; checking: boolean }) {
  const reply = text === null ? null : splitReply(text, true);
  if (reply === null && checking) {
    return (
      <p className="flex items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-[14px] text-text3" role="status">
        {CHECKING_BRIEF}
        <Dots />
      </p>
    );
  }
  if (reply === null || (reply.prose === "" && !reply.checking)) {
    return (
      <TutorMessage label="Planner">
        <p className="flex items-center gap-2 text-[14px] text-text3" role="status">
          {THINKING}
          <Dots />
        </p>
      </TutorMessage>
    );
  }
  return (
    <TutorMessage label="Planner">
      {reply.prose !== "" && <NoteProse source={reply.prose} idPrefix="streaming-" images="link" />}
      {reply.checking && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-[14px] text-text3" role="status">
          {CHECKING_BRIEF}
          <Dots />
        </p>
      )}
    </TutorMessage>
  );
}

function Dots() {
  return (
    <span aria-hidden className="inline-flex gap-1">
      {[0, 1, 2].map((at) => (
        <span
          key={at}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-text3 motion-reduce:animate-none"
          style={{ animationDelay: `${at * 180}ms` }}
        />
      ))}
    </span>
  );
}

/** E1, E2 and E6: a `--warn-tint` card at the foot of the thread, with what to do. */
function Problem({
  problem,
  kind = null,
  onRetry,
  onAskAgain,
  onStartOver,
  cutOffShown,
  blocked,
}: {
  problem: ThreadProblem;
  /** The kind E6's refused brief was, when the runner names it. */
  kind?: DraftKind | null;
  /**
   * Why a paid resend waits, or null: the brief is being edited, and a reply
   * may carry a new brief that retires the card with the edits on it.
   */
  blocked: string | null;
  /** The cut-off reply already says so under its text: E2 is then only Try again. */
  cutOffShown: boolean;
  onRetry: (() => void) | null;
  onAskAgain: (() => void) | null;
  onStartOver: () => void;
}) {
  if (problem.case === "E2" && cutOffShown) {
    return onRetry === null ? null : (
      <div className="-mt-3 px-1.5">
        <Button size="sm" variant="secondary" onClick={onRetry} disabled={blocked !== null} disabledReason={blocked ?? undefined}>
          Try again
        </Button>
      </div>
    );
  }
  const title =
    problem.case === "E1" ? (
      <>The planner&apos;s request was refused.</>
    ) : problem.case === "E6" ? (
      <>The planner&apos;s {kind === null ? "" : `${kind} `}brief did not pass the studio&apos;s checks twice.</>
    ) : undefined;
  return (
    <Callout
      role="alert"
      title={title}
      actions={
        problem.case !== "E6" && onRetry === null ? undefined : (
          <>
            {problem.case !== "E6" && onRetry !== null && (
              <Button size="sm" variant="secondary" onClick={onRetry} disabled={blocked !== null} disabledReason={blocked ?? undefined}>
                Try again
              </Button>
            )}
            {problem.case === "E6" && (
              <>
                {onAskAgain !== null && (
                  <Button size="sm" variant="secondary" onClick={onAskAgain} disabled={blocked !== null} disabledReason={blocked ?? undefined}>
                    Ask again
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onStartOver}>
                  Start over
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {problem.case === "E1" && (
        <>
          <p>{problem.text}</p>
          <p className="mt-1">
            The planner runs on this machine&apos;s <span className="font-mono">claude</span> login. Check it with{" "}
            <span className="font-mono">claude doctor</span>, then try again.
          </p>
        </>
      )}
      {problem.case === "E2" && <p>{problem.text}</p>}
      {problem.case === "E6" && <p className="font-mono text-[12px]">{problem.text}</p>}
    </Callout>
  );
}

/** Why New conversation or Start over did nothing, where the press was. */
function Failure({ text, className }: { text: string | null; className?: string }) {
  if (text === null) return null;
  return (
    <p role="alert" className={`text-[13px] text-danger ${className ?? ""}`}>
      {text}
    </p>
  );
}

function BackBar({ href }: { href: string }) {
  return (
    <div className="flex h-10 shrink-0 items-center border-b border-hair bg-surface2 px-3">
      <PanelLink
        href={href}
        scroll={false}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-text2 transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Glyph name="previous" size={16} />
        From your conversation
      </PanelLink>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-4 p-8 text-center">{children}</div>;
}
