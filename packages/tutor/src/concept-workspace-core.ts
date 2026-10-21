import type { AssetRef, KbConcept, KnowledgeBase, MasteryLabel, ReviewCard } from "@gnosia/catalog/state";

import type { ConceptPromptInput, ConceptPromptNeighbour } from "./prompt";
import { backlinksOf, dependantsOf, neighbourhood, type GraphNode, type GraphSelection } from "./concept-graph";
import type { ConceptCheck } from "./concept-note-core";
import { bucketOf, MASTERY_BUCKET_LABEL, type MasteryBucket } from "./mastery-bucket";
import { normaliseQuestion } from "./session-core";

/**
 * Everything the concept workspace shows about one concept, assembled from
 * the pieces the server reads (the knowledge base, the note file, the event
 * log, the review card, the asset links).
 *
 * Pure: `concept-workspace.ts` does the reading and hands the pieces here, so
 * the rules (what a backlink is, which observations make the history, which
 * checks count as passed) are tested without a database. The same object is
 * the page's props and the body of `GET /api/concepts/[slug]`, and the tutor's
 * prompt is built from it by `toConceptPromptInput`.
 */

export interface NeighbourRef {
  slug: string;
  title: string;
  bucket: MasteryBucket;
  pL: number;
}

/** Where a concept sits in a course, from the first of its curriculum items that resolves. */
export interface ConceptPlace {
  courseSlug: string;
  courseCode: string;
  courseTitle: string;
  moduleSlug: string;
  moduleOrder: number;
  moduleTitle: string;
  topicId: string;
  topicTitle: string;
}

export interface WorkspaceObservation {
  at: string;
  correct: boolean;
  pLBefore: number | null;
  pLAfter: number | null;
  question: string | null;
  /** `probe`, `teach`, `review`: which step of the loop recorded it. */
  source: string | null;
}

export type CheckStatus = "passed" | "missed" | "untried";

export interface WorkspaceCheck extends ConceptCheck {
  /**
   * From the latest observation whose question is this check's question, when
   * there is one. Best effort: an observation records the question it asked
   * as text, not which check it came from, so a reworded check reads as untried.
   */
  status: CheckStatus;
}

export type WorkspaceNote =
  | { available: true; path: string; source: string }
  | { available: false; code: "no-note" | "too-large" | "not-flipped" | "unreachable"; message: string };

export interface ConceptWorkspace {
  slug: string;
  title: string;
  summary: string;
  domain: string | null;
  bucket: MasteryBucket;
  pL: number;
  mastery: MasteryLabel;
  observations: number;
  correct: number;
  lastSeen: string | null;
  place: ConceptPlace | null;
  note: WorkspaceNote;
  /** The note's `sources:` frontmatter, as written. */
  sources: string[];
  tags: string[];
  requires: NeighbourRef[];
  assumes: NeighbourRef[];
  /** Concepts that require this one. */
  dependants: NeighbourRef[];
  /** Concepts whose `requires` or `assumes` names this one. */
  backlinks: NeighbourRef[];
  checks: WorkspaceCheck[];
  /** Every direct observation of this concept outside a voided session, oldest first. */
  history: WorkspaceObservation[];
  review: {
    due: string;
    intervalDays: number;
    ease: number;
    repetitions: number;
    lapses: number;
    leech: boolean;
  } | null;
  /** Assets linked to this concept, its own note left out. */
  assets: AssetRef[];
  /** The neighbourhood graph: this concept, its prerequisites and its dependants. */
  graph: GraphSelection;
  /** True when this concept is on the frontier: every prerequisite met, itself not yet held. */
  frontier: boolean;
}

/** An event as `readEvents` returns it; only the fields read here are named. */
export interface WorkspaceEvent {
  at: string;
  type: string;
  concept?: string | null;
  session?: string | null;
  [key: string]: unknown;
}

export function graphNodeOf(concept: KbConcept, courses: readonly string[] = []): GraphNode {
  return {
    id: concept.id,
    title: concept.title,
    bucket: bucketOf(concept),
    pL: concept.pL,
    courses: [...courses],
    domain: concept.domain,
  };
}

function refOf(concept: KbConcept): NeighbourRef {
  return { slug: concept.id, title: concept.title, bucket: bucketOf(concept), pL: concept.pL };
}

