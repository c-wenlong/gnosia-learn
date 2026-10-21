import type { TopicEntry } from "@gnosia/content";

import { isAgentModel } from "@gnosia/schema/shared";

import { topicList } from "../data/catalog";
import { MERMAID_LIMIT, studioOwner, TEXT_LIMIT, VOCABULARY_STATUS_MS } from "../config";
import { readThrough, type CachedRead } from "../data/content-cache";

/**
 * The brief, and the refusals that happen before anything is spent.
 *
 * Two different jobs live here and it is worth keeping them apart. The first is
 * completeness: a job cannot start until every required field is filled, so the
 * UI's job is to ask rather than to guess (the same rule manimkc's DESIGN.md
 * states for its own brief). The second is that **a brief is untrusted input**.
 * The person submitting is not the threat; a note or a flowchart pasted from
 * somewhere else is. So slug-shaped fields are pattern-checked, free text is
 * length-capped, and the mermaid source never enters the prompt at all — it is
 * written to the job scratch directory and lifted with `from-mermaid --source`,
 * which is a parser rather than a model.
 *
 * Nothing here is a security boundary on its own. The per-job settings file is;
 * this is what stops a paragraph of instructions reaching the prompt in a field
 * that was meant to hold a slug. See edge case A5.
 */

/**
 * The same expression tldrawkc exports from `src/lib/meta.ts`.
 *
 * Duplicated rather than imported, and that is a deviation worth naming: the
 * tool is a git submodule with its own lockfile and is deliberately not an npm
 * workspace of this repo, so there is no specifier that resolves it at
 * typecheck time. The value is three characters of regex that has not changed
 * since the tool's metadata bag existed, and the gate re-checks the stamp the
 * tool itself wrote, so a drift here surfaces as a refused diagram rather than
 * as a bad file.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MODES = ["new", "extend"] as const;
export type Mode = (typeof MODES)[number];

export const LAYOUTS = ["flow-lr", "layered", "comparison", "radial"] as const;
export type Layout = (typeof LAYOUTS)[number];

export interface BriefElement {
  label: string;
  note?: string;
}

export interface BriefRelation {
  from: string;
  to: string;
  label?: string;
}

/** What a caller posts to `POST /api/jobs`. */
export interface Brief {
  intent: string;
  topic: string;
  slug: string;
  title: string;
  mode: Mode;
  elements: BriefElement[];
  relations: BriefRelation[];
  concepts?: string[];
  layout?: Layout;
  /** The flowchart text itself. Written to scratch; never interpolated. */
  mermaid?: string;
  source?: string;
  model?: string;
  notes?: string;
  /** Supplied by the caller so a retried submit returns the existing job. */
  idempotencyKey?: string;
}

/** A validated brief: every field present, every slug checked, every cap applied. */
export interface ValidBrief extends Brief {
  mode: Mode;
  /**
   * Only when the brief named one. Absent is the ordinary case: the runner
   * then takes the model from the settings panel's Diagrams row at job start
   * (D53 of docs/STUDIO-VIDEOS.md), and `sonnet` when the owner never saved
   * one. Filling `sonnet` in here, as this did before the panel, would make
   * every brief name a model and the panel apply to none.
   */
  model?: string;
  concepts: string[];
  idempotencyKey: string;
}

export class BriefError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "BriefError";
    this.field = field;
  }
}

function text(value: unknown, field: string, limit = TEXT_LIMIT): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BriefError(field, `"${field}" is required and must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > limit) {
    throw new BriefError(
      field,
      `"${field}" is ${trimmed.length} characters and the cap is ${limit}. A brief field is a ` +
        `label, not a document: put the long version in "notes" or in the concept note.`,
    );
  }
  return trimmed;
}

function optionalText(value: unknown, field: string, limit = TEXT_LIMIT): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, field, limit);
}

function slug(value: unknown, field: string): string {
  const raw = text(value, field, 120);
  if (!SLUG_PATTERN.test(raw)) {
    throw new BriefError(
      field,
      `"${raw}" is not a slug. Lowercase letters, digits and single hyphens only, which is ` +
        `what tldrawkc's own metadata accepts and what a file name can carry.`,
    );
  }
  return raw;
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const raw = text(value, field, 40);
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new BriefError(field, `"${raw}" is not a "${field}". Known: ${allowed.join(", ")}.`);
  }
  return raw as T;
}

