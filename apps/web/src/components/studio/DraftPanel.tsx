"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { NoteProse } from "@/components/NoteProse";
import { ConfirmCard, type SaveOutcome } from "@/components/studio/ConfirmCard";
import { JobPanel } from "@/components/studio/JobPanel";
import { askToNotify, useStudioJobs } from "@/components/studio/JobsProvider";
import { PinnedDiagram } from "@/components/studio/PinnedDiagram";
import { useStartDraft } from "@/components/studio/PlusCard";
import { DialogHeader } from "@/components/studio/StudioDialog";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/classes";
import { Composer } from "@/components/ui/Composer";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import type { TopicOption } from "@/data/topics";
import {
  askAgainText,
  capFrom,
  cardPendingTopic,
  cardStatus,
  CHECKING_BRIEF,
  composerState,
  costLabel,
  drawBlock,
  drawKey,
  drawRefusal,
  GONE,
  isEmptyConversation,
  jobPatch,
  lastPersonText,
  latestBriefSeq,
  modEnterAction,
  OPENING_TURN,
  refusalNoted,
  sendRefusal,
  splitReply,
  startOverStep,
  STILL_ANSWERING,
  THINKING,
  threadProblem,
  turnIndicator,
  visibleEntries,
  wordsBack,
  type DrawRefusal,
  type CapStatus,
  type Suggestion,
  type ThreadProblem,
} from "@/lib/studio-chat";
import {
  abandonDraft,
  drawDraft,
  getDraft,
  openDraftEvents,
  readDailyCap,
  saveBrief,
  sendMessage,
  type DraftView,
  type TranscriptEntry,
} from "@/lib/studio-drafts";
import { arrivingSource, EXTEND_OPENING_TURN, forgetExtendKey, sessionStore, takeOpener } from "@/lib/studio-extend";
import { isTerminal, type Brief, type Job } from "@/lib/studio-jobs";
import { panelHref, titleOf } from "@/lib/studio-view";

/**
 * The conversation, in the studio's panel (docs/STUDIO-CHAT-FIRST.md, "UI").
 *
 * Two bodies under one header, and the URL says which: the chat
 * (`?draft=`), and the job Draw started with a bar back to the chat
 * (`?draft=&job=`). One component holds both so the conversation's state and
 * its event stream live through the trip to the job and back.
 *
 * An extend conversation (a draft with `source`) pins the diagram at the top
 * of the thread, and on arrival from Extend sends the opening message
 * `ExtendStart` handed it, so the planner's first reply says what it sees.
 *
 * **The runner owns the draft; this is a cache of it**, as `JobsProvider` is
 * of the jobs. `GET /api/drafts/{id}` is the record. The event stream adds
 * the one thing the record cannot, a reply growing as it is written (`delta`),
 * and every other event is a cue to read the record again, so a missed event
 * or a dropped stream costs a moment and nothing else. Every call goes
 * through `studio-drafts.ts`; every judgement about what to show is in
 * `studio-chat.ts`.
 */

/** The polled record while a turn is in flight, for when the stream is down. */
const POLL_IN_FLIGHT_MS = 4_000;
/**
 * How often focus may re-read the daily cap. `/api/health` runs `doctor`,
 * which the runner caches for 30 seconds, and `claude --version`, so this is
 * the cheapest rate at which each read can still be new.
 */
const CAP_READ_MS = 30_000;
/** The same limit the runner takes, `STUDIO_TEXT_LIMIT`'s default. */
const TEXT_LIMIT = 8_000;

type Status = "loading" | "ready" | "gone" | "down";

