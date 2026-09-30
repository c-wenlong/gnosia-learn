import type { MentionOption, MentionValue } from "@/components/ui/mention-text";
import { inlinePieces, isBareTag, isEmptyValue, prependValue, validMentions, valueOf } from "@/components/ui/mention-text";
import type { Brief, Job } from "@/lib/studio-jobs";
import { isActive, isTerminal } from "@/lib/studio-jobs";
import { isVideoBrief, type VideoBrief } from "@/lib/studio-brief-video";
import {
  capSentence,
  cardStatus,
  drawLabel,
  STILL_ANSWERING,
  targetSlug,
  visibleEntries,
  type CapStatus,
  type CardStatus,
  type DrawBlock,
  type ThreadProblem,
} from "@/lib/studio-chat";
import { replacesJob } from "@/lib/studio-drafts";
import type {
  DraftKind,
  DraftMention,
  DraftSlot,
  DraftView,
  PendingTopic,
  TranscriptBrief,
  TranscriptEntry,
  VideoAvailability,
} from "@/lib/studio-drafts";

/**
 * The conversation's cards once a draft can hold a brief of each kind
 * (docs/STUDIO-MENTIONS.md, "Several live briefs", D55 to D62).
 *
 * Pure, like `studio-chat.ts`, which keeps the rules that do not care about
 * kinds. A card's identity is its reply and its kind, never the reply alone:
 * two briefs in one reply share a transcript `seq`, so everything here is
 * keyed by `(seq, kind)`.
 *
 * Every function reads a runner from before STUDIO-MENTIONS.md too: a draft
 * with no `slots` is one diagram slot, judged by `studio-chat.ts`'s own
 * `cardStatus`, so the web PR can land before or after the runner's.
 */

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

export const KIND_NAME: Record<DraftKind, string> = { diagram: "Diagram", video: "Video" };

/** The opening line of an empty conversation (STUDIO-MENTIONS.md, phase 2b). */
export const MENTION_OPENING_TURN = "Ask me about an idea, or type @ to make a diagram or a video of it.";
/** A conversation opened with Change on a video tile (`sourceKind: "video"`): the planner has its brief. */
export const CHANGE_OPENING_TURN = "I've read this video's brief. Tell me what it should change, or ask me what's in it first.";

/**
 * A landed video's poster, from the library's asset route: the picture a
 * Change conversation pins, as Extend pins a diagram's SVG.
 */
export function videoPosterHref(slug: string): string {
  return `/api/assets/${encodeURIComponent(`video:${slug}`)}/poster`;
}
export const MENTION_PLACEHOLDER = "Ask about an idea, or type @ to make something";
/** The menu's foot line: the one thing a person cannot see from the entries. */
export const MENTION_HINT = "Tag one or both";
/** T15: a bare tag in an empty conversation gives the planner nothing to go on. */
export const SAY_WHAT = "Say what it should show";
export const TWO_READY = "Two briefs are ready. Press Make both, or the card you want.";

/** The @ menu's entries (STUDIO-MENTIONS.md, "What is in it"). */
const ENTRIES: Record<DraftKind, MentionOption<DraftKind>> = {
  diagram: {
    id: "diagram",
    name: "Diagram",
    description: "Shapes and arrows that show how it fits together",
    icon: "diagram",
    aliases: ["draw", "drawing"],
  },
  video: {
    id: "video",
    name: "Video",
    description: "A narrated animation, one to ten minutes",
    icon: "video",
    aliases: ["animation", "explainer"],
  },
};

/** The kinds a draft's planner prompt carries: absent means a draft from before, diagrams only (T4). */
export function plannerKindsOf(view: Pick<DraftView, "plannerKinds">): DraftKind[] {
  return view.plannerKinds !== undefined && view.plannerKinds.length > 0 ? view.plannerKinds : ["diagram"];
}

/**
 * Why a kind cannot be tagged right now, or null. The menu keeps the entry
 * and shows this in place of its description, and a suggestion button of the
 * kind is disabled with the same words (T4, T5, T25).
 */