const normalise = normaliseQuestion;

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/** Direct observations of `slug`, oldest first, voided sessions left out. */
export function observationsOf(events: readonly WorkspaceEvent[], slug: string): WorkspaceObservation[] {
  const voided = new Set(
    events
      .filter((e) => e.type === "void" && typeof e.session === "string" && e.session !== "")
      .map((e) => e.session as string),
  );
  return events
    .filter((e) => e.type === "observation" && e.concept === slug && !(typeof e.session === "string" && voided.has(e.session)))
    .map((e) => ({
      at: e.at,
      correct: e.correct === true,
      pLBefore: num(e.pLBefore),
      pLAfter: num(e.pLAfter),
      question: str(e.question),
      source: str(e.source),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Each check with what the latest observation asking its question said. */
export function checkStatuses(checks: readonly ConceptCheck[], history: readonly WorkspaceObservation[]): WorkspaceCheck[] {
  return checks.map((check) => {
    const question = normalise(check.question);
    const latest = [...history].reverse().find((o) => o.question !== null && normalise(o.question) === question);
    return { ...check, status: latest === undefined ? "untried" : latest.correct ? "passed" : "missed" };
  });
}

/**
 * The last `count` p(L) values after each observation, for the six-bar history
 * in the mastery card. Fewer observations give fewer bars.
 */
export function historyBars(history: readonly WorkspaceObservation[], count = 6): number[] {
  return history
    .map((o) => o.pLAfter)
    .filter((v): v is number => v !== null)
    .slice(-count);
}

export interface WorkspaceInput {
  kb: KnowledgeBase;
  slug: string;
  note: WorkspaceNote;
  frontmatter: { sources: string[]; tags: string[] } | null;
  checks: ConceptCheck[];
  events: readonly WorkspaceEvent[];
  card: ReviewCard | null;
  assets: AssetRef[];
  place: ConceptPlace | null;
}

/** The workspace for `slug`, or null when the knowledge base has no such concept. */
export function buildConceptWorkspace(input: WorkspaceInput): ConceptWorkspace | null {
  const { kb, slug } = input;
  const concept = kb.concepts.find((c) => c.id === slug);
  if (concept === undefined) return null;
  const byId = new Map(kb.concepts.map((c) => [c.id, c]));
  const refs = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const c = byId.get(id);
      return c === undefined ? [] : [refOf(c)];
    });

  const history = observationsOf(input.events, slug);
  const nodes = kb.concepts.map((c) => graphNodeOf(c));
  const ownNote = input.note.available ? input.note.path : null;

  return {
    slug,
    title: concept.title,
    summary: concept.summary,
    domain: concept.domain,
    bucket: bucketOf(concept),
    pL: concept.pL,
    mastery: concept.mastery,
    observations: concept.observations,
    correct: concept.correct,
    lastSeen: concept.lastSeen,
    place: input.place,
    note: input.note,
    sources: input.frontmatter?.sources ?? [],
    tags: input.frontmatter?.tags ?? [],
    requires: refs(concept.requires),
    assumes: refs(concept.assumes),
    dependants: refs(dependantsOf(kb.edges, slug, ["requires"])),
    backlinks: refs(backlinksOf(kb.concepts, slug)),
    checks: checkStatuses(input.checks, history),
    history,
    review:
      input.card === null
        ? null
        : {
            due: input.card.due,
            intervalDays: input.card.intervalDays,
            ease: input.card.ease,
            repetitions: input.card.repetitions,
            lapses: input.card.lapses,
            leech: input.card.leech,
          },
    assets: input.assets.filter((a) => !(a.kind === "note" && a.path !== null && a.path === ownNote)),
    graph: neighbourhood(nodes, kb.edges, slug),
    frontier: kb.frontier.includes(slug),
  };
}

function promptNeighbour(ref: NeighbourRef): ConceptPromptNeighbour {
  return { slug: ref.slug, title: ref.title, label: MASTERY_BUCKET_LABEL[ref.bucket] };
}

/** "CP4281 · Module 2 · Transformations". */
export function placeLabel(place: ConceptPlace | null): string | null {
  if (place === null) return null;
  return `${place.courseCode} · Module ${place.moduleOrder} · ${place.topicTitle}`;
}

/** Strip the frontmatter off a note file, leaving the body the tutor reads. */
export function noteBody(source: string): string {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return source;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  return end === -1 ? source : lines.slice(end + 1).join("\n").trim();
}

/** How many recent answers the tutor is shown. */
export const PROMPT_RECENT_ANSWERS = 5;

/** The tutor's view of a workspace: what `buildConceptSessionContext` takes. */
export function toConceptPromptInput(workspace: ConceptWorkspace): ConceptPromptInput {
  return {
    slug: workspace.slug,
    title: workspace.title,
    summary: workspace.summary,
    body: workspace.note.available ? noteBody(workspace.note.source) : null,
    place: placeLabel(workspace.place),
    requires: workspace.requires.map(promptNeighbour),
    assumes: workspace.assumes.map(promptNeighbour),
    dependants: workspace.dependants.map(promptNeighbour),
    mastery: {
      pL: workspace.pL,
      label: MASTERY_BUCKET_LABEL[workspace.bucket],
      observations: workspace.observations,
      correct: workspace.correct,
      lastSeen: workspace.lastSeen,
      due: workspace.review?.due ?? null,
    },
    recent: workspace.history.slice(-PROMPT_RECENT_ANSWERS).map((o) => ({
      at: o.at,
      correct: o.correct,
      question: o.question,
      pLAfter: o.pLAfter,
    })),
    sources: workspace.sources,
  };
}

/**
 * A concept id as the knowledge base writes them: lowercase letters, digits
 * and hyphens (`slugify` in the CLI). Checked before any lookup, so a request
 * or a URL segment that could not be a concept never reaches the database.
 */
export function isConceptSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
}
