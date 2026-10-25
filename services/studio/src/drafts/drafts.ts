import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DRAFT_TRANSITIONS,
  isAgentModel,
  LOCAL_LEARNER_ID,
  canTransition,
  type DraftErrorKind,
  type DraftState,
} from "@gnosia/schema/shared";

import { BriefError, loadVocabulary, SLUG_PATTERN, validateBrief, type ValidBrief, type Vocabulary } from "../diagram/brief";
import { byokEnv, loadByok, resolveByok } from "../agent/byok";
import { codexEnv, codexSignedIn, sealCodexHome } from "../agent/codex";
import { canvas, doctor, doctorChecks, type InspectReport } from "../canvas/canvas";
import { conceptShow, draftUpsert, topicAdd, topicAddDryRun, videoList, videoShow, type CatalogResult } from "../data/catalog";
import {
  agentAuth,
  CODEX_BIN,
  PLANNER_CONCURRENCY,
  PLANNER_TURNS,
  plannerModel,
  QWEN_BIN,
  studioOwner,
  VERB_TIMEOUT_MS,
} from "../config";
import { costFromLog, JobCostMeter, type CostSource, type SpendEntry } from "../cost";
import { checkoutRevision, documentHashOf, ensureCheckout, isDiagramName, listDiagrams } from "../canvas/diagrams";
import {
  draftDir,
  draftJsonPath,
  draftSessionLogPath,
  draftTmpDir,
  draftTranscriptPath,
  draftTranscriptRef,
  plannerSettingsPath,
  plannerSystemPath,
  studioHome,
  workPath,
} from "../paths";
import {
  briefBlocks,
  buildSystemPrompt,
  drawingSummary,
  evaluateBrief,
  fence,
  isVideoBrief,
  mermaidBlocks,
  codexPlannerArgv,
  plannerArgv,
  qwenPlannerArgv,
  PLANNER_BRIEF_FIELDS,
  PLANNER_VIDEO_FIELDS,
  plannerSettings,
  readHold,
  readSuggest,
  startPlanner,
  stripFencedBlocks,
  studioMessage,
  TOPIC_RELATION_KINDS,
  vocabularyBlock,
  vocabularyHash,
  EXTENDING_LINE_CAP,
  type AnyDraftBrief,
  type CorpusEntry,
  type DraftBrief,
  type DraftVideoBrief,
  type KindVerdict,
  type PendingTopic,
  type PlannerOutcome,
  type PlannerRun,
} from "./planner";
import {
  BRIEF_KINDS,
  buildCombinedSystemPrompt,
  changingSummary,
  conceptBlock,
  isBriefKind,
  isTagKind,
  lengthOf,
  TAG_KINDS,
  tutorBlock,
  TUTOR_TURN_CAP,
  type BriefKind,
  type TagKind,
  type TutorTurn,
  type VideoCorpusEntry,
} from "./planner-prompt";
import { JobRefused, type Runner } from "../diagram/runner";
import type { JobRecord, JobStore } from "../data/store";
import { validateVideoBrief, type ValidVideoBrief } from "../video/brief";
import { videoKindBuilt } from "../video/config";
import { videoAbbreviations } from "../video/narration";
import { briefTool } from "../video/tools";
import type { VideoRunner, VideoStore } from "../video/runner";
import type { VideoJobRecord } from "../video/types";

/**
 * Drafts: the planner conversations, their records and their turns
 * (docs/STUDIO-CHAT-FIRST.md, phase 1).
 *
 * **Disk first, as for a job (rule 7).** `drafts/<id>/draft.json` is the
 * record, `transcript.ndjson` every event the conversation had, and
 * `session.ndjson` every raw stream line of every planner turn, which is the
 * cost record an interrupted turn is replayed from. Each is written before
 * the row is mirrored into Postgres with `catalog draft upsert`, and a mirror
 * that fails is noted and retried with the next write, never a refusal: with
 * Postgres down the studio still talks, as it still draws (U3).
 *
 * **Between turns a draft holds nothing.** No process, no port, no lease, no
 * slot. A turn is one `claude -p`, started when a person's message arrives and
 * gone when its reply has been judged.
 *
 * **The runner, not the planner, decides what a reply means.** It takes the
 * last fenced `brief` block, runs it through the same `validateBrief`
 * `POST /api/jobs` runs, and on a refusal resumes the planner once with the
 * field and the sentence. A second refusal is shown, not retried (A10).
 */

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/** One planner turn's spend, dated at its own end (D36). Structurally a `SpendEntry`. */
export interface TurnSpend extends SpendEntry {
  /** The transcript seq of the person's message the turn answered. */
  turn: number;
  startedAt: string;
  finishedAt: string | null;
  costUsd: number | null;
  costSource: CostSource | null;
}

/** A slot's own state: today's draft states, for one kind alone (D62). */
export type SlotState = "open" | "briefed" | "drawing" | "done";

/**
 * One kind's part of a draft (D62 of docs/STUDIO-MENTIONS.md): the brief in
 * force, who wrote it, its pending topic, the kind's newest job, and the
 * tag waiting for a brief. In `draft.json` only; the row mirrors the newest
 * brief of any kind.
 */
export interface KindSlot {
  brief: AnyDraftBrief | null;
  briefAt: string | null;
  /** The transcript seq of the entry carrying the brief: what `PUT .../brief?base=` names. */
  briefSeq: number | null;
  /** A person's edit stays in force through a reply with no brief; a planner's does not. */
  briefBy: "planner" | "person" | null;
  pendingTopic: PendingTopic | null;
  /** A person's edits since the planner last heard, as one note (see `DraftRecord.pendingEdit`, which it replaces). */
  pendingEdit: { base: AnyDraftBrief | null; text: string } | null;
  /** This kind's newest job from this draft. */
  jobId: string | null;
  /** The `briefSeq` that job was pressed from, so a newer brief in force is known to be newer. */
  drawnSeq: number | null;
  /** The last verdict on this kind's job the draft acted on. */
  followed: { jobId: string; state: string } | null;
  /** A tagged request for this kind still owed a brief, and how often its brief was refused so far. */
  waiting: { requestSeq: number; refusals?: number; make?: boolean } | null;
  /** The tagged message the brief in force answered: what pairs two cards for Make both. */
  requestSeq: number | null;
  /** Set by a planner `hold` block until Use this brief, an edit, or a new brief. */
  held: { reason: string; at: string; replySeq: number } | null;
  /**
   * V11, a video slot only: the abbreviations of the brief in force as of the
   * last turn that answered. A turn whose brief holds a word missing from it
   * tells the planner (`abbreviationCheck`). Absent on a draft from before.
   */
  abbreviationsTold?: string[] | null;
  state: SlotState;
}

export function emptySlot(): KindSlot {
  return {
    brief: null,
    briefAt: null,
    briefSeq: null,
    briefBy: null,
    pendingTopic: null,
    pendingEdit: null,
    jobId: null,
    drawnSeq: null,
    followed: null,
    waiting: null,
    requestSeq: null,
    held: null,
    state: "open",
  };
}

export interface DraftRecord {
  id: string;
  /** The newest brief's kind, for display (D62); `diagram` before any brief. */
  kind: BriefKind;
  /** A summary of the slots for the list and the pruner (D62), or `abandoned`. */
  state: DraftState;
  /** The kinds this draft's planner prompt carries (D59, D105). Absent on a draft from before, which is `["diagram"]`. */
  plannerKinds?: TagKind[];
  /**
   * True for a draft whose prompt is the combined, conversational one: an
   * untagged message is conversation. Absent on a draft from before, whose
   * recorded prompt proposes on every message, so the runner treats its
   * untagged messages as tagged Diagram (D61).
   */
  conversational?: boolean;
  /** Per kind (D62). Absent on a draft from before; `load` builds its diagram slot. */
  slots?: Partial<Record<BriefKind, KindSlot>>;
  /** What `source` names: a diagram (the default) or a studio video. */
  sourceKind?: BriefKind;
  ownerId: string;
  /** The slug of the diagram (or, with `sourceKind: "video"`, the studio video) the draft was opened on. */
  source: string | null;
  /** That diagram's document hash when the draft opened (C11). */
  sourceHash: string | null;
  /** The revision the EXTENDING block summarised, as the checkout records it; null when unknown. */
  sourceRevision: number | null;
  /** The latest brief's title. */
  title: string | null;
  /**
   * The name the owner gave the conversation with Rename, shown before
   * `title` everywhere; null or absent for none (a draft from before it).
   * Set only by `PUT /api/drafts/{id}/name` (`rename`), never by a turn.
   */
  name?: string | null;
  /**
   * The model the composer's picker chose for this conversation (D90), or
   * null for the runner's own default: `plannerModel()` for turns and the
   * settings panel for jobs. Set at creation and by `PUT .../model`, never by
   * a turn; every planner spawn and every brief pressed off this draft runs
   * on it while it stands.
   */
  model?: string | null;
  /**
   * The harness the conversation's turns spawn on: absent or null is `claude`,
   * the default; `"byok"` is the open harness (`qwen`, Qwen Code) on the key
   * `byok.json` holds; `"codex"` is OpenAI's `codex exec` on the owner's codex
   * login. Set at creation from the picker's pick and by `PUT .../harness`
   * while no turn has run; a harness carries its own session store, so once a
   * turn has run the pick is locked to it.
   *
   * Jobs this draft draws or makes still run on `claude`: the job spawn's
   * hooks and Bash guard are a claude surface, and no open harness carries
   * the same ones yet.
   */
  harness?: "byok" | "codex" | null;
  /**
   * The concept a hand-off from the concept tutor opened the draft on (D65 of
   * docs/STUDIO-TUTOR-HANDOFF.md). Absent or null on every other draft. The
   * note itself is kept only in the system prompt.
   */
  concept?: DraftConcept | null;
  /** How many tutor turns the TUTOR block carries, at least in part (D69). */
  tutorTurns?: number;
  plannerSessionId: string;
  /** True once the CLI has a transcript for the session, so the next turn resumes it. */
  sessionStarted: boolean;
  /** `drafts/<id>/transcript.ndjson`, relative to `$STUDIO_HOME`. */
  transcriptPath: string;
  /** The newest brief of any kind, mirrored from the slots for the row (D62). */
  brief: AnyDraftBrief | null;
  briefAt: string | null;
  /**
   * The transcript seq of the entry carrying the brief in force: the planner
   * reply it came in, or the studio note of a person's edit. What a
   * `PUT .../brief?base=` names, so an edit of an older brief is refused.
   */
  briefSeq?: number | null;
  /**
   * Who wrote the brief in force. A person's edit stays in force when a later
   * planner reply carries no brief; only a newer valid planner brief replaces
   * it. A planner's brief ends with any reply that does not repeat it.
   */
  briefBy?: "planner" | "person" | null;
  /**
   * A person's edits since the planner last heard, as one note: the change
   * from the brief the planner last knew (`base`) to the one now in force.
   * Replaced, never appended to, by a further edit before the next turn.
   */
  pendingEdit?: { base: DraftBrief | null; text: string } | null;
  pendingTopic: PendingTopic | null;
  /** Person turns so far, retries included, against `PLANNER_TURNS`. */
  turns: number;
  costUsd: number | null;
  costSource: CostSource | null;
  errorKind: DraftErrorKind | null;
  error: string | null;
  /** The field a brief was refused on, beside an `error` of kind `brief-invalid`. */
  errorField?: string | null;
  /** The kind of that brief. */
  errorBriefKind?: BriefKind | null;
  idempotencyKey: string;
  /**
   * The hash of the vocabulary the planner has been told of: the system
   * prompt's at creation, then the one each C4 note brought it up to.
   */
  vocabularyHash: string;
  /** The person's first message, collapsed and cut for the drafts list; null before one. */
  firstMessage?: string | null;
  /** The last transcript seq written. */
  seq: number;
  /** The turn a planner process is answering right now, if any. */
  inFlight: { turn: number; startedAt: string } | null;
  /** STUDIO notes the planner has not been told yet, sent at the head of the next turn. */
  undelivered: string[];
  spend: TurnSpend[];
  /** Every job this draft started, oldest first. The last is the draft's `jobId` (D35). */
  jobIds: string[];
  /** The last job verdict this draft acted on, so no verdict is acted on twice. */
  followed?: { jobId: string; state: string } | null;
  /**
   * D108 of docs/STUDIO-CONSENT.md: the brief kinds the person has allowed
   * without asking, on this conversation only. A trusted kind may be briefed
   * unprompted, and that brief's job launches on validation like a consented
   * one.
   */
  trust?: BriefKind[];
  /**
   * D109: the suggestions the person declined, kind and the pitch line it was
   * offered with. Read back to the planner as a DECLINED block so the same
   * offer is not re-made. Capped, newest last.
   */
  declined?: DeclinedOffer[];
  catalogErrors: string[];
  createdAt: string;
  updatedAt: string;
}

/** One line of `transcript.ndjson`. */
export interface TranscriptEvent {
  seq: number;
  type:
    | "created"
    | "message"
    | "reply"
    | "brief"
    | "brief-invalid"
    | "brief-ignored"
    | "stop-waiting"
    | "studio"
    | "draw"
    | "job"
    | "declined"
    | "error"
    | "abandoned";
  at: string;
  [field: string]: unknown;
}

export type DraftRole = "person" | "planner" | "studio";

/** One offer the person declined (D109): its kind and the pitch it made. */
export interface DeclinedOffer {
  kind: TagKind;
  pitch: string | null;
  at: string;
}

/** A kind's cost band from the machine's finished jobs (D107): `n` of them ran $`low`–$`high`, middle of the spread. */
export interface CostBand {
  low: number;
  high: number;
  n: number;
}

/** One entry of a draft's transcript, as the API reports it. */
/** A mention as a message carries it: `text.slice(start, end)` reads `@<kind>`. */
export interface Mention {
  kind: TagKind;
  start: number;
  end: number;
}

/** One brief on a transcript entry (D61). */
export interface EntryBrief {
  kind: BriefKind;
  brief: AnyDraftBrief;
  pendingTopic?: PendingTopic;
  /** The tagged message it answered; null on an edit or a draft from before. */
  requestSeq: number | null;
  /**
   * A video brief's words the voice would read as words (V11), from
   * gnosia-audio's pronunciation table; absent until gnosia-audio has
   * answered, when the card makes its own rougher check.
   */
  abbreviations?: string[];
}

export interface TranscriptEntry {
  seq: number;
  role: DraftRole;
  text: string;
  at: string;
  /** A person's message: its chips, where they were. */
  mentions?: Mention[];
  /** Every brief the entry carries, one per kind. */
  briefs?: EntryBrief[];
  /** The last of `briefs`, kept one release for the web app from before (D61). */
  brief?: AnyDraftBrief;
  pendingTopic?: PendingTopic;
  briefsInvalid?: { kind: BriefKind; field: string; message: string; retried: boolean }[];
  /** The last of `briefsInvalid`, kept one release. */
  briefInvalid?: { field: string; message: string; retried: boolean };
  /** Kinds whose brief the reply carried and the runner dropped, since nothing tagged them (T24). */
  briefsIgnored?: string[];
  /** A reply's suggestion buttons (D58). */
  suggest?: TagKind[];
  /** The suggestion card's pitch: the `suggest` block's `line` (D106). */
  pitch?: string | null;
  /** The kinds of the reply's suggestion the person declined (D109). */
  declined?: TagKind[];
  /** A reply's hold on live cards (D60). */
  hold?: { kinds: BriefKind[]; reason: string };
  superseded?: boolean;
  internal?: boolean;
  /** A studio note for a person's edit of the brief, which carries that brief. */
  edit?: boolean;
  interrupted?: boolean;
  costUsd?: number | null;
  costSource?: CostSource | null;
}

/** A slot, as the API reports it. */
export interface SlotView {
  kind: BriefKind;
  brief: AnyDraftBrief | null;
  briefAt: string | null;
  briefSeq: number | null;
  briefBy: "planner" | "person" | null;
  pendingTopic: PendingTopic | null;
  jobId: string | null;
  /** That job's state, when the runner knows it. */
  jobState: string | null;
  waiting: { requestSeq: number } | null;
  requestSeq: number | null;
  held: { reason: string; at: string } | null;
  state: SlotState;
  /** The brief is in force: its card is live, not greyed. */
  live: boolean;
  /** Why its press would be refused now for its job: `kind-busy` with the job. Null when it is free. */
  busy: { jobId: string; state: string } | null;
  /**
   * Video only: the press will replace this draft's video in review, the
   * parent discarded in the child's own catalog transaction (D52), so the
   * button reads "Replace and make video". Null otherwise.
   */
  replaces: { jobId: string } | null;
}

/** What `GET /api/drafts/{id}` answers. */
export interface DraftView {
  draftId: string;
  kind: BriefKind;
  state: DraftState;
  plannerKinds: TagKind[];
  conversational: boolean;
  sourceKind: BriefKind;
  source: string | null;
  /**
   * The concept a hand-off from the tutor opened the draft on, and how many
   * tutor turns came along: what the studio pins above the thread (D69).
   * Null on every other draft.
   */
  concept: { slug: string; title: string; topic: string | null; tutorTurns: number } | null;
  slots: Partial<Record<BriefKind, SlotView>>;
  /** Kinds whose tagged request is still owed a brief, oldest request first. */
  waiting: BriefKind[];
  /** A diagram and a video card asked for in one message, both live: Make both's pair (D60). */
  pair: { requestSeq: number; kinds: BriefKind[] } | null;
  /**
   * C11: whether the extend target's checkout differs from what the EXTENDING
   * block summarised: its document hash, or the revision its checkout record
   * names. False when unknown (not an extend draft, or no checkout to read).
   */
  sourceChanged: boolean;
  /** The revision the EXTENDING block summarised; null when unknown or not an extend draft. */
  sourceRevision: number | null;
  title: string | null;
  /** The owner's name for the conversation, which every page shows before `title`. */
  name: string | null;
  /** The model the conversation's picker holds (D90); null is the runner's default. */
  model: string | null;
  /** The harness the conversation's turns run on: `"claude"`, `"byok"` or `"codex"` (the pane picker's pick). */
  harness: "claude" | "byok" | "codex";
  transcript: TranscriptEntry[];
  /** The brief kinds the person has allowed this conversation to start unprompted (D108). */
  trust: BriefKind[];
  /**
   * What a make of each kind has cost on this machine, for the consent card's
   * estimate (D107): null for a kind with under three finished jobs, absent
   * for a kind with no store.
   */
  estimates: Partial<Record<BriefKind, CostBand | null>>;
  /** The newest brief of any kind, kept one release for the web app from before (D61). */
  brief: AnyDraftBrief | null;
  /** The seq of the transcript entry carrying `brief`; what `PUT .../brief?base=` names. */
  briefSeq: number | null;
  pendingTopic: PendingTopic | null;
  jobId: string | null;
  turns: number;
  turnCap: number;
  costUsd: number | null;
  costSource: CostSource | null;
  inFlight: boolean;
  error: { kind: DraftErrorKind; message: string; field?: string; briefKind?: BriefKind } | null;
  created: string;
  updated: string;
  note: string;
}

/** A row of `GET /api/drafts`. */
export interface DraftSummaryView {
  draftId: string;
  kind: BriefKind;
  /** The kinds the draft has briefs or jobs of. */
  kinds: BriefKind[];
  state: DraftState;
  title: string | null;
  /** The owner's name for the conversation, which every page shows before `title`. */
  name: string | null;
  /** The person's first message, for a row with no title yet. */
  firstMessage: string | null;
  source: string | null;
  /** The concept a hand-off from the tutor opened the draft on, which titles a row with no brief yet. */
  concept: { slug: string; title: string } | null;
  turns: number;
  costUsd: number | null;
  updated: string;
  jobId: string | null;
}

/** An SSE event: `id` only on the ones written to the transcript. */
export interface DraftStreamEvent {
  id?: number;
  event: string;
  data: unknown;
}

/** The opening line of every planner turn in `session.ndjson`, so a replay knows where a turn began. */
interface TurnMarker {
  type: "studio-turn";
  turn: number;
  at: string;
  retry?: boolean;
  /** The model this spawn passed to the CLI (D90): what a recovery prices by, not the record's pick now. */
  model?: string;
}

let writeCounter = 0;

async function atomicWrite(file: string, body: string): Promise<void> {
  writeCounter += 1;
  const temporary = `${file}.${process.pid}.${writeCounter}.tmp`;
  try {
    await writeFile(temporary, body, "utf8");
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function sumCost(spend: readonly TurnSpend[]): { costUsd: number | null; costSource: CostSource | null } {
  const priced = spend.filter((entry) => entry.costUsd !== null);
  if (priced.length === 0) return { costUsd: null, costSource: null };
  const total = Math.round(priced.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0) * 1_000_000) / 1_000_000;
  return { costUsd: total, costSource: priced.some((entry) => entry.costSource === "stream") ? "stream" : "result" };
}

/** The refusal `POST /api/jobs` would give when the catalog cannot read the vocabulary. */
/**
 * C11, read from the checkout the planner was told about: two small file reads
 * and no Chromium, so it is cheap enough for every view. The hash catches an
 * edit on the canvas (saved or not yet committed); the revision catches a
 * checkout brought up to a newer revision (an accepted job, a commit), which
 * happens the next time anything opens the diagram. A missing file, or a draft
 * that recorded neither, says nothing changed rather than guess.
 */
export async function sourceChanged(record: Pick<DraftRecord, "source" | "sourceHash" | "sourceRevision" | "sourceKind">): Promise<boolean> {
  if (record.source === null) return false;
  // A draft opened on a studio video: the checks below read a diagram's
  // checkout by slug, which is a different thing that may share the name.
  // Checking the video would be a catalog call per view, so it says nothing.
  if (record.sourceKind === "video") return false;
  if (record.sourceHash !== null) {
    const now = await documentHashOf(workPath(record.source));
    if (now !== null && now !== record.sourceHash) return true;
  }
  if (record.sourceRevision !== null) {
    const revision = await checkoutRevision(record.source);
    if (typeof revision === "number" && revision !== record.sourceRevision) return true;
  }
  return false;
}

function vocabularyDown(error: unknown): JobRefused {
  return new JobRefused(
    503,
    `the topic list cannot be read and there is no cached copy, so a brief cannot be checked: ${(error as Error).message}`,
    { readAt: null, stale: true },
  );
}

/* -------------------------------------------------------------------------- */
/* The service                                                                */
/* -------------------------------------------------------------------------- */

export interface CreateInput {
  source?: string | null;
  /** What `source` names: `diagram` (the default) or a studio `video`. */
  sourceKind?: string | null;
  idempotencyKey?: string | null;
  /**
   * The concept a hand-off from the concept tutor opens on, as the web app's
   * server action read it for the signed-in owner (D65 of
   * docs/STUDIO-TUTOR-HANDOFF.md): `{ slug, title, summary?, body? }`.
   * Unchecked here; `parseConcept` checks it.
   */
  concept?: unknown;
  /** The tutor's last turns, oldest first: `[{ role: "user" | "assistant", content }]`, at most six (D69). */
  tutor?: unknown;
  /** The model the new conversation's picker holds (D90); absent or `"default"` is the runner's own default. */
  model?: unknown;
  /** The harness the conversation's turns run on; absent, `"default"` or `"claude"` is `claude`. */
  harness?: unknown;
}

/** A concept as a draft records it: what the planner was told, less the note. */
export interface DraftConcept {
  slug: string;
  title: string;
  /** The topic whose concept list names the slug, from the vocabulary at creation; null when none does (H13). */
  topic: string | null;
}

/** The concept a create was posted with, checked. */
export interface ConceptInput {
  slug: string;
  title: string;
  summary: string | null;
  body: string;
}

/**
 * The most a concept's `body` may be, in UTF-8 bytes: 256 KiB, the web note
 * reader's own `NOTE_READ_LIMIT`, so every note the page can read is accepted
 * and the CONCEPT block's 12,000-character cap is the only cut (D65).
 */
export const CONCEPT_BODY_LIMIT = 256 * 1024;
/** The most a concept's `title` may be, in characters. */
export const CONCEPT_TITLE_LIMIT = 200;

/**
 * `concept` on `POST /api/drafts`, checked. The slug is a catalog slug, so it
 * can be neither a flag nor a path when it is handed to `learn concept show`;
 * the title and the note are untrusted text, which only ever reach the
 * planner inside the CONCEPT block (`conceptBlock`). Null when absent.
 */
export function parseConcept(raw: unknown): ConceptInput | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new JobRefused(400, `"concept" is an object: { slug, title, summary, body }`, { field: "concept" });
  }
  const input = raw as Record<string, unknown>;
  const slug = typeof input.slug === "string" ? input.slug.trim() : "";
  if (slug === "" || slug.length > 120 || !SLUG_PATTERN.test(slug)) {
    throw new JobRefused(400, `"concept.slug" is a concept's slug: lower-case letters, digits and single hyphens`, {
      field: "concept.slug",
    });
  }
  const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
  if (title === "" || title.length > CONCEPT_TITLE_LIMIT) {
    throw new JobRefused(400, `"concept.title" is 1 to ${CONCEPT_TITLE_LIMIT} characters`, { field: "concept.title" });
  }
  if (input.summary !== undefined && input.summary !== null && typeof input.summary !== "string") {
    throw new JobRefused(400, `"concept.summary" is a string or null`, { field: "concept.summary" });
  }
  if (input.body !== undefined && input.body !== null && typeof input.body !== "string") {
    throw new JobRefused(400, `"concept.body" is a string or null`, { field: "concept.body" });
  }
  const body = typeof input.body === "string" ? input.body : "";
  if (Buffer.byteLength(body, "utf8") > CONCEPT_BODY_LIMIT) {
    throw new JobRefused(400, `"concept.body" is over ${CONCEPT_BODY_LIMIT} bytes; send it empty and the planner works from the title`, {
      field: "concept.body",
      limit: CONCEPT_BODY_LIMIT,
    });
  }
  const summary = typeof input.summary === "string" && input.summary.trim() !== "" ? input.summary : null;
  return { slug, title, summary, body };
}