/**
 * A model name on a brief: whatever `claude --model` takes, the same rule the
 * settings panel's save applies (D53). Newer releases rename models without a
 * schema bump, so the check is the name's shape, not a fixed list.
 */
export function agentModelName(value: unknown): string {
  const raw = text(value, "model", 90);
  if (!isAgentModel(raw)) {
    throw new BriefError("model", `"${raw}" is not a model name the claude CLI takes`);
  }
  return raw;
}

/** The topic vocabulary, as a brief is checked against it. */
export interface Vocabulary {
  topics: Map<string, { title: string; concepts: string[] }>;
  /**
   * Every topic as the catalog listed it, for a screen that shows titles and
   * domains (the web studio's chips and the brief form's picker).
   */
  entries: TopicEntry[];
  /** When the vocabulary was read from its source, as an ISO instant. */
  readAt: string;
  /**
   * True when the source could not be read and this is the copy cached at
   * `readAt` (D13): the screen says "stale since" rather than showing it as
   * current.
   */
  stale: boolean;
  /** Why the source could not be read, when `stale`. */
  staleReason?: string;
}

/**
 * The topics, as `catalog topic ls --json` lists them, cut to the fields a
 * `TopicEntry` has so the cached copy is the same shape the rest of the repo
 * reads. The listing's `incoming` edges are the planner's and are not kept.
 */
async function readTopics(): Promise<TopicEntry[]> {
  const result = await topicList();
  const listed = (result.json as { topics?: unknown } | null)?.topics;
  if (!result.ok || !Array.isArray(listed)) {
    throw new Error(result.error ?? "catalog topic ls printed no topics list");
  }
  const entries: TopicEntry[] = [];
  for (const item of listed) {
    const entry = entryOf(item);
    if (entry === null) {
      throw new Error(`catalog topic ls printed a topic without a slug, a title or a concepts list: ${JSON.stringify(item)}`);
    }
    entries.push(entry);
  }
  return entries;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** One listed topic as a `TopicEntry`, or null when a field a brief is checked on is missing. */
function entryOf(value: unknown): TopicEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const maps = (typeof raw.maps === "object" && raw.maps !== null ? raw.maps : {}) as Record<string, unknown>;
  if (typeof raw.slug !== "string" || typeof raw.title !== "string") return null;
  if (!Array.isArray(maps.concepts) || !maps.concepts.every((c: unknown) => typeof c === "string")) return null;
  return {
    slug: raw.slug,
    title: raw.title,
    domain: typeof raw.domain === "string" ? raw.domain : "",
    summary: typeof raw.summary === "string" ? raw.summary : null,
    aliases: strings(raw.aliases),
    relations: Array.isArray(raw.relations) ? (raw.relations as TopicEntry["relations"]) : [],
    maps: { manimkc: strings(maps.manimkc), courses: strings(maps.courses), concepts: maps.concepts as string[] },
  };
}

/**
 * The vocabulary: the catalog's topic rows, through the studio's cache.
 *
 * Read with `catalog topic ls` because the studio opens no database connection
 * of its own (`catalog.ts` says why), and the rows are the one truth the
 * enqueue's foreign key and the gate check the same slug against: D7 explains
 * why all three checks are worth having. Every good read is kept in
 * `$STUDIO_HOME/cache/topics.<owner>.json`, and a read that fails for any
 * reason (the database down, the CLI exiting 3, a listing that does not parse)
 * is answered from that copy, marked stale with the time it was read (D13).
 * With Postgres down the studio still browses and still draws (U3), and the
 * topic list is one of the things that makes that true.
 *
 * One copy per owner, as the diagram list keeps, since the listing is one
 * owner's (`topic ls --owner`), and never the old `topics.json`, which a
 * runner from before that flag wrote from every owner's topics. An upgraded
 * runner that finds the database down before its first read has no copy,
 * rather than one naming another owner's topics and concepts.
 *
 * With no copy on disk a failed read throws: `/api/health` then reports
 * `readAt: null`, and a brief cannot be checked until the catalog answers.
 */