export function DraftPanel({
  draftId,
  jobId,
  path,
  topics,
  titles,
  suggestions,
  cap: initialCap,
}: {
  draftId: string;
  /** `?job=`: the job view, with the bar back to the chat. */
  jobId: string | null;
  /** The page's own URL, which every link here patches. */
  path: string;
  topics: TopicOption[];
  /** Each diagram's display title by name, for an extend conversation's header and picture. */
  titles: Readonly<Record<string, string>>;
  suggestions: Suggestion[];
  /** `dailyCap` from `/api/health` at render time. A 429 replaces it. */
  cap: CapStatus | null;
}) {
  const router = useRouter();
  const { jobs, refresh: refreshJobs } = useStudioJobs();
  const [view, setView] = useState<DraftView | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [downReason, setDownReason] = useState<string | null>(null);
  /** The reply being written, as the last `delta` had it. */
  const [stream, setStream] = useState<{ turn: number; text: string } | null>(null);
  /** The person's turn between Send and the record having it. */
  const [pending, setPending] = useState<{ text: string; seq: number | null } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [cap, setCap] = useState<CapStatus | null>(initialCap);
  const [drawing, setDrawing] = useState(false);
  const [refused, setRefused] = useState<(DrawRefusal & { seq: number }) | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const [startOverError, setStartOverError] = useState<string | null>(null);
  /** The live brief is being edited on its card: Draw and Send wait. */
  const [editing, setEditing] = useState(false);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const thread = useRef<HTMLDivElement | null>(null);
  const focused = useRef(false);
  const { start: startDraft, busy: starting, error: startError } = useStartDraft(path);

  const arriving = arrivingSource(draftId);

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

  // Several events in one burst (a reply, its brief, the state) are one read.
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
    lastSeq.current = view?.transcript.reduce((max, entry) => Math.max(max, entry.seq), 0) ?? 0;
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
        if (event.type === "state" && (event.data.state === "drawing" || event.data.jobId !== null)) void refreshJobs();
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

  // Draw's and Send's disabled reasons are re-checked when the panel regains
  // focus: a job held elsewhere may have been accepted meanwhile, and the
  // day's spend may have aged out.
  const capReadAt = useRef(0);
  const readCap = useCallback(async () => {
    capReadAt.current = Date.now();
    const next = capFrom(await readDailyCap());
    if (next !== null) setCap(next);
  }, []);
  useEffect(() => {
    const wake = () => {
      void refreshJobs();
      void load();
      if (Date.now() - capReadAt.current >= CAP_READ_MS) void readCap();
    };
    window.addEventListener("focus", wake);
    return () => window.removeEventListener("focus", wake);
  }, [refreshJobs, load, readCap]);

  // A spent cap frees when its oldest spend leaves the 24-hour window, which
  // the runner names; read it again then rather than waiting for a focus.
  const freesAt = cap?.exceeded ? Date.parse(cap.oldestAgesOutAt ?? "") : Number.NaN;
  useEffect(() => {
    if (!Number.isFinite(freesAt)) return;
    const wait = Math.max(1_000, Math.min(freesAt - Date.now() + 1_000, 2 ** 31 - 1));
    const timer = setTimeout(() => void readCap(), wait);
    return () => clearTimeout(timer);
  }, [freesAt, readCap]);

  /* ---------------------------------------------------------------- */
  /* Focus and scroll                                                  */
  /* ---------------------------------------------------------------- */

  const mode: "chat" | "job" = jobId !== null ? "job" : "chat";

  useEffect(() => {
    // Opening focuses the composer, once it exists.
    if (!ready || mode !== "chat" || focused.current) return;
    focused.current = true;
    composer.current?.focus();
  }, [ready, mode]);

  const entries = useMemo(() => (view === null ? [] : visibleEntries(view.transcript)), [view]);
  useEffect(() => {
    // The thread scrolls, never the page.
    const box = thread.current;
    if (box !== null) box.scrollTop = box.scrollHeight;
  }, [entries.length, stream?.text, pending, mode]);

  /* ---------------------------------------------------------------- */
  /* Verbs                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * One person turn. `keepComposer` is for a turn that was not typed in the
   * composer (the opener an Extend press hands over), whose composer may hold
   * a second message that sending this one must not clear.
   */
  async function send(raw: string, { keepComposer = false }: { keepComposer?: boolean } = {}) {
    const body = raw.trim();
    if (body === "" || view === null) return;
    setSendError(null);
    setPending({ text: body, seq: null });
    if (!keepComposer) setText("");
    const result = await sendMessage(draftId, body);
    if (!result.ok) {
      setPending(null);
      // Give the words back: a refused turn should not cost the typing.
      setText((held) => wordsBack(held, body, keepComposer));
      if (result.status === 429) setCap(capFrom({ ...(result.refusal.detail as object), exceeded: true }) ?? cap);
      setSendError(sendRefusal(result.status, result.refusal));
      void load();
      return;
    }
    setPending({ text: body, seq: result.data.seq });
    void load();
  }

  const liveSeq = view === null ? null : latestBriefSeq(view.transcript);
  const liveEntry = liveSeq === null ? undefined : entries.find((entry) => entry.seq === liveSeq);
  const liveBrief = liveEntry?.brief ?? null;
  const drawIsLive = view !== null && liveSeq !== null && cardStatus(view, liveSeq) === "live";
  const block = view !== null && liveBrief !== null ? drawBlock(liveBrief, view, jobs, cap) : null;

  async function draw() {
    if (view === null || !drawIsLive || block !== null || drawing || liveSeq === null) return;
    // The notification prompt rides on the press that starts a job: a browser
    // will not show one without a gesture, and the job's ending is what it is
    // for. Not awaited, so Draw does not wait on the person answering it.
    void askToNotify();
    setDrawing(true);
    setRefused(null);
    const result = await drawDraft(draftId, drawKey(draftId, liveSeq, view.jobId));
    if (!result.ok) {
      setDrawing(false);
      setRefused({ seq: liveSeq, ...drawRefusal(result.status, result.refusal) });
      if (result.status === 429) setCap(capFrom({ ...(result.refusal.detail as object), exceeded: true }) ?? cap);
      void load();
      return;
    }
    await refreshJobs();
    router.push(panelHref(path, { job: result.data.jobId, draft: draftId }), { scroll: false });
    setDrawing(false);
    void load();
  }

  async function startOver() {
    setConfirmStartOver(false);
    setStartOverError(null);
    const step = view === null ? "skip" : startOverStep(view.state);
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
    // A done draft is left as it is: it drew something and stays findable.
    await startDraft();
  }

  const drawReady = drawIsLive && block === null && !editing;

  /**
   * The person's edit of the live brief (phase 3). Resolves once the record
   * holds the result, so the card leaves editing as the stored brief appears
   * under the runner's note, rather than showing the old brief for a moment.
   * Focus then goes to the new card's Draw, the next thing to press.
   */
  const saveEdit = useCallback(
    async (brief: Brief): Promise<SaveOutcome> => {
      const result = await saveBrief(draftId, brief);
      if (!result.ok) {
        if (result.status === 404) setStatus("gone");
        return { ok: false, status: result.status, refusal: result.refusal };
      }
      await load();
      requestAnimationFrame(() => thread.current?.querySelector<HTMLElement>("[data-studio-draw]")?.focus());
      return { ok: true };
    },
    [draftId, load],
  );

  // Arriving from Extend, or from Talk it through on a failed job: the opener
  // left for this draft, taken once so a reload never sends it again, and
  // sent only into a conversation that is still empty.
  const opened = useRef(false);
  useEffect(() => {
    if (!ready || view === null || opened.current) return;
    opened.current = true;
    const store = sessionStore();
    const opener = takeOpener(store, draftId);
    if (opener === null) return;
    // Arrived: a reload of the press that made this draft may now mint a new one.
    if (opener.source !== null) forgetExtendKey(store, opener.source);
    // The composer first, and a send that leaves it alone: a message queued
    // during the read and a second one still being typed both survive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (opener.compose !== "") setText(opener.compose);
    if (opener.send !== null && isEmptyConversation(view.transcript) && !view.inFlight) {
      void send(opener.send, { keepComposer: true });
    }
    // `send` is this render's; the guard makes this run once whatever changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view, draftId]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Cmd or Ctrl+Enter presses a live Draw from anywhere in the panel, and
    // only while the composer is empty: words there are a correction to send,
    // not a reason to pay for the old brief. The composer handles its own and
    // marks the event, so nothing is pressed twice.
    if (event.defaultPrevented || event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    if (modEnterAction(text, drawReady) !== "draw") return;
    event.preventDefault();
    void draw();
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
        <DialogHeader title="New diagram" />
        <Empty>
          <p className="text-[15px] text-text">{GONE}</p>
          <Button onClick={() => void startDraft()} disabled={starting}>
            New diagram
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
        <DialogHeader title={`Extending ${arrivingTitle}`} />
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
        <DialogHeader title="New diagram" />
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

  const sourceTitle = view.source === null ? null : (titleOf(titles, view.source) ?? view.source);
  const title = view.title ?? liveBrief?.title ?? (sourceTitle === null ? "New diagram" : `Extending ${sourceTitle}`);

  if (mode === "job" && jobId !== null) {
    const job = jobs.find((entry) => entry.jobId === jobId) ?? null;
    const settled = job !== null && (isTerminal(job.state) || job.state === "awaiting_review");
    const ended = job !== null && isTerminal(job.state);
    return (
      <>
        <DialogHeader title={job?.title ?? title} meta={cost === null ? undefined : <span title={costTitle}>{cost}</span>} />
        <BackBar href={panelHref(path, { job: null })} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {ended && (
            <div className="flex flex-wrap items-center gap-3 border-b border-hair px-5 py-3">
              <p className="min-w-0 flex-1 text-[14px] text-text2">
                {job.state === "accepted"
                  ? "Accepted. Ask for a change or another diagram in the same conversation."
                  : job.state === "failed" || job.state === "interrupted"
                    ? "The drawing did not pass. What the checks found is in the conversation."
                    : "Ask for a change, or start something new."}
              </p>
              <Button size="sm" href={panelHref(path, { job: null })}>
                Back to the conversation
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void startDraft()} disabled={starting}>
                New diagram
              </Button>
              <Failure text={startError} className="basis-full" />
            </div>
          )}
          <JobPanel jobId={jobId} path={path} embedded inConversation />
          {settled && !ended && (
            <p className="px-5 pb-5 text-[13px] text-text3">
              Accept or Discard above. Either way, the conversation is where the next diagram starts.
            </p>
          )}
        </div>
      </>
    );
  }

  const problem = threadProblem(view);
  const empty = isEmptyConversation(view.transcript) && pending === null;
  const composing = composerState(view, cap, pending !== null, empty, editing);
  const busy = view.inFlight || pending !== null;
  const lastPerson = pending?.text ?? lastPersonText(view.transcript);

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <DialogHeader title={title} meta={cost === null ? undefined : <span title={costTitle}>{cost}</span>} />

      <div
        ref={thread}
        role="log"
        aria-live="polite"
        aria-busy={busy}
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
      >
        {view.source !== null && sourceTitle !== null && <PinnedDiagram name={view.source} title={sourceTitle} />}

        {empty && (
          <TutorMessage label="Planner">
            <p className="max-w-[60ch]">{view.source === null ? OPENING_TURN : EXTEND_OPENING_TURN}</p>
          </TutorMessage>
        )}
        {/* The corpus's topics are a way into a new diagram; an extend
            conversation already has its subject. */}
        {empty && view.source === null && suggestions.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-2 px-1.5" aria-label="Suggestions">
            {suggestions.map((suggestion) => (
              <Chip
                key={suggestion.label}
                onClick={() => {
                  setText(suggestion.text);
                  composer.current?.focus();
                }}
              >
                {suggestion.label}
              </Chip>
            ))}
          </div>
        )}

        {entries.map((entry) => (
          <Entry
            key={entry.seq}
            entry={entry}
            view={view}
            topics={topics}
            block={entry.seq === liveSeq ? block : null}
            busy={drawing}
            onSave={saveEdit}
            onEditingChange={setEditing}
            refusal={
              refused !== null && refused.seq === entry.seq
                ? { text: refusalNoted(refused, entries) ? null : refused.text, holder: refused.holder }
                : null
            }
            onDraw={() => void draw()}
            path={path}
            jobs={jobs}
          />
        ))}

        {pending !== null && !view.transcript.some((entry) => entry.seq === pending.seq) && (
          <UserMessage>{pending.text}</UserMessage>
        )}

        {busy && (
          <Streaming
            text={stream?.text ?? null}
            checking={pending === null && turnIndicator(view, stream !== null) === "checking"}
          />
        )}

        {problem !== null && !busy && (
          <Problem
            problem={problem}
            onRetry={lastPerson === null ? null : () => void send(lastPerson)}
            onAskAgain={problem.case === "E6" ? () => void send(askAgainText(problem)) : null}
            onStartOver={() => setConfirmStartOver(true)}
            cutOffShown={entries.at(-1)?.interrupted === true}
          />
        )}

        {sendError !== null && (
          <p role="alert" className="rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-text">
            {sendError}
          </p>
        )}

        {view.turnCap > 0 && view.turns >= view.turnCap && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-text">
            <span className="min-w-0 flex-1">
              This conversation has reached its {view.turnCap}-turn limit.
              {drawIsLive ? " The last brief can still be drawn." : ""}
            </span>
            <Button size="sm" variant="secondary" onClick={() => void startDraft()} disabled={starting}>
              New diagram
            </Button>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-hair px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:px-5">
        <Composer
          value={text}
          onChange={setText}
          onSubmit={(value) => void send(value)}
          label="Tell the planner what the diagram should show"
          placeholder={composing.placeholder}
          maxLength={TEXT_LIMIT}
          disabled={composing.disabled}
          sendDisabled={composing.sendDisabled}
          disabledReason={composing.reason ?? undefined}
          inputRef={composer}
          onModEnter={drawReady ? () => void draw() : undefined}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-text3">
          {confirmStartOver ? (
            <span className="flex items-center gap-2">
              <span className="text-text2">Close this conversation for good?</span>
              <button type="button" onClick={() => void startOver()} className="font-medium text-danger underline-offset-4 hover:underline">
                Start over
              </button>
              <button type="button" onClick={() => setConfirmStartOver(false)} className="underline-offset-4 hover:text-text2 hover:underline">
                Keep it
              </button>
            </span>
          ) : (
            view.transcript.length > 0 && (
              <button type="button" onClick={() => setConfirmStartOver(true)} className="underline-offset-4 hover:text-text2 hover:underline">
                Start over
              </button>
            )
          )}
          {downReason !== null && <span className="text-danger">The runner stopped answering: {downReason}</span>}
          <Failure text={startOverError ?? (startError === null ? null : `A new conversation could not start: ${startError}`)} className="basis-full" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Entry({
  entry,
  view,
  topics,
  block,
  busy,
  refusal,
  onDraw,
  path,
  jobs,
  onSave,
  onEditingChange,
}: {
  jobs: readonly Job[];
  entry: TranscriptEntry;
  view: DraftView;
  topics: readonly TopicOption[];
  block: ReturnType<typeof drawBlock>;
  busy: boolean;
  refusal: { text: string | null; holder: string | null } | null;
  onDraw: () => void;
  path: string;
  onSave: (brief: Brief) => Promise<SaveOutcome>;
  onEditingChange: (editing: boolean) => void;
}) {
  if (entry.role === "person") return <UserMessage>{entry.text}</UserMessage>;
  const status = entry.brief === undefined ? null : cardStatus(view, entry.seq);
  const card =
    entry.brief !== undefined && status !== null ? (
      <ConfirmCard
        brief={entry.brief}
        pendingTopic={cardPendingTopic(status, entry, view)}
        status={status}
        topics={topics}
        block={block}
        busy={busy}
        refusal={refusal}
        onDraw={onDraw}
        onSave={onSave}
        onEditingChange={onEditingChange}
        editBlock={view.inFlight ? STILL_ANSWERING : busy ? "Draw was just pressed." : null}
        jobHref={view.jobId === null ? null : panelHref(path, { job: view.jobId })}
        holderHref={(holder) => panelHref(path, jobPatch(holder, view, jobs))}
        sourceChanged={view.sourceChanged === true}
      />
    ) : null;
  if (entry.role === "studio") {
    // The runner speaking: a centred line, not a bubble and not a third voice.
    // A person's own edit of the brief is one of these, and carries the
    // stored brief as the card under it (phase 3).
    return (
      <div className="flex flex-col gap-3">
        {/* An edit's note lists its changes one to a line, which reads as a
            list only when the lines start together. */}
        <p
          className={cx(
            "mx-auto max-w-[56ch] whitespace-pre-wrap text-[13px] leading-5 text-text3",
            card === null ? "text-center" : "w-fit text-left",
          )}
        >
          <span className="sr-only">Studio: </span>
          {entry.text}
        </p>
        {card !== null && <div className="px-1.5">{card}</div>}
      </div>
    );
  }
  const reply = splitReply(entry.text);
  return (
    <TutorMessage label="Planner">
      {reply.prose !== "" && <NoteProse source={reply.prose} idPrefix={`p${entry.seq}-`} images="link" />}
      {entry.interrupted === true && <p className="mt-2 text-[13px] text-text3">The reply was cut off.</p>}
      {card !== null && <div className="mt-3">{card}</div>}
    </TutorMessage>
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
  onRetry,
  onAskAgain,
  onStartOver,
  cutOffShown,
}: {
  problem: ThreadProblem;
  /** The cut-off reply already says so under its text: E2 is then only Try again. */
  cutOffShown: boolean;
  onRetry: (() => void) | null;
  onAskAgain: (() => void) | null;
  onStartOver: () => void;
}) {
  if (problem.case === "E2" && cutOffShown) {
    return onRetry === null ? null : (
      <div className="-mt-3 px-1.5">
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl bg-warn-tint px-4 py-3.5 text-[14px] text-text">
      {problem.case === "E1" && (
        <>
          <p className="font-semibold">The planner&apos;s request was refused.</p>
          <p className="break-words text-[13px] text-text2">{problem.text}</p>
          <p className="text-[13px] text-text2">
            The planner runs on this machine&apos;s <span className="font-mono">claude</span> login. Check it with{" "}
            <span className="font-mono">claude doctor</span>, then try again.
          </p>
        </>
      )}
      {problem.case === "E2" && <p>{problem.text}</p>}
      {problem.case === "E6" && (
        <>
          <p className="font-semibold">The planner&apos;s brief did not pass the studio&apos;s checks twice.</p>
          <p className="break-words font-mono text-[12px] text-text2">{problem.text}</p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {problem.case !== "E6" && onRetry !== null && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {problem.case === "E6" && (
          <>
            {onAskAgain !== null && (
              <Button size="sm" variant="secondary" onClick={onAskAgain}>
                Ask again
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onStartOver}>
              Start over
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Why New diagram or Start over did nothing, where the press was. */
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
      <Link
        href={href}
        scroll={false}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-text2 transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5l-5 5 5 5" />
        </svg>
        From your conversation
      </Link>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-4 p-8 text-center">{children}</div>;
}