/** `tutor` on `POST /api/drafts`, checked: at most six `{ role, content }`. Empty when absent. */
export function parseTutor(raw: unknown): TutorTurn[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new JobRefused(400, `"tutor" is a list of { role, content }`, { field: "tutor" });
  }
  if (raw.length > TUTOR_TURN_CAP) {
    throw new JobRefused(400, `"tutor" holds at most ${TUTOR_TURN_CAP} turns, the last ones; it has ${raw.length}`, {
      field: "tutor",
      limit: TUTOR_TURN_CAP,
    });
  }
  return raw.map((turn, i) => {
    const entry = typeof turn === "object" && turn !== null && !Array.isArray(turn) ? (turn as Record<string, unknown>) : null;
    if (entry === null || (entry.role !== "user" && entry.role !== "assistant") || typeof entry.content !== "string") {
      throw new JobRefused(400, `"tutor[${i}]" is { role: "user" or "assistant", content: a string }`, { field: "tutor" });
    }
    return { role: entry.role, content: entry.content };
  });
}

/**
 * D66: the runner's fields on a brief of a draft opened on a concept, filled
 * before the validator runs so the validator checks the result. `source` is
 * always the concept's slug, replacing any other value a reply or an edit
 * carried: the draft is about that concept, and the job agent reads the whole
 * note through it. The slug joins `concepts` when the brief's topic files it,
 * which is what puts the made asset on the concept's page. Never when the
 * topic does not file it: the validator would refuse the brief for it.
 */
export function withConcept(
  raw: Record<string, unknown>,
  concept: Pick<DraftConcept, "slug"> | null | undefined,
  vocabulary: Pick<Vocabulary, "topics">,
): Record<string, unknown> {
  if (concept === null || concept === undefined) return raw;
  const next: Record<string, unknown> = { ...raw, source: concept.slug };
  const topic = typeof next.topic === "string" ? next.topic : null;
  const files = topic !== null && (vocabulary.topics.get(topic)?.concepts.includes(concept.slug) ?? false);
  if (files) {
    const list: unknown[] = Array.isArray(next.concepts) ? next.concepts : [];
    if (!list.includes(concept.slug)) next.concepts = [...list, concept.slug];
  }
  return next;
}

/** The topics whose concept list names the slug, in the vocabulary's order. */
export function topicsFiling(vocabulary: Pick<Vocabulary, "entries">, slug: string): string[] {
  return vocabulary.entries.filter((entry) => entry.maps.concepts.includes(slug)).map((entry) => entry.slug);
}

export class Drafts {
  private readonly records = new Map<string, DraftRecord>();
  private readonly streams = new Map<string, EventEmitter>();
  /** One chain of writes per draft, so the record, the transcript and the mirror land in order. */
  private readonly chains = new Map<string, Promise<unknown>>();
  /** The planner process answering each draft, while one is. */
  private readonly running = new Map<string, PlannerRun>();
  /** The whole of each draft's current turn, for `settled`. */
  private readonly turnsInFlight = new Map<string, Promise<void>>();
  /** The reply so far, per draft, while a turn streams. Never written: a cache (rule 8). */
  private readonly live = new Map<string, { turn: number; text: string }>();
  /** Mirrors in flight, and whether another write arrived while one ran. */
  private readonly mirroring = new Map<string, { again: boolean; done: Promise<void> }>();
  /**
   * The Draw press in progress on each draft, with its key. Held from the
   * press to the job being recorded, so neither a planner turn nor a second
   * press can run beside it: a turn could otherwise move the draft while the
   * topic, the doctor and the enqueue are awaited, and a second press would
   * create the topic twice and queue a second job.
   */
  private readonly draws = new Map<string, { key: string; result: Promise<unknown> }>();
  /**
   * D107: the kinds a settled turn earned a launch for — a consented tag or a
   * trusted kind's unprompted brief — queued while the turn was open and
   * drawn once it closes and `inFlight` clears. A `trust` entry re-reads the
   * draft's trust at flush, so a revoke while the turn ran costs nothing.
   */
  private readonly pendingLaunch = new Map<string, Map<BriefKind, "consent" | "trust">>();
  private readonly launching = new Map<string, Promise<void>>();
  private draining = false;
  /** Creates in progress, by idempotency key, so two posts of one key make one draft. */
  private readonly creating = new Map<string, Promise<{ record: DraftRecord; created: boolean }>>();
  /** Drafts the pruner has taken (D40): gone to `get`, `require` and `list` from that moment. */
  private readonly pruning = new Set<string>();
  /** Workspaces of pruned drafts that did not all go, removed by the next pass. */
  private readonly leftovers = new Set<string>();
  /**
   * Each create, and the corpus and video reads it starts, until they finish.
   * A create refused before it awaits its reads (the vocabulary down, a
   * concept the catalog does not know) leaves them running, and the diagram
   * list writes its cache under `STUDIO_HOME` when it returns; a create still
   * waiting on a checkout or an inspect writes the draft once it is past
   * them. `drain` waits for all of it.
   */
  private readonly readsInFlight = new Set<Promise<unknown>>();
  /** The last vocabulary this service read, reused by a turn's C4 check for a short while. */
  private lastVocabulary: { at: number; value: Vocabulary } | null = null;

  constructor(
    private readonly store: JobStore,
    private readonly runner: Runner,
    /** The video runner and its store; absent in a studio (or a test) that serves only diagrams. */
    private readonly video?: { store: VideoStore; runner: VideoRunner },
  ) {
    const follow = (record: JobRecord | VideoJobRecord, kind: BriefKind): void => {
      // A draft that cannot be told is a draft whose record is behind, not a
      // job that failed: the job's own record is already written.
      void this.onJobState(record, kind).catch((error: unknown) => {
        process.stderr.write(`draft ${record.draftId ?? "?"} could not follow job ${record.id}: ${(error as Error).message}\n`);
      });
    };
    store.onStateChange((record) => follow(record, "diagram"));
    video?.store.onStateChange((record) => follow(record, "video"));
  }

  /** The kinds a draft made now carries (D59, D105): every kind this build has. `svg` needs no machine. */
  plannerKindsNow(): TagKind[] {
    return this.video !== undefined && videoKindBuilt() ? [...TAG_KINDS] : ["diagram", "svg"];
  }

  /** A job of either kind, by id. */
  private jobOf(kind: BriefKind, id: string): JobRecord | VideoJobRecord | undefined {
    return kind === "diagram" ? this.store.get(id) : this.video?.store.get(id);
  }

  /** Which runner a job is on, or null when neither knows it. */
  private kindOfJob(id: string): BriefKind | null {
    if (this.store.get(id) !== undefined) return "diagram";
    if (this.video?.store.get(id) !== undefined) return "video";
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Load and reconcile                                                 */
  /* ------------------------------------------------------------------ */

  /** Read every draft workspace back into memory. Called once, at start. */
  async load(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(`${studioHome()}/drafts`);
    } catch {
      return;
    }
    for (const entry of entries) {
      // A draft the pruner took whose workspace did not all go: its row is
      // gone, so it is never served again, and the next pass removes the rest.
      if (await readFile(tombstonePath(entry), "utf8").then(() => true, () => false)) {
        this.leftovers.add(entry);
        continue;
      }
      try {
        const record = JSON.parse(await readFile(draftJsonPath(entry), "utf8")) as DraftRecord;
        if (record.id !== entry) continue;
        // `append` moves `seq` in memory and the next save writes it, so a
        // crash between the two leaves a record behind its own transcript.
        // The transcript is the authority on what was written.
        const events = await this.events(entry);
        const seq = events.reduce((max, event) => Math.max(max, event.seq), record.seq);
        // A draft from before the list showed first messages learns its own.
        const first = events.find((event) => event.type === "message" && typeof event.text === "string");
        const firstMessage = record.firstMessage ?? (first === undefined ? null : listLine(first.text as string));
        // A draft from before briefs carried their seq learns it from its transcript.
        const lastBrief = [...events].reverse().find((event) => event.type === "brief");
        const briefSeq =
          record.briefSeq ?? (record.brief !== null && typeof lastBrief?.replySeq === "number" ? lastBrief.replySeq : null);
        const briefBy = record.briefBy ?? (record.brief === null ? null : lastBrief?.edit === true ? "person" : "planner");
        const loaded: DraftRecord = { ...record, seq, firstMessage, briefSeq, briefBy };
        // A draft from before D62 keeps its one brief as its diagram slot, and
        // its recorded prompt, which proposes on every message (D61).
        if (loaded.slots === undefined) loaded.slots = legacySlots(loaded);
        // A brief saved before D53 holds the `sonnet` the old `validateBrief`
        // filled in on every brief, which is no one's choice and would beat
        // the settings panel at every press, so it goes. Any other stored
        // model was chosen by a person and stays: it wins at the press, as a
        // model posted to POST /api/jobs does (D53).
        loaded.slots = withoutLegacyModels(loaded.slots);
        // A slot drawing with no record of what it was pressed from (a draft
        // from before slots, or a job route that did not say) is drawing the
        // brief in force: otherwise that brief reads as newer and could be
        // edited under its own job.
        for (const slot of Object.values(loaded.slots)) {
          if (slot.state === "drawing" && slot.drawnSeq === null) slot.drawnSeq = slot.briefSeq;
        }
        if (loaded.brief !== null) loaded.brief = withoutLegacyModel(loaded.brief);
        loaded.plannerKinds = loaded.plannerKinds ?? ["diagram"];
        this.records.set(record.id, { ...loaded, ...summarize(loaded) });
      } catch {
        // A workspace with no readable record is one that was created and
        // never written, or one a person has been poking at: nothing to serve.
      }
    }
  }

  /**
   * C1: a turn whose runner died. The draft has a `message` with no `reply`,
   * so a `reply` marked interrupted is written with whatever text arrived,
   * the turn's cost is rebuilt from `session.ndjson` as a job's is, and the
   * draft is left `open`. Nothing is resent by itself (D15).
   */
  async reconcile(): Promise<string[]> {
    const interrupted: string[] = [];
    for (const record of this.records.values()) {
      if (record.inFlight === null) continue;
      const turn = record.inFlight;
      const { lines, startedAt, spawns, model: spawnModel } = await this.linesOfTurn(record.id, turn.turn);
      const events = await this.events(record.id);
      const replies = events.filter((event) => event.type === "reply" && event.turn === turn.turn);
      // The runner died after the last spawn's reply was written: nothing is
      // cut off, and a second reply would repeat it.
      const answered = spawns > 0 && replies.length >= spawns;
      // A brief that passed on this turn stays in force.
      const briefed = events.some(
        (event) => event.type === "brief" && replies.some((reply) => reply.seq === event.replySeq),
      );
      // A spawn whose spend was already written finished before the runner
      // died; only what came after it is unaccounted for. Asked of the spend
      // alone, never of whether a reply exists: `speak` saves the spend before
      // it appends the reply, but this pass appends its cut-off reply first,
      // so a crash between the two leaves an answered turn whose cost is still
      // to be counted, from the same stream lines, exactly once.
      const counted = record.spend.some((entry) => entry.startedAt === startedAt);
      // The spawn's own model, not the pick as it stands now: a model chosen
      // mid-turn does not reprice the turn that was already running (D90).
      const cost = costFromLog(lines.join("\n"), spawnModel ?? record.model ?? plannerModel());
      const spend: TurnSpend = {
        turn: turn.turn,
        startedAt: startedAt ?? turn.startedAt,
        finishedAt: new Date().toISOString(),
        costUsd: counted ? null : cost.usd,
        costSource: counted ? null : cost.source,
      };
      await this.write(record.id, async () => {
        if (!answered) {
          await this.append(record.id, {
            type: "reply",
            turn: turn.turn,
            text: replyText(lines),
            interrupted: true,
            costUsd: cost.usd,
            costSource: cost.source,
          });
        }
        const current = this.require(record.id);
        const nextSpend = counted || lines.length === 0 ? current.spend : [...current.spend, spend];
        await this.save(record.id, {
          inFlight: null,
          spend: nextSpend,
          ...sumCost(nextSpend),
          ...(answered
            ? {}
            : {
                errorKind: "interrupted" as const,
                error: "The reply was cut off: the studio stopped while the planner was answering.",
                errorField: null,
              }),
          // A draft from before D61 answered every message with a brief or
          // none, so a cut-off turn ends a planner's diagram brief as a reply
          // with none would. A tagged request on a conversational draft stays
          // waiting instead, for the next turn to answer.
          ...(current.conversational !== true && slotOf(current, "diagram").state === "briefed" && !briefed && slotOf(current, "diagram").briefBy !== "person"
            ? withSlot(current, "diagram", { state: "open" })
            : {}),
        });
      });
      interrupted.push(record.id);
    }
    return interrupted;
  }

