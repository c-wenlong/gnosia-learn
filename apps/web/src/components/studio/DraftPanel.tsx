"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { DraftJobView } from "@/components/studio/draft/DraftJobView";
import { DraftStatus } from "@/components/studio/draft/DraftStatus";
import { Entry, MadeArrival, type EntryActions, type EntryThread } from "@/components/studio/draft/Entry";
import { Failure, Problem, Streaming } from "@/components/studio/draft/ThreadFoot";
import { problemKindOf, topSeq, type Value } from "@/components/studio/draft/thread";
import { useDraftRecord } from "@/components/studio/draft/use-draft-record";
import { useDraftVerbs } from "@/components/studio/draft/use-draft-verbs";
import { useFocusWhenReady } from "@/components/studio/draft/use-focus-when-ready";
import { useOpener } from "@/components/studio/draft/use-opener";
import { useOptimisticPick } from "@/components/studio/draft/use-optimistic-pick";
import { useStudioHealth } from "@/components/studio/draft/use-studio-health";
import { HarnessPicker } from "@/components/studio/HarnessPicker";
import { JobCost } from "@/components/studio/JobCost";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { MadeList, useConversationMade } from "@/components/studio/MadeCard";
import { ENTER, FADE_IN } from "@/components/studio/motion";
import { Arrive } from "@/components/studio/motion-parts";
import { PANE_GUTTER, usePaneLayout } from "@/components/studio/pane-context";
import { PinnedConcept, PinnedDiagram, PinnedVideo } from "@/components/studio/PinnedDiagram";
import { Sentence } from "@/components/studio/Sentence";
import { DialogHeader } from "@/components/studio/StudioDialog";
import { MentionComposer } from "@/components/studio/StudioComposer";
import { useStartDraft } from "@/components/studio/useStartDraft";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/classes";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { Glyph } from "@/components/ui/Glyph";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import type { MentionComposerHandle } from "@/components/ui/MentionComposer";
import { EMPTY_MENTION_VALUE, isEmptyValue } from "@/lib/mentions";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import { TextLink } from "@/components/ui/TextLink";
import { useFollowFoot } from "@/components/ui/use-follow-foot";
import type { TopicOption } from "@/data/topics";
import { conversationTitle } from "@/lib/conversation-title";
import { placeMade } from "@/lib/conversation-made";
import { harnessModelOptions } from "@/lib/studio-agent-settings";
import {
  askAgainValue,
  CHANGE_OPENING_TURN,
  conceptOpeningTurn,
  KIND_NAME,
  lastPersonValue,
  liveCards,
  makeBoth,
  MENTION_HINT,
  MENTION_OPENING_TURN,
  mentionOptions,
  modEnterPlan,
  suggestionsFor,
  topicSuggestionValue,
  valueSendBlock,
  waitingKinds,
  waitingLine,
} from "@/lib/studio-cards";
import {
  composerState,
  costLabel,
  EDITING_BRIEF,
  isEmptyConversation,
  threadProblem,
  turnIndicator,
  visibleEntries,
  type CapStatus,
  type Suggestion,
} from "@/lib/studio-chat";
import { setDraftHarness, setDraftModel } from "@/lib/studio-drafts";
import { type VideoAvailability } from "@/lib/studio-health";
import {
  arrivingPurpose,
  arrivingSource,
  EXTEND_OPENING_TURN,
  MAKE_VIDEO_OPENING_TURN,
  makeVideoTitle,
} from "@/lib/studio-extend";
import type { HarnessValue } from "@/lib/studio-harness";
import { titleOf } from "@/lib/studio-url";

