"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { NoteProse } from "@/components/NoteProse";
import { BriefForm } from "@/components/studio/BriefForm";
import { ConfirmCard } from "@/components/studio/ConfirmCard";
import { JobPanel } from "@/components/studio/JobPanel";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { useStartDraft } from "@/components/studio/PlusCard";
import { DialogHeader } from "@/components/studio/StudioDialog";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Composer } from "@/components/ui/Composer";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import type { TopicOption } from "@/data/topics";
import {
  askAgainText,
  capFrom,
  cardStatus,
  CHECKING_BRIEF,
  composerState,
  costLabel,
  drawBlock,
  drawRefusal,
  GONE,
  isEmptyConversation,
  lastPersonText,
  latestBriefSeq,
  OPENING_TURN,
  splitReply,
  THINKING,
  threadProblem,
  visibleEntries,
  type CapStatus,
  type Suggestion,
  type ThreadProblem,
} from "@/lib/studio-chat";
import {
  abandonDraft,
  drawDraft,
  getDraft,
  idempotencyKey,
  openDraftEvents,
  refusalReason,
  sendMessage,
  type DraftView,
  type TranscriptEntry,
} from "@/lib/studio-drafts";
import { isTerminal } from "@/lib/studio-jobs";
import { panelHref, thumbnailHref } from "@/lib/studio-view";

/**
 * The conversation, in the studio's panel (docs/STUDIO-CHAT-FIRST.md, "UI").
 *
 * Three bodies under one header, and the URL says which: the chat
 * (`?draft=`), the job Draw started with a bar back to the chat
 * (`?draft=&job=`), and the brief form as "Fill the brief myself"
 * (`?draft=&new=`). One component holds all three so the conversation's
 * state and its event stream live through the trip to the job and back.
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
/** The same limit the runner takes, `STUDIO_TEXT_LIMIT`'s default. */
const TEXT_LIMIT = 8_000;

type Status = "loading" | "ready" | "gone" | "down";