  /**
   * The raw stream lines of a turn's last spawn (the retry, when there was
   * one), from its marker to the end, and when that spawn started.
   */
  private async linesOfTurn(
    id: string,
    turn: number,
  ): Promise<{ lines: string[]; startedAt: string | null; spawns: number; model: string | null }> {
    const body = await readFile(draftSessionLogPath(id), "utf8").catch(() => "");
    const lines = body.split("\n").filter((line) => line.trim() !== "");
    let start = -1;
    let startedAt: string | null = null;
    let model: string | null = null;
    let spawns = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const marker = safeJson(lines[i]!);
      if (marker?.type === "studio-turn" && marker.turn === turn) {
        start = i;
        spawns += 1;
        startedAt = typeof marker.at === "string" ? marker.at : null;
        model = typeof marker.model === "string" ? marker.model : null;
      }
    }
    return { lines: start === -1 ? [] : lines.slice(start + 1), startedAt, spawns, model };
  }

  /* ------------------------------------------------------------------ */
  /* Reads                                                              */
  /* ------------------------------------------------------------------ */

  /** A draft being pruned is already gone to every reader, so nothing new can start on it. */
  get(id: string): DraftRecord | undefined {
    return this.pruning.has(id) ? undefined : this.records.get(id);
  }

  private require(id: string): DraftRecord {
    const record = this.get(id);
    if (record === undefined) throw new JobRefused(404, `no draft ${id}`, "This conversation is gone, or never existed.");
    return record;
  }

  /**
   * `state` may name several, comma-separated (`open,briefed`). `before` is
   * the last row of the page before, by its `updated` and id, so a history
   * longer than one page can be read a page at a time. `q` keeps the drafts
   * whose name, title, first message or concept title contains it (`draftMatches`),
   * before the cursor and the limit, so a page of matches is full and the
   * paging reads the matches and nothing else.
   */
  list(filter: { state?: string; limit?: number; nonEmpty?: boolean; q?: string; before?: { updated: string; id: string } } = {}): DraftSummaryView[] {
    const before = filter.before;
    const needle = filter.q === undefined ? "" : searchText(filter.q);
    const states =
      filter.state === undefined
        ? null
        : new Set(filter.state.split(",").map((state) => state.trim()).filter((state) => state !== ""));
    return [...this.records.values()]
      .filter((record) => !this.pruning.has(record.id))
      .filter((record) => states === null || states.size === 0 || states.has(record.state))
      // Before the limit, so conversations never started cannot crowd real ones out.
      .filter((record) => filter.nonEmpty !== true || record.turns > 0)
      .filter((record) => needle === "" || draftMatches(record, needle))
      // Newest first, and by id where two share a time, so a page boundary
      // between them neither repeats a row nor drops one.
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .filter(
        (record) =>
          before === undefined ||
          record.updatedAt < before.updated ||
          (record.updatedAt === before.updated && record.id < before.id),
      )
      .slice(0, filter.limit ?? 50)
      .map((record) => ({
        draftId: record.id,
        kind: record.kind,
        kinds: BRIEF_KINDS.filter((kind) => {
          const slot = record.slots?.[kind];
          return slot !== undefined && (slot.brief !== null || slot.jobId !== null);
        }),
        state: record.state,
        title: record.title,
        name: record.name ?? null,
        firstMessage: record.firstMessage ?? null,
        source: record.source,
        concept: record.concept == null ? null : { slug: record.concept.slug, title: record.concept.title },
        turns: record.turns,
        costUsd: record.costUsd,
        updated: record.updatedAt,
        jobId: record.jobIds.at(-1) ?? null,
      }));
  }

  /** Every planner turn's spend, for the daily cap (D36). */
  spendEntries(): TurnSpend[] {
    return [...this.records.values()].flatMap((record) => record.spend);
  }

  /** How many planner turns are running right now. */
  get busy(): number {
    return this.running.size;
  }

  async events(id: string): Promise<TranscriptEvent[]> {
    const body = await readFile(draftTranscriptPath(id), "utf8").catch(() => "");
    return body
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => safeJson(line) as TranscriptEvent | null)
      .filter((event): event is TranscriptEvent => event !== null);
  }

  async view(id: string): Promise<DraftView> {
    const record = this.require(id);
    return {
      draftId: record.id,
      kind: record.kind,
      state: record.state,
      plannerKinds: plannerKindsOf(record),
      conversational: record.conversational === true,
      sourceKind: record.sourceKind ?? "diagram",
      source: record.source,
      concept: record.concept == null ? null : { ...record.concept, tutorTurns: record.tutorTurns ?? 0 },
      ...this.slotsOf(record),
      sourceChanged: await sourceChanged(record),
      sourceRevision: record.source === null ? null : record.sourceRevision,
      title: record.title,
      name: record.name ?? null,
      model: record.model ?? null,
      // The picker's pick, spelled out so a pane never guesses the default.
      harness: record.harness ?? "claude",
      transcript: transcriptOf(await this.events(id)),
      trust: (record.trust ?? []).filter((kind) => plannerKindsOf(record).includes(kind)),
      estimates: this.costBands(record),
      brief: record.brief,
      briefSeq: record.brief === null ? null : (record.briefSeq ?? null),
      pendingTopic: record.pendingTopic,
      jobId: record.jobIds.at(-1) ?? null,
      turns: record.turns,
      turnCap: PLANNER_TURNS,
      costUsd: record.costUsd,
      costSource: record.costSource,
      inFlight: record.inFlight !== null,
      error:
        record.errorKind === null
          ? null
          : {
              kind: record.errorKind,
              message: record.error ?? "",
              ...(record.errorField === undefined || record.errorField === null ? {} : { field: record.errorField }),
              ...(record.errorBriefKind === undefined || record.errorBriefKind === null ? {} : { briefKind: record.errorBriefKind }),
            },
      created: record.createdAt,
      updated: record.updatedAt,
      note: noteForDraft(record),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Writes                                                             */
  /* ------------------------------------------------------------------ */

  /** Run `fn` after every earlier write to this draft, and before every later one. */
  private write<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(fn);
    this.chains.set(id, next.catch(() => undefined));
    return next;
  }

  /**
   * Merge a patch into the record, write `draft.json`, then mirror it. Call
   * inside `write`. `touch: false` keeps `updatedAt`, for a change (a rename)
   * that should not move the conversation up the lists or put off its pruning.
   */
  private async save(id: string, patch: Partial<DraftRecord>, options: { mirror?: boolean; touch?: boolean } = {}): Promise<DraftRecord> {
    const record = this.require(id);
    const merged: DraftRecord = { ...record, ...patch };
    const next: DraftRecord = { ...merged, ...summarize(merged), updatedAt: options.touch === false ? record.updatedAt : new Date().toISOString() };
    this.records.set(id, next);
    await mkdir(draftDir(id), { recursive: true });
    await atomicWrite(draftJsonPath(id), `${JSON.stringify(next, null, 1)}\n`);
    if (options.mirror !== false) this.mirror(id);
    this.publish(id, { event: "state", data: this.stateOf(next) });
    return next;
  }

  /** Append one transcript event, then tell whoever is listening. Call inside `write`. */
  private async append(id: string, event: Omit<TranscriptEvent, "seq" | "at">): Promise<TranscriptEvent> {
    const record = this.require(id);
    const full = { ...event, seq: record.seq + 1, at: new Date().toISOString() } as TranscriptEvent;
    this.records.set(id, { ...record, seq: full.seq });
    await appendFile(draftTranscriptPath(id), `${JSON.stringify(full)}\n`, "utf8");
    const streamed = streamEventOf(full);
    if (streamed !== null) this.publish(id, streamed);
    return full;
  }

  /**
   * Mirror the record into Postgres, coalesced: a write that lands while a
   * mirror runs asks for one more, and only the latest record is sent.
   */
  private mirror(id: string): void {
    const running = this.mirroring.get(id);
    if (running !== undefined) {
      running.again = true;
      return;
    }
    const state = { again: false, done: Promise.resolve() };
    state.done = (async () => {
      do {
        state.again = false;
        const result = await draftUpsert(draftJsonPath(id)).catch(
          (error: unknown): CatalogResult => ({ ok: false, json: null, error: (error as Error).message, offline: true }),
        );
        if (!result.ok) await this.noteCatalogError(id, result.error ?? "catalog draft upsert failed");
      } while (state.again);
    })().finally(() => this.mirroring.delete(id));
    this.mirroring.set(id, state);
  }

  /** Wait for any mirror of this draft to land. What a Draw needs before the job names it. */
  private async mirrored(id: string): Promise<void> {
    await this.mirroring.get(id)?.done;
  }

  private async noteCatalogError(id: string, message: string): Promise<void> {
    const record = this.records.get(id);
    if (record === undefined) return;
    await this.write(id, () => this.save(id, { catalogErrors: [...record.catalogErrors, message].slice(-20) }, { mirror: false }));
  }

  /** A STUDIO note: shown to the person as the runner speaking, and told to the planner on its next turn. */
  private async note(id: string, text: string, options: { deliver?: boolean } = {}): Promise<void> {
    await this.append(id, { type: "studio", text });
    if (options.deliver !== false) {
      const record = this.require(id);
      await this.save(id, { undelivered: [...record.undelivered, text] });
    }
  }

  /** Every slot as the API reports it, the kinds still waiting, and Make both's pair. */
  private slotsOf(record: DraftRecord): Pick<DraftView, "slots" | "waiting" | "pair"> {
    const slots: Partial<Record<BriefKind, SlotView>> = {};
    for (const kind of BRIEF_KINDS) {
      if (record.slots?.[kind] === undefined) continue;
      slots[kind] = this.slotView(record, kind);
    }
    const waiting = BRIEF_KINDS.filter((kind) => record.slots?.[kind]?.waiting != null).sort(
      (a, b) => (record.slots![a]!.waiting!.requestSeq - record.slots![b]!.waiting!.requestSeq),
    );
    const diagram = slots.diagram;
    const video = slots.video;
    const pair =
      diagram !== undefined &&
      video !== undefined &&
      diagram.live &&
      video.live &&
      diagram.held === null &&
      video.held === null &&
      diagram.requestSeq !== null &&
      diagram.requestSeq === video.requestSeq
        ? { requestSeq: diagram.requestSeq, kinds: ["diagram", "video"] as BriefKind[] }
        : null;
    return { slots, waiting, pair };
  }

  private slotView(record: DraftRecord, kind: BriefKind): SlotView {
    const slot = slotOf(record, kind);
    const job = slot.jobId === null ? undefined : this.jobOf(kind, slot.jobId);
    const press = this.pressStatus(record, kind);
    return {
      kind,
      brief: slot.brief,
      briefAt: slot.briefAt,
      briefSeq: slot.brief === null ? null : slot.briefSeq,
      briefBy: slot.briefBy,
      pendingTopic: slot.pendingTopic,
      jobId: slot.jobId,
      jobState: job?.state ?? null,
      waiting: slot.waiting === null ? null : { requestSeq: slot.waiting.requestSeq },
      requestSeq: slot.requestSeq,
      held: slot.held === null ? null : { reason: slot.held.reason, at: slot.held.at },
      state: slot.state,
      live: slot.brief !== null && (slot.state === "briefed" || slot.state === "drawing"),
      busy: press.busy,
      replaces: press.replaces,
    };
  }

  /**
   * What the kind's newest job from this draft means for its press (D60):
   * queued or running holds it (`kind-busy`); in review holds a diagram, and
   * holds a video too unless a newer brief on the same slug is in force, when
   * the press replaces it in one catalog transaction (D52).
   */
  private pressStatus(record: DraftRecord, kind: BriefKind): { busy: { jobId: string; state: string } | null; replaces: { jobId: string } | null } {
    const slot = slotOf(record, kind);
    const free = { busy: null, replaces: null };
    if (slot.jobId === null) return free;
    const job = this.jobOf(kind, slot.jobId);
    if (job === undefined) return free;
    if (job.state === "queued" || job.state === "running") return { busy: { jobId: job.id, state: job.state }, replaces: null };
    if (job.state !== "awaiting_review") return free;
    if (
      kind === "video" &&
      slot.brief !== null &&
      isVideoBrief(slot.brief) &&
      slot.briefSeq !== slot.drawnSeq &&
      slot.brief.slug === job.slug
    ) {
      return { busy: null, replaces: { jobId: job.id } };
    }
    return { busy: { jobId: job.id, state: job.state }, replaces: null };
  }

  private stateOf(record: DraftRecord): Record<string, unknown> {
    return {
      ...this.slotsOf(record),
      kind: record.kind,
      state: record.state,
      jobId: record.jobIds.at(-1) ?? null,
      inFlight: record.inFlight !== null,
      turns: record.turns,
      costUsd: record.costUsd,
      costSource: record.costSource,
      model: record.model ?? null,
    };
  }

  /* ------------------------------------------------------------------ */
  /* The stream                                                         */
  /* ------------------------------------------------------------------ */

  private stream(id: string): EventEmitter {
    let emitter = this.streams.get(id);
    if (emitter === undefined) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(64);
      this.streams.set(id, emitter);
    }
    return emitter;
  }

  private publish(id: string, event: DraftStreamEvent): void {
    this.stream(id).emit("event", event);
  }

  /**
   * Replay every transcript event after `after` from disk, then follow. The
   * listener is attached before the file is read and the two are merged by
   * seq, so an event that lands during the read is sent once, not zero times
   * or twice. A turn in flight gets its reply so far straight after the
   * replay.
   */
  async subscribe(id: string, after: number, listener: (event: DraftStreamEvent) => void): Promise<() => void> {
    this.require(id);
    let lastSent = after;
    let replaying = true;
    const queued: DraftStreamEvent[] = [];
    const forward = (event: DraftStreamEvent): void => {
      if (replaying) {
        queued.push(event);
        return;
      }
      if (event.id !== undefined) {
        if (event.id <= lastSent) return;
        lastSent = event.id;
      }
      listener(event);
    };
    const emitter = this.stream(id);
    emitter.on("event", forward);
    for (const event of await this.events(id)) {
      if (event.seq <= after) continue;
      const streamed = streamEventOf(event);
      if (streamed === null) continue;
      lastSent = event.seq;
      listener(streamed);
    }
    replaying = false;
    for (const event of queued) forward(event);
    const live = this.live.get(id);
    if (live !== undefined) listener({ event: "delta", data: live });
    return () => emitter.off("event", forward);
  }

  /* ------------------------------------------------------------------ */
  /* Create                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * A new conversation: the record, the planner's whole system prompt and its
   * settings file, written once. With `source`, the diagram is checked out and
   * inspected first, which can take a Chromium launch, and its summary is the
   * EXTENDING block.
   */
  async create(input: CreateInput): Promise<{ record: DraftRecord; created: boolean }> {
    const key = input.idempotencyKey?.trim() || null;
    if (key === null) return this.tracked(this.createNew(input, null));
    if (key.length > 200) throw new JobRefused(400, `"idempotencyKey" is over 200 characters`, { field: "idempotencyKey" });
    const existing = [...this.records.values()].find((record) => record.idempotencyKey === key && !this.pruning.has(record.id));
    if (existing !== undefined) return { record: existing, created: false };
    // Reserved before the first await: a second post of the same key while
    // the vocabulary, the corpus or an inspect is being read gets this draft.
    const pending = this.creating.get(key);
    if (pending !== undefined) return { record: (await pending).record, created: false };
    const made = this.tracked(this.createNew(input, key));
    this.creating.set(key, made);
    try {
      return await made;
    } finally {
      this.creating.delete(key);
    }
  }

  private async createNew(input: CreateInput, key: string | null): Promise<{ record: DraftRecord; created: boolean }> {
    // Before any read starts, so a read `drain` has not seen cannot begin.
    if (this.draining) throw new JobRefused(503, "the studio is shutting down", { reason: "shutdown" });
    const source = input.source?.trim() || null;
    const sourceKind: BriefKind = input.sourceKind === undefined || input.sourceKind === null ? "diagram" : (input.sourceKind as BriefKind);
    if (!isBriefKind(sourceKind)) {
      throw new JobRefused(400, `"sourceKind" is diagram or video`, { field: "sourceKind" });
    }
    const kinds = this.plannerKindsNow();
    if (source !== null && sourceKind === "diagram" && !isDiagramName(source)) {
      throw new JobRefused(400, `"${source}" is not a diagram name`, { field: "source" });
    }
    if (source !== null && sourceKind === "video") {
      if (!isDiagramName(source)) throw new JobRefused(400, `"${source}" is not a video slug`, { field: "source" });
      if (!kinds.includes("video")) {
        throw new JobRefused(409, "videos are not available on this machine, so a conversation cannot open on one", {
          reason: "kind-not-in-conversation",
          kind: "video",
        });
      }
    }
    // D65: a hand-off from the concept tutor. It opens on a concept, never on
    // an asset as well, and the tutor's turns come only with it.
    if (input.concept !== undefined && input.concept !== null && source !== null) {
      throw new JobRefused(400, "a conversation opens on a concept or on an asset, not both", { field: "concept" });
    }
    const concept = parseConcept(input.concept);
    const tutor = parseTutor(input.tutor);
    const harness = draftHarness(input.harness);
    const model = draftModel(input.model, harness);
    if (harness === "byok" && resolveByok(await loadByok(), null) === null) {
      throw new JobRefused(400, "BYOK is not set up: the picker's BYOK row takes a provider, an API key and a Default model first", {
        field: "harness",
        reason: "byok-unconfigured",
      });
    }
    if (harness === "codex" && !(await codexSignedIn(process.env))) {
      throw new JobRefused(400, "codex is not signed in: `codex login` once, or an OPENAI_API_KEY in the runner's env", {
        field: "harness",
        reason: "codex-not-signed-in",
      });
    }
    // Any `tutor` at all, an empty list included, names a hand-off: without
    // its concept it is a malformed one, never an ordinary draft.
    if (concept === null && input.tutor !== undefined && input.tutor !== null) {
      throw new JobRefused(400, "tutor turns come with the concept they were about", { field: "tutor" });
    }

    // The corpus and the videos are read beside the vocabulary rather than
    // after it: each is a catalog subprocess, and one after another they
    // were most of the wait between New and a conversation to type into.
    // Neither can reject, so a refusal below leaves nothing unhandled, and
    // `drain` waits for both, since a refusal returns without them.
    const listingRead = this.tracked(listDiagrams().catch(() => null));
    const videosRead = kinds.includes("video") ? this.tracked(readVideoCorpus()) : Promise.resolve(null);

    let vocabulary: Vocabulary;
    try {
      vocabulary = await this.readVocabulary();
    } catch (error) {
      throw vocabularyDown(error);
    }

    let conceptRecord: DraftConcept | null = null;
    let conceptText: string | null = null;
    let tutorText: string | null = null;
    let tutorTurns = 0;
    if (concept !== null) {
      await this.assertConcept(concept.slug);
      const topics = topicsFiling(vocabulary, concept.slug);
      conceptRecord = { slug: concept.slug, title: concept.title, topic: topics[0] ?? null };
      conceptText = conceptBlock({
        slug: concept.slug,
        title: concept.title,
        topic: conceptRecord.topic,
        otherTopics: topics.slice(1),
        summary: concept.summary,
        body: concept.body,
      });
      const told = tutorBlock(tutor);
      tutorText = told.body;
      tutorTurns = told.shown;
    }
    const listing = await listingRead;
    const corpus: CorpusEntry[] = (listing?.diagrams ?? []).map((diagram) => ({
      name: diagram.name,
      title: diagram.title,
      topic: diagram.topic,
      shapes: diagram.shapes,
    }));
    const videos = await videosRead;

    let extending: string | null = null;
    let changing: string | null = null;
    let sourceHash: string | null = null;
    let sourceRevision: number | null = null;
    if (source !== null && sourceKind === "diagram") {
      // The same call an extend job makes before drawing (`execute` in
      // runner.ts): the checkout brought up to the latest revision unless it
      // holds uncommitted edits, so the planner and the job read one file.
      const checkout = await ensureCheckout(source, { canvasOpen: this.runner.canvasOpen(`learn/assets/${source}.tldr`) });
      if (checkout.failed) throw new JobRefused(502, checkout.note);
      if (!checkout.exists) throw new JobRefused(404, `no diagram ${source} in the catalog`, checkout.note);
      const inspected = await canvas(["inspect", checkout.path, "--json"], VERB_TIMEOUT_MS);
      if (inspected.code !== 0 && inspected.code !== 3) {
        throw new JobRefused(502, `${source} would not inspect, so the planner cannot be told what is in it`, {
          exitCode: inspected.code,
        });
      }
      const listed = corpus.find((entry) => entry.name === source);
      extending = drawingSummary(
        { slug: source, title: listed?.title ?? null, topic: listed?.topic ?? null, concepts: [] },
        (inspected.json ?? {}) as InspectReport,
      );
      sourceHash = await documentHashOf(checkout.path);
      sourceRevision = checkout.revision;
    }
    if (source !== null && sourceKind === "video") {
      // Resolved against studio videos only, owner-scoped by the catalog:
      // never a same-slug diagram, which is a different thing to change.
      const shown = await videoShow(source);
      if (!shown.ok) {
        throw new JobRefused(shown.offline ? 503 : 502, `the video ${source} could not be read from the catalog: ${shown.error ?? "no reason given"}`, {
          reason: shown.offline ? "catalog-unreachable" : "catalog",
        });
      }
      const video = (shown.json as { video?: Record<string, unknown> | null } | null)?.video ?? null;
      if (video === null) {
        throw new JobRefused(404, `no studio video ${source}`, { reason: "no-video", source });
      }
      changing = changingSummary({
        slug: source,
        title: typeof video.title === "string" ? video.title : null,
        topic: typeof video.topic === "string" ? video.topic : null,
        durationSeconds: typeof video.durationSeconds === "number" ? video.durationSeconds : null,
        brief: video.brief,
      });
      sourceHash = typeof video.sourceHash === "string" ? video.sourceHash : null;
      sourceRevision = typeof video.revision === "number" ? video.revision : null;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const hash = vocabularyHash(vocabulary.entries);
    const record: DraftRecord = {
      id,
      kind: sourceKind,
      state: "open",
      plannerKinds: kinds,
      conversational: true,
      slots: {},
      sourceKind,
      ownerId: studioOwner(),
      source,
      sourceHash,
      sourceRevision,
      title: null,
      model,
      harness,
      ...(conceptRecord === null ? {} : { concept: conceptRecord, tutorTurns }),
      plannerSessionId: randomUUID(),
      sessionStarted: false,
      transcriptPath: draftTranscriptRef(id),
      brief: null,
      briefAt: null,
      pendingTopic: null,
      turns: 0,
      costUsd: null,
      costSource: null,
      errorKind: null,
      error: null,
      errorField: null,
      idempotencyKey: key ?? `draft:${id}`,
      vocabularyHash: hash,
      firstMessage: null,
      seq: 0,
      inFlight: null,
      undelivered: [],
      spend: [],
      jobIds: [],
      catalogErrors: [],
      createdAt: now,
      updatedAt: now,
    };
    await mkdir(draftTmpDir(id), { recursive: true });
    // The record first, then the prompt, then the transcript: a crash between
    // leaves a draft with no system prompt, which the first turn writes.
    this.records.set(id, record);
    await this.write(id, async () => {
      await this.save(id, {});
      // Atomically, so a crash mid-write never leaves a half prompt the next
      // turn would pass to the CLI as the whole of it.
      await atomicWrite(
        plannerSystemPath(id),
        buildCombinedSystemPrompt({
          kinds,
          vocabulary: vocabulary.entries,
          corpus,
          videos,
          extending,
          changing,
          concept: conceptText,
          tutor: tutorText,
        }),
      );
      await writeFile(plannerSettingsPath(id), `${JSON.stringify(plannerSettings(), null, 1)}\n`, "utf8");
      await this.append(id, {
        type: "created",
        mode: source === null ? "new" : sourceKind === "video" ? "change" : "extend",
        source,
        sourceKind,
        sourceHash,
        sourceRevision,
        plannerKinds: kinds,
        vocabularyHash: hash,
        // The manual a Draw pressed now would start with, for the record.
        manualHash: this.runner.manual?.current()?.hash ?? null,
        corpus: corpus.length,
        corpusStale: listing?.stale ?? true,
        ...(videos === null ? {} : { videos: videos.length }),
        ...(conceptRecord === null ? {} : { concept: conceptRecord, tutorTurns }),
      });
    });
    return { record: this.require(id), created: true };
  }

  /**
   * The concept a hand-off names, resolved as this studio's owner may read it
   * (`learn concept show`, which carries `--owner` from `catalog.ts` as every
   * other catalog read here does): their own note or the commons', never
   * another owner's by the same slug. The slug has already passed
   * `SLUG_PATTERN`, so it can be neither a flag nor a path.
   */
  private async assertConcept(slug: string): Promise<void> {
    const shown = await conceptShow(slug);
    if (shown.ok && typeof shown.json === "object" && shown.json !== null) return;
    if (!shown.ok && shown.offline) {
      throw new JobRefused(503, `the concept ${slug} could not be read from the catalog: ${shown.error ?? "no reason given"}`, {
        reason: "catalog-unreachable",
        field: "concept",
      });
    }
    if (!shown.ok && /no such concept/i.test(shown.error ?? "")) {
      throw new JobRefused(404, `no concept ${slug} that this studio's owner can read`, { reason: "no-concept", field: "concept", slug });
    }
    throw new JobRefused(502, `the concept ${slug} could not be read: ${shown.error ?? "the catalog answered with no note"}`, {
      reason: "catalog",
      field: "concept",
    });
  }

  /* ------------------------------------------------------------------ */
  /* A turn                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * A person's message, with its tags (D57 of docs/STUDIO-MENTIONS.md).
   * Refused with 400 for a mention that does not read `@<kind>` where it says,
   * 409 for a kind this draft's prompt does not carry, 409 while a turn is in
   * flight or a press is being made, 422 at the turn cap, 429 over the daily
   * cap, and 503 when every planner slot is busy. Accepted while a job of any
   * kind runs (C14 lifted by D60). Otherwise the message is on disk before this
   * returns, and the turn runs on.
   */
  async send(id: string, rawText: unknown, rawMentions?: unknown, options: { make?: boolean } = {}): Promise<{ seq: number }> {
    const record = this.require(id);
    const raw = typeof rawText === "string" ? rawText : "";
    const parsed = parseMentions(raw, rawMentions);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text === "") throw new JobRefused(400, `"text" is required: a message with nothing in it`, { field: "text" });
    // Positions against the text as stored: the leading whitespace trimmed off.
    const mentions: Mention[] = parsed.map((mention) => ({ ...mention, start: mention.start - lead, end: mention.end - lead }));
    const kinds = plannerKindsOf(record);
    for (const mention of mentions) {
      if (!kinds.includes(mention.kind)) {
        throw new JobRefused(409, `this conversation's planner cannot make ${mention.kind === "svg" ? "an" : "a"} ${mention.kind}: start a new conversation to make one`, {
          reason: "kind-not-in-conversation",
          kind: mention.kind,
        });
      }
    }
    // T15, except on a draft opened on a concept, where a bare tag means "of
    // this concept" (H8 of docs/STUDIO-TUTOR-HANDOFF.md).
    if (mentions.length > 0 && record.turns === 0 && record.concept == null && withoutMentions(text, mentions).trim() === "") {
      throw new JobRefused(400, "Say what it should show: a tag alone needs a conversation to make it from", { field: "text" });
    }
    if (record.turns >= PLANNER_TURNS) {
      throw new JobRefused(422, `This conversation has reached its ${PLANNER_TURNS}-turn limit.`, {
        reason: "turn-cap",
        turns: record.turns,
        turnCap: PLANNER_TURNS,
      });
    }
    if (record.state === "abandoned") {
      throw new JobRefused(409, "this conversation was closed. Start a new one.", { reason: "abandoned" });
    }
    if (record.inFlight !== null || this.turnsInFlight.has(id)) {
      throw new JobRefused(409, "the planner is still answering the last message", { reason: "in-flight" });
    }
    if (this.draws.has(id)) {
      throw new JobRefused(409, "Draw was just pressed on this conversation; wait for it to be queued", {
        reason: "draw-in-progress",
      });
    }
    // The job cap's own refusal, body and all: spend is spend (D36).
    this.runner.assertUnderCap();
    if (this.turnsInFlight.size >= PLANNER_CONCURRENCY) {
      throw new JobRefused(503, `every planner slot is busy (${PLANNER_CONCURRENCY}); try again in a few seconds`, {
        reason: "planner-busy",
        concurrency: PLANNER_CONCURRENCY,
      });
    }
    if (this.draining) throw new JobRefused(503, "the studio is shutting down", { reason: "shutdown" });

    const tags = mentions.map((mention) => mention.kind);
    let seq = 0;
    const turn = this.write(id, async () => {
      const message = await this.append(id, {
        type: "message",
        text,
        ...(mentions.length === 0 ? {} : { mentions, tags }),
      });
      seq = message.seq;
      const current = this.require(id);
      // A tag orders a brief, and the order stands until a brief of it lands,
      // a newer tag moves it, the person stops waiting, or it is refused twice
      // (D57). A draft from before tags reads every message as tagged Diagram.
      // `svg` orders no brief: the reply itself is the picture (D105).
      const asked: BriefKind[] = current.conversational === true ? tags.filter(isBriefKind) : ["diagram"];
      let slots = current.slots ?? {};
      for (const kind of asked) {
        const slot = slots[kind] ?? emptySlot();
        slots = {
          ...slots,
          [kind]: {
            ...slot,
            ...(current.conversational === true
              ? { waiting: { requestSeq: message.seq, ...(options.make === true ? { make: true } : {}) } }
              : {}),
            // Another diagram after a finished one opens its slot again.
            ...(slot.state === "done" ? { state: "open" as const } : {}),
          },
        };
      }
      await this.save(id, {
        turns: current.turns + 1,
        inFlight: { turn: message.seq, startedAt: message.at },
        ...(current.firstMessage === undefined || current.firstMessage === null ? { firstMessage: listLine(text) } : {}),
        errorKind: null,
        error: null,
        errorField: null,
        errorBriefKind: null,
        slots,
      });
    });
    // Registered synchronously, so a second message in the same tick is 409.
    const whole = turn
      .then(() => this.converse(id, seq, text, tags, options.make === true))
      .catch(async (error: unknown) => {
        await this.write(id, () =>
          this.recordError(id, "agent", `the studio failed while running this turn: ${(error as Error).message}`),
        );
      })
      .finally(async () => {
        this.live.delete(id);
        await this.write(id, () => this.save(id, { inFlight: null })).catch(() => undefined);
        this.turnsInFlight.delete(id);
        // D107: consent and trust spend on landing — the briefs this turn
        // earned a launch for draw now that `inFlight` is cleared.
        await this.flushLaunch(id, seq);
        this.maybeCapTurns(id);
      });
    this.turnsInFlight.set(id, whole);
    await turn;
    return { seq };
  }

  /** Resolves once the draft's current turn, and every write it queued, has landed. */
  async settled(id: string): Promise<void> {
    await this.turnsInFlight.get(id);
    await this.launching.get(id);
    await this.chains.get(id);
    await this.mirroring.get(id)?.done;
  }

  /** The turn cap reached with no brief to draw: the conversation is closed (E4). */
  private maybeCapTurns(id: string): void {
    const record = this.records.get(id);
    if (record === undefined || record.turns < PLANNER_TURNS || record.state !== "open") return;
    void this.write(id, async () => {
      await this.append(id, { type: "abandoned", by: "turn-cap" });
      await this.save(id, { state: "abandoned" });
    }).catch(() => undefined);
  }

  private async recordError(id: string, kind: DraftErrorKind, message: string, field?: string, briefKind?: BriefKind): Promise<void> {
    await this.append(id, {
      type: "error",
      kind,
      message,
      ...(field === undefined ? {} : { field }),
      ...(briefKind === undefined ? {} : { briefKind }),
    });
    await this.save(id, { errorKind: kind, error: message.slice(0, 1_000), errorField: field ?? null, errorBriefKind: briefKind ?? null });
  }

  /**
   * One person turn (D57, D61): the planner's reply, then a verdict on each
   * brief of a kind the message tagged or that is still waiting, with one
   * shared retry for the refused ones.
   */
  private async converse(id: string, turn: number, text: string, tags: TagKind[], make: boolean): Promise<void> {
    await this.tellVocabularyChanges(id);
    const record = this.require(id);
    const conversational = record.conversational === true;
    const kinds = plannerKindsOf(record);
    // D108: kinds the person has allowed without asking. One is briefed
    // unprompted — announced in prose — and its job launches on validation.
    const trusted = (record.trust ?? []).filter((kind) => kinds.includes(kind));
    // `tagged` is every tag the message carried, for the TAGS block the
    // planner reads; only the brief kinds ever open a slot, wait or judge
    // (D105: `svg` is answered by the reply itself).
    const briefKinds = kinds.filter(isBriefKind);
    const tagged: TagKind[] = conversational ? tags : ["diagram"];
    const taggedBriefs = tagged.filter(isBriefKind);
    const waiting = conversational
      ? briefKinds
          .filter((kind) => !taggedBriefs.includes(kind) && slotOf(record, kind).waiting !== null)
          .sort((a, b) => slotOf(record, a).waiting!.requestSeq - slotOf(record, b).waiting!.requestSeq)
      : [];
    // D107: a waiting request its message marked `make` stays approved while
    // the planner clarifies — the consent was for the request, not the turn.
    const approved = conversational
      ? briefKinds.filter((kind) => slotOf(record, kind).waiting?.make === true)
      : [];
    const edits = briefKinds.map((kind) => slotOf(record, kind).pendingEdit?.text ?? null).filter((note): note is string => note !== null);
    // V11: the video brief in force, weighed for abbreviations as it stands
    // now, so a brief replaced since it was proposed is never described.
    const abbreviations = briefKinds.includes("video") ? abbreviationCheck(slotOf(record, "video")) : null;
    const notes = [...record.undelivered, ...edits, ...(abbreviations?.note == null ? [] : [abbreviations.note])];
    // D109: the offers the person declined, so the same one is not re-made.
    const declined = (record.declined ?? []).map((offer) => `${offer.kind}${offer.pitch === null ? "" : `: ${offer.pitch}`}`);
    const blocks = [
      ...(waiting.length > 0 ? [fence("WAITING", waiting.join("\n"))] : []),
      ...(conversational && tagged.length > 0 ? [fence("TAGS", tagged.join("\n"))] : []),
      ...(conversational && trusted.length > 0 ? [fence("TRUSTED", trusted.join("\n"))] : []),
      ...(conversational && declined.length > 0 ? [fence("DECLINED", declined.join("\n"))] : []),
    ];
    const prompt = [...notes.map(studioMessage), ...blocks, text].join("\n\n");
    const delivered = {
      undelivered: [...record.undelivered],
      edits: Object.fromEntries(briefKinds.map((kind) => [kind, slotOf(record, kind).pendingEdit?.text ?? null])) as Partial<Record<BriefKind, string | null>>,
      abbreviations: abbreviations?.told ?? null,
    };
    const abbreviationNote = abbreviations?.note ?? null;
    if (abbreviationNote !== null) {
      // On the record, hidden from the person, whose card already carries the
      // warning, and from a replay (C3), as the retry instruction is.
      await this.write(id, () =>
        this.append(id, { type: "studio", text: abbreviationNote, internal: true, kind: "video", abbreviations: abbreviations!.listed }),
      );
    }

    const first = await this.speak(id, turn, prompt, false);
    // Only a turn that answered has heard its notes. A refused, timed-out or
    // cut-off turn leaves them queued for the next one: told twice is better
    // than never told.
    if (first === null) return;
    const toldMoved =
      abbreviations !== null && JSON.stringify(abbreviations.told) !== JSON.stringify(slotOf(record, "video").abbreviationsTold ?? []);
    if (notes.length > 0 || toldMoved) await this.write(id, () => this.clearDelivered(id, delivered));
    const asked = briefKinds.filter((kind) => taggedBriefs.includes(kind) || waiting.includes(kind));
    // D108: a trusted kind briefed unprompted is judged like a tagged one;
    // a brief of any other unasked kind stays ignored (T24).
    const unprompted = conversational
      ? trusted.filter((kind) => !asked.includes(kind) && briefBlocks(first.text).some((block) => block.kind === kind))
      : [];
    const judged = await this.judgeReply(first.text, [...asked, ...unprompted], conversational, record.concept);
    const refused = await this.write(id, () =>
      this.settleReply(id, { replySeq: first.seq, messageSeq: turn, tagged: taggedBriefs, judged, hold: first.hold, retry: false }),
    );
    // D107: a consented tag's brief and a trusted kind's unprompted one
    // launch their job once the turn closes; a person's own tag still waits
    // on its press. Only the brief this reply landed may launch: a request
    // stopped or a trust revoked while the planner answered left the older
    // brief in force, and this consent never covered it.
    const settled = this.require(id);
    for (const [kind, verdict] of judged.verdicts) {
      if (verdict.kind !== "valid" || slotOf(settled, kind).briefSeq !== first.seq) continue;
      if (unprompted.includes(kind)) this.pendingLaunchFor(id).set(kind, "trust");
      else if ((make && taggedBriefs.includes(kind)) || approved.includes(kind)) this.pendingLaunchFor(id).set(kind, "consent");
    }
    if (refused.length === 0) return;

    // Refusals are counted per waiting request, not per turn (the #207
    // review): a retry answered with no brief leaves the request waiting, and
    // without a count every later untagged turn would pay for another retry.
    // The second refusal of one request is E6, retried or not.
    const canRetry = this.require(id).turns < PLANNER_TURNS && this.records.get(id)?.state !== "abandoned";
    const toRetry: typeof refused = [];
    await this.write(id, async () => {
      for (const verdict of refused) {
        const current = this.require(id);
        const waitingFor = slotOf(current, verdict.kind).waiting;
        const refusals = (waitingFor?.refusals ?? 0) + 1;
        if (conversational && waitingFor !== null) {
          await this.save(id, withSlot(current, verdict.kind, { waiting: { ...waitingFor, refusals } }));
        }
        const retried = canRetry && (!conversational || refusals < 2);
        if (retried) toRetry.push(verdict);
        await this.append(id, {
          type: "brief-invalid",
          replySeq: first.seq,
          kind: verdict.kind,
          field: verdict.field,
          message: verdict.message,
          retried,
        });
        if (!retried) await this.refusedTwice(id, verdict);
      }
    });
    if (toRetry.length === 0) return;

    const instruction = conversational
      ? `Your ${toRetry.length === 1 ? `${toRetry[0]!.kind} brief was` : "briefs were"} refused:\n` +
        toRetry.map((verdict) => `- ${verdict.kind}, ${verdict.field}: ${verdict.message}`).join("\n") +
        `\nFix exactly that and send ${toRetry.length === 1 ? "that whole brief" : "each of those whole briefs"} again, ` +
        `with its topic block again when it names a new topic, one or two lines above it, and no other brief. ${RETRY_REPLY_RULE}`
      : `Your brief was refused. ${toRetry[0]!.field}: ${toRetry[0]!.message}\n` +
        `Fix exactly that and send the whole brief again, with the same summary above it. ${RETRY_REPLY_RULE}`;
    await this.write(id, async () => {
      await this.append(id, { type: "studio", text: instruction, internal: true, replySeq: first.seq });
      // The automatic retry counts as a turn (the doc's cost table), however many briefs it fixes.
      await this.save(id, { turns: this.require(id).turns + 1 });
    });
    const second = await this.speak(id, turn, studioMessage(instruction), true);
    if (second === null) return;
    // Read for the refused kinds only: a brief of a kind that already passed
    // is ignored, so the retry cannot replace a card the person is reading.
    const again = await this.judgeReply(
      second.text,
      toRetry.map((verdict) => verdict.kind),
      conversational,
      record.concept,
    );
    await this.write(id, async () => {
      const stillRefused = await this.settleReply(id, {
        replySeq: second.seq,
        messageSeq: turn,
        tagged: taggedBriefs.filter((kind) => toRetry.some((verdict) => verdict.kind === kind)),
        judged: again,
        hold: null,
        retry: true,
      });
      const corrected = this.require(id);
      for (const [kind, verdict] of again.verdicts) {
        if (verdict.kind !== "valid" || slotOf(corrected, kind).briefSeq !== second.seq) continue;
        if (unprompted.includes(kind)) this.pendingLaunchFor(id).set(kind, "trust");
        else if ((make && taggedBriefs.includes(kind)) || approved.includes(kind)) this.pendingLaunchFor(id).set(kind, "consent");
      }
      for (const verdict of stillRefused) {
        await this.append(id, {
          type: "brief-invalid",
          replySeq: second.seq,
          kind: verdict.kind,
          field: verdict.field,
          message: verdict.message,
          retried: false,
        });
        await this.refusedTwice(id, verdict);
      }
    });
  }

  /**
   * Take the notes a turn carried off the queue, and only those: a note
   * queued while the turn ran (a job's verdict, a later edit) stays for the
   * next one. The video brief's abbreviations as the turn weighed them become
   * what the planner was told; a brief that changed while it ran is weighed
   * again at the next turn.
   */
  private async clearDelivered(
    id: string,
    delivered: { undelivered: string[]; edits: Partial<Record<BriefKind, string | null>>; abbreviations?: string[] | null },
  ): Promise<void> {
    const current = this.require(id);
    const left = [...current.undelivered];
    for (const note of delivered.undelivered) {
      const at = left.indexOf(note);
      if (at !== -1) left.splice(at, 1);
    }
    let patch: Partial<DraftRecord> = { undelivered: left };
    for (const kind of BRIEF_KINDS) {
      const edit = slotOf(current, kind).pendingEdit;
      if (edit !== null && edit.text === delivered.edits[kind]) {
        patch = { ...patch, ...withSlot({ ...current, ...patch }, kind, { pendingEdit: null }) };
      }
    }
    if (delivered.abbreviations != null) {
      patch = { ...patch, ...withSlot({ ...current, ...patch }, "video", { abbreviationsTold: delivered.abbreviations }) };
    }
    await this.save(id, patch);
  }

  /** E6: the second refusal of a kind's brief is shown, not retried, and that kind stops waiting. */
  private async refusedTwice(id: string, verdict: { kind: BriefKind; field: string; message: string }): Promise<void> {
    const conversational = this.require(id).conversational === true;
    await this.recordError(
      id,
      "brief-invalid",
      conversational
        ? `The planner's ${verdict.kind} brief did not pass the studio's checks twice. ${verdict.field}: ${verdict.message}`
        : `The planner's brief did not pass the studio's checks twice. ${verdict.field}: ${verdict.message}`,
      verdict.field,
      conversational ? verdict.kind : undefined,
    );
    const now = this.require(id);
    const slot = slotOf(now, verdict.kind);
    await this.save(
      id,
      withSlot(now, verdict.kind, {
        waiting: null,
        ...(slot.state === "briefed" && slot.briefBy !== "person" ? { state: "open" as const } : {}),
      }),
    );
  }

  /**
   * One reply's verdicts, applied (D60, D61). Returns the refused briefs, for
   * the caller to retry or show. Call inside `write`.
   *
   * - A kind neither tagged by the message nor waiting was never judged: its
   *   brief is recorded as `brief-ignored` (T24).
   * - A `hold` puts each named live card on hold, unless the same reply
   *   replaces it.
   * - A kind whose waiting was stopped while the turn ran is dropped too: the
   *   person said they no longer want it.
   * - A tagged kind with no brief in the reply ends a planner's brief of that
   *   kind, and stays waiting ("Which briefs a reply ends").
   */
  private async settleReply(
    id: string,
    input: {
      replySeq: number;
      messageSeq: number;
      tagged: BriefKind[];
      judged: { verdicts: Map<BriefKind, KindVerdict>; ignored: string[] };
      hold: { kinds: BriefKind[]; reason: string } | null;
      retry: boolean;
    },
  ): Promise<{ kind: BriefKind; field: string; message: string }[]> {
    const record = this.require(id);
    if (record.state === "abandoned") return [];
    const conversational = record.conversational === true;
    for (const kind of input.judged.ignored) {
      await this.append(id, { type: "brief-ignored", replySeq: input.replySeq, kind });
    }
    if (input.hold !== null) {
      const now = new Date().toISOString();
      let patch: Partial<DraftRecord> = {};
      for (const kind of input.hold.kinds) {
        if (input.judged.verdicts.get(kind)?.kind === "valid") continue;
        patch = { ...patch, ...withSlot({ ...record, ...patch }, kind, { held: { reason: input.hold.reason, at: now, replySeq: input.replySeq } }) };
      }
      if (patch.slots !== undefined) await this.save(id, patch);
    }
    const refused: { kind: BriefKind; field: string; message: string }[] = [];
    for (const [kind, verdict] of input.judged.verdicts) {
      const current = this.require(id);
      const slot = slotOf(current, kind);
      // D108: a trusted kind's unprompted brief needs no waiting request — but
      // only one nobody asked for. A tag whose waiting was stopped still
      // drops, trusted or not, and trust is read as it stands now: a revoke
      // while the planner answered keeps the spend from landing.
      const trustedNow = !input.tagged.includes(kind) && (current.trust ?? []).includes(kind);
      if (conversational && slot.waiting === null && !trustedNow) {
        await this.append(id, { type: "brief-ignored", replySeq: input.replySeq, kind, reason: "stopped-waiting" });
        continue;
      }
      if (verdict.kind === "invalid") {
        refused.push({ kind, field: verdict.field, message: verdict.message });
        continue;
      }
      const requestSeq = slot.waiting?.requestSeq ?? input.messageSeq;
      await this.append(id, {
        type: "brief",
        replySeq: input.replySeq,
        kind,
        brief: verdict.brief,
        pendingTopic: verdict.pendingTopic,
        requestSeq,
      });
      await this.save(
        id,
        withSlot(current, kind, {
          brief: verdict.brief,
          briefAt: new Date().toISOString(),
          briefSeq: input.replySeq,
          briefBy: "planner",
          pendingTopic: verdict.pendingTopic,
          requestSeq,
          waiting: null,
          held: null,
          // A job in flight keeps the slot at `drawing`; the new brief is
          // what the next press makes once that job is over.
          state: slot.state === "drawing" ? "drawing" : "briefed",
        }),
      );
    }
    for (const kind of input.tagged) {
      if (input.judged.verdicts.has(kind)) continue;
      // A reply that asks rather than proposes leaves no planner brief of the
      // kind it was asked for in force; the last one stays on the slot, for
      // "Fill the brief myself". A brief the person edited stays in force.
      const current = this.require(id);
      const slot = slotOf(current, kind);
      if (slot.state === "briefed" && slot.briefBy !== "person") await this.save(id, withSlot(current, kind, { state: "open" }));
    }
    return refused;
  }

  /**
   * The verdict on each brief a reply carries, for the kinds asked for
   * (tagged or waiting); every other kind is ignored, never judged. A draft
   * from before D61 is judged as it was: its last `brief` block, a diagram.
   */
  private async judgeReply(
    text: string,
    asked: readonly BriefKind[],
    conversational: boolean,
    concept?: DraftConcept | null,
  ): Promise<{ verdicts: Map<BriefKind, KindVerdict>; ignored: string[] }> {
    const verdicts = new Map<BriefKind, KindVerdict>();
    const ignored: string[] = [];
    const wanted: { kind: BriefKind; body: string }[] = [];
    if (!conversational) {
      const body = fencedLast(text);
      if (body !== null) wanted.push({ kind: "diagram", body });
    } else {
      for (const block of briefBlocks(text)) {
        if (isBriefKind(block.kind) && asked.includes(block.kind)) wanted.push({ kind: block.kind, body: block.body });
        else ignored.push(block.kind);
      }
    }
    if (wanted.length === 0) return { verdicts, ignored };
    let vocabulary: Vocabulary;
    try {
      vocabulary = await this.readVocabulary();
    } catch (error) {
      for (const { kind } of wanted) {
        verdicts.set(kind, { kind: "invalid", field: "topic", message: `the topic list cannot be read: ${(error as Error).message}` });
      }
      return { verdicts, ignored };
    }
    const topics = {
      dryRun: async (entry: Parameters<typeof topicAddDryRun>[0]) => {
        const result = await topicAddDryRun(entry);
        const said = (result.json as { error?: unknown } | null)?.error;
        return { ...result, error: typeof said === "string" ? said : result.error };
      },
    };
    // D66: a concept draft's `source` and `concepts`, filled before the validator runs.
    const prepare = (raw: Record<string, unknown>, against: Vocabulary): Record<string, unknown> => withConcept(raw, concept, against);
    for (const { kind, body } of wanted) verdicts.set(kind, await evaluateBrief(kind, body, text, vocabulary, topics, prepare));
    return { verdicts, ignored };
  }

  /**
   * C4: topics added, changed or archived since the planner last heard. Its
   * system prompt stays as it was written (the CLI replays the recorded one on
   * every resume), so the change reaches it as a STUDIO note at the head of
   * this turn, and the vocabulary it was told of is kept beside the prompt as
   * the next comparison's baseline. A read that fails tells nothing: Draw
   * still checks the brief against the vocabulary as it is.
   */
  private async tellVocabularyChanges(id: string): Promise<void> {
    let vocabulary: Vocabulary;
    try {
      vocabulary = await this.recentVocabulary(turnVocabularyMs());
    } catch {
      return;
    }
    const hash = vocabularyHash(vocabulary.entries);
    if (hash === this.require(id).vocabularyHash) return;
    const told =
      (await readFile(vocabularyToldPath(id), "utf8").catch(() => null)) ??
      (await readFile(plannerSystemPath(id), "utf8").catch(() => null));
    const now = vocabularyBlock(vocabulary.entries);
    const change = told === null ? null : vocabularyChange(told, now);
    await this.write(id, async () => {
      // The note first, then the baseline: a crash between the two tells the
      // planner twice rather than not at all.
      if (change?.note) await this.note(id, change.note);
      const complete = change === null || change.complete;
      await atomicWrite(vocabularyToldPath(id), `${complete ? now : change.baseline}\n`);
      // A capped note leaves the baseline short of the catalog, so the hash
      // cannot match and the next turn tells the rest.
      await this.save(id, { vocabularyHash: complete ? hash : `partial:${hash}` });
    });
  }

  /** `work` (a create or a read), held in `readsInFlight` until it settles. */
  private tracked<T>(read: Promise<T>): Promise<T> {
    this.readsInFlight.add(read);
    void read.finally(() => this.readsInFlight.delete(read)).catch(() => undefined);
    return read;
  }

  /** The vocabulary, read at most `maxAgeMs` ago by this service, or read now. */
  private async recentVocabulary(maxAgeMs: number): Promise<Vocabulary> {
    const last = this.lastVocabulary;
    if (last !== null && Date.now() - last.at < maxAgeMs) return last.value;
    return this.readVocabulary();
  }

  /** Read the vocabulary and remember it for `recentVocabulary`. */
  private async readVocabulary(): Promise<Vocabulary> {
    const value = await loadVocabulary();
    this.lastVocabulary = { at: Date.now(), value };
    return value;
  }

  /**
   * One planner process: spawn, stream, and write down what came of it.
   * Returns the reply's seq and text, or null when there is no reply to judge
   * (the request was refused, the turn timed out, the seals did not hold, or
   * the draft was abandoned under it).
   */
  private async speak(
    id: string,
    turn: number,
    prompt: string,
    retry: boolean,
  ): Promise<{ seq: number; text: string; hold: { kinds: BriefKind[]; reason: string } | null } | null> {
    let outcome = await this.spawnOnce(id, turn, prompt, retry);

    // C3: the stored session cannot be resumed. A fresh session is given the
    // conversation so far as data, and told so, once.
    const record = this.require(id);
    if (
      outcome !== null &&
      record.sessionStarted &&
      outcome.run.init === null &&
      outcome.run.stopReason === null &&
      !outcome.run.spawnFailed &&
      outcome.run.text === "" &&
      outcome.run.exitCode !== 0
    ) {
      const history = await this.events(id);
      await this.write(id, async () => {
        await this.save(id, { plannerSessionId: randomUUID(), sessionStarted: false });
        await this.note(
          id,
          "The planner's earlier session could not be resumed, so it was given this conversation so far and started a new one.",
          { deliver: false },
        );
      });
      const replayed = [
        // The turn's own message is in the prompt below on a first attempt,
        // so it is left out here rather than sent twice; the automatic retry's
        // prompt is only the instruction, so there the message stays.
        fence("CONVERSATION", replayOf(conversationEntries(history, retry ? null : turn), REPLAY_LIMIT)),
        "The block above is this conversation so far, as data. Carry on from it.",
        prompt,
      ].join("\n\n");
      outcome = await this.spawnOnce(id, turn, replayed, retry);
    }
    if (outcome === null) {
      if (this.draining) {
        await this.write(id, () => this.recordError(id, "interrupted", "The studio stopped before the planner answered."));
      }
      return null;
    }
    const { run, cost } = outcome;

    if (run.stopReason === "abandoned") return null;
    if (run.spawnFailed) {
      await this.write(id, () => this.recordError(id, "agent", `the planner never started: ${run.stderr}`));
      return null;
    }
    if (run.sealBroken !== null) {
      await this.write(id, () => this.recordError(id, "agent", `${run.sealBroken}, so the turn was stopped before its reply.`));
      return null;
    }
    if (run.stopReason === "turn-timeout" || run.stopReason === "idle-timeout" || run.stopReason === "shutdown") {
      const why =
        run.stopReason === "idle-timeout"
          ? "the planner went quiet for too long"
          : run.stopReason === "shutdown"
            ? "the studio stopped"
            : "the planner took too long";
      await this.write(id, async () => {
        await this.append(id, { type: "reply", turn, text: run.text, interrupted: true, ...cost });
        await this.recordError(id, run.stopReason === "shutdown" ? "interrupted" : "timeout", `The reply was cut off: ${why}.`);
      });
      return null;
    }
    if (run.text !== "" && (run.isError || run.exitCode !== 0)) {
      // The session failed after saying something: whatever streamed is shown
      // as cut off, and no brief is read out of a reply that did not finish.
      await this.write(id, async () => {
        await this.append(id, { type: "reply", turn, text: run.text, interrupted: true, ...cost });
        await this.recordError(
          id,
          "agent",
          run.result ?? (run.stderr || `the planner's session failed (${run.subtype ?? `exit ${run.exitCode ?? run.signal}`})`),
        );
      });
      return null;
    }
    if (run.text === "") {
      // E1: the first request was refused, or the session ended with nothing
      // to say. The API's own sentence is the one a person can act on.
      await this.write(id, () =>
        this.recordError(
          id,
          "agent",
          run.result ?? (run.stderr || `the planner's session ended with no reply (${run.subtype ?? `exit ${run.exitCode}`})`),
        ),
      );
      return null;
    }
    return this.write(id, async () => {
      // A conversational draft's reply may end with a `suggest` and a `hold`
      // block (D58, D60): read, checked, and stripped from what a person
      // reads. A retry answers a refusal, so its offers are not read.
      const current = this.require(id);
      const conversational = current.conversational === true;
      const kinds = plannerKindsOf(current);
      const live = kinds.filter(isBriefKind).filter((kind) => {
        const slot = slotOf(current, kind);
        return slot.brief !== null && (slot.state === "briefed" || slot.state === "drawing");
      });
      const suggested = conversational && !retry ? readSuggest(run.text, kinds) : null;
      const hold = conversational && !retry ? readHold(run.text, live) : null;
      const shown = conversational ? stripFencedBlocks(run.text, ["suggest", "hold"]) : run.text;
      const reply = await this.append(id, {
        type: "reply",
        turn,
        text: shown,
        ...cost,
        ...(retry ? { retry: true } : {}),
        ...(suggested !== null && suggested.kinds.length > 0 ? { suggest: suggested.kinds, pitch: suggested.line } : {}),
        ...(hold === null ? {} : { hold }),
      });
      return { seq: reply.seq, text: run.text, hold };
    });
  }

  /** Spawn and wait. Records the turn's spend whatever happened. */
  private async spawnOnce(
    id: string,
    turn: number,
    prompt: string,
    retry: boolean,
  ): Promise<{ run: PlannerOutcome; cost: { costUsd: number | null; costSource: CostSource | null } } | null> {
    const record = this.require(id);
    // Every spawn asks, the retry and the C3 respawn included: a shutdown
    // that began between two spawns of one turn must not start a paid one.
    if (record.state === "abandoned" || this.draining) return null;
    const startedAt = new Date().toISOString();
    // The draft's harness (the pane picker's pick): absent is `claude`. BYOK
    // spawns `qwen` on the configured key; a draft made before the key was
    // cleared reports the way a missing binary does. Codex is `codex exec` on
    // the owner's codex login, checked the same way at pick time.
    const harness = record.harness ?? "claude";
    const byok = harness === "byok" ? resolveByok(await loadByok(), record.model ?? null) : null;
    if (harness === "byok" && byok === null) {
      return {
        run: {
          exitCode: null,
          signal: null,
          text: "",
          result: null,
          isError: true,
          subtype: null,
          turns: null,
          init: null,
          stopReason: null,
          sealBroken: null,
          spawnFailed: true,
          stderr: "BYOK is not set up: the picker's BYOK row takes a provider and an API key first",
        },
        cost: { costUsd: null, costSource: null },
      };
    }
    // The conversation's own pick (D90), else the runner's `STUDIO_PLANNER_MODEL`.
    // A BYOK turn runs the provider's model, which only `byok.json` names; a
    // codex turn takes its login's model — the pick names claude's, so the
    // marker records what ran.
    const model = byok !== null ? byok.model : harness === "codex" ? (record.model ?? "codex") : (record.model ?? plannerModel());
    const marker: TurnMarker = { type: "studio-turn", turn, at: startedAt, model, ...(retry ? { retry: true } : {}) };
    let logChain: Promise<void> = appendFile(draftSessionLogPath(id), `${JSON.stringify(marker)}\n`, "utf8");
    const meter = new JobCostMeter(model);
    const systemPrompt = await readFile(plannerSystemPath(id), "utf8").catch(() => null);
    if (systemPrompt === null) {
      // A crash between the record and the prompt at creation: write it now,
      // from what the studio knows today. A concept draft's note and tutor
      // turns were never kept, so its CONCEPT block says so; the job agent
      // still reads the whole note through the brief's `source` (H17).
      const vocabulary = await loadVocabulary();
      const concept = record.concept ?? null;
      const rewritten =
        record.conversational === true
          ? buildCombinedSystemPrompt({
              kinds: plannerKindsOf(record),
              vocabulary: vocabulary.entries,
              corpus: [],
              videos: [],
              concept:
                concept === null
                  ? null
                  : conceptBlock({ slug: concept.slug, title: concept.title, topic: concept.topic, missing: "(the note was not kept)" }),
            })
          : buildSystemPrompt({ vocabulary: vocabulary.entries, corpus: [] });
      await atomicWrite(plannerSystemPath(id), rewritten);
      await writeFile(plannerSettingsPath(id), `${JSON.stringify(plannerSettings(), null, 1)}\n`, "utf8");
    }
    const systemPromptFile = path.resolve(plannerSystemPath(id));
    const argv =
      harness === "codex"
        ? codexPlannerArgv({ sessionId: record.plannerSessionId, resume: record.sessionStarted, systemPromptFile, model: record.model ?? null })
        : byok === null
          ? plannerArgv({
              // The file, never its text: nothing in the prompt is ever an argv element.
              systemPromptFile,
              settingsFile: plannerSettingsPath(id),
              sessionId: record.plannerSessionId,
              resume: record.sessionStarted,
              model,
            })
          : qwenPlannerArgv({ sessionId: record.plannerSessionId, resume: record.sessionStarted, model });
    let env: NodeJS.ProcessEnv | undefined;
    if (byok !== null) {
      // Qwen's seals are flags and env, not a settings file: `--safe-mode` and
      // `--exclude-tools` on its argv, and `byokEnv` seals HOME so the owner's
      // own qwen config and logins never reach the spawn.
      await mkdir(draftTmpDir(id), { recursive: true });
      env = byokEnv(process.env, byok, draftTmpDir(id), systemPromptFile);
    } else if (harness === "codex") {
      // Codex's seal is the env: a draft-owned `CODEX_HOME` holding only the
      // login's `auth.json` as a symlink, `HOME` sealed beside it, and the
      // argv's `read-only`/`never`-approve config (`codexPlannerArgv`).
      await mkdir(draftTmpDir(id), { recursive: true });
      const sealed = await sealCodexHome(draftTmpDir(id), process.env);
      env = codexEnv(process.env, draftTmpDir(id), sealed.home, { keepKey: !sealed.linked });
    }
    const live = { turn, text: "" };
    this.live.set(id, live);
    const run = startPlanner({
      argv,
      prompt,
      cwd: draftDir(id),
      auth: agentAuth(),
      tmp: draftTmpDir(id),
      ...(byok !== null
        ? { bin: QWEN_BIN, env }
        : harness === "codex"
          ? { bin: CODEX_BIN, env, format: "codex" as const }
          : {}),
      onLine: (line) => {
        meter.observe(line);
        logChain = logChain.then(() => appendFile(draftSessionLogPath(id), `${line}\n`, "utf8")).catch(() => undefined);
      },
      onDelta: (text) => {
        live.text = text;
        this.publish(id, { event: "delta", data: { turn, text } });
      },
      onInit: (init) => {
        const current = this.require(id);
        const patch: { sessionStarted?: boolean; plannerSessionId?: string } = {};
        if (!current.sessionStarted) patch.sessionStarted = true;
        // A codex spawn ignores the minted id and mints a `thread_id` itself;
        // what its init reports is what the next turn's `resume` takes.
        if (init.sessionId !== null && init.sessionId !== current.plannerSessionId) patch.plannerSessionId = init.sessionId;
        if (patch.sessionStarted === true || patch.plannerSessionId !== undefined) {
          void this.write(id, () => this.save(id, patch)).catch(() => undefined);
        }
      },
    });
    this.running.set(id, run);
    let outcome: PlannerOutcome;
    try {
      outcome = await run.done;
    } finally {
      this.running.delete(id);
    }
    await logChain;
    const reading = meter.read();
    const spend: TurnSpend = {
      turn,
      startedAt,
      finishedAt: new Date().toISOString(),
      costUsd: reading.usd,
      costSource: reading.source,
    };
    await this.write(id, async () => {
      const current = this.require(id);
      const nextSpend = [...current.spend, spend];
      await this.save(id, { spend: nextSpend, ...sumCost(nextSpend) });
    });
    return { run: outcome, cost: { costUsd: reading.usd, costSource: reading.source } };
  }

  /* ------------------------------------------------------------------ */
  /* Draw, Make video, Make both                                        */
  /* ------------------------------------------------------------------ */

  /**
   * A press (D60): `{ idempotencyKey, kind? }` for one card, `kind` defaulting
   * to `diagram` for a web app from before; or `{ items: [{ kind,
   * idempotencyKey }, ...] }` for Make both. Each card stands alone: its own
   * key, its own refusal, its own job. A pending topic both cards name is
   * created once, and a topic that fails refuses only the cards that name it.
   *
   * One card answers as its press always did, refusal thrown. Make both
   * answers one entry per item, each what that card's own press would have
   * answered. A repeated key returns the job it already started and tries
   * only what has not.
   */
  async draw(id: string, input: unknown): Promise<DrawAnswer> {
    const record = this.require(id);
    const body = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    // `items` present but not a list is a malformed Make both, never one card.
    if (body.items !== undefined && !Array.isArray(body.items)) {
      throw new JobRefused(400, `"items" is a list of { kind, idempotencyKey }, one per card`, { field: "items" });
    }
    const single = body.items === undefined;
    const rawItems: unknown[] = single ? [{ kind: body.kind ?? "diagram", idempotencyKey: body.idempotencyKey }] : (body.items as unknown[]);
    if (!single && (rawItems.length < 1 || rawItems.length > BRIEF_KINDS.length)) {
      throw new JobRefused(400, `"items" holds one card per kind, at most ${BRIEF_KINDS.length}`, { field: "items" });
    }
    const items: DrawItem[] = rawItems.map((raw, index) => {
      const item = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const at = single ? "" : `items[${index}].`;
      const kind = item.kind ?? "diagram";
      if (!isBriefKind(kind)) throw new JobRefused(400, `"${at}kind" is diagram or video`, { field: `${at}kind` });
      const key = typeof item.idempotencyKey === "string" && item.idempotencyKey.trim() !== "" ? item.idempotencyKey.trim() : null;
      if (key === null) {
        throw new JobRefused(400, `"${at}idempotencyKey" is required: it is what makes a second press safe`, { field: `${at}idempotencyKey` });
      }
      if (key.length > 200) throw new JobRefused(400, `"${at}idempotencyKey" is over 200 characters`, { field: `${at}idempotencyKey` });
      if (!plannerKindsOf(record).includes(kind)) {
        throw new JobRefused(409, `this conversation's planner cannot make a ${kind}`, { reason: "kind-not-in-conversation", kind });
      }
      return { kind, jobKey: `draft:${id}:${key}` };
    });
    if (new Set(items.map((item) => item.kind)).size !== items.length) {
      throw new JobRefused(400, "Make both presses one card of each kind", { field: "items" });
    }
    if (new Set(items.map((item) => item.jobKey)).size !== items.length) {
      throw new JobRefused(400, "each card's press needs its own idempotency key", { field: "items" });
    }
    const answer = (results: DrawItemResult[]): DrawAnswer => {
      if (!single) return { single: false, results };
      const only = results[0]!;
      if ("refusal" in only) throw new JobRefused(only.status, only.refusal.error, only.refusal.detail);
      return { single: true, result: only };
    };

    // A repeated press answers with the job the first one made, whether that
    // press is over or still running.
    const repeated = (item: DrawItem): DrawItemResult | null => {
      const job = item.kind === "diagram" ? this.store.byIdempotencyKey(item.jobKey) : this.video?.store.byIdempotencyKey(item.jobKey);
      return job !== undefined && job.draftId === id ? { kind: item.kind, jobId: job.id, created: false, replaces: null } : null;
    };
    const already = items.map(repeated);
    if (already.every((result) => result !== null)) return answer(already as DrawItemResult[]);

    const composite = items.map((item) => item.jobKey).sort().join("|");
    const pressing = this.draws.get(id);
    if (pressing !== undefined) {
      if (pressing.key !== composite) {
        throw new JobRefused(409, "a press is being made on this conversation; wait for it to be queued", {
          reason: "draw-in-progress",
        });
      }
      const first = (await pressing.result) as DrawItemResult[];
      return answer(first.map((result) => ("jobId" in result ? { ...result, created: false } : result)));
    }
    if (record.inFlight !== null || this.turnsInFlight.has(id)) {
      throw new JobRefused(409, "the planner is still answering; press once its reply is in", { reason: "in-flight" });
    }
    // Registered before the first await, so a turn or a second press in the
    // same tick sees it.
    const result = this.pressItems(id, items, already);
    this.draws.set(id, { key: composite, result });
    try {
      return answer(await result);
    } finally {
      this.draws.delete(id);
    }
  }

  /** One card's press, by key and kind: `draw` with `{ idempotencyKey, kind }`. */
  async drawOne(
    id: string,
    idempotencyKey: unknown,
    kind: BriefKind = "diagram",
  ): Promise<{ kind: BriefKind; jobId: string; created: boolean; replaces: string | null }> {
    const answer = await this.draw(id, { idempotencyKey, kind });
    if (!answer.single) throw new Error("a single press answered as Make both");
    return answer.result;
  }

  /** Each card in order: checked, its topic created once, enqueued; a refusal stops only its own card. */
  private async pressItems(id: string, items: DrawItem[], already: (DrawItemResult | null)[]): Promise<DrawItemResult[]> {
    const results: (DrawItemResult | null)[] = [...already];
    const refuse = async (index: number, error: unknown): Promise<void> => {
      if (!(error instanceof JobRefused)) throw error;
      const item = items[index]!;
      results[index] = { kind: item.kind, status: error.status, refusal: { error: error.message, detail: error.detail } };
      await this.write(id, async () => {
        await this.append(id, { type: "draw", kind: item.kind, refused: { status: error.status, error: error.message, detail: error.detail } });
        await this.note(id, `${pressName(item.kind)} was refused: ${error.message}`);
      });
    };

    // Everything an enqueue would refuse on is asked first, so a press that
    // can only fail leaves no topic behind.
    const prepared = new Map<number, Prepared>();
    for (const [index, item] of items.entries()) {
      if (results[index] !== null) continue;
      try {
        prepared.set(index, await this.prepare(id, item));
      } catch (error) {
        await refuse(index, error);
      }
    }

    // Each distinct proposed topic, created once; a refusal refuses only the
    // cards naming it (T32).
    const bySlug = new Map<string, number[]>();
    for (const [index, ready] of prepared) {
      if (ready.pending === null) continue;
      bySlug.set(ready.pending.entry.slug, [...(bySlug.get(ready.pending.entry.slug) ?? []), index]);
    }
    for (const [, indices] of bySlug) {
      try {
        await this.createTopic(id, prepared.get(indices[0]!)!.pending!, indices.map((index) => items[index]!.kind));
      } catch (error) {
        for (const index of indices) {
          prepared.delete(index);
          await refuse(index, error);
        }
      }
    }

    let rowFresh = false;
    for (const [index, ready] of prepared) {
      try {
        if (!rowFresh) {
          // The row the job's `draft_id` names has to be there first. A
          // mirror that failed while Postgres was down left no row, and
          // nothing since may have asked for another, so this one is fresh.
          await this.chains.get(id);
          await this.mirrored(id);
          const row = await draftUpsert(draftJsonPath(id)).catch(
            (error: unknown): CatalogResult => ({ ok: false, json: null, error: (error as Error).message, offline: true }),
          );
          if (!row.ok) await this.noteCatalogError(id, row.error ?? "catalog draft upsert failed");
          rowFresh = true;
        }
        results[index] = await this.enqueueItem(id, ready);
      } catch (error) {
        await refuse(index, error);
      }
    }
    return results as DrawItemResult[];
  }

  /** One card's checks, before anything is written: every refusal its enqueue would make. */
  private async prepare(id: string, item: DrawItem): Promise<Prepared> {
    const record = this.require(id);
    const slot = slotOf(record, item.kind);
    if (slot.brief === null || (slot.state !== "briefed" && slot.state !== "drawing")) {
      throw new JobRefused(409, `there is no ${item.kind} brief to make: its card is ${slot.brief === null ? "empty" : "out of force"}`, {
        reason: "not-briefed",
        kind: item.kind,
        state: slot.state,
      });
    }
    if (slot.held !== null) {
      throw new JobRefused(409, `On hold: ${slot.held.reason}. Press Use this brief to make it as it stands.`, {
        reason: "held",
        kind: item.kind,
        held: slot.held.reason,
      });
    }
    const press = this.pressStatus(record, item.kind);
    if (press.busy !== null) {
      throw new JobRefused(
        409,
        item.kind === "video" ? "The video is still being made" : "The diagram is still being drawn",
        { reason: "kind-busy", kind: item.kind, jobId: press.busy.jobId, state: press.busy.state },
      );
    }
    const pending = slot.pendingTopic;
    if (pending !== null && studioOwner() !== LOCAL_LEARNER_ID) {
      // C16: `catalog topic add` writes as the catalog CLI's owner, `local`,
      // and takes no `--owner` yet, so another owner's topic would be filed
      // under `local`. Refused before anything is written; a brief on a topic
      // that exists still draws.
      throw new JobRefused(
        409,
        `this studio serves an owner other than "${LOCAL_LEARNER_ID}", and a new topic can only be created ` +
          `as "${LOCAL_LEARNER_ID}" until \`catalog topic add\` takes an owner. Nothing was written. Ask the planner ` +
          `for a brief under a topic that exists, or add "${pending.entry.slug}" by hand.`,
        { reason: "topic-owner", topic: pending.entry.slug },
      );
    }
    const briefSeq = slot.briefSeq;
    if (item.kind === "diagram") {
      const brief = slot.brief as DraftBrief;
      const checked = await doctor();
      if (checked.code !== 0) {
        throw new JobRefused(503, "tldrawkc cannot run on this machine, so nothing was queued", {
          doctor: doctorChecks(checked).filter((check) => check.status !== "pass"),
          fix: ["git submodule update --init tools/tldrawkc", "(cd tools/tldrawkc && npm ci && npm run build)"],
        });
      }
      // C8: a flowchart the person pasted rides along, never through the planner.
      const mermaid = await this.latestMermaid(id);
      const ready: Prepared = {
        kind: "diagram",
        jobKey: item.jobKey,
        briefSeq,
        brief,
        pending,
        mermaid,
        model: jobModelOf(record),
        parent: null,
      };
      await this.runner.admit(validDiagram(ready, await vocabularyFor(pending)));
      return ready;
    }
    if (this.video === undefined) {
      throw new JobRefused(503, "this studio was started without the video runner, so nothing was queued", { reason: "no-video-runner" });
    }
    const brief = slot.brief as DraftVideoBrief;
    // A change is to a video this conversation is about: the one it opened
    // on, or one of its own jobs made (the #207 review). The planner could
    // otherwise propose changing any of the owner's videos from any chat.
    if (brief.mode === "change" && !this.videoSlugsOf(record).has(brief.slug)) {
      throw new JobRefused(
        409,
        `this conversation can change only a video it opened on or made; "${brief.slug}" is neither. Open a conversation on that video with Change, or ask for a new one.`,
        { reason: "change-not-in-conversation", kind: "video", slug: brief.slug },
      );
    }
    // D52: a newer brief on the slug of this draft's video in review replaces
    // it in one catalog transaction; a change to an accepted one starts from
    // its source.
    const newest = slot.jobId === null ? undefined : this.video.store.get(slot.jobId);
    const parent =
      press.replaces !== null
        ? { jobId: press.replaces.jobId, discard: true }
        : newest !== undefined && newest.state === "accepted" && newest.slug === brief.slug && brief.mode === "change"
          ? { jobId: newest.id, discard: false }
          : null;
    const ready: Prepared = {
      kind: "video",
      jobKey: item.jobKey,
      briefSeq,
      brief,
      pending,
      mermaid: null,
      model: jobModelOf(record),
      parent,
    };
    try {
      await this.video.runner.admit(validVideo(ready, await vocabularyFor(pending)), parent?.discard === true ? parent.jobId : null);
    } catch (error) {
      // A new video on a slug a studio video already has. The runner's own
      // words offer a change, which this conversation cannot make when it
      // neither opened on that video nor made it (above): a conversation
      // opened on a diagram whose video exists already, D86 of
      // docs/STUDIO-CHAT-FIRST.md (the #305 review). The STUDIO note this
      // becomes steers the planner's next brief to the one way out.
      const reason = error instanceof JobRefused ? (error.detail as { reason?: unknown } | undefined)?.reason : undefined;
      if (reason === "slug-taken" && brief.mode === "new" && !this.videoSlugsOf(record).has(brief.slug)) {
        throw new JobRefused(
          409,
          `a studio video called ${brief.slug} already exists, and this conversation did not open on it or make it, so it cannot change it: give the new video a slug no video uses`,
          { reason: "slug-taken", slug: brief.slug, field: "slug" },
        );
      }
      throw error;
    }
    return ready;
  }

  /** The studio videos this conversation is about: its video source, and every video its own jobs made. */
  private videoSlugsOf(record: DraftRecord): Set<string> {
    const slugs = new Set<string>();
    if (record.sourceKind === "video" && record.source !== null) slugs.add(record.source);
    for (const jobId of record.jobIds) {
      const job = this.video?.store.get(jobId);
      if (job !== undefined && job.draftId === record.id) slugs.add(job.slug);
    }
    return slugs;
  }

  /** One checked card, enqueued on its own runner and recorded on the draft. */
  private async enqueueItem(id: string, ready: Prepared): Promise<DrawItemResult> {
    const vocabulary = await vocabularyFor(null);
    if (ready.kind === "diagram") {
      const { record: job, created } = await this.runner.enqueue(validDiagram(ready, vocabulary), undefined, { draftId: id });
      await this.markDrawing(id, job.id, "diagram", ready.briefSeq);
      return { kind: "diagram", jobId: job.id, created, replaces: null };
    }
    const video = this.video!;
    const parent = ready.parent;
    const { record: job, created } = await video.runner.enqueue(
      validVideo(ready, vocabulary),
      parent === null ? undefined : { jobId: parent.jobId, agentSessionId: null, changes: null, discard: parent.discard },
      { draftId: id },
    );
    await this.markDrawing(id, job.id, "video", ready.briefSeq);
    if (parent?.discard === true && created) {
      await this.write(id, () => this.note(id, `The video in review (job ${parent.jobId}) was discarded and replaced by the new brief; nothing of it landed.`));
    }
    return { kind: "video", jobId: job.id, created, replaces: parent?.discard === true ? parent.jobId : null };
  }

  /** The set a turn adds launches to (D107), created on first use. */
  private pendingLaunchFor(id: string): Map<BriefKind, "consent" | "trust"> {
    let pending = this.pendingLaunch.get(id);
    if (pending === undefined) {
      pending = new Map();
      this.pendingLaunch.set(id, pending);
    }
    return pending;
  }

  /**
   * Draw what a turn earned consent or trust for (D107), run from `send`'s
   * tail once `inFlight` is cleared so `draw`'s own guards all pass. A kind
   * no longer launchable — held, busy, out of force — is skipped quietly: a
   * refusal here would make a card of a race the person never asked about.
   * Anything `draw` still refuses lands as a `draw` event like any press.
   */
  private async flushLaunch(id: string, messageSeq: number): Promise<void> {
    const pending = this.pendingLaunch.get(id);
    if (pending === undefined) return;
    this.pendingLaunch.delete(id);
    const record = this.records.get(id);
    if (record === undefined || record.state === "abandoned") return;
    const items = [...pending]
      .filter(([kind, via]) => {
        // Trust is read as it stands at launch: a revoke while the turn ran
        // costs nothing. A `consent` launch stands on its own mark.
        if (via === "trust" && !(record.trust ?? []).includes(kind)) return false;
        const slot = slotOf(record, kind);
        return slot.state === "briefed" && slot.brief !== null && slot.held === null && this.pressStatus(record, kind).busy === null;
      })
      .map(([kind]) => ({ kind, idempotencyKey: `consent:${messageSeq}:${kind}` }));
    if (items.length === 0) return;
    const doing = this.draw(id, { items })
      .then(() => undefined)
      .catch(async (error: unknown) => {
        await this.write(id, () =>
          this.recordError(id, "agent", `the consented draw failed before queueing: ${(error as Error).message}`),
        ).catch(() => undefined);
      });
    this.launching.set(id, doing);
    try {
      await doing;
    } finally {
      this.launching.delete(id);
    }
  }

  /** The band a kind last computed to, keyed on the job store's version. */
  private readonly bandCache = new Map<BriefKind, { version: number; band: CostBand | null }>();

  /**
   * What a make of each kind has cost on this machine (D107): the finished
   * jobs' `costUsd`, middle of the spread — a quarter of them in at the low
   * end, a tenth off the top — so a runaway render does not widen the promise
   * the card makes. Null with under three records, where a band would just be
   * noise; the card falls back to a fixed "usually" line. Cached on the job
   * store's version: a draft view is read on every change and every poll, and
   * the history under a band moves only when a job's record does.
   */
  private costBands(record: DraftRecord): Partial<Record<BriefKind, CostBand | null>> {
    const estimates: Partial<Record<BriefKind, CostBand | null>> = {};
    for (const kind of plannerKindsOf(record).filter(isBriefKind)) {
      const store = kind === "diagram" ? this.store : this.video?.store;
      if (store === undefined) {
        estimates[kind] = null;
        continue;
      }
      const hit = this.bandCache.get(kind);
      if (hit !== undefined && hit.version === store.version) {
        estimates[kind] = hit.band;
        continue;
      }
      // A band that cannot be read — a store with records too old to list —
      // is just unknown; the card falls back like an empty one.
      let band: CostBand | null = null;
      try {
        band = costBandOf(store.list());
      } catch {
        band = null;
      }
      this.bandCache.set(kind, { version: store.version, band });
      estimates[kind] = band;
    }
    return estimates;
  }

  /**
   * `PUT /api/drafts/{id}/trust` (D108): allow or take back a kind the
   * planner may brief — and launch — unprompted on this conversation.
   * `svg` is refused: it spends nothing and asks for nothing (D110).
   */
  async setTrust(id: string, rawKind: unknown, rawTrusted: unknown): Promise<{ trust: BriefKind[] }> {
    const record = this.require(id);
    if (!isBriefKind(rawKind)) {
      throw new JobRefused(400, `"kind" is diagram or video — svg needs no trust: it spends nothing`, { field: "kind" });
    }
    if (typeof rawTrusted !== "boolean") {
      throw new JobRefused(400, `"trusted" is required: true to allow the kind unprompted, false to ask again`, { field: "trusted" });
    }
    if (!plannerKindsOf(record).includes(rawKind)) {
      throw new JobRefused(409, `this conversation's planner cannot make a ${rawKind}`, { reason: "kind-not-in-conversation", kind: rawKind });
    }
    const kind = rawKind;
    const trusted = rawTrusted;
    await this.write(id, async () => {
      const current = this.require(id);
      const trust = (current.trust ?? []).filter((listed) => listed !== kind);
      if (trusted) trust.push(kind);
      await this.save(id, { trust });
    });
    return { trust: this.require(id).trust ?? [] };
  }

  /**
   * `POST /api/drafts/{id}/declined` (D109): the person answered a suggestion
   * card with Deny. The kinds are written onto the reply's transcript entry —
   * the card collapses to a quiet declined line — and kept on the record,
   * with the pitch they were offered under, for the DECLINED block every
   * later turn reads. Only kinds the named reply actually suggested count.
   */
  async decline(id: string, input: unknown): Promise<{ declined: TagKind[] }> {
    this.require(id);
    const body = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const replySeq = typeof body.replySeq === "number" && Number.isInteger(body.replySeq) ? body.replySeq : null;
    if (replySeq === null) {
      throw new JobRefused(400, `"replySeq" is required: the reply whose suggestion is declined`, { field: "replySeq" });
    }
    const kinds = Array.isArray(body.kinds) ? body.kinds.filter(isTagKind) : [];
    if (kinds.length === 0) {
      throw new JobRefused(400, `"kinds" is required: the suggested kinds being declined`, { field: "kinds" });
    }
    const events = await this.events(id);
    const reply = events.find((event) => event.seq === replySeq && event.type === "reply");
    const offered = reply === undefined ? [] : (Array.isArray(reply.suggest) ? reply.suggest.filter(isTagKind) : []);
    const counts = kinds.filter((kind) => offered.includes(kind));
    if (counts.length === 0) {
      throw new JobRefused(409, `reply ${replySeq} suggested none of those kinds`, { reason: "not-suggested", replySeq });
    }
    const pitch = typeof reply?.pitch === "string" ? reply.pitch : null;
    await this.write(id, async () => {
      const current = this.require(id);
      await this.append(id, { type: "declined", replySeq, kinds: counts });
      const kept = [...(current.declined ?? [])];
      for (const kind of counts) {
        if (!kept.some((offer) => offer.kind === kind && offer.pitch === pitch)) kept.push({ kind, pitch, at: new Date().toISOString() });
      }
      await this.save(id, { declined: kept.slice(-20) });
    });
    return { declined: counts };
  }

  /** The press's topic: created, or the reason it could not be. Clears the pending topic on every slot naming it (T11). */
  private async createTopic(id: string, pending: PendingTopic, kinds: BriefKind[]): Promise<void> {
    const added = await topicAdd(pending.entry, `Create topic and ${kinds.length > 1 ? "make both" : kinds[0] === "video" ? "make video" : "draw"}, from studio draft ${id}`);
    const clearAll = (current: DraftRecord): Partial<DraftRecord> => {
      let patch: Partial<DraftRecord> = {};
      for (const kind of BRIEF_KINDS) {
        if (slotOf(current, kind).pendingTopic?.entry.slug === pending.entry.slug) {
          patch = { ...patch, ...withSlot({ ...current, ...patch }, kind, { pendingTopic: null }) };
        }
      }
      return patch;
    };
    if (added.ok) {
      await this.write(id, async () => {
        await this.save(id, clearAll(this.require(id)));
        await this.note(id, `Created the topic "${pending.entry.title}" (${pending.entry.slug}).`);
      });
      return;
    }
    const said = (added.json as { error?: unknown } | null)?.error;
    const message = typeof said === "string" ? said : (added.error ?? "catalog topic add failed");
    if (added.offline) {
      throw new JobRefused(503, `the catalog cannot be reached, so the topic cannot be created: ${message}`, {
        reason: "catalog-unreachable",
      });
    }
    if (/already exists|exists and is archived/.test(message)) {
      // C4: someone created it in the meantime. If every brief naming it
      // passes against the vocabulary as it is now, the pending topic is
      // simply done with.
      let cleared = false;
      try {
        const vocabulary = await loadVocabulary();
        const current = this.require(id);
        for (const kind of kinds) {
          const brief = slotOf(current, kind).brief;
          if (brief === null) continue;
          if (kind === "video") validateVideoBrief({ ...brief }, vocabulary);
          else validateBrief({ ...brief }, vocabulary);
        }
        cleared = true;
      } catch {
        cleared = false;
      }
      if (cleared) {
        await this.write(id, async () => {
          await this.save(id, clearAll(this.require(id)));
          await this.note(id, `The topic "${pending.entry.slug}" exists now, so the next press makes it under that topic.`);
        });
      }
      throw new JobRefused(409, message, { reason: "topic-exists", pendingTopicCleared: cleared });
    }
    throw new JobRefused(400, message, { reason: "topic-add", field: "topic" });
  }

  /** The latest fenced mermaid block in the person's own messages, or null (C8). */
  private async latestMermaid(id: string): Promise<string | null> {
    const events = await this.events(id);
    for (const event of [...events].reverse()) {
      if (event.type !== "message" || typeof event.text !== "string") continue;
      const blocks = mermaidBlocks(event.text);
      if (blocks.length > 0) return blocks.at(-1)!;
    }
    return null;
  }

  /**
   * A `POST /api/jobs` naming this draft: refused unless its diagram card
   * could be pressed (a brief in force, not held, its kind not busy, and no
   * turn or press running), and then held as a press would be until `release`
   * is called, so nothing can move the draft while that job is queued.
   */
  claimForJob(id: string): () => void {
    const record = this.require(id);
    const slot = slotOf(record, "diagram");
    if (slot.brief === null || slot.state !== "briefed" || slot.held !== null) {
      throw new JobRefused(409, `draft ${id} has no diagram brief in force, and only a briefed draft can start a job`, {
        reason: "not-briefed",
        state: record.state,
      });
    }
    if (this.pressStatus(record, "diagram").busy !== null) {
      throw new JobRefused(409, "The diagram is still being drawn", { reason: "kind-busy", kind: "diagram" });
    }
    if (record.inFlight !== null || this.turnsInFlight.has(id)) {
      throw new JobRefused(409, "the planner is still answering on this draft", { reason: "in-flight" });
    }
    if (this.draws.has(id)) {
      throw new JobRefused(409, "Draw was just pressed on this conversation", { reason: "draw-in-progress" });
    }
    let release: () => void = () => undefined;
    const held = new Promise<unknown>((resolve) => {
      release = () => resolve([]);
    });
    this.draws.set(id, { key: `job-route:${randomUUID()}`, result: held });
    return () => {
      release();
      this.draws.delete(id);
    };
  }

  /**
   * Whether a Revise or a Resume of `jobId` carries this draft (T20): the job
   * is its kind's newest from the draft, the draft is open to it, and for a
   * diagram no other drawing is in flight. A video in review may be revised,
   * which discards it in the child's own transaction (D52).
   */
  carries(draftId: string, jobId: string, kind: BriefKind): boolean {
    const record = this.get(draftId);
    if (record === undefined || record.state === "abandoned") return false;
    const slot = slotOf(record, kind);
    if (slot.jobId !== jobId) return false;
    return kind === "video" || slot.state !== "drawing";
  }

  /**
   * A job was queued for this draft: its kind's slot is drawing now. Also the
   * Resume and Revise of a draft's job, which carry its draft and kind (T20).
   *
   * The job can already be over by the time this runs: a runner's enqueue
   * starts it, and a spawn that fails or a cancel can finish it before the
   * draft records its id, when `onJobState` still ignores it as not the
   * slot's newest. So once the id is recorded, the job's state as it is now
   * is applied too.
   */
  async markDrawing(id: string, jobId: string, kind?: BriefKind, drawnSeq?: number | null): Promise<void> {
    const which = kind ?? this.kindOfJob(jobId) ?? "diagram";
    await this.write(id, async () => {
      const record = this.require(id);
      if (!record.jobIds.includes(jobId)) {
        await this.append(id, { type: "draw", jobId, kind: which });
        const slot = slotOf(record, which);
        await this.save(id, {
          jobIds: [...record.jobIds, jobId],
          ...(record.state === "abandoned"
            ? {}
            : withSlot(record, which, {
                jobId,
                state: "drawing",
                // A Resume or Revise draws what the slot last drew; with no
                // record of that, the brief in force.
                drawnSeq: drawnSeq === undefined ? (slot.drawnSeq ?? slot.briefSeq) : drawnSeq,
              })),
        });
      }
      const job = this.jobOf(which, jobId);
      if (job !== undefined) await this.applyJob(id, job, which);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Stop waiting, Use this brief                                       */
  /* ------------------------------------------------------------------ */

  /**
   * `POST /api/drafts/{id}/slots/{kind}/stop-waiting` (D57): the person no
   * longer wants the brief a tag ordered, and no turn is spent saying so. A
   * turn in flight that then carries that brief has it dropped. A kind not
   * waiting writes nothing.
   */
  async stopWaiting(id: string, rawKind: unknown): Promise<{ record: DraftRecord; changed: boolean }> {
    this.require(id);
    const kind = parseKind(rawKind);
    return this.write(id, async () => {
      const current = this.require(id);
      const slot = slotOf(current, kind);
      if (slot.waiting === null) return { record: current, changed: false };
      await this.append(id, { type: "stop-waiting", kind, requestSeq: slot.waiting.requestSeq });
      return { record: await this.save(id, withSlot(current, kind, { waiting: null })), changed: true };
    });
  }

  /**
   * `POST /api/drafts/{id}/slots/{kind}/use?base=<seq>`, Use this brief (D60):
   * a held card back in force, with no turn; the planner hears it on its next
   * one. `base` names the held brief, so a newer one is not chosen blind. A
   * brief not on hold writes nothing.
   */
  async useBrief(id: string, rawKind: unknown, rawBase: unknown): Promise<{ record: DraftRecord; changed: boolean }> {
    const record = this.require(id);
    const kind = parseKind(rawKind);
    const base = parseBase(rawBase);
    if (record.state === "abandoned") {
      throw new JobRefused(409, "this conversation was closed. Start a new one.", { reason: "abandoned" });
    }
    return this.write(id, async () => {
      const current = this.require(id);
      const slot = slotOf(current, kind);
      if (slot.held === null) return { record: current, changed: false };
      if (base !== slot.briefSeq) {
        throw new JobRefused(409, "this is not the brief on hold any more; look at the newer one", {
          reason: "brief-changed",
          base: slot.briefSeq,
        });
      }
      await this.save(id, withSlot(current, kind, { held: null }));
      await this.note(
        id,
        `The person chose the ${kind} brief "${slot.brief?.title ?? "(untitled)"}" as it stands, with Use this brief: ` +
          `it is back in force, despite "${slot.held.reason}".`,
      );
      return { record: this.require(id), changed: true };
    });
  }

  /* ------------------------------------------------------------------ */
  /* The brief, edited by hand                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Refused while anything else could move this kind's brief: a turn, a
   * press, its own job drawing the brief in force, or a slot that is done,
   * or a closed draft. A newer brief that arrived while a job ran is not the
   * one being drawn, so it may be edited.
   */
  private assertEditable(id: string, kind: BriefKind): DraftRecord {
    const record = this.require(id);
    if (record.state === "abandoned") {
      throw new JobRefused(409, "this conversation was closed. Start a new one.", { reason: "abandoned" });
    }
    if (record.inFlight !== null || this.turnsInFlight.has(id)) {
      throw new JobRefused(409, "the planner is still answering; edit the brief once its reply is in", { reason: "in-flight" });
    }
    if (this.draws.has(id)) {
      throw new JobRefused(409, "a press is being made on this conversation; wait for it to be queued", {
        reason: "draw-in-progress",
      });
    }
    const slot = slotOf(record, kind);
    if (slot.state === "drawing" && (slot.brief === null || slot.briefSeq === slot.drawnSeq)) {
      throw new JobRefused(409, `this conversation's ${kind} is being made from this brief, so it cannot change under it`, {
        reason: "drawing",
        jobId: slot.jobId,
      });
    }
    if (slot.state === "done") {
      throw new JobRefused(409, `this conversation's ${kind} is reviewed; ask the planner for another instead`, {
        reason: "done",
      });
    }
    return record;
  }

  /**
   * `PUT /api/drafts/{id}/brief?base=<seq>&kind=<kind>`: a person's own edit
   * of one kind's brief (the confirm card's inline edits). The whole brief is
   * checked by that kind's validator, against the vocabulary as it is now,
   * widened with the slot's proposed topic when the brief still names it; a
   * brief on any other topic ends the proposal. An edit of a held card puts
   * it back in force, since editing is choosing it. Stored disk first, then
   * mirrored, and the planner is told on its next turn.
   *
   * An identical brief in force and not held changes nothing and writes nothing.
   */
  async editBrief(id: string, input: unknown, rawBase: unknown, rawKind?: unknown): Promise<{ record: DraftRecord; changed: boolean; kind: BriefKind }> {
    const kind = rawKind === undefined || rawKind === null || rawKind === "" ? "diagram" : parseKind(rawKind);
    if (!plannerKindsOf(this.require(id)).includes(kind)) {
      throw new JobRefused(409, `this conversation's planner cannot make a ${kind}`, { reason: "kind-not-in-conversation", kind });
    }
    this.assertEditable(id, kind);
    const base = parseBase(rawBase);
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new JobRefused(400, "the request body must be a JSON object holding a brief", { field: "body" });
    }
    const fields = kind === "video" ? EDITABLE_VIDEO_FIELDS : EDITABLE_BRIEF_FIELDS;
    const picked: Record<string, unknown> = {};
    for (const field of fields) if (field in input) picked[field] = (input as Record<string, unknown>)[field];
    let vocabulary: Vocabulary;
    try {
      vocabulary = await this.readVocabulary();
    } catch (error) {
      throw vocabularyDown(error);
    }
    return this.write(id, async () => {
      // Asked again after the read: a turn or a press may have started since.
      const current = this.assertEditable(id, kind);
      const slot = slotOf(current, kind);
      const pending = slot.pendingTopic;
      const keepsPending = pending !== null && picked.topic === pending.entry.slug && !vocabulary.topics.has(pending.entry.slug);
      const checkedAgainst: Vocabulary = keepsPending
        ? { ...vocabulary, topics: new Map([...vocabulary.topics, [pending.entry.slug, { title: pending.entry.title, concepts: [] }]]) }
        : vocabulary;
      // D66: a concept draft's `source` and `concepts`, as on a planner's brief.
      const raw = withConcept(picked, current.concept, checkedAgainst);
      let brief: AnyDraftBrief;
      try {
        brief =
          kind === "video"
            ? withoutVideoKey(validateVideoBrief(raw, checkedAgainst))
            : withoutKey(validateBrief({ ...raw, ...modelOf(slot.brief) }, checkedAgainst));
      } catch (error) {
        if (error instanceof BriefError) throw new JobRefused(400, error.message, { field: error.field });
        throw error;
      }
      const pendingTopic = keepsPending ? pending : null;
      // What is already in force is a success whatever the base, so a
      // retried PUT whose first try landed is not refused.
      if (
        (slot.state === "briefed" || slot.state === "drawing") &&
        slot.held === null &&
        JSON.stringify(brief) === JSON.stringify(slot.brief) &&
        pendingTopic === slot.pendingTopic
      ) {
        return { record: current, changed: false, kind };
      }
      const inForce = slot.brief === null ? null : slot.briefSeq;
      if (base !== inForce) {
        throw new JobRefused(
          409,
          "this edit is of a brief that is no longer the one in force; look at the newer brief and edit that",
          { reason: "brief-changed", base: inForce },
        );
      }
      const describe = (before: AnyDraftBrief | null, after: AnyDraftBrief): string =>
        kind === "video"
          ? describeVideoBriefEdit(before as DraftVideoBrief | null, after as DraftVideoBrief, { pendingCleared: pending !== null && pendingTopic === null })
          : describeBriefEdit(before as DraftBrief | null, after as DraftBrief, { pendingCleared: pending !== null && pendingTopic === null });
      const summary = describe(slot.brief, brief);
      // The planner hears once per turn: every edit since, from the brief it last knew.
      const plannerBase = slot.pendingEdit ? slot.pendingEdit.base : slot.brief;
      const told = describe(plannerBase, brief);
      // In memory at once, before the first await: a press from here on makes
      // this brief, never the one it replaces. The disk record is written
      // once, after the transcript, so the stream carries `studio`, `brief`,
      // then `state`.
      const inMemory: DraftRecord = {
        ...current,
        ...withSlot(current, kind, {
          state: slot.state === "drawing" ? "drawing" : "briefed",
          brief,
          briefAt: new Date().toISOString(),
          briefBy: "person",
          pendingTopic,
          held: null,
          // A brief of the kind is in force now: the person answered their own tag.
          waiting: null,
        }),
        errorKind: null,
        error: null,
        errorField: null,
        errorBriefKind: null,
      };
      this.records.set(id, { ...inMemory, ...summarize(inMemory) });
      const note = await this.append(id, { type: "studio", text: summary, edit: true, kind });
      await this.append(id, { type: "brief", replySeq: note.seq, kind, brief, pendingTopic, edit: true, requestSeq: slot.requestSeq });
      const now = this.require(id);
      await this.save(
        id,
        withSlot(now, kind, {
          briefSeq: note.seq,
          pendingEdit: {
            base: plannerBase,
            text:
              `${kind === "video" ? "Video brief. " : conversationalPrefix(now)}${told}\n\n` +
              `This is the brief in force; build on it, and a change is still a whole new brief:\n${JSON.stringify(brief, null, 1)}`,
          },
        }),
      );
      return { record: this.require(id), changed: true, kind };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Following the job                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * After a start: bring every draft up to its jobs of both kinds, which the
   * runners' own reconciles have already moved before any draft was
   * listening. A job that names a draft the draft never recorded (the runner
   * died between the enqueue and `markDrawing`) is recorded now, as its
   * kind's newest when it is newer, and that job's state is applied.
   */
  async syncFromJobs(): Promise<void> {
    for (const record of [...this.records.values()]) {
      const jobs: { kind: BriefKind; job: JobRecord | VideoJobRecord }[] = [
        ...this.store.list().map((job) => ({ kind: "diagram" as const, job })),
        ...(this.video?.store.list() ?? []).map((job) => ({ kind: "video" as const, job })),
      ]
        .filter(({ job }) => job.draftId === record.id)
        .sort((a, b) => a.job.requestedAt.localeCompare(b.job.requestedAt));
      if (jobs.length === 0) continue;
      await this.write(record.id, async () => {
        const current = this.require(record.id);
        const missing = jobs.filter(({ job }) => !current.jobIds.includes(job.id)).map(({ job }) => job.id);
        if (missing.length > 0) await this.save(record.id, { jobIds: [...current.jobIds, ...missing] });
        for (const kind of BRIEF_KINDS) {
          const newest = jobs.filter((entry) => entry.kind === kind).at(-1)?.job;
          if (newest === undefined) continue;
          const now = this.require(record.id);
          const slot = slotOf(now, kind);
          const known = slot.jobId === null ? undefined : this.jobOf(kind, slot.jobId);
          if (slot.jobId !== newest.id && (known === undefined || known.requestedAt.localeCompare(newest.requestedAt) < 0)) {
            await this.save(record.id, withSlot(now, kind, { jobId: newest.id }));
          }
          const after = this.require(record.id);
          const followed = slotOf(after, kind);
          if (ACTIVE_JOB.includes(newest.state) && followed.jobId === newest.id && followed.state !== "drawing" && after.state !== "abandoned") {
            await this.save(record.id, withSlot(after, kind, { state: "drawing" }));
          }
          await this.applyJob(record.id, newest, kind);
        }
      });
    }
  }

  /**
   * A slot follows its job. A failed, cancelled or interrupted one puts the
   * slot back at `briefed` with what went wrong as a STUDIO note, because the
   * next useful thing is to talk about it; an accepted or discarded one is
   * `done`, and an accept tells the planner the thing now exists. A newer
   * brief that arrived while the job ran stays in force either way. A video
   * reaching review is told to the planner too, so a change is a `change`
   * brief on its slug.
   */
  private async onJobState(job: JobRecord | VideoJobRecord, kind: BriefKind): Promise<void> {
    const id = job.draftId;
    if (id === null || id === undefined || !this.records.has(id)) return;
    await this.write(id, () => this.applyJob(id, job, kind));
  }

  /** Act on a job's state, once per verdict, if it is its slot's newest job. Call inside `write`. */
  private async applyJob(id: string, job: JobRecord | VideoJobRecord, kind: BriefKind): Promise<void> {
    const current = this.require(id);
    const slot = slotOf(current, kind);
    if (slot.jobId !== job.id) return;
    if (slot.followed?.jobId === job.id && slot.followed.state === job.state) return;
    const followed = { jobId: job.id, state: job.state };
    if (kind === "video" && job.state === "awaiting_review") {
      const video = job as VideoJobRecord;
      await this.append(id, { type: "job", jobId: job.id, state: job.state, kind });
      await this.note(
        id,
        `The video \`${video.slug}\` is ready for review, ${lengthOf(video.gate?.durationSeconds ?? null)}. ` +
          `A change to what is said is a change brief on the slug ${video.slug}.`,
      );
      await this.save(id, withSlot(this.require(id), kind, { followed }));
      return;
    }
    if (!JOB_VERDICTS.includes(job.state)) return;
    if (job.state === "discarded" && kind === "video" && typeof (job as VideoJobRecord).replacedBy === "string") {
      // Replaced by a Replace or a Revise, in the child's own transaction
      // (D52): not a verdict. The record says so, not a marker held while a
      // press runs, so a loser of a Replace and Revise pressed together, or a
      // draft that hears of the discard late, cannot read it as one.
      await this.append(id, { type: "job", jobId: job.id, state: job.state, kind, replaced: true });
      await this.save(id, withSlot(current, kind, { followed }));
      return;
    }
    await this.append(id, { type: "job", jobId: job.id, state: job.state, kind });
    // A newer brief than the one this job made stays the card in force.
    const newer = slot.brief !== null && slot.drawnSeq !== null && slot.briefSeq !== slot.drawnSeq;
    const noun = kind === "video" ? `The video ${job.slug}` : `The drawing of ${job.slug}`;
    const press = pressName(kind);
    if (job.state === "failed" || job.state === "cancelled" || job.state === "interrupted") {
      const findings = job.gate?.findings ?? [];
      const what =
        job.state === "failed" ? "failed" : job.state === "cancelled" ? "was cancelled" : "was interrupted: the studio stopped while it ran";
      await this.note(
        id,
        `${noun} ${what}. ` +
          (job.state === "interrupted"
            ? `Resume it from the job, or press ${press} again.`
            : `${findings.length > 0 ? findings.join(" ") : (job.error ?? "no reason recorded")} ` +
              `The brief is unchanged; say what to change, or press ${press} again.`),
      );
      const now = this.require(id);
      await this.save(id, withSlot(now, kind, { followed, ...(slotOf(now, kind).state === "drawing" ? { state: "briefed" as const } : {}) }));
      return;
    }
    await this.note(
      id,
      job.state === "accepted"
        ? kind === "video"
          ? acceptedVideoNote(job as VideoJobRecord)
          : acceptedNote(job as JobRecord)
        : `${noun} was discarded; nothing landed.`,
    );
    const now = this.require(id);
    await this.save(
      id,
      withSlot(now, kind, {
        followed,
        ...(slotOf(now, kind).state === "drawing" ? { state: newer ? ("briefed" as const) : ("done" as const) } : {}),
      }),
    );
  }

  /* ------------------------------------------------------------------ */
  /* Pruning (D40), driven by prune.ts                                  */
  /* ------------------------------------------------------------------ */

  /** Nothing is running on the draft or waiting to write it: no turn, no press, no mirror. */
  private idle(id: string): boolean {
    const record = this.records.get(id);
    return (
      record !== undefined &&
      record.inFlight === null &&
      !this.turnsInFlight.has(id) &&
      !this.running.has(id) &&
      !this.draws.has(id) &&
      !this.mirroring.has(id)
    );
  }

  /** Drafts untouched since `before` (epoch ms) that nothing is using, oldest first: the pruner's candidates. */
  untouchedSince(before: number): DraftRecord[] {
    return [...this.records.values()]
      .filter((record) => !this.pruning.has(record.id) && Date.parse(record.updatedAt) < before && this.idle(record.id))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  }

  /**
   * Remove one draft for the pruner, if it is still untouched since `before`
   * and idle once every earlier write has landed. The draft is taken first:
   * from then on every route answers 404 for it and no press, message, edit or
   * job can start on it, so `decide` (the pruner's job checks and the row's
   * delete) judges a draft nothing can move. When `decide` says yes the
   * record leaves memory, then the workspace goes; a workspace that will not
   * go is found again at the next start, and its row is already gone.
   */
  async prune(id: string, before: number, decide: (record: DraftRecord) => Promise<boolean>): Promise<boolean> {
    return this.write(id, async () => {
      const record = this.records.get(id);
      if (record === undefined || this.pruning.has(id) || Date.parse(record.updatedAt) >= before || !this.idle(id)) return false;
      this.pruning.add(id);
      try {
        if (!(await decide(record))) return false;
        // The row is gone. A tombstone first, so a workspace that does not
        // all go is never loaded as a draft again, and the next pass finishes it.
        await writeFile(tombstonePath(id), `${new Date().toISOString()}\n`, "utf8");
        this.records.delete(id);
        this.live.delete(id);
        this.streams.get(id)?.removeAllListeners();
        this.streams.delete(id);
        await rm(draftDir(id), { recursive: true, force: true }).catch(() => this.leftovers.add(id));
        return true;
      } finally {
        this.pruning.delete(id);
      }
    });
  }

  /** Remove what is left of workspaces pruned before; their rows went first. */
  async sweepLeftovers(): Promise<{ removed: string[]; failed: string[] }> {
    const removed: string[] = [];
    const failed: string[] = [];
    for (const id of [...this.leftovers]) {
      try {
        await rm(draftDir(id), { recursive: true, force: true });
        this.leftovers.delete(id);
        removed.push(id);
      } catch {
        failed.push(id);
      }
    }
    return { removed, failed };
  }

  /* ------------------------------------------------------------------ */
  /* Rename                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * `PUT /api/drafts/{id}/name`: the owner's name for the conversation, or
   * none (`null`, or a name with nothing in it). Written to `draft.json` and
   * mirrored like every other change, on the draft's write chain, so it lands
   * in order with a turn's writes and `drain` waits for it. It leaves
   * `updatedAt` alone: naming a conversation is not using it, so it neither
   * moves up the lists nor outlives its pruning. The planner is not told; a
   * name is the owner's label, not part of the conversation.
   */
  async rename(id: string, rawName: unknown): Promise<{ record: DraftRecord; changed: boolean }> {
    this.require(id);
    const name = cleanName(rawName);
    if (this.draining) throw new JobRefused(503, "the studio is shutting down", { reason: "shutdown" });
    return this.write(id, async () => {
      const current = this.require(id);
      if ((current.name ?? null) === name) return { record: current, changed: false };
      return { record: await this.save(id, { name }, { touch: false }), changed: true };
    });
  }

  /**
   * `PUT /api/drafts/{id}/model`: the composer picker's write (D90). The pick
   * lands on the next planner spawn and the next press; a turn in flight keeps
   * the model it started with. `touch: false` for the same reason as a rename:
   * a pick moves nothing up the list.
   */
  async setModel(id: string, rawModel: unknown): Promise<{ record: DraftRecord; changed: boolean }> {
    this.require(id);
    if (this.draining) throw new JobRefused(503, "the studio is shutting down", { reason: "shutdown" });
    return this.write(id, async () => {
      const current = this.require(id);
      const model = draftModel(rawModel, current.harness ?? null);
      if ((current.model ?? null) === model) return { record: current, changed: false };
      return { record: await this.save(id, { model }, { touch: false }), changed: true };
    });
  }

  /**
   * `PUT /api/drafts/{id}/harness`: the pane picker's write. A harness carries
   * its own session store, so the pick is for a conversation that has not
   * spoken: after a turn, a new conversation is the way to change it. The
   * record's `harness` names what the next spawn is given; it is only ever
   * `"byok"` or absent, since `claude` is the default and `codex` is refused
   * until it is wired.
   */
  async setHarness(id: string, rawHarness: unknown): Promise<{ record: DraftRecord; changed: boolean }> {
    this.require(id);
    const harness = draftHarness(rawHarness);
    if (this.draining) throw new JobRefused(503, "the studio is shutting down", { reason: "shutdown" });
    if (harness === "byok" && resolveByok(await loadByok(), null) === null) {
      throw new JobRefused(400, "BYOK is not set up: the picker's BYOK row takes a provider, an API key and a Default model first", {
        field: "harness",
        reason: "byok-unconfigured",
      });
    }
    if (harness === "codex" && !(await codexSignedIn(process.env))) {
      throw new JobRefused(400, "codex is not signed in: `codex login` once, or an OPENAI_API_KEY in the runner's env", {
        field: "harness",
        reason: "codex-not-signed-in",
      });
    }
    return this.write(id, async () => {
      const current = this.require(id);
      if ((current.harness ?? null) === harness) return { record: current, changed: false };
      if (current.turns > 0 || current.sessionStarted) {
        throw new JobRefused(409, "a conversation keeps the harness it started on; a new one picks afresh", {
          reason: "harness-locked",
        });
      }
      // The session id is one harness's own: a changed pick mints a new one so
      // no resume is ever handed to a CLI that did not write it. The model is
      // one harness's too (D92): a `gpt-` pick that survives onto claude, or a
      // `fable` that survives onto codex, would fail the next spawn outright.
      return {
        record: await this.save(id, { harness, plannerSessionId: randomUUID(), sessionStarted: false, model: null }, { touch: false }),
        changed: true,
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Abandon and shutdown                                               */
  /* ------------------------------------------------------------------ */

  async abandon(id: string): Promise<DraftRecord> {
    const record = this.require(id);
    if (record.state === "abandoned") return record;
    if (!canTransition(DRAFT_TRANSITIONS, record.state, "abandoned")) {
      throw new JobRefused(
        409,
        record.state === "drawing"
          ? "a drawing from this conversation is in progress; cancel or review it first"
          : `a ${record.state} conversation cannot be abandoned`,
        { reason: record.state, state: record.state },
      );
    }
    // Stops an in-flight turn first.
    await this.running.get(id)?.stop("abandoned");
    await this.write(id, async () => {
      await this.append(id, { type: "abandoned", by: "person" });
      await this.save(id, { state: "abandoned" });
    });
    return this.require(id);
  }

  /**
   * Resolves once every create, read, write and mirror this service started
   * has landed, for every draft and for a create that was refused. A landed
   * write can queue another (a failed mirror notes its error, a turn's end
   * closes a capped draft), so this looks again until a pass finds nothing new.
   */
  async settledAll(): Promise<void> {
    for (;;) {
      const chains = [...this.chains.values()];
      const pending = [...this.readsInFlight, ...chains, ...[...this.mirroring.values()].map((mirror) => mirror.done)];
      await Promise.all(pending.map((work) => work.catch(() => undefined)));
      const now = [...this.chains.values()];
      const quiet =
        this.readsInFlight.size === 0 &&
        this.mirroring.size === 0 &&
        now.length === chains.length &&
        now.every((chain, index) => chain === chains[index]);
      if (quiet) return;
    }
  }

  /**
   * Stop every planner turn, then wait for everything they and anything else
   * here started to be written (`settledAll`). Their replies are written as
   * cut off, and a create after this begins is refused. A catalog read can
   * hold this for as long as its own timeout, so the process's shutdown
   * bounds it rather than awaiting it bare.
   */
  async drain(): Promise<void> {
    this.draining = true;
    for (const run of this.running.values()) await run.stop("shutdown");
    await Promise.all([...this.turnsInFlight.values()].map((turn) => turn.catch(() => undefined)));
    await this.settledAll();
  }
}

/* -------------------------------------------------------------------------- */
/* Slots (D62)                                                                */
/* -------------------------------------------------------------------------- */

/** The kinds a draft's planner prompt carries: `["diagram"]` for a draft from before D59. */
export function plannerKindsOf(record: Pick<DraftRecord, "plannerKinds">): TagKind[] {
  return record.plannerKinds ?? ["diagram"];
}

/** A kind's slot, or an empty one. */
export function slotOf(record: Pick<DraftRecord, "slots">, kind: BriefKind): KindSlot {
  return record.slots?.[kind] ?? emptySlot();
}

/**
 * The cost band over finished jobs (D107): their `costUsd`, middle of the
 * spread — a quarter of them in at the low end, a tenth off the top — so a
 * runaway render does not widen the promise the card makes. Null with under
 * three records, where a band would just be noise.
 */
export function costBandOf(jobs: { costUsd: number | null; finishedAt: string | null }[]): CostBand | null {
  const costs = jobs
    .filter((job) => job.finishedAt !== null)
    .map((job) => job.costUsd)
    .filter((usd): usd is number => usd !== null && usd > 0)
    .sort((a, b) => a - b);
  if (costs.length < 3) return null;
  const low = costs[Math.floor(costs.length * 0.25)]!;
  const high = costs[Math.min(costs.length - 1, Math.ceil(costs.length * 0.9) - 1)]!;
  return { low: Math.floor(low * 100) / 100, high: Math.max(Math.ceil(high * 100) / 100, Math.floor(low * 100) / 100), n: costs.length };
}

/** The `slots` patch that changes one kind's slot. `save` recomputes the row's summary from it. */
export function withSlot(record: Pick<DraftRecord, "slots">, kind: BriefKind, patch: Partial<KindSlot>): Pick<DraftRecord, "slots"> {
  return { slots: { ...(record.slots ?? {}), [kind]: { ...slotOf(record, kind), ...patch } } };
}

/**
 * The row's summary of its slots (D62): `abandoned` if abandoned; else
 * `drawing` if any slot is; else `briefed`; else `done`; else `open`. `brief`,
 * `briefAt`, `pendingTopic`, `title` and `kind` mirror the newest brief of any
 * kind, so every `CHECK` on the row holds as written.
 */
export function summarize(record: DraftRecord): Pick<DraftRecord, "state" | "kind" | "brief" | "briefAt" | "briefSeq" | "briefBy" | "pendingTopic" | "title"> {
  let newest: { kind: BriefKind; slot: KindSlot } | null = null;
  const states: SlotState[] = [];
  for (const kind of BRIEF_KINDS) {
    const slot = record.slots?.[kind];
    if (slot === undefined) continue;
    states.push(slot.state);
    // Ties (two briefs in one reply) go to the later kind in the build's order.
    if (slot.brief !== null && (newest === null || (slot.briefSeq ?? 0) >= (newest.slot.briefSeq ?? 0))) newest = { kind, slot };
  }
  const state: DraftState =
    record.state === "abandoned"
      ? "abandoned"
      : states.includes("drawing")
        ? "drawing"
        : states.includes("briefed")
          ? "briefed"
          : states.includes("done")
            ? "done"
            : "open";
  return {
    state,
    kind: newest?.kind ?? record.kind ?? "diagram",
    brief: newest?.slot.brief ?? null,
    briefAt: newest?.slot.briefAt ?? null,
    briefSeq: newest?.slot.briefSeq ?? null,
    briefBy: newest?.slot.briefBy ?? null,
    pendingTopic: newest?.slot.pendingTopic ?? null,
    title: newest?.slot.brief?.title ?? record.title ?? null,
  };
}

/** A draft from before D62: its one brief and its jobs, as its diagram slot. */
export function legacySlots(record: DraftRecord): Partial<Record<BriefKind, KindSlot>> {
  if (record.brief === null && record.jobIds.length === 0 && record.state !== "done") return {};
  const state: SlotState = record.state === "abandoned" ? (record.brief === null ? "open" : "briefed") : record.state;
  return {
    diagram: {
      ...emptySlot(),
      brief: record.brief,
      briefAt: record.briefAt,
      briefSeq: record.briefSeq ?? null,
      briefBy: record.briefBy ?? null,
      pendingTopic: record.pendingTopic,
      pendingEdit: record.pendingEdit ?? null,
      jobId: record.jobIds.at(-1) ?? null,
      followed: record.followed ?? null,
      state,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Mentions (D57)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The mentions a message carries, checked against the text as sent rather
 * than trusted: each `text.slice(start, end)` reads exactly `@<kind>`, no two
 * overlap, and a kind appears once. Refused with `400 { field: "mentions" }`.
 */
export function parseMentions(text: string, raw: unknown): Mention[] {
  if (raw === undefined || raw === null) return [];
  const refuse = (why: string): never => {
    throw new JobRefused(400, `"mentions" ${why}`, { field: "mentions" });
  };
  if (!Array.isArray(raw)) return refuse("is a list of { kind, start, end }");
  if (raw.length > TAG_KINDS.length) refuse(`holds at most one mention of each kind`);
  const mentions = raw.map((entry, index): Mention => {
    const item = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : refuse(`[${index}] is not an object`);
    const kind = item.kind;
    if (!isTagKind(kind)) return refuse(`[${index}].kind is not a kind this studio makes (${TAG_KINDS.join(", ")})`);
    const start = item.start;
    const end = item.end;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end)) {
      return refuse(`[${index}] needs whole-number "start" and "end"`);
    }
    if (start < 0 || end > text.length || start >= end) return refuse(`[${index}] is out of the text's bounds`);
    if (text.slice(start, end) !== `@${kind}`) return refuse(`[${index}] does not read "@${kind}" at ${start} to ${end}`);
    return { kind, start, end };
  });
  const sorted = [...mentions].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.start < sorted[i - 1]!.end) refuse("overlap");
  }
  if (new Set(mentions.map((mention) => mention.kind)).size !== mentions.length) refuse("repeat a kind: one tag of each kind");
  return mentions;
}

/** The text with every mention's `@<kind>` taken out: what a bare tag leaves. */
export function withoutMentions(text: string, mentions: readonly Mention[]): string {
  let out = "";
  let at = 0;
  for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
    out += text.slice(at, mention.start);
    at = mention.end;
  }
  return out + text.slice(at);
}

function parseKind(raw: unknown): BriefKind {
  if (!isBriefKind(raw)) throw new JobRefused(400, `the kind is ${BRIEF_KINDS.join(" or ")}`, { field: "kind" });
  return raw;
}

/** The last `brief` block, however it is tagged inside: how a draft from before D61 read a reply. */
function fencedLast(text: string): string | null {
  const blocks = briefBlocks(text);
  if (blocks.length === 0) return null;
  // `briefBlocks` keeps the last per kind; a draft from before had one kind,
  // so the last block written is the last one it returns.
  return blocks.at(-1)!.body;
}

/* -------------------------------------------------------------------------- */
/* The press                                                                  */
/* -------------------------------------------------------------------------- */

interface DrawItem {
  kind: BriefKind;
  /** `draft:<id>:<key>`, the job's own idempotency key. */
  jobKey: string;
}

/** One card, checked and ready to enqueue. */
interface Prepared {
  kind: BriefKind;
  jobKey: string;
  briefSeq: number | null;
  brief: AnyDraftBrief;
  pending: PendingTopic | null;
  mermaid: string | null;
  /** The conversation's own model pick (D90), stamped onto the brief unless the brief names one itself. */
  model: string | null;
  /** Video: the job this one starts from, and whether the catalog discards it in the same transaction. */
  parent: { jobId: string; discard: boolean } | null;
}

/** One card's answer: its job, or the refusal its own press would have had. */
export type DrawItemResult =
  | { kind: BriefKind; jobId: string; created: boolean; replaces: string | null }
  | { kind: BriefKind; status: number; refusal: { error: string; detail: unknown } };

export type DrawAnswer =
  | { single: true; result: { kind: BriefKind; jobId: string; created: boolean; replaces: string | null } }
  | { single: false; results: DrawItemResult[] };

/** What a person pressed, by kind: the words a refusal and a note use. */
function pressName(kind: BriefKind): string {
  return kind === "video" ? "Make video" : "Draw";
}

/** The vocabulary as it is now, widened in memory with a pending topic the catalog does not have yet. */
async function vocabularyFor(pending: PendingTopic | null): Promise<Vocabulary> {
  let vocabulary: Vocabulary;
  try {
    vocabulary = await loadVocabulary();
  } catch (error) {
    throw vocabularyDown(error);
  }
  if (pending !== null && !vocabulary.topics.has(pending.entry.slug)) {
    vocabulary = {
      ...vocabulary,
      topics: new Map([...vocabulary.topics, [pending.entry.slug, { title: pending.entry.title, concepts: [] }]]),
    };
  }
  return vocabulary;
}

/** The stored diagram brief through the job path byte for byte, with the press's key and any pasted flowchart. */
function validDiagram(ready: Prepared, vocabulary: Vocabulary): ValidBrief {
  const stored = ready.brief as DraftBrief;
  // D90: the conversation's pick lands on the job, but a brief that names its
  // own model keeps it: a person's explicit choice is the stronger one (D53).
  const posted = {
    ...stored,
    ...(stored.model === undefined && ready.model !== null ? { model: ready.model } : {}),
    ...(ready.mermaid === null ? {} : { mermaid: ready.mermaid }),
    idempotencyKey: ready.jobKey,
  };
  try {
    return validateBrief(posted, vocabulary);
  } catch (error) {
    if (error instanceof BriefError) throw new JobRefused(400, error.message, { field: error.field });
    throw error;
  }
}

/** The stored video brief through `validateVideoBrief`, with the press's key. */
function validVideo(ready: Prepared, vocabulary: Vocabulary): ValidVideoBrief {
  const stored = ready.brief as DraftVideoBrief;
  try {
    return validateVideoBrief(
      {
        ...stored,
        ...(stored.model === undefined && ready.model !== null ? { model: ready.model } : {}),
        idempotencyKey: ready.jobKey,
      },
      vocabulary,
    );
  } catch (error) {
    if (error instanceof BriefError) throw new JobRefused(400, error.message, { field: error.field });
    throw error;
  }
}

/** `catalog video list`, as the VIDEOS block's entries; null when it cannot be read. */
async function readVideoCorpus(): Promise<VideoCorpusEntry[] | null> {
  const listed = await videoList().catch(() => null);
  if (listed === null || !listed.ok) return null;
  const videos = (listed.json as { videos?: unknown } | null)?.videos;
  if (!Array.isArray(videos)) return null;
  return videos
    .filter((video): video is Record<string, unknown> => typeof video === "object" && video !== null)
    .map((video) => ({
      origin:
        video.origin === "manimkc" ||
        video.origin === "remotionkc" ||
        video.origin === "revideokc" ||
        // A render the studio cannot make (no backend) is still a video
        // that exists, which is what the VIDEOS block tells the planner.
        video.origin === "blenderkc"
          ? video.origin
          : "studio",
      slug: typeof video.slug === "string" ? video.slug : null,
      assetId: typeof video.assetId === "string" ? video.assetId : "(unknown)",
      title: typeof video.title === "string" ? video.title : null,
      topic: typeof video.topic === "string" ? video.topic : null,
      durationSeconds: typeof video.durationSeconds === "number" ? video.durationSeconds : null,
    }));
}

/** The fields a person's edit of a video brief may set: the planner's, and the concept note it draws from. */
export const EDITABLE_VIDEO_FIELDS = [...PLANNER_VIDEO_FIELDS, "source"] as const;

function withoutVideoKey(brief: ValidVideoBrief): DraftVideoBrief {
  const kept: Partial<ValidVideoBrief> = { ...brief };
  delete kept.idempotencyKey;
  return kept as DraftVideoBrief;
}

/** The planner-facing edit note's first words on a conversational draft, so it knows which card changed. */
function conversationalPrefix(record: Pick<DraftRecord, "conversational">): string {
  return record.conversational === true ? "Diagram brief. " : "";
}

/**
 * The STUDIO note after a person edits a video brief: what changed, field by
 * field and line by line, capped like the EXTENDING block.
 */
export function describeVideoBriefEdit(
  before: DraftVideoBrief | null,
  after: DraftVideoBrief,
  options: { pendingCleared?: boolean } = {},
): string {
  const lines: string[] = [];
  if (before === null) {
    lines.push(`The person wrote the video brief "${after.title}" by hand.`);
  } else {
    for (const field of ["title", "topic", "slug", "mode", "idea", "audience", "targetSeconds", "voice", "source"] as const) {
      if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
        lines.push(`- ${field}: ${quoted(before[field])} -> ${quoted(after[field])}`);
      }
    }
    if (JSON.stringify(before.concepts) !== JSON.stringify(after.concepts)) {
      lines.push(`- concepts: ${quoted(before.concepts.join(", "))} -> ${quoted(after.concepts.join(", "))}`);
    }
    if (briefTool(before) !== briefTool(after)) {
      lines.push(`- tool: ${briefTool(before)} -> ${briefTool(after)}, the person's choice: keep it in every brief after this one`);
    } else if (JSON.stringify(before.toolReason) !== JSON.stringify(after.toolReason)) {
      lines.push(`- toolReason: ${quoted(before.toolReason)} -> ${quoted(after.toolReason)}`);
    }
    const names = (brief: DraftVideoBrief): string[] => brief.scenes.map((scene) => scene.name);
    for (const scene of after.scenes) if (!names(before).includes(scene.name)) lines.push(`- scene added: ${scene.name}`);
    for (const scene of before.scenes) if (!names(after).includes(scene.name)) lines.push(`- scene removed: ${scene.name}`);
    if (names(before).filter((name) => names(after).includes(name)).join("\u0000") !== names(after).filter((name) => names(before).includes(name)).join("\u0000")) {
      lines.push(`- scenes reordered: ${names(after).join(", ")}`);
    }
    for (const scene of after.scenes) {
      const was = before.scenes.find((candidate) => candidate.name === scene.name);
      if (was === undefined) continue;
      const count = Math.max(was.beats.length, scene.beats.length);
      for (let i = 0; i < count; i += 1) {
        const a = was.beats[i];
        const b = scene.beats[i];
        const at = `${scene.name} beat ${i + 1}`;
        if (a === undefined && b !== undefined) lines.push(`- ${at} added: say ${quoted(b.say)}`);
        else if (a !== undefined && b === undefined) lines.push(`- ${at} removed: say ${quoted(a.say)}`);
        else if (a !== undefined && b !== undefined) {
          for (const field of ["say", "show", "labels", "seconds"] as const) {
            if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) lines.push(`- ${at} ${field}: ${quoted(a[field])} -> ${quoted(b[field])}`);
          }
        }
      }
    }
    lines.unshift(lines.length === 0 ? "The person confirmed the video brief as it stands." : "The person edited the video brief by hand:");
  }
  if (options.pendingCleared === true) lines.push("The proposed new topic is dropped: the brief now names a topic that exists.");
  return lines.slice(0, EXTENDING_LINE_CAP).join("\n");
}

/** The most words one abbreviation note lists. */
export const ABBREVIATION_NOTE_CAP = 30;

/**
 * V11's planner half: the STUDIO note a turn carries about the abbreviations
 * of the video brief in force, or null for no note, and `told`, the words to
 * count as told once the turn answers. The note is due when the brief holds a
 * word the planner was not told of at the last turn that answered, so it
 * follows a brief proposed or edited with new ones and is never repeated for
 * the same set. It names the new words first, then those told before, and
 * `told` keeps only words a note has named, so a word past the cap is told by
 * a later note rather than counted as told unnamed. Null altogether, and
 * nothing counted, when there is nothing to weigh: no video brief in force,
 * one already pressed (the video agent may still respell a line while
 * voicing, D47), or gnosia-audio has not answered, when the runner cannot tell.
 */
export function abbreviationCheck(slot: KindSlot): { told: string[]; listed: string[]; note: string | null } | null {
  const brief = slot.brief;
  if (brief === null || !isVideoBrief(brief)) return null;
  if (slot.drawnSeq !== null && slot.briefSeq === slot.drawnSeq) return null;
  const words = videoAbbreviations(brief);
  if (words === null) return null;
  const before = new Set(slot.abbreviationsTold ?? []);
  const fresh = words.filter((word) => !before.has(word));
  if (fresh.length === 0) return { told: words, listed: [], note: null };
  const ordered = [...fresh, ...words.filter((word) => before.has(word))];
  const listed = ordered.slice(0, ABBREVIATION_NOTE_CAP);
  return {
    told: words.filter((word) => before.has(word) || listed.includes(word)),
    listed,
    note: abbreviationNote(ordered, slot.briefBy === "person"),
  };
}

/**
 * The note itself: the words, and what the planner may do about them. A note,
 * never a refusal: the brief stands, and some abbreviations are meant to be
 * said as words. It names no free text, so nothing in it can close its fence:
 * every word is letters and digits (`abbreviationsIn`).
 */
export function abbreviationNote(words: readonly string[], byPerson: boolean): string {
  const shown = words.slice(0, ABBREVIATION_NOTE_CAP).join(", ");
  const more = words.length > ABBREVIATION_NOTE_CAP ? ` and ${words.length - ABBREVIATION_NOTE_CAP} more` : "";
  return [
    `Video brief. The voice will read these words in its lines as words, not letter by letter: ${shown}${more}.`,
    "This is not a refusal: the brief stands as it is, and the person sees the same warning on its card. Answer the person's words as usual.",
    byPerson
      ? "The person wrote this brief by hand: keep their spelling in your next video brief unless they ask you to change it."
      : 'The next time you write a video brief, spell each one in `say` the way it is spoken ("A C L"), or keep it where it is meant to be said as a word.',
  ].join("\n");
}

/** The STUDIO note after a video is accepted: where it landed, so a change is a change brief on its slug. */
export function acceptedVideoNote(job: VideoJobRecord): string {
  return (
    `The video "${job.brief.title}" was accepted and saved as ${job.slug}, under ${job.topic}` +
    `${job.gate?.durationSeconds === undefined || job.gate?.durationSeconds === null ? "" : `, ${lengthOf(job.gate.durationSeconds)}`}. ` +
    `It exists now, so a change to what is said is a change brief on the slug ${job.slug}.`
  );
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Job states a draft acts on: the verdicts, and a job the runner died under. */
const JOB_VERDICTS: readonly string[] = ["failed", "cancelled", "interrupted", "accepted", "discarded"];

/** Job states that hold the draft at `drawing`. */
const ACTIVE_JOB: readonly string[] = ["queued", "running", "awaiting_review"];

/**
 * The fields a person's edit may set: the brief as GET returns it, less the
 * key Draw mints, the flowchart Draw attaches (C8), and `model`, which the
 * settings panel decides for every job from a draft (D53). An edit keeps
 * whatever model the brief it replaces already held (`modelOf`).
 */
export const EDITABLE_BRIEF_FIELDS = [...PLANNER_BRIEF_FIELDS, "notes", "source"] as const;

/**
 * A brief without the `sonnet` the old `validateBrief` filled in on every
 * brief before D53. Only that value goes: any other model is a person's choice.
 */
function withoutLegacyModel(brief: AnyDraftBrief): AnyDraftBrief {
  if ((brief as { model?: unknown }).model !== "sonnet") return brief;
  const kept: Record<string, unknown> = { ...brief };
  delete kept.model;
  return kept as unknown as AnyDraftBrief;
}

/** Every slot's brief and pending-edit base without a pre-D53 filled-in `sonnet`. */
function withoutLegacyModels(slots: Partial<Record<BriefKind, KindSlot>>): Partial<Record<BriefKind, KindSlot>> {
  const out: Partial<Record<BriefKind, KindSlot>> = {};
  for (const [kind, slot] of Object.entries(slots) as [BriefKind, KindSlot][]) {
    out[kind] = {
      ...slot,
      brief: slot.brief === null ? null : withoutLegacyModel(slot.brief),
      pendingEdit:
        slot.pendingEdit === null || slot.pendingEdit.base === null
          ? slot.pendingEdit
          : { ...slot.pendingEdit, base: withoutLegacyModel(slot.pendingEdit.base) },
    };
  }
  return out;
}

/**
 * The model of the brief an edit replaces, for the edited brief to keep. An
 * edit cannot set a model (the settings panel decides, D53), and must not
 * drop one a person chose before either.
 */
function modelOf(before: AnyDraftBrief | null): { model?: unknown } {
  const model = (before as { model?: unknown } | null)?.model;
  return model === undefined ? {} : { model };
}

function withoutKey(brief: ValidBrief): DraftBrief {
  const kept: Partial<ValidBrief> = { ...brief };
  delete kept.idempotencyKey;
  delete kept.mermaid;
  return kept as DraftBrief;
}

const quoted = (value: unknown): string => (value === undefined || value === null || value === "" ? "(none)" : JSON.stringify(value));

/**
 * The STUDIO note after a person edits the brief: what changed, field by
 * field, so the person can check it and the planner knows what to build on.
 */
export function describeBriefEdit(before: DraftBrief | null, after: DraftBrief, options: { pendingCleared?: boolean } = {}): string {
  const lines: string[] = [];
  if (before === null) {
    lines.push(`The person wrote the brief "${after.title}" by hand.`);
  } else {
    for (const field of ["title", "intent", "topic", "slug", "mode", "layout", "model", "notes", "source"] as const) {
      if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
        lines.push(`- ${field}: ${quoted(before[field])} -> ${quoted(after[field])}`);
      }
    }
    // Elements are matched by label first; the leftovers are paired in order
    // as renames, and whatever is left over after that was added or removed.
    // So an insert reads as one added element, not a cascade of renames.
    const afterLabels = new Set(after.elements.map((element) => element.label));
    const beforeLabels = new Set(before.elements.map((element) => element.label));
    const removed = before.elements.filter((element) => !afterLabels.has(element.label));
    const added = after.elements.filter((element) => !beforeLabels.has(element.label));
    const renamed = new Map<string, string>();
    const pairs = Math.min(removed.length, added.length);
    for (let i = 0; i < pairs; i += 1) {
      const was = removed[i]!;
      const now = added[i]!;
      renamed.set(was.label, now.label);
      const place = after.elements.indexOf(now) + 1;
      lines.push(`- element ${place}: "${was.label}" -> "${now.label}"`);
    }
    for (const element of added.slice(pairs)) lines.push(`- element added: "${element.label}"`);
    for (const element of removed.slice(pairs)) lines.push(`- element removed: "${element.label}"`);
    const rename = (label: string): string => renamed.get(label) ?? label;
    const notes = new Map(before.elements.map((element) => [rename(element.label), element.note ?? ""]));
    for (const element of after.elements) {
      const was = notes.get(element.label);
      if (was !== undefined && was !== (element.note ?? "")) {
        lines.push(`- element "${element.label}" note: ${quoted(was)} -> ${quoted(element.note)}`);
      }
    }
    const mapped = before.elements.map((element) => rename(element.label));
    const common = (labels: string[], other: string[]): string => labels.filter((label) => other.includes(label)).join("\u0000");
    const current = after.elements.map((element) => element.label);
    if (common(mapped, current) !== common(current, mapped)) {
      lines.push(`- elements reordered: ${after.elements.map((element) => `"${element.label}"`).join(", ")}`);
    }
    const arrow = (relation: DraftBrief["relations"][number]): string =>
      `${relation.from} -> ${relation.to}${relation.label === undefined ? "" : ` (${relation.label})`}`;
    const was = new Set(before.relations.map((relation) => arrow({ ...relation, from: rename(relation.from), to: rename(relation.to) })));
    const now = new Set(after.relations.map(arrow));
    for (const relation of now) if (!was.has(relation)) lines.push(`- arrow added: ${relation}`);
    for (const relation of was) if (!now.has(relation)) lines.push(`- arrow removed: ${relation}`);
    if (JSON.stringify(before.concepts) !== JSON.stringify(after.concepts)) {
      lines.push(`- concepts: ${quoted(before.concepts.join(", "))} -> ${quoted(after.concepts.join(", "))}`);
    }
    lines.unshift(lines.length === 0 ? "The person confirmed the brief as it stands." : "The person edited the brief by hand:");
  }
  if (options.pendingCleared === true) lines.push("The proposed new topic is dropped: the brief now names a topic that exists.");
  return lines.join("\n");
}

/** Written into a pruned draft's workspace before it is removed, so a partial removal is never loaded again. */
function tombstonePath(id: string): string {
  return path.join(draftDir(id), "pruned");
}

/**
 * How long a turn's C4 check may reuse the vocabulary this service last read
 * (every reply's verdict reads it), rather than spawn `catalog topic ls` again
 * before the turn. Read per call, so a suite can set it.
 */
function turnVocabularyMs(): number {
  const raw = Number(process.env.STUDIO_TURN_VOCABULARY_MS ?? "");
  return Number.isFinite(raw) && raw >= 0 && process.env.STUDIO_TURN_VOCABULARY_MS?.trim() ? raw : 60_000;
}

/** `?base=`: the seq of the brief the edit started from, or `none` for a draft with no brief. */
function parseBase(raw: unknown): number | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "none") return null;
  if (/^[1-9][0-9]{0,8}$/.test(text)) return Number(text);
  throw new JobRefused(
    400,
    `"base" is required: the seq of the transcript entry carrying the brief being edited, or "none" when there is no brief`,
    { field: "base" },
  );
}

/** The VOCABULARY block the planner was last told of by a C4 note; before any, its system prompt's. */
function vocabularyToldPath(id: string): string {
  return path.join(draftDir(id), "vocabulary-told.md");
}

/**
 * Each topic in a VOCABULARY block, by slug: its line and the relation and
 * concept lines under it, exactly as the planner read them. Taken from the
 * first such block in `text`, which may be the whole system prompt.
 */
export function vocabularyTopics(text: string): { domains: string | null; topics: Map<string, string> } | null {
  const begin = "-----BEGIN VOCABULARY-----";
  const start = text.indexOf(begin);
  if (start === -1) return null;
  const end = text.indexOf("-----END VOCABULARY-----", start);
  // Trailing space trimmed: a topic with no summary ends in "| ", and the
  // fence trims the block's last line, so the same topic would otherwise
  // read as changed whenever it stops being the last one.
  const lines = text
    .slice(start + begin.length, end === -1 ? undefined : end)
    .split("\n")
    .map((line) => line.trimEnd());
  let domains: string | null = null;
  const topics = new Map<string, string>();
  let current: string | null = null;
  let body = false;
  for (const line of lines) {
    if (!body) {
      if (line.startsWith("domains: ")) domains = line;
      if (line.trim() === "" && domains !== null) body = true;
      continue;
    }
    if (line.trim() === "") continue;
    if (line.startsWith("  ") && current !== null) {
      topics.set(current, `${topics.get(current)!}\n${line}`);
      continue;
    }
    current = line.split(" | ")[0]!.trim();
    topics.set(current, line);
  }
  return { domains, topics };
}

/** Lines a C4 note may carry before it says how many more there were, as the EXTENDING block is capped. */
const VOCABULARY_NOTE_CAP = EXTENDING_LINE_CAP;

/**
 * The C4 note: what is new, what changed and what is gone between the
 * vocabulary the planner was told of and the one the catalog lists now, and
 * the baseline for the next comparison: what the planner has now been told.
 * Removals come first and always fit; whole topics follow up to the cap, and
 * any that do not fit stay out of the baseline, so the next turn tells them.
 * Null when either block cannot be read.
 */
export function vocabularyChange(
  told: string,
  now: string,
): { note: string | null; baseline: string; complete: boolean } | null {
  const before = vocabularyTopics(told);
  const after = vocabularyTopics(now);
  if (before === null || after === null) return null;
  const added: [string, string][] = [];
  const changed: [string, string][] = [];
  const gone: string[] = [];
  for (const [slug, entry] of after.topics) {
    const was = before.topics.get(slug);
    if (was === undefined) added.push([slug, entry]);
    else if (was !== entry) changed.push([slug, entry]);
  }
  for (const slug of before.topics.keys()) if (!after.topics.has(slug)) gone.push(slug);
  if (added.length === 0 && changed.length === 0 && gone.length === 0) {
    return { note: null, baseline: now, complete: true };
  }
  const lines = ["The topic list changed since you were given the VOCABULARY block. Read it with these changes, in the same format:"];
  if (after.domains !== null && after.domains !== before.domains) lines.push(after.domains);
  if (gone.length > 0) lines.push(`archived or removed, so no brief may name them: ${gone.join(", ")}`);
  const baseline = new Map(before.topics);
  for (const slug of gone) baseline.delete(slug);
  let untold = 0;
  for (const [heading, group] of [
    ["added:", added],
    ["changed (as they are now):", changed],
  ] as const) {
    let headed = false;
    for (const [slug, entry] of group) {
      const entryLines = entry.split("\n");
      // One line kept back for the count of what did not fit.
      if (lines.length + entryLines.length + (headed ? 0 : 1) > VOCABULARY_NOTE_CAP - 1) {
        untold += 1;
        continue;
      }
      if (!headed) lines.push(heading);
      headed = true;
      lines.push(...entryLines);
      baseline.set(slug, entry);
    }
  }
  if (untold > 0) lines.push(`(${untold} more topic${untold === 1 ? "" : "s"} changed; they follow in the next note)`);
  const header = [after.domains ?? "domains: ", `relation kinds: ${TOPIC_RELATION_KINDS.join(", ")}`, ""];
  return {
    note: lines.join("\n"),
    baseline: untold === 0 ? now : fence("VOCABULARY", [...header, ...baseline.values()].join("\n")),
    complete: untold === 0,
  };
}

/** The note alone, for a caller that does not keep a baseline. */
export function vocabularyChangeNote(told: string, now: string): string | null {
  return vocabularyChange(told, now)?.note ?? null;
}

/** How long a first message may be in the drafts list. */
export const LIST_LINE_LIMIT = 120;

/** The most characters `GET /api/drafts?q=` takes. */
export const DRAFT_SEARCH_LIMIT = 200;

/** A message as one line of the drafts list: whitespace collapsed, cut with an ellipsis. */
export function listLine(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= LIST_LINE_LIMIT ? line : `${line.slice(0, LIST_LINE_LIMIT - 1).trimEnd()}…`;
}

/**
 * A search text as `list` compares it: whitespace runs as one space, trimmed,
 * each character folded on its own: lower case, with the Greek final sigma
 * written as the ordinary one (lower-casing a whole string would make "ΑΣ"
 * "ας" and a search for "ασ" miss it). One at a time so the web app can trace
 * a match back to the character it came from (a character may lower-case to
 * more than one letter, the Turkish dotted capital I), and so the two sides
 * agree on what matches by construction. The rule is the web app's
 * `searchText` in `studio-draft-list.ts`.
 */
export function searchText(text: string): string {
  return [...text.replace(/\s+/g, " ").trim()].map((char) => char.toLowerCase().replace("ς", "σ")).join("");
}

/** The longest name a conversation keeps, as the catalog's `draft.name` holds it. */
export const DRAFT_NAME_LIMIT = 200;

/**
 * A name as `rename` keeps it: one line (whitespace runs as one space),
 * trimmed, cut to `DRAFT_NAME_LIMIT` characters; null when nothing is left,
 * which clears the name. The sidebar's `cleanTitle` and the catalog's
 * `draft upsert` keep a name by the same rule. Anything but a string or null
 * is refused.
 */
export function cleanName(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new JobRefused(400, `"name" is a string, or null to clear the name`, { field: "name" });
  }
  const line = raw.replace(/\s+/g, " ").trim().slice(0, DRAFT_NAME_LIMIT).trim();
  return line === "" ? null : line;
}

/**
 * A model as a create or a `PUT .../model` keeps it: a name `claude --model`
 * takes, the same rule the settings panel's save applies, or null, posted as
 * `null`, `""` or `"default"`, which clears the pick and hands the runner's
 * own default back (D90).
 */
export function draftModel(raw: unknown, harness: "claude" | "byok" | "codex" | null = null): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new JobRefused(400, `"model" is a model name, or null/"default" for the runner's default`, { field: "model" });
  }
  const name = raw.trim();
  if (name === "" || name === "default") return null;
  // A name only means something on its own CLI (D92): a `gpt-` slug belongs
  // to codex, and one that is not is a claude name codex cannot take either.
  // BYOK's pick is a tier (D94): the provider's own model names live in
  // `byok.json`, resolved at spawn, so a conversation holds the tier only.
  if (harness === "byok") {
    if (name === "lite" || name === "max") return name;
    throw new JobRefused(400, `"${name}" is not a tier byok takes (lite, default, max)`, { field: "model" });
  }
  if (harness === "codex") {
    if (!isCodexModel(name)) {
      throw new JobRefused(400, `"${name}" is not a model name codex takes (a gpt- slug)`, { field: "model" });
    }
    return name;
  }
  if (isCodexModel(name)) {
    throw new JobRefused(400, `"${name}" is a codex model name; this conversation runs on claude`, { field: "model" });
  }
  if (!isAgentModel(name)) {
    throw new JobRefused(400, `"${name}" is not a model name the claude CLI takes`, { field: "model" });
  }
  return name;
}