/**
 * The conversation, in the studio's panel (docs/STUDIO-CHAT-FIRST.md, "UI",
 * and docs/STUDIO-MENTIONS.md for tags and cards per kind).
 *
 * Two bodies under one header, and the URL says which: the chat
 * (`?draft=`), and the job a press started with a bar back to the chat
 * (`?draft=&job=`, `DraftJobView`). One component holds both so the
 * conversation's state and its event stream live through the trip to the job
 * and back.
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
 * This file is the composition. The record and its stream are
 * `draft/use-draft-record.ts`, health and the cap `draft/use-studio-health.ts`,
 * the verbs `draft/use-draft-verbs.ts`, and the thread's pieces sit beside
 * them. Every call goes through `studio-drafts.ts`; every judgement about what
 * to show is in `studio-chat.ts` and `studio-cards.ts`.
 */
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
  const { jobs, refresh: refreshJobs } = useStudioJobs();
  const { view, status, ready, downReason, stream, pending, setPending, baseline, load } = useDraftRecord(draftId, refreshJobs);
  const { cap, video, diagramAgent, agentMenu, capRefused } = useStudioHealth({
    cap: initialCap,
    video: initialVideo,
    diagramAgent: initialDiagram,
    byok: view?.harness === "byok",
  });
  const [value, setValue] = useState<Value>(EMPTY_MENTION_VALUE);
  const [announce, setAnnounce] = useState("");
  /** A card is being edited: its press and Send wait. */
  const [editing, setEditing] = useState(false);
  const composer = useRef<MentionComposerHandle | null>(null);
  const thread = useRef<HTMLDivElement | null>(null);
  const { start: startDraft, busy: starting, error: startError } = useStartDraft(path);
  const { inline } = usePaneLayout();
  // Full screen, the thread and the composer keep to a column in the middle.
  const gutter = inline ? PANE_GUTTER : "px-5";

  const arriving = arrivingSource(draftId);
  // Opened by Make a video of this in this tab (D86): the header and the
  // opening turn speak of the video, not of extending the diagram.
  const forVideo = arrivingPurpose(draftId) === "video";

  /* ---------------------------------------------------------------- */
  /* Focus and scroll                                                  */
  /* ---------------------------------------------------------------- */

  const mode: "chat" | "job" = jobId !== null ? "job" : "chat";
  const focusComposerSoon = useFocusWhenReady(composer, ready && mode === "chat");

  const entries = useMemo(() => (view === null ? [] : visibleEntries(view.transcript)), [view]);
  // What the conversation made, from the catalog (D89): read on opening and
  // whenever the thread or a job's state moves, since the runner writes the
  // asset just before the studio line saying it landed.
  const madeVersion =
    view === null
      ? ""
      : `${topSeq(view.transcript)}|${view.state}|${Object.values(view.slots ?? {})
          .map((slot) => `${slot?.jobId ?? ""}:${slot?.jobState ?? ""}`)
          .join(",")}`;
  const { made, seen: madeSeen } = useConversationMade(draftId, madeVersion);
  const placed = useMemo(() => placeMade(entries, made), [entries, made]);
  const cards = useMemo(
    () => (view === null ? [] : liveCards(view, jobs, cap, video, diagramAgent)),
    [view, jobs, cap, video, diagramAgent],
  );
  const both = useMemo(() => (editing ? null : makeBoth(cards)), [cards, editing]);
  const verbs = useDraftVerbs({
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
  });
  const { send, press, sendError } = verbs;
  // What sits at the thread's foot besides the entries: the reply being
  // written, and a problem or refusal in its place when a turn fails
  // without adding an entry.
  const foot = view === null ? null : `${view.inFlight}|${threadProblem(view)?.case ?? ""}|${sendError !== null}`;
  // The thread scrolls, never the page. Something new in it (a message, a
  // reply, a banner) glides into view; a new thread box (opening, back from a
  // job) jumps straight to its foot (`useFollowFoot`).
  const threadChange = useMemo(() => [entries.length, pending, mode, foot, made.length], [entries.length, pending, mode, foot, made.length]);
  useFollowFoot(thread, threadChange, { glide: true });
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
  /* The model pick (D90) and the harness pick (the pane picker's)     */
  /* ---------------------------------------------------------------- */

  const model = useOptimisticPick<string>(view?.model ?? "default", async (next) => {
    const result = await setDraftModel(draftId, next === "default" ? null : next);
    return result.ok ? null : `The model could not be set: ${result.refusal.error}`;
  });
  // Same optimistic shape as the model pick: the chip shows it at once, the
  // record's own `harness` clears the stand-in, and a refusal is said under
  // the composer. A harness moves only before the first turn, so the common
  // refusal is `harness-locked`.
  const harness = useOptimisticPick<HarnessValue>(view?.harness ?? "claude", async (next) => {
    const result = await setDraftHarness(draftId, next);
    return result.ok ? null : `The harness could not be set: ${result.refusal.error}`;
  });

  useOpener({ draftId, ready, view, send, setValue, focusSoon: focusComposerSoon });

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (status !== "ready" || view === null) {
    const arrivingTitle = arriving === null ? null : (titleOf(titles, arriving) ?? arriving);
    return (
      <DraftStatus
        status={status}
        arriving={arriving === null || arrivingTitle === null ? null : { name: arriving, title: arrivingTitle }}
        forVideo={forVideo}
        onNewConversation={() => void startDraft()}
        starting={starting}
        startError={startError}
        downReason={downReason}
        onRetry={() => void load()}
      />
    );
  }

  const diagramSource = view.sourceKind === undefined || view.sourceKind === "diagram";
  const sourceTitle =
    view.source === null ? null : ((diagramSource ? titleOf(titles, view.source) : titleOf(videoTitles, view.source)) ?? view.source);
  const newestTitle = cards.at(-1)?.brief.title ?? null;
  // The owner's name, the planner's title or the concept, as every other page
  // calls the conversation (`conversationTitle`); the first message is the
  // thread's own first line, so the header does not repeat it.
  const title =
    conversationTitle({ name: view.name, title: view.title ?? newestTitle, concept: view.concept })?.text ??
    (sourceTitle === null
      ? "New conversation"
      : diagramSource
        ? forVideo
          ? makeVideoTitle(sourceTitle)
          : `Extending ${sourceTitle}`
        : `Changing ${sourceTitle}`);

  if (mode === "job" && jobId !== null) {
    return (
      <DraftJobView
        jobId={jobId}
        jobs={jobs}
        path={path}
        title={title}
        inline={inline}
        onNewConversation={() => void startDraft()}
        starting={starting}
        startError={startError}
      />
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
  const entryThread: EntryThread = {
    view,
    topics,
    jobs,
    cards,
    makeBothLive: both !== null,
    pressing: verbs.pressing,
    refused: verbs.refused,
    entries,
    answering: busy,
    bothError: verbs.bothError,
    waiting,
    path,
    video,
  };
  const entryActions: EntryActions = {
    save: verbs.saveEdit,
    use: verbs.takeOffHold,
    editingChange: setEditing,
    press: (card) => void press(card),
    pressBoth: () => void verbs.pressBoth(),
    allow: verbs.allowOffer,
    decline: verbs.declineOffer,
  };

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
    if (plan.action === "send") {
      // The composer's own Send rules hold from anywhere in the panel: words
      // are not sent while Send is held (a brief card being edited, a turn in
      // flight, the turn cap) or the words themselves are refused (S1-15).
      if (composing.sendDisabled || valueBlock !== null) return;
      void send(value);
    }
    else if (plan.action === "press") void press(plan.card);
    else if (plan.action === "announce") {
      // Focus stays where it is: a paid button with focus is one stray Space
      // from a job. Said again even when the words have not changed.
      setAnnounce("");
      const text = plan.text;
      requestAnimationFrame(() => setAnnounce(text));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The composer handles its own and marks the event, so nothing is pressed twice.
    if (event.defaultPrevented || event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    if (cards.length === 0) return;
    event.preventDefault();
    modEnter(event.target);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <DialogHeader
        title={title}
        meta={costLabel(view.costUsd, view.costSource) === null ? undefined : <JobCost usd={view.costUsd} source={view.costSource} subject="conversation" />}
        // The harness picker bound to this conversation: its own `harness`,
        // and picks written through `PUT .../harness` (`harness.pick`).
        leading={<HarnessPicker value={harness.shown} onPick={(next) => void harness.pick(next)} />}
      />

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

        {entries.flatMap((entry) => [
          // A person's turn does not animate: it replaces the bubble that
          // already rose in at Send (below), in the same place.
          <Arrive key={entry.seq} animate={baseline !== null && entry.seq > baseline && entry.role !== "person"}>
            <Entry
              entry={entry}
              both={both !== null && both.seq === entry.seq ? both : null}
              suggestion={suggested !== null && suggested.seq === entry.seq ? suggested : null}
              thread={entryThread}
              on={entryActions}
            />
          </Arrive>,
          // Where the job's story ended: what it made, as a card (D89).
          ...(placed.after.get(entry.seq) ?? []).map((item) => (
            <MadeArrival key={`made:${item.id}`} item={item} seen={madeSeen} path={path} />
          )),
        ])}

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
              onStartOver={() => verbs.setConfirmStartOver(true)}
              cutOffShown={entries.at(-1)?.interrupted === true}
            />
          </Arrive>
        )}

        {sendError !== null && (
          <Callout
            role="alert"
            className={ENTER}
            actions={
              verbs.trustRetry !== null ? (
                <Button size="sm" variant="secondary" onClick={() => void verbs.retryTrust()}>
                  Save always-allow
                </Button>
              ) : undefined
            }
          >
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

        {placed.tail.map((item) => (
          <MadeArrival key={`made:${item.id}`} item={item} seen={madeSeen} path={path} />
        ))}
        <MadeList made={made} />
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
                <TextLink onClick={() => void verbs.stopWaitingFor(item.kind)}>Stop waiting</TextLink>
              </p>
            ))}
            {verbs.waitError !== null && (
              <p role="alert" className="text-[12px] text-danger">
                {verbs.waitError}
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
          {/* The conversation's model (D90), as tiers (D92): each harness's
              own Lite/Default/Max rather than a model list. On BYOK the tiers
              name the active provider's configured models (D94); one left
              unconfigured shows greyed out and cannot be picked. */}
          <FilterMenu
            label="Model"
            bare
            options={harnessModelOptions(harness.shown, model.shown, agentMenu.resolved, agentMenu.byokTiers)}
            value={model.shown}
            defaultValue="default"
            busy={model.busy}
            onChange={(next) => void model.pick(next)}
          />
          {/* The kinds always allowed here (D108): each a chip whose press
              takes the trust back, so the next offer asks again. */}
          {(view.trust ?? []).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => void verbs.revokeTrust(kind)}
              title={`The planner may start ${KIND_NAME[kind].toLowerCase()} makes here without asking — press to ask again`}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[12px] text-text3 transition-colors hover:text-text"
            >
              <Glyph name={kind} size={13} />
              {KIND_NAME[kind]} allowed
              <span aria-hidden>×</span>
            </button>
          ))}
          {/* The question and the press swap in place, each fading in. The
              problem card's Start over opens the question too. */}
          {(verbs.confirmStartOver || view.transcript.length > 0) && (
            <InlineConfirm
              size="text"
              label="Start over"
              question="Close this conversation for good?"
              confirmLabel="Start over"
              onConfirm={() => void verbs.startOver()}
              open={verbs.confirmStartOver}
              onOpenChange={verbs.setConfirmStartOver}
            />
          )}
          {downReason !== null && <span className="text-danger">The runner stopped answering: {downReason}</span>}
          <Failure
            text={
              model.error ?? harness.error ?? verbs.startOverError ?? (startError === null ? null : `A new conversation could not start: ${startError}`)
            }
            className="basis-full"
          />
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>
    </div>
  );
}