export function kindUnavailable(
  kind: DraftKind,
  view: Pick<DraftView, "plannerKinds">,
  video: VideoAvailability | null,
): string | null {
  if (!plannerKindsOf(view).includes(kind)) {
    return kind === "video" ? "Start a new conversation to make a video" : "Start a new conversation to make a diagram";
  }
  if (kind === "video" && video !== null && !video.ok) {
    return video.reason === null ? "Videos are not available on this machine" : `Videos are unavailable: ${video.reason}`;
  }
  return null;
}

/** The menu's two entries, each with its reason when it cannot be used. */
export function mentionOptions(view: Pick<DraftView, "plannerKinds">, video: VideoAvailability | null): MentionOption<DraftKind>[] {
  return (["diagram", "video"] as const).map((kind) => ({ ...ENTRIES[kind], disabledReason: kindUnavailable(kind, view, video) }));
}

/* -------------------------------------------------------------------------- */
/* The briefs a transcript entry carries                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every brief an entry carries, one per kind: `briefs` when the runner sends
 * it, else the single `brief` a runner from before STUDIO-MENTIONS.md sends,
 * which is a diagram (D61: a block with no kind is a diagram).
 */
export function entryBriefs(entry: Pick<TranscriptEntry, "brief" | "briefs">): TranscriptBrief[] {
  if (Array.isArray(entry.briefs) && entry.briefs.length > 0) {
    const seen = new Set<DraftKind>();
    // One per kind, the last of each (D61's "last block wins", per kind). A
    // video brief too malformed to draw a card from is left out rather than
    // taking the panel down with it.
    return [...entry.briefs].reverse().filter((item) => {
      if (item.kind === "video" && !isVideoBrief(item.brief)) return false;
      if (seen.has(item.kind)) return false;
      seen.add(item.kind);
      return true;
    }).reverse();
  }
  return entry.brief === undefined ? [] : [{ kind: "diagram", brief: entry.brief, requestSeq: null }];
}

/** The seq of the newest visible entry carrying a brief of `kind`, or null. */
export function newestBriefSeq(transcript: readonly TranscriptEntry[], kind: DraftKind): number | null {
  let latest: number | null = null;
  for (const entry of visibleEntries(transcript)) {
    if (entryBriefs(entry).some((item) => item.kind === kind) && (latest === null || entry.seq > latest)) latest = entry.seq;
  }
  return latest;
}