/**
 * The `model` a draft's draw jobs inherit (D92): the conversation's pick, or
 * each kind's saved setting when there is none — but never a codex name. A
 * codex draft's pick is a `codex -m` slug, and every job the draft makes is a
 * `claude` spawn, so its own saved row stands instead.
 */
function jobModelOf(record: DraftRecord): string | null {
  // Only a claude conversation's pick is a claude name: codex's is a `gpt-`
  // slug, byok's a tier — neither means anything to a job's `claude` spawn.
  if ((record.harness ?? "claude") !== "claude") return null;
  return record.model ?? null;
}

/**
 * A model as `codex -m` takes: a `gpt-` slug, the shape every name in
 * `codex debug models`' catalog has (D92's tiers are its rows).
 */
export function isCodexModel(value: unknown): value is string {
  return typeof value === "string" && /^gpt-[0-9a-z][0-9a-z.-]*$/.test(value);
}

/**
 * A harness as a create or a `PUT .../harness` keeps it: `"byok"` for the open
 * harness (`qwen`), `"codex"` for OpenAI's `codex exec`, or null — absent,
 * `""`, `"default"` or `"claude"` — for `claude` itself. Anything else never
 * was a row.
 */
export function draftHarness(raw: unknown): "byok" | "codex" | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new JobRefused(400, `"harness" is "claude", "byok", "codex", or null/"default" for the runner's default`, { field: "harness" });
  }
  const name = raw.trim().toLowerCase();
  if (name === "" || name === "default" || name === "claude") return null;
  if (name === "byok") return "byok";
  if (name === "codex") return "codex";
  throw new JobRefused(400, `"harness" is "claude", "byok" or "codex"`, { field: "harness" });
}

