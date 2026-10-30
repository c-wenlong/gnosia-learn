"use client";

import { NoteProse } from "@/components/NoteProse";
import { ConfirmCard, type SaveOutcome } from "@/components/studio/ConfirmCard";
import { ConfirmCardVideo } from "@/components/studio/ConfirmCardVideo";
import { ConsentCard } from "@/components/studio/draft/ConsentCard";
import { cardKey, costNote } from "@/components/studio/draft/thread";
import type { CardRefusals } from "@/components/studio/draft/use-draft-verbs";
import { MadeCard } from "@/components/studio/MadeCard";
import { Arrive } from "@/components/studio/motion-parts";
import { Sentence } from "@/components/studio/Sentence";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import { TypingDots } from "@/components/ui/TypingDots";
import type { TopicOption } from "@/data/topics";
import type { MadeItem } from "@/lib/conversation-made";
import { switchedTool } from "@/lib/studio-brief-video";
import {
  entryBriefs,
  entryValue,
  kindCardStatus,
  kindPendingTopic,
  kindUnavailable,
  pressUnderWay,
  suggestionCost,
  type KindCardStatus,
  type LiveCard,
  type makeBoth,
} from "@/lib/studio-cards";
import { jobPatch, refusalNoted, splitReply, STILL_ANSWERING, type DrawBlock } from "@/lib/studio-chat";
import {
  isDraftKind,
  type DraftKind,
  type DraftView,
  type TagKind,
  type TranscriptBrief,
  type TranscriptEntry,
} from "@/lib/studio-drafts";
import { type VideoAvailability } from "@/lib/studio-health";
import { isTerminal, type Brief, type Job } from "@/lib/studio-jobs";
import { panelHref } from "@/lib/studio-url";

/** What every entry in the thread reads: the record and the card state around it. */
export interface EntryThread {
  view: DraftView;
  topics: readonly TopicOption[];
  jobs: readonly Job[];
  /** The live cards, at most one per kind (D60). */
  cards: readonly LiveCard[];
  /** Whether Make both is shown anywhere in the thread. */
  makeBothLive: boolean;
  pressing: ReadonlyMap<DraftKind, string | null>;
  refused: CardRefusals;
  entries: readonly TranscriptEntry[];
  /** A person turn is in flight: sent, or being answered. */
  answering: boolean;
  bothError: string | null;
  waiting: readonly { kind: DraftKind; requestSeq: number }[];
  path: string;
  /** Health's video doctor: whether Video can be made, its tools (D73) and narration speed. */
  video: VideoAvailability | null;
}

/** What an entry's cards can do, each a verb of the panel's. */
export interface EntryActions {
  save: (brief: Brief | TranscriptBrief["brief"], base: number, kind: DraftKind) => Promise<SaveOutcome>;
  use: (kind: DraftKind, base: number) => Promise<string | null>;
  editingChange: (editing: boolean) => void;
  press: (card: LiveCard) => void;
  pressBoth: () => void;
  /** Allow once or Always allow on a paid kind's consent card (D106). */
  allow: (kind: TagKind, always: boolean) => Promise<boolean>;
  /** Deny an offered kind on a reply: the runner keeps the refusal (D109). */
  decline: (replySeq: number, kind: TagKind) => Promise<boolean>;
}

/** The newest reply's offer, on that reply only: kinds, pitch, declines (D106). */
export type EntrySuggestion = { seq: number; kinds: TagKind[]; pitch: string | null; declined: TagKind[] };

/**
 * One turn of the thread: the person's sentence, the planner's reply with
 * its cards and offer, or the runner's own centred line.
 */
export function Entry({
  entry,
  both,
  suggestion,
  thread,
  on,
}: {
  entry: TranscriptEntry;
  /** Make both, on the entry it sits under. */
  both: ReturnType<typeof makeBoth>;
  suggestion: EntrySuggestion | null;
  thread: EntryThread;
  on: EntryActions;
}) {
  const { view, topics, jobs, cards, makeBothLive, pressing, refused, entries, answering, bothError, waiting, path, video } = thread;
  if (entry.role === "person") {
    const tagged = waiting.filter((item) => item.requestSeq === entry.seq).map((item) => item.kind);
    return (
      <UserMessage>
        <Sentence value={entryValue(entry)} waiting={tagged} />
      </UserMessage>
    );
  }

  const briefs = entryBriefs(entry);
  // Whether at most one card is live, so Cmd+Enter presses it.
  const singleCard = cards.length <= 1;
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
          onDraw={() => live !== null && on.press(live)}
          onSave={(brief) => on.save(brief, entry.seq, "diagram")}
          onEditingChange={on.editingChange}
          editBlock={editBlock}
          jobHref={jobHref}
          jobRunning={running}
          holderHref={holderHref}
          sourceChanged={view.sourceChanged === true}
          holdReason={holdReason}
          onUse={() => on.use("diagram", entry.seq)}
          paired={paired}
          keyShortcut={singleCard}
          costNote={costNote(view.estimates, "diagram")}
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
          onPress={() => live !== null && on.press(live)}
          onUse={() => on.use("video", entry.seq)}
          onPutBack={async () => {
            const outcome = await on.save(item.brief, entry.seq, "video");
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
          tools={video?.tools ?? []}
          charsPerSecond={video?.charsPerSecond}
          costNote={costNote(view.estimates, "video")}
          onSwitchTool={async (tool) => {
            const outcome = await on.save(switchedTool(item.brief, tool), entry.seq, "video");
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
            onPress={on.pressBoth}
          />
        )}
        {retrying.map((kind) => (
          <p key={kind} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-[14px] text-text3" role="status">
            Checking the {kind} brief
            <TypingDots />
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
      {suggestion !== null && suggestion.kinds.length > 0 && (
        <div className="mt-3 flex flex-col gap-2" aria-label="Suggested">
          {suggestion.kinds.map((kind) => (
            <ConsentCard
              key={kind}
              kind={kind}
              pitch={suggestion.pitch}
              declined={suggestion.declined.includes(kind)}
              cost={suggestionCost(kind, isDraftKind(kind) ? view.estimates?.[kind] : undefined)}
              unavailable={kindUnavailable(kind, view, video)}
              onAllow={(always) => on.allow(kind, always)}
              onDecline={() => on.decline(entry.seq, kind)}
            />
          ))}
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
 * A card for something the conversation made. One the panel opened with
 * stands still; one that lands while it is open rises in, as a new turn does.
 */
export function MadeArrival({ item, seen, path }: { item: MadeItem; seen: ReadonlySet<string> | null; path: string }) {
  return (
    <Arrive animate={seen !== null && !seen.has(item.id)} className="px-1.5">
      <MadeCard item={item} path={path} />
    </Arrive>
  );
}