export async function loadVocabulary(): Promise<Vocabulary> {
  let read: CachedRead<TopicEntry[]>;
  try {
    read = await readThrough(`topics.${studioOwner()}`, readTopics, { isValue: isTopicList });
  } catch (error) {
    remember({ readAt: null, stale: true, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  remember({ readAt: read.readAt, stale: read.stale, ...(read.error === undefined ? {} : { error: read.error }) });
  const topics = new Map<string, { title: string; concepts: string[] }>();
  for (const entry of read.value) {
    topics.set(entry.slug, { title: entry.title, concepts: [...entry.maps.concepts] });
  }
  return {
    topics,
    entries: read.value,
    readAt: read.readAt,
    stale: read.stale,
    ...(read.error === undefined ? {} : { staleReason: read.error }),
  };
}

/** Where the vocabulary stands, as `/api/health` reports it. `readAt: null` means no copy at all. */
export interface VocabularyStatus {
  readAt: string | null;
  stale: boolean;
  error?: string;
}

/** The outcome of the last `loadVocabulary`, from any route, and when it came. */
let lastStatus: { at: number; status: VocabularyStatus } | null = null;
let statusRead: Promise<VocabularyStatus> | null = null;

function remember(status: VocabularyStatus): void {
  lastStatus = { at: Date.now(), status };
}

/**
 * The vocabulary's state for `/api/health`, without a `catalog topic ls` per
 * call.
 *
 * Every studio page render asks health, and each read spawns the catalog CLI.
 * So health reuses the last read any route made (a brief's enqueue, the
 * vocabulary route, an earlier health) when it is younger than
 * `STUDIO_VOCABULARY_STATUS_MS`, and concurrent callers share one read. A
 * brief is still checked against a read of its own, so the cost of the reuse
 * is only that the health line can be that many seconds behind an outage.
 */
export async function vocabularyStatus(maxAgeMs: number = VOCABULARY_STATUS_MS): Promise<VocabularyStatus> {
  if (lastStatus !== null && Date.now() - lastStatus.at < maxAgeMs) return lastStatus.status;
  statusRead ??= loadVocabulary()
    .then(
      (): VocabularyStatus => lastStatus?.status ?? { readAt: null, stale: true },
      (): VocabularyStatus => lastStatus?.status ?? { readAt: null, stale: true },
    )
    .finally(() => {
      statusRead = null;
    });
  return statusRead;
}

/**
 * `vocabularyStatus` for `/api/health`, which never waits once there is an
 * answer: the last outcome, however old, and a read started behind it when it
 * is older than `STUDIO_VOCABULARY_STATUS_MS`. Only with no outcome at all
 * (the first call after a start) does it wait for one.
 */
export async function vocabularyStatusNow(maxAgeMs: number = VOCABULARY_STATUS_MS): Promise<VocabularyStatus> {
  if (lastStatus === null) return vocabularyStatus(maxAgeMs);
  if (Date.now() - lastStatus.at >= maxAgeMs) void vocabularyStatus(maxAgeMs);
  return lastStatus.status;
}

/** The fields `loadVocabulary` reads, checked on a cached copy before it is trusted. */
function isTopicList(value: unknown): value is TopicEntry[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return false;
      const topic = entry as { slug?: unknown; title?: unknown; maps?: { concepts?: unknown } };
      return (
        typeof topic.slug === "string" &&
        typeof topic.title === "string" &&
        Array.isArray(topic.maps?.concepts) &&
        topic.maps.concepts.every((concept: unknown) => typeof concept === "string")
      );
    })
  );
}

/**
 * Validate a posted brief, or refuse it with the field named.
 *
 * The topic check is the earliest moment "refuse, never skip" can fire, and it
 * is worth doing here as well as at the foreign key: a slug that is not in the
 * vocabulary costs a 400 with a sentence in it, rather than a `23503` a caller
 * has to decode.
 */