/**
 * Whether a draft is a hit for `needle` (already `searchText`): the name the
 * owner gave it, its title, the first message the list shows for it (cut to
 * `LIST_LINE_LIMIT`, so a match past the cut is not found), or the title of
 * the concept a hand-off from the tutor opened it on. The web app's
 * `draftMatches` applies the same rule, so a runner from before this one,
 * which ignores `q`, still shows only matches.
 */
export function draftMatches(
  record: { name?: string | null; title: string | null; firstMessage?: string | null; concept?: { title: string } | null },
  needle: string,
): boolean {
  return [record.name, record.title, record.firstMessage, record.concept?.title].some(
    (field) => typeof field === "string" && searchText(field).includes(needle),
  );
}

function safeJson(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * How a retry's reply speaks, in the studio's instruction as in the prompt's
 * "A refused brief": the reply is shown to the person, and the refusal is not.
 * A retry once answered "(fix: `targetSeconds` set to 60, a valid whole number
 * in range; script unchanged, total narration length still fits)" to a person
 * who never saw what it was fixing (Phase 2 measured, docs/STUDIO-VIDEOS.md).
 */
export const RETRY_REPLY_RULE =
  "The person does not see this message: write to them as if proposing for the first time, and never name the refusal, a field or the fix. " +
  "Only when the fix changes something they asked for, say so in one plain sentence.";