export function DraftPanel({
  draftId,
  jobId,
  form,
  path,
  topics,
  suggestions,
  cap: initialCap,
}: {
  draftId: string;
  /** `?job=`: the job view, with the bar back to the chat. */
  jobId: string | null;
  /** `?new=`: the brief form. `""` prefills from the draft's brief, a job id from that job's. */
  form: string | null;
  /** The page's own URL, which every link here patches. */
  path: string;
  topics: TopicOption[];
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
  const [refused, setRefused] = useState<{ seq: number; text: string; holder: string | null } | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const thread = useRef<HTMLDivElement | null>(null);
  const focused = useRef(false);
  const { start: startDraft, busy: starting } = useStartDraft(path);

  const topicMap = useMemo(() => new Map(topics.map((topic) => [topic.slug, topic])), [topics]);

  /* ---------------------------------------------------------------- */
  /* The record                                                        */
  /* ---------------------------------------------------------------- */

  const load = useCallback(async (): Promise<DraftView | null> => {
    const result = await getDraft(draftId);
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
    return openDraftEvents(draftId, lastSeq.current, {
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
  }, [draftId, ready, reload, refreshJobs]);

  // The record is the truth, so a turn in flight is also polled: with the
  // stream down, the reply still arrives, only without growing on screen.
  const inFlight = (view?.inFlight ?? false) || pending !== null;
  useEffect(() => {
    if (!inFlight) return;
    const every = setInterval(() => void load(), POLL_IN_FLIGHT_MS);
    return () => clearInterval(every);
  }, [inFlight, load]);

  // Draw's disabled reasons are re-checked when the panel regains focus: a
  // job held elsewhere may have been accepted meanwhile.
  useEffect(() => {
    const wake = () => {
      void refreshJobs();
      void load();
    };
    window.addEventListener("focus", wake);
    return () => window.removeEventListener("focus", wake);
  }, [refreshJobs, load]);

  /* ---------------------------------------------------------------- */
  /* Focus and scroll                                                  */
  /* ---------------------------------------------------------------- */

  const mode: "chat" | "job" | "form" = jobId !== null ? "job" : form !== null ? "form" : "chat";

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

  async function send(raw: string) {
    const body = raw.trim();
    if (body === "" || view === null) return;
    setSendError(null);
    setPending({ text: body, seq: null });
    setText("");
    const result = await sendMessage(draftId, body);
    if (!result.ok) {
      setPending(null);
      // Give the words back: a refused turn should not cost the typing.
      setText((held) => (held === "" ? body : held));
      if (result.status === 429) setCap(capFrom({ ...(result.refusal.detail as object), exceeded: true }) ?? cap);
      const reason = refusalReason(result.refusal);
      setSendError(
        result.status === 429
          ? null
          : reason === "in-flight"
            ? "The planner is still answering the last message."
            : result.refusal.error,
      );
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
    setDrawing(true);
    setRefused(null);
    const result = await drawDraft(draftId, idempotencyKey(`draw:${draftId}:${liveSeq}`));
    if (!result.ok) {
      setDrawing(false);
      setRefused({ seq: liveSeq, ...drawRefusal(result.status, result.refusal) });
      if (result.status === 429) setCap(capFrom({ ...(result.refusal.detail as object), exceeded: true }) ?? cap);
      void load();
      return;
    }
    await refreshJobs();
    router.push(panelHref(path, { job: result.data.jobId, brief: null }), { scroll: false });
    setDrawing(false);
    void load();
  }

  async function startOver() {
    setConfirmStartOver(false);
    await abandonDraft(draftId);
    await startDraft();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Cmd or Ctrl+Enter presses a live Draw from anywhere in the panel. The
    // composer handles its own and marks the event, so it is not pressed twice.
    if (event.defaultPrevented || event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    if (!drawIsLive || block !== null) return;
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
        </Empty>
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

  const title = view.title ?? liveBrief?.title ?? "New diagram";

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
            </div>
          )}
          <JobPanel jobId={jobId} path={path} embedded />
          {settled && !ended && (
            <p className="px-5 pb-5 text-[13px] text-text3">
              Accept or Discard above. Either way, the conversation is where the next diagram starts.
            </p>
          )}
        </div>
      </>
    );
  }

  if (mode === "form") {
    return (
      <>
        <DialogHeader title="Fill the brief yourself" />
        <BackBar href={panelHref(path, { brief: null })} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <BriefForm
            path={path}
            topics={topics}
            from={form ?? ""}
            initial={form === "" ? (view.brief ?? liveBrief ?? undefined) : undefined}
            draftId={view.state === "briefed" ? draftId : null}
            embedded
          />
        </div>
      </>
    );
  }

  const problem = threadProblem(view);
  const empty = isEmptyConversation(view.transcript) && pending === null;
  const composing = composerState(view, cap, pending !== null, empty);
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
        {view.source !== null && (
          <figure className="flex flex-col items-center gap-1.5">
            <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-border bg-[#f7f6f3]">
              {/* The runner streams the stored SVG; see DiagramTile. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbnailHref(view.source)} alt="" className="h-full w-full object-contain p-2" />
            </div>
            <figcaption className="text-[12px] text-text3">
              Extending <span className="font-mono">{view.source}</span>
            </figcaption>
          </figure>
        )}

        {empty && (
          <TutorMessage label="Planner">
            <p className="max-w-[60ch]">{OPENING_TURN}</p>
          </TutorMessage>
        )}
        {empty && suggestions.length > 0 && (
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
            topics={topicMap}
            block={entry.seq === liveSeq ? block : null}
            busy={drawing}
            refusal={refused !== null && refused.seq === entry.seq ? refusalShown(refused, entries) : null}
            onDraw={() => void draw()}
            path={path}
          />
        ))}

        {pending !== null && !view.transcript.some((entry) => entry.seq === pending.seq) && (
          <UserMessage>{pending.text}</UserMessage>
        )}

        {busy && <Streaming text={stream?.text ?? null} />}

        {problem !== null && !busy && (
          <Problem
            problem={problem}
            onRetry={lastPerson === null ? null : () => void send(lastPerson)}
            onAskAgain={problem.case === "E6" ? () => void send(askAgainText(problem)) : null}
            formHref={panelHref(path, { brief: "" })}
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
          onModEnter={drawIsLive && block === null ? () => void draw() : () => void send(text)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-text3">
          <Link href={panelHref(path, { brief: "" })} scroll={false} className="underline-offset-4 hover:text-text2 hover:underline">
            Fill the brief myself
          </Link>
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
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A refused Draw says so under the button until the runner's own studio note
 * (E7) is in the thread; after that the card keeps only the action, so the
 * sentence is not on screen twice.
 */
function refusalShown(
  refused: { seq: number; text: string; holder: string | null },
  entries: readonly TranscriptEntry[],
): { text: string | null; holder: string | null } {
  const noted = entries.some((entry) => entry.role === "studio" && entry.seq > refused.seq);
  return { text: noted ? null : refused.text, holder: refused.holder };
}

function Entry({
  entry,
  view,
  topics,
  block,
  busy,
  refusal,
  onDraw,
  path,
}: {
  entry: TranscriptEntry;
  view: DraftView;
  topics: ReadonlyMap<string, TopicOption>;
  block: ReturnType<typeof drawBlock>;
  busy: boolean;
  refusal: { text: string | null; holder: string | null } | null;
  onDraw: () => void;
  path: string;
}) {
  if (entry.role === "person") return <UserMessage>{entry.text}</UserMessage>;
  if (entry.role === "studio") {
    // The runner speaking: a centred line, not a bubble and not a third voice.
    return (
      <p className="mx-auto max-w-[56ch] whitespace-pre-wrap text-center text-[13px] leading-5 text-text3">
        <span className="sr-only">Studio: </span>
        {entry.text}
      </p>
    );
  }
  const reply = splitReply(entry.text);
  const status = entry.brief === undefined ? null : cardStatus(view, entry.seq);
  return (
    <TutorMessage label="Planner">
      {reply.prose !== "" && <NoteProse source={reply.prose} idPrefix={`p${entry.seq}-`} />}
      {entry.interrupted === true && <p className="mt-2 text-[13px] text-text3">The reply was cut off.</p>}
      {entry.brief !== undefined && status !== null && (
        <div className="mt-3">
          <ConfirmCard
            brief={entry.brief}
            pendingTopic={entry.pendingTopic ?? (status === "live" ? view.pendingTopic : null)}
            status={status}
            topics={topics}
            block={block}
            busy={busy}
            refusal={refusal}
            onDraw={onDraw}
            jobHref={view.jobId === null ? null : panelHref(path, { job: view.jobId })}
            holderHref={(holder) => panelHref(path, { job: holder })}
          />
        </div>
      )}
    </TutorMessage>
  );
}

/** A reply being written: "The planner is thinking" until the first words arrive. */
function Streaming({ text }: { text: string | null }) {
  const reply = text === null ? null : splitReply(text, true);
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
      {reply.prose !== "" && <NoteProse source={reply.prose} idPrefix="streaming-" />}
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
  formHref,
  onStartOver,
  cutOffShown,
}: {
  problem: ThreadProblem;
  /** The cut-off reply already says so under its text: E2 is then only Try again. */
  cutOffShown: boolean;
  onRetry: (() => void) | null;
  onAskAgain: (() => void) | null;
  formHref: string;
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
            <Button size="sm" variant="secondary" href={formHref}>
              Fill the brief myself
            </Button>
            <Button size="sm" variant="ghost" onClick={onStartOver}>
              Start over
            </Button>
          </>
        )}
      </div>
    </div>
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