export function validateBrief(input: unknown, vocabulary: Vocabulary): ValidBrief {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BriefError("body", "the request body must be a JSON object holding a brief");
  }
  const raw = input as Record<string, unknown>;

  const intent = text(raw.intent, "intent");
  const topic = slug(raw.topic, "topic");
  const known = vocabulary.topics.get(topic);
  if (known === undefined) {
    throw new BriefError(
      "topic",
      `no topic "${topic}" in the catalog's vocabulary. A diagram is filed under a topic that ` +
        `already exists; add it with \`catalog topic add\` first if this is a new subject.`,
    );
  }
  const diagramSlug = slug(raw.slug, "slug");
  const title = text(raw.title, "title", 200);
  const mode = oneOf(raw.mode, "mode", MODES);

  if (!Array.isArray(raw.elements) || raw.elements.length === 0) {
    throw new BriefError(
      "elements",
      `"elements" must be a non-empty array of { label, note }. They are the agent's checklist ` +
        `and half of what the gate checks, so a brief without them cannot be judged.`,
    );
  }
  const elements: BriefElement[] = raw.elements.map((element, i) => {
    if (typeof element !== "object" || element === null) {
      throw new BriefError(`elements[${i}]`, `element ${i} must be an object with a "label"`);
    }
    const record = element as Record<string, unknown>;
    const label = text(record.label, `elements[${i}].label`, 200);
    const note = optionalText(record.note, `elements[${i}].note`);
    return { label, ...(note === undefined ? {} : { note }) };
  });

  if (!Array.isArray(raw.relations)) {
    throw new BriefError(
      "relations",
      `"relations" must be an array of { from, to, label }. It may be empty, and an empty array ` +
        `is a different statement from a missing field: it says the diagram has no arrows.`,
    );
  }
  const labels = new Set(elements.map((element) => element.label));
  const relations: BriefRelation[] = raw.relations.map((relation, i) => {
    if (typeof relation !== "object" || relation === null) {
      throw new BriefError(`relations[${i}]`, `relation ${i} must be an object`);
    }
    const record = relation as Record<string, unknown>;
    const from = text(record.from, `relations[${i}].from`, 200);
    const to = text(record.to, `relations[${i}].to`, 200);
    for (const [field, value] of [
      [`relations[${i}].from`, from],
      [`relations[${i}].to`, to],
    ] as const) {
      if (!labels.has(value)) {
        throw new BriefError(
          field,
          `"${value}" is not one of the elements. An arrow binds two shapes, so both ends have ` +
            `to be things the diagram is going to draw.`,
        );
      }
    }
    const label = optionalText(record.label, `relations[${i}].label`, 200);
    return { from, to, ...(label === undefined ? {} : { label }) };
  });

  const concepts = Array.isArray(raw.concepts)
    ? raw.concepts.map((value, i) => slug(value, `concepts[${i}]`))
    : [];
  for (const concept of concepts) {
    if (!known.concepts.includes(concept)) {
      throw new BriefError(
        "concepts",
        `"${concept}" is not filed under topic "${topic}" in the catalog's vocabulary, so it ` +
          `would be dropped from the asset row after the diagram is drawn.`,
      );
    }
  }

  const mermaid = optionalText(raw.mermaid, "mermaid", MERMAID_LIMIT);
  const layout = raw.layout === undefined ? undefined : oneOf(raw.layout, "layout", LAYOUTS);
  const source = optionalText(raw.source, "source", 400);
  const notes = optionalText(raw.notes, "notes");
  const model = raw.model === undefined ? undefined : agentModelName(raw.model);
  const idempotencyKey = optionalText(raw.idempotencyKey, "idempotencyKey", 200);

  return {
    intent,
    topic,
    slug: diagramSlug,
    title,
    mode,
    elements,
    relations,
    concepts,
    ...(layout === undefined ? {} : { layout }),
    ...(mermaid === undefined ? {} : { mermaid }),
    ...(source === undefined ? {} : { source }),
    ...(notes === undefined ? {} : { notes }),
    ...(model === undefined ? {} : { model }),
    // An absent key still has to be unique, or a second brief for a different
    // diagram would resolve to the first job. The caller supplying one is what
    // makes a retried submit safe; minting one here only makes it legal.
    idempotencyKey: idempotencyKey ?? `studio:${topic}:${diagramSlug}:${Date.now()}`,
  };
}

/**
 * The brief as the agent sees it: the fields that describe the drawing, with
 * everything operational removed.
 *
 * `mermaid` is not here, and that is the point of the function. The flowchart
 * reaches the agent as a path to a file it runs a parser over, never as text in
 * a prompt.
 */
export function promptFacing(brief: ValidBrief): Record<string, unknown> {
  return {
    intent: brief.intent,
    title: brief.title,
    topic: brief.topic,
    concepts: brief.concepts,
    mode: brief.mode,
    elements: brief.elements,
    relations: brief.relations,
    ...(brief.layout === undefined ? {} : { layout: brief.layout }),
    ...(brief.source === undefined ? {} : { source: brief.source }),
    ...(brief.notes === undefined ? {} : { notes: brief.notes }),
  };
}