/** The text a set of raw stream lines carries: the result, else the assistant's, else the deltas. */
export function replyText(lines: readonly string[]): string {
  let streamed = "";
  let assistant = "";
  let result: string | null = null;
  for (const line of lines) {
    const event = safeJson(line);
    if (event === null) continue;
    if (event.type === "stream_event") {
      const inner = event.event as Record<string, unknown> | undefined;
      const delta = inner?.delta as Record<string, unknown> | undefined;
      if (inner?.type === "content_block_delta" && delta?.type === "text_delta" && typeof delta.text === "string") {
        streamed += delta.text;
      }
    } else if (event.type === "assistant") {
      const content = (event.message as { content?: unknown } | undefined)?.content;
      if (Array.isArray(content)) {
        for (const block of content as { type?: unknown; text?: unknown }[]) {
          if (block.type === "text" && typeof block.text === "string") assistant += block.text;
        }
      }
    } else if (event.type === "result" && event.is_error !== true && typeof event.result === "string") {
      result = event.result;
    }
  }
  return (result ?? (assistant || streamed)).trim();
}

/** The SSE form of a transcript event, or null for one the stream does not carry. */
function streamEventOf(event: TranscriptEvent): DraftStreamEvent | null {
  switch (event.type) {
    case "message":
    case "reply":
    case "studio": {
      const entry = entryOf(event);
      return entry === null ? null : { id: event.seq, event: event.type, data: entry };
    }
    case "brief": {
      const kind = kindOfEvent(event);
      const abbreviations = kind === "video" ? videoAbbreviations(event.brief as { voice?: unknown; scenes?: unknown }) : null;
      return {
        id: event.seq,
        event: "brief",
        data: {
          seq: event.seq,
          replySeq: event.replySeq,
          kind,
          brief: event.brief,
          pendingTopic: event.pendingTopic ?? null,
          requestSeq: typeof event.requestSeq === "number" ? event.requestSeq : null,
          ...(event.edit === true ? { edit: true } : {}),
          ...(abbreviations === null ? {} : { abbreviations }),
        },
      };
    }
    case "brief-invalid":
      return {
        id: event.seq,
        event: "brief-invalid",
        data: {
          seq: event.seq,
          replySeq: event.replySeq,
          kind: kindOfEvent(event),
          field: event.field,
          message: event.message,
          retried: event.retried,
        },
      };
    case "brief-ignored":
      return { id: event.seq, event: "brief-ignored", data: { seq: event.seq, replySeq: event.replySeq, kind: event.kind } };
    case "error":
      return {
        id: event.seq,
        event: "error",
        data: {
          seq: event.seq,
          kind: event.kind,
          message: event.message,
          ...(event.field === undefined ? {} : { field: event.field }),
          ...(event.briefKind === undefined ? {} : { briefKind: event.briefKind }),
        },
      };
    default:
      return null;
  }
}