function slotOf(view: Pick<DraftView, "slots">, kind: DraftKind): DraftSlot | null {
  return view.slots?.[kind] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Where a card stands                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `studio-chat.ts`'s five, plus `onHold`: the planner read an untagged
 * message as contradicting this brief (a `hold` block), so its press and Make
 * both wait for Use this brief, an edit, or a newer brief (D60).
 */
export type KindCardStatus = CardStatus | "onHold";

type ViewForCards = Pick<DraftView, "state" | "transcript" | "slots">;

/**
 * Where the card for `(seq, kind)` stands.
 *
 * Only the newest brief of its kind can be anything but `stale`: a newer
 * brief greys only the older card of its own kind. For the newest, the
 * kind's slot decides: on hold, in force (`live`), out of force (`held`,
 * which a save puts back), or the brief a job was made from (`drawn`).
 *
 * C14 is lifted, so a newer brief can land while this kind's job from an
 * older one still runs. The slot then names that job, and the card is `live`
 * (its press disabled by `kindBusy`) when its brief is newer than the job,
 * `drawn` when the job was made from it.
 */
export function kindCardStatus(
  view: ViewForCards,
  seq: number,
  kind: DraftKind,
  jobs: readonly Pick<Job, "jobId" | "requested">[] = [],
): KindCardStatus {
  if (view.slots === undefined) {
    // A runner from before STUDIO-MENTIONS.md: one kind, one card in force.
    return kind === "diagram" ? cardStatus(view, seq) : "stale";
  }
  if (seq !== newestBriefSeq(view.transcript, kind)) return "stale";
  if (view.state === "abandoned") return "closed";
  const slot = slotOf(view, kind);
  if (slot === null) return "closed";
  if (slot.held !== null && slot.held !== undefined) return "onHold";
  // The runner's own word, when it sends one (#207): in force and pressable,
  // or a brief this kind's job was made from.
  if (slot.live === true) return "live";
  if (slot.live === false && (slot.state === "drawing" || slot.state === "done")) return "drawn";
  if (slot.state === "briefed") return "live";
  if (slot.state === "open") return "held";
  // drawing or done: was the job made from this brief, or from an older one?
  const job = slot.jobId === null ? undefined : jobs.find((entry) => entry.jobId === slot.jobId);
  const briefAt = slot.briefAt ? Date.parse(slot.briefAt) : Number.NaN;
  const jobAt = job === undefined ? Number.NaN : Date.parse(job.requested);
  if (Number.isFinite(briefAt) && Number.isFinite(jobAt) && briefAt > jobAt) return "live";
  return "drawn";
}

/** Whether a card in this state may be edited or put back in force. */
export function kindCardEditable(status: KindCardStatus): boolean {
  return status === "live" || status === "held";
}

/**
 * The topic a card shows as "New topic": the slot's own pending topic for the
 * card in force (the runner clears it once the topic exists, T11), the
 * reply's for an older card.
 */
export function kindPendingTopic(
  status: KindCardStatus,
  kind: DraftKind,
  entry: Pick<TranscriptEntry, "pendingTopic"> & Partial<Pick<TranscriptEntry, "brief" | "briefs">>,
  view: Pick<DraftView, "slots" | "pendingTopic">,
): PendingTopic | null {
  if (status === "live" || status === "held" || status === "onHold") {
    if (view.slots === undefined) return view.pendingTopic;
    return slotOf(view, kind)?.pendingTopic ?? null;
  }
  // An older card keeps what its own brief proposed (#207 puts it on the
  // brief), else what the reply proposed.
  const own = entryBriefs(entry as Pick<TranscriptEntry, "brief" | "briefs">).find((item) => item.kind === kind)?.pendingTopic;
  return own ?? entry.pendingTopic ?? null;
}

/** The tagged message the card answered, which pairs it for Make both. */
export function requestSeqOf(view: Pick<DraftView, "slots">, kind: DraftKind, item: Pick<TranscriptBrief, "requestSeq">, live: boolean): number | null {
  if (live) {
    const fromSlot = slotOf(view, kind)?.requestSeq;
    if (fromSlot !== undefined && fromSlot !== null) return fromSlot;
  }
  return item.requestSeq ?? null;
}

/* -------------------------------------------------------------------------- */
/* Whether a card can be pressed                                              */
/* -------------------------------------------------------------------------- */

/** A video job's target: `videos/<slug>.mp4`. A diagram's is `learn/assets/<slug>.tldr`. */
export function jobKind(job: Pick<Job, "target">): DraftKind {
  return /(^|\/)videos\/[^/]+\.mp4$/.test(job.target) || job.target.endsWith(".mp4") ? "video" : "diagram";
}

function videoSlug(target: string): string {
  return (target.split("/").at(-1) ?? target).replace(/\.mp4$/, "");
}

export const KIND_BUSY: Record<DraftKind, string> = {
  diagram: "The diagram is still being drawn",
  video: "The video is still being made",
};

/**
 * This draft's newest job of `kind`, when it has not reached a verdict: the
 * card's press is disabled until it does (D60, T8). A job in review counts,
 * since Accept or Discard is still to come.
 */
export function kindBusy(
  view: Pick<DraftView, "slots">,
  kind: DraftKind,
  jobs: readonly Job[],
): Pick<Job, "jobId" | "state"> | null {
  const slot = slotOf(view, kind);
  // The runner says which job holds the press (#207); the jobs list is the
  // fallback for a runner that does not, and the fresher of the two when a
  // job reached its verdict since the draft was read.
  if (slot?.busy !== undefined) {
    if (slot.busy === null) return null;
    const listed = jobs.find((entry) => entry.jobId === slot.busy!.jobId);
    if (listed !== undefined && isTerminal(listed.state)) return null;
    return { jobId: slot.busy.jobId, state: (listed?.state ?? slot.busy.state) as Job["state"] };
  }
  const jobId = slot?.jobId ?? null;
  if (jobId === null) return null;
  const job = jobs.find((entry) => entry.jobId === jobId);
  return job !== undefined && !isTerminal(job.state) ? job : null;
}

/**
 * Why the card for `kind` cannot be pressed right now, or null when it can.
 *
 * In the order a person would want to hear them: a reply still arriving, the
 * card on hold, this draft's own job of the kind still open, another job
 * holding the slug (of the same kind: a diagram and a video may share a slug,
 * T10), the video doctor failing, then the daily cap. The runner checks all
 * of it again on the press; this is the courtesy.
 */
export function kindDrawBlock(
  kind: DraftKind,
  brief: Pick<Brief | VideoBrief, "slug">,
  view: Pick<DraftView, "inFlight" | "slots">,
  jobs: readonly Job[],
  cap: CapStatus | null,
  video: VideoAvailability | null,
  diagram: VideoAvailability | null = null,
): DrawBlock | null {
  if (view.inFlight) return { reason: STILL_ANSWERING, holder: null };
  const held = slotOf(view, kind)?.held ?? null;
  if (held !== null) return { reason: `On hold: ${held.reason}`, holder: null };
  // A video in review that this press replaces (D52) does not hold the press
  // back, and does not count as another job holding the slug.
  const replaced = replacesJob(view, kind);
  const busy = kindBusy(view, kind, jobs);
  if (busy !== null && busy.jobId !== replaced) return { reason: `${KIND_BUSY[kind]}.`, holder: busy.jobId };
  const holder = jobs.find((job) => {
    if (!isActive(job.state) || jobKind(job) !== kind || job.jobId === replaced) return false;
    return (kind === "video" ? videoSlug(job.target) : targetSlug(job.target)) === brief.slug;
  });
  if (holder !== undefined) {
    const name = holder.title ?? holder.jobId.slice(0, 8);
    const state = holder.state === "awaiting_review" ? "waiting for review" : holder.state;
    return { reason: `“${name}” already holds ${brief.slug} (${state}). Accept or discard it first.`, holder: holder.jobId };
  }
  if (kind === "diagram" && diagram !== null && !diagram.ok) {
    return { reason: diagram.reason === null ? "Diagrams cannot be drawn on this machine right now." : sentenceOf(diagram.reason), holder: null };
  }
  if (kind === "video" && video !== null && !video.ok) {
    return { reason: video.reason === null ? "Videos are not available on this machine." : `Videos are unavailable: ${video.reason}`, holder: null };
  }
  if (cap !== null && cap.exceeded) return { reason: capSentence(cap), holder: null };
  return null;
}

/**
 * The press's words: Draw or Make video, with the topic's creation when one
 * is proposed, and "Replace and make video" when the press discards this
 * draft's video in review and queues the new one in its place (D52).
 */
export function pressLabel(kind: DraftKind, pending: PendingTopic | null | undefined, replacing = false): string {
  if (kind === "diagram") return drawLabel(pending);
  if (replacing) return pending ? "Create topic, replace and make video" : "Replace and make video";
  return pending ? "Create topic and make video" : "Make video";
}

/** The job a kind's card last started, as the draft's record has it. */
export function slotJobId(view: Pick<DraftView, "slots" | "jobId">, kind: DraftKind): string | null {
  if (view.slots === undefined) return kind === "diagram" ? view.jobId : null;
  return slotOf(view, kind)?.jobId ?? null;
}

/**
 * Whether a card's press still reads as under way ("Queuing…"). From the
 * press until its answer, except once the draft's record already names a new
 * job for the kind: the runner records each job as it queues it and says so
 * on the draft's stream, and Make both answers only after both are queued
 * (seconds later, measured in phase 2). The card then says what the record
 * says, the job and its link, rather than "Queuing…" over a running job.
 *
 * `pressing` holds each pressed kind's job before the press.
 */
export function pressUnderWay(
  pressing: ReadonlyMap<DraftKind, string | null>,
  view: Pick<DraftView, "slots" | "jobId">,
  kind: DraftKind,
): boolean {
  if (!pressing.has(kind)) return false;
  return slotJobId(view, kind) === (pressing.get(kind) ?? null);
}

/** The press's words while it is under way. */
export function pressBusyLabel(kind: DraftKind, pending: PendingTopic | null | undefined): string {
  if (pending) return "Creating the topic…";
  return kind === "diagram" ? "Queuing…" : "Queuing the video…";
}

/** The pressed card's line while its job runs, and after. */
export function madeLine(kind: DraftKind, running: boolean): string {
  if (kind === "diagram") return running ? "Drawing" : "Drawn from this brief";
  return running ? "Making the video" : "Made from this brief";
}

/**
 * The idempotency key for one press of one card: the reply, the kind, and the
 * kind's job before it. A double press, or one repeated after a reload, is
 * the same key and gets the first press's job back; a press after that job
 * reached a verdict is a new key.
 */
export function kindDrawKey(draftId: string, seq: number, kind: DraftKind, previousJobId: string | null): string {
  return `draw:${draftId}:${seq}:${kind}:${previousJobId ?? "none"}`;
}

/* -------------------------------------------------------------------------- */
/* The live cards, and Make both                                              */
/* -------------------------------------------------------------------------- */

export interface LiveCard {
  seq: number;
  kind: DraftKind;
  /** The job in review this card's press replaces, or null (D52). */
  replaces: string | null;
  brief: Brief | VideoBrief;
  requestSeq: number | null;
  pendingTopic: PendingTopic | null;
  block: DrawBlock | null;
}

/** Every card in force (`live`), one per kind at most, with why each cannot be pressed. */
export function liveCards(
  view: DraftView,
  jobs: readonly Job[],
  cap: CapStatus | null,
  video: VideoAvailability | null,
  diagram: VideoAvailability | null = null,
): LiveCard[] {
  const out: LiveCard[] = [];
  for (const kind of ["diagram", "video"] as const) {
    const seq = newestBriefSeq(view.transcript, kind);
    if (seq === null) continue;
    const status = kindCardStatus(view, seq, kind, jobs);
    if (status !== "live") continue;
    const entry = view.transcript.find((candidate) => candidate.seq === seq);
    const item = entry === undefined ? undefined : entryBriefs(entry).find((candidate) => candidate.kind === kind);
    if (entry === undefined || item === undefined) continue;
    out.push({
      seq,
      kind,
      brief: item.brief,
      requestSeq: requestSeqOf(view, kind, item, true),
      replaces: replacesJob(view, kind),
      pendingTopic: kindPendingTopic(status, kind, entry, view),
      block: kindDrawBlock(kind, item.brief, view, jobs, cap, video, diagram),
    });
  }
  return out;
}

export interface MakeBoth {
  /** The card Make both sits under: the later of the pair, the one read last. */
  seq: number;
  kind: DraftKind;
  label: string;
  cards: [LiveCard, LiveCard];
}

/**
 * Make both, when it is shown: a live diagram card and a live video card that
 * answer one tagged message (the same `requestSeq`, whatever replies they
 * landed in, T31), neither disabled. Two cards from different requests are
 * pressed one at a time, as the owner asked (D60).
 */
export function makeBoth(cards: readonly LiveCard[]): MakeBoth | null {
  const diagram = cards.find((card) => card.kind === "diagram");
  const video = cards.find((card) => card.kind === "video");
  if (diagram === undefined || video === undefined) return null;
  if (diagram.requestSeq === null || diagram.requestSeq !== video.requestSeq) return null;
  if (diagram.block !== null || video.block !== null) return null;
  const later = video.seq >= diagram.seq ? video : diagram;
  const topic = diagram.pendingTopic !== null || video.pendingTopic !== null;
  return { seq: later.seq, kind: later.kind, label: topic ? "Create topic and make both" : "Make both", cards: [diagram, video] };
}

/**
 * Cmd or Ctrl+Enter from the composer (T9). Words in the field are sent.
 * From an empty field, exactly one live and enabled card is pressed. With
 * two, nothing is pressed and focus stays in the composer: the person hears
 * that two briefs are ready and presses the one they mean. Moving focus to a
 * paid button would let the next keystroke (a Space) press it.
 */
export function modEnterPlan(
  empty: boolean,
  cards: readonly LiveCard[],
): { action: "send" } | { action: "none" } | { action: "press"; card: LiveCard } | { action: "announce" } {
  if (!empty) return { action: "send" };
  const ready = cards.filter((card) => card.block === null);
  if (ready.length === 1 && cards.length === 1) return { action: "press", card: ready[0]! };
  if (cards.length >= 2) return { action: "announce" };
  return { action: "none" };
}

/* -------------------------------------------------------------------------- */
/* Waiting, holding, suggestions                                              */
/* -------------------------------------------------------------------------- */

/** The kinds still owed a brief by a tagged message, with that message's seq (D57). */
export function waitingKinds(view: Pick<DraftView, "slots">): { kind: DraftKind; requestSeq: number }[] {
  const out: { kind: DraftKind; requestSeq: number }[] = [];
  for (const kind of ["diagram", "video"] as const) {
    const waiting = slotOf(view, kind)?.waiting ?? null;
    if (waiting !== null && Number.isInteger(waiting.requestSeq)) out.push({ kind, requestSeq: waiting.requestSeq });
  }
  return out;
}

/** "Video brief still to come": the line above the composer while a kind waits. */
export function waitingLine(kind: DraftKind): string {
  return `${KIND_NAME[kind]} brief still to come`;
}

/**
 * The suggestion buttons (D58): the kinds the newest planner reply offers,
 * under that reply only, since an older offer may no longer fit. Nothing
 * while a turn is in flight: the reply it is writing is the newest.
 */
export function suggestionsFor(view: Pick<DraftView, "transcript" | "inFlight">): { seq: number; kinds: DraftKind[] } | null {
  if (view.inFlight) return null;
  const replies = visibleEntries(view.transcript).filter((entry) => entry.role === "planner");
  const newest = replies.at(-1);
  if (newest === undefined) return null;
  const last = visibleEntries(view.transcript).at(-1);
  // A person's message after it means the conversation has moved on.
  if (last !== undefined && last.role === "person") return null;
  const kinds = suggestKinds(newest.suggest);
  return kinds.length === 0 ? null : { seq: newest.seq, kinds };
}

/** A reply's `suggest`, read as a list of kinds whether it arrives as `["video"]` or `{ kinds: ["video"] }`. */
export function suggestKinds(raw: unknown): DraftKind[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "object" && raw !== null ? (raw as { kinds?: unknown }).kinds : null;
  if (!Array.isArray(list)) return [];
  const out: DraftKind[] = [];
  for (const kind of list) if ((kind === "diagram" || kind === "video") && !out.includes(kind)) out.push(kind);
  return out;
}

/** A suggestion button's accessible name. */
export function suggestionName(kind: DraftKind): string {
  return `Add a ${kind} tag to your message`;
}

/* -------------------------------------------------------------------------- */
/* The composer                                                               */
/* -------------------------------------------------------------------------- */

/** The same limit the runner takes, `STUDIO_TEXT_LIMIT`'s default. */
export const TEXT_LIMIT = 8_000;

/**
 * Why Send waits on the length of what is in the field, or null. Only Send:
 * the field stays editable, so the person can cut it back down.
 */
export function lengthSendBlock(value: MentionValue, limit: number): string | null {
  if (value.text.length <= limit) return null;
  return `${value.text.length.toLocaleString("en")} of ${limit.toLocaleString("en")} characters. Cut it down to send.`;
}

/**
 * Why Send waits for what is in the field, or null (T15): a bare tag in an
 * empty conversation gives the planner nothing to go on. After a turn, a bare
 * tag means "from what we discussed" and is sent (T16).
 */
export function valueSendBlock(value: MentionValue, emptyConversation: boolean): string | null {
  return emptyConversation && isBareTag(value) ? SAY_WHAT : null;
}

/**
 * E6's paid Ask again with the kind it failed on: the tag goes again, so the
 * kind waits anew (D57's fourth way a waiting kind clears). A problem with no
 * kind, from a runner before STUDIO-MENTIONS.md, is the old untagged text.
 */
export function askAgainValue(problem: Extract<ThreadProblem, { case: "E6" }>, kind: DraftKind | null): MentionValue<DraftKind> {
  const words = `The studio refused that brief: ${problem.text}. Please fix that and send the whole brief again.`;
  if (kind === null) return { text: words, mentions: [] };
  return valueOf<DraftKind>([{ type: "mention", kind }, { type: "text", text: ` ${words}` }]);
}

/** A topic suggestion under the opening turn: "A [Diagram] for X that shows ", never sent. */
export function topicSuggestionValue(label: string): MentionValue<DraftKind> {
  return valueOf<DraftKind>([
    { type: "text", text: "A " },
    { type: "mention", kind: "diagram" },
    { type: "text", text: ` for ${label} that shows ` },
  ]);
}

/** A person's entry as the value it was sent as: its text and the chips the runner recorded. */
export function entryValue(entry: Pick<TranscriptEntry, "text" | "mentions">): MentionValue<DraftKind> {
  return { text: entry.text, mentions: validMentions(entry.text, entry.mentions) };
}

/** The last thing the person said, chips included, for Try again (E1, E2). */
export function lastPersonValue(transcript: readonly TranscriptEntry[]): MentionValue<DraftKind> | null {
  const person = visibleEntries(transcript).filter((entry) => entry.role === "person").at(-1);
  return person === undefined ? null : entryValue(person);
}

/**
 * The composer after a refused turn (T17), `wordsBack`'s rule with chips: a
 * turn typed in the composer comes back, chips where they were, unless
 * something new was typed meanwhile; a turn that was never in the composer
 * (an opener) goes back in front of whatever it holds.
 */
export function valueBack(
  held: MentionValue<DraftKind>,
  body: MentionValue<DraftKind>,
  keptComposer: boolean,
): MentionValue<DraftKind> {
  if (isEmptyValue(held)) return body;
  return keptComposer ? prependValue(body, held) : held;
}

/**
 * An opener's words and chips as the composer's value: chips first, each
 * followed by a space (the video job view's Change hands its text over with
 * the Video chip, 2c), then the words with any chips typed into them where
 * they were typed (an Extend press's unsent text). A kind the words carry
 * already is not added ahead of them too: one chip per kind. Never sent; the
 * person sends it.
 */
export function openerValue(opener: {
  compose: string;
  composeMentions?: readonly DraftMention[];
  mentions?: readonly unknown[];
}): MentionValue<DraftKind> | null {
  const words = inlinePieces<DraftKind>({ text: opener.compose, mentions: [...(opener.composeMentions ?? [])] });
  const inWords = new Set(words.flatMap((piece) => (piece.type === "mention" ? [piece.kind] : [])));
  const kinds = [
    ...new Set((opener.mentions ?? []).filter((kind): kind is DraftKind => kind === "diagram" || kind === "video")),
  ].filter((kind) => !inWords.has(kind));
  if (opener.compose === "" && kinds.length === 0) return null;
  return valueOf<DraftKind>([
    ...kinds.flatMap((kind) => [{ type: "mention" as const, kind }, { type: "text" as const, text: " " }]),
    ...words,
  ]);
}

/**
 * The first turn an opener sends into an empty conversation, chips where
 * the person put them, or null when it sends none.
 */
export function openerSend(opener: { send: string | null; sendMentions?: readonly DraftMention[] }): MentionValue<DraftKind> | null {
  if (opener.send === null) return null;
  return { text: opener.send, mentions: validMentions(opener.send, [...(opener.sendMentions ?? [])]) };
}

/** A runner's sentence as the card shows it: a capital first, a full stop last. */
function sentenceOf(text: string): string {
  const trimmed = text.trim();
  const capital = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}