/** A brief event's kind: absent on a draft from before D61, which is a diagram. */
function kindOfEvent(event: TranscriptEvent): BriefKind {
  return isBriefKind(event.kind) ? event.kind : "diagram";
}

function entryOf(event: TranscriptEvent): TranscriptEntry | null {
  const text = typeof event.text === "string" ? event.text : "";
  switch (event.type) {
    case "message":
      return {
        seq: event.seq,
        role: "person",
        text,
        at: event.at,
        ...(Array.isArray(event.mentions) && event.mentions.length > 0 ? { mentions: event.mentions as Mention[] } : {}),
      };
    case "reply":
      return {
        seq: event.seq,
        role: "planner",
        text,
        at: event.at,
        ...(event.interrupted === true ? { interrupted: true } : {}),
        ...(Array.isArray(event.suggest) && event.suggest.length > 0 ? { suggest: event.suggest as TagKind[] } : {}),
        ...(typeof event.pitch === "string" ? { pitch: event.pitch } : {}),
        ...(typeof event.hold === "object" && event.hold !== null ? { hold: event.hold as { kinds: BriefKind[]; reason: string } } : {}),
        costUsd: typeof event.costUsd === "number" ? event.costUsd : null,
        costSource: (event.costSource as CostSource | null | undefined) ?? null,
      };
    case "studio":
      return {
        seq: event.seq,
        role: "studio",
        text,
        at: event.at,
        ...(event.internal === true ? { internal: true } : {}),
        ...(event.edit === true ? { edit: true } : {}),
      };
    default:
      return null;
  }
}

/**
 * The transcript as the API reports it: person, planner and studio turns,
 * each reply carrying its verdicts per kind (D61). A reply whose every brief
 * was refused and retried is superseded by the retry's reply; one with a
 * valid brief stays, and the retry's reply carries the fixed card under it.
 */
export function transcriptOf(events: readonly TranscriptEvent[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const bySeq = new Map<number, TranscriptEntry>();
  for (const event of events) {
    const entry = entryOf(event);
    if (entry !== null) {
      entries.push(entry);
      bySeq.set(entry.seq, entry);
      continue;
    }
    const reply = typeof event.replySeq === "number" ? bySeq.get(event.replySeq) : undefined;
    if (reply === undefined) continue;
    if (event.type === "brief") {
      const kind = kindOfEvent(event);
      const pendingTopic = event.pendingTopic === null || event.pendingTopic === undefined ? undefined : (event.pendingTopic as PendingTopic);
      const briefs = (reply.briefs ?? []).filter((brief) => brief.kind !== kind);
      // Worked out as the transcript is read rather than stored on the event,
      // so a fix to the pronunciation table reaches every card at once.
      const abbreviations = kind === "video" ? videoAbbreviations(event.brief as { voice?: unknown; scenes?: unknown }) : null;
      briefs.push({
        kind,
        brief: event.brief as AnyDraftBrief,
        ...(pendingTopic === undefined ? {} : { pendingTopic }),
        requestSeq: typeof event.requestSeq === "number" ? event.requestSeq : null,
        ...(abbreviations === null ? {} : { abbreviations }),
      });
      reply.briefs = briefs;
      reply.brief = event.brief as AnyDraftBrief;
      if (pendingTopic !== undefined) reply.pendingTopic = pendingTopic;
    } else if (event.type === "brief-invalid") {
      const retried = event.retried === true;
      const invalid = { field: String(event.field), message: String(event.message), retried };
      reply.briefsInvalid = [...(reply.briefsInvalid ?? []), { kind: kindOfEvent(event), ...invalid }];
      reply.briefInvalid = invalid;
    } else if (event.type === "brief-ignored") {
      reply.briefsIgnored = [...(reply.briefsIgnored ?? []), String(event.kind)];
    } else if (event.type === "declined" && Array.isArray(event.kinds)) {
      // D109: the person's Deny, marked on the reply that offered so its card
      // reads declined rather than live.
      const kinds = (event.kinds as unknown[]).filter(isTagKind);
      reply.declined = [...new Set([...(reply.declined ?? []), ...kinds])];
    }
  }
  for (const entry of entries) {
    if ((entry.briefsInvalid ?? []).some((invalid) => invalid.retried) && (entry.briefs ?? []).length === 0) entry.superseded = true;
  }
  return entries;
}

/**
 * The most of the conversation a fresh session is handed (C3), in characters:
 * the runner's 1 MB body limit, since a chat message has no cap of its own and
 * one message may be that long.
 */
const REPLAY_LIMIT = 1_000_000;

/**
 * The conversation for a fresh session, newest entries first until `limit`,
 * each whole: a message is never cut part way, and the newest is kept however
 * long it is. When older ones are left out, the text says so.
 */
export function replayOf(entries: readonly string[], limit: number): string {
  const kept: string[] = [];
  let size = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (kept.length > 0 && size + entry.length > limit) {
      kept.unshift(`(${index + 1} earlier ${index === 0 ? "entry" : "entries"} left out for length)`);
      break;
    }
    kept.unshift(entry);
    size += entry.length;
  }
  return kept.join("\n\n");
}

/** The conversation as plain entries, for a fresh session that could not resume the old one (C3); a tagged message keeps its TAGS block (T22). */
function conversationEntries(events: readonly TranscriptEvent[], leaveOut: number | null = null): string[] {
  const tagsBySeq = new Map<number, string[]>();
  for (const event of events) {
    if (event.type === "message" && Array.isArray(event.tags) && event.tags.length > 0) tagsBySeq.set(event.seq, event.tags as string[]);
  }
  return transcriptOf(events)
    .filter((entry) => entry.superseded !== true && entry.internal !== true && entry.seq !== leaveOut)
    .map((entry) => {
      const tags = tagsBySeq.get(entry.seq);
      return tags === undefined ? `${entry.role}: ${entry.text}` : `${entry.role}: ${fence("TAGS", tags.join("\n"))}\n${entry.text}`;
    });
}

/**
 * The STUDIO note after an accept: the verdict, the slug, and what the gate
 * held the drawing to. The gate checked every element label against a drawn
 * shape and every relation against a binding, so the brief's lists are what
 * the drawing is known to contain. Capped like the EXTENDING block.
 */
export function acceptedNote(job: JobRecord): string {
  const lines = [
    `The diagram "${job.brief.title}" was accepted and saved as ${job.slug}, under ${job.topic}.`,
    `It exists now, so a change to it is an extend brief on the slug ${job.slug}. What the gate found in the drawing:`,
    "labels:",
    ...job.brief.elements.map((element) => `  ${element.label}`),
    "arrows:",
    ...job.brief.relations.map((relation) => `  ${relation.from} -> ${relation.to}${relation.label === undefined ? "" : ` (${relation.label})`}`),
  ];
  return lines.slice(0, EXTENDING_LINE_CAP).join("\n");
}

export function noteForDraft(record: DraftRecord): string {
  const live = BRIEF_KINDS.filter((kind) => {
    const slot = record.slots?.[kind];
    return slot !== undefined && slot.brief !== null && slot.state === "briefed";
  });
  const waiting = BRIEF_KINDS.filter((kind) => record.slots?.[kind]?.waiting != null);
  switch (record.state) {
    case "open":
      return record.inFlight !== null
        ? "the planner is answering"
        : record.turns === 0
          ? record.concept != null
            ? `a conversation about ${record.concept.title}: tag @diagram or @video to make one of it, or ask about it first`
            : record.conversational === true
              ? "a new conversation: ask about an idea, or tag @diagram or @video to make one"
              : "a new conversation: say what the diagram should make clear"
          : waiting.length > 0
            ? `the planner owes a ${waiting.join(" and a ")} brief`
            : "the planner is waiting for your reply";
    case "briefed": {
      const pending = BRIEF_KINDS.map((kind) => record.slots?.[kind]?.pendingTopic).find((topic) => topic != null);
      if (pending != null) return `a brief is ready on a new topic, ${pending.entry.slug}: the press creates it`;
      return live.length > 1
        ? "a diagram brief and a video brief are ready: Draw, Make video, or Make both"
        : live[0] === "video"
          ? "a video brief is ready: Make video starts it"
          : "a brief is ready: Draw starts the drawing";
    }
    case "drawing": {
      const jobs = BRIEF_KINDS.map((kind) => record.slots?.[kind])
        .filter((slot): slot is KindSlot => slot !== undefined && slot.state === "drawing" && slot.jobId !== null)
        .map((slot) => slot.jobId);
      return `drawing: job ${jobs.join(", ") || (record.jobIds.at(-1) ?? "?")}`;
    }
    case "done":
      return "the job is reviewed. Ask for another, or a change to this one";
    case "abandoned":
      return "this conversation is closed";
  }
}
