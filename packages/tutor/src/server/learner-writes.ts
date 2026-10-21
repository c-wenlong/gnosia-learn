import {
  appendEvent,
  asLastVisited,
  asRecentModules,
  assetsByIds,
  clearPreference,
  closeTutorSession,
  gradeForRating,
  gradeReview,
  inTransaction,
  ratingForGrade,
  readConceptGraph,
  readPreference,
  recordObservation,
  setNote,
  setProgress,
  StateError,
  withLearnerLock,
  withRecentModule,
  writeAssetName,
  writeDisplayName,
  writePreference,
  type CatalogDatabase,
} from "@gnosia/catalog/state";
import {
  ASSET_NAME_MAX,
  cleanAssetName,
  cleanDisplayName,
  DISPLAY_NAME_MAX,
  PREFERENCE_KEYS,
  type LastVisited,
} from "@gnosia/schema/shared";

import { isConceptSlug } from "../concept-workspace-core";
import { dayKey } from "../days";
import { favoriteKey } from "../favorite";
import {
  applySave,
  coverage,
  isRange,
  MAX_DURATION_SECONDS,
  MAX_RANGES,
  parsePlayback,
  playbackKey,
  type Range,
} from "../playback";
import { isRating, type Rating } from "../review-core";
import {
  isSessionToken,
  OBSERVE_SOURCES,
  SESSION_TEXT_LIMIT,
  type ObserveSource,
} from "../session-core";
import { MAX_ASSET_ID_CHARS } from "./asset-detail";
import type { TutorDeps } from "./deps";
import { appTimeZone } from "./time-zone";
import type { TurnReply } from "./turns";

/**
 * The request-independent core of the learner-state write routes under
 * `/api/learner/` — the ones `apps/web`'s `handler` (`src/lib/learner-api.ts`)
 * wraps, ported to the sidecar so the native app can write the same Postgres
 * the web writes. Bodies, field refusals, the `{ ok, result }` / `{ ok, error,
 * code }` envelopes and the statuses are the routes' own, so a reader sees one
 * protocol.
 *
 * What is not ported is what a loopback single-owner service does not have:
 * the same-origin check (`guard.ts` has its own), the rate limit, and the
 * session — `deps.owner` is the owner every write lands against.
 *
 * The skip list, and why each is absent: `preference` carries only the one
 * key the native app writes — `lastVisited`, so a module visit the app
 * records reaches the same event log and `recentModules` list the web's
 * route keeps (the rest of the allow-list is the browser's own: theme,
 * resources, Settings choices), `recent` (pins are the web sidebar's),
 * `avatar`, `export`,
 * `import`, `reset`, `recap`, `home` and `ask` (reads, destructive resets or
 * surfaces the app has no equivalent of). `custom-provider` is a Settings
 * write rather than a learner-state one, so it lives in `turns.ts` with the
 * provider-key and tutor-model routes.
 */

function reply(status: number, body: unknown): TurnReply {
  return { status, body };
}

/** `badRequest` in learner-api.ts: `{ ok: false, error, code: "BAD_REQUEST" }`. */
function badRequest(error: string): TurnReply {
  return reply(400, { ok: false, error, code: "BAD_REQUEST" });
}

/** `unavailable` there: the message is logged, never returned — it is the driver's. */
function unavailable(error: unknown): TurnReply {
  console.warn(`learner write failed: ${error instanceof Error ? error.message : String(error)}`);
  return reply(503, { ok: false, error: "Not saved: the database is unreachable.", code: "STORE_UNAVAILABLE" });
}

/** `BadRequest` there: a payload's fault, so a 400, never a 503. */
class BadRequest extends Error {}

/**
 * `handler` in learner-api.ts, minus the guards the sidecar does not carry:
 * parse the body (400 on a bad one), run the write (a `StateError` is a 400,
 * anything else a 503), answer `{ ok: true, result }`.
 */
async function learnerWrite<T>(
  deps: TutorDeps,
  body: unknown,
  parse: (body: Record<string, unknown>) => T,
  write: (db: CatalogDatabase, input: T, owner: string) => Promise<unknown>,
): Promise<TurnReply> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("Body must be a JSON object.");
  }
  let input: T;
  try {
    input = parse(body as Record<string, unknown>);
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error.message);
    throw error;
  }
  try {
    const result = await write(await deps.db, input, deps.owner);
    return reply(200, { ok: true, result });
  } catch (error) {
    // A StateError is the payload naming something the catalog does not have,
    // which the web answers 400, not 503: the two must not be confused.
    if (error instanceof StateError) return badRequest(error.message);
    return unavailable(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Field readers — learner-api.ts                                              */
/* -------------------------------------------------------------------------- */

/** The longest scratch note the checklist will store. */
const MAX_NOTE_CHARS = 20_000;

/** Curriculum item ids are authored (`cs4263-m1-t1`), so they are short. */
const MAX_ID_CHARS = 128;

function requireId(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequest(`"${field}" is required and must be a non-empty string.`);
  }
  if (value.length > MAX_ID_CHARS) {
    throw new BadRequest(`"${field}" is longer than ${MAX_ID_CHARS} characters.`);
  }
  return value;
}

/** `assetId`, bounded by MAX_ASSET_ID_CHARS rather than MAX_ID_CHARS. */
function requireAssetId(body: Record<string, unknown>): string {
  const value = body.assetId;
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequest('"assetId" is required and must be a non-empty string.');
  }
  if (value.length > MAX_ASSET_ID_CHARS) {
    throw new BadRequest(`"assetId" is longer than ${MAX_ASSET_ID_CHARS} characters.`);
  }
  return value;
}

function requireBoolean(body: Record<string, unknown>, field: string): boolean {
  const value = body[field];
  if (typeof value !== "boolean") {
    throw new BadRequest(`"${field}" is required and must be a boolean.`);
  }
  return value;
}

function optionalBoolean(body: Record<string, unknown>, field: string, fallback: boolean): boolean {
  const value = body[field];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new BadRequest(`"${field}" must be a boolean.`);
  return value;
}

function requireString(body: Record<string, unknown>, field: string, max: number): string {
  const value = body[field];
  if (typeof value !== "string") {
    throw new BadRequest(`"${field}" is required and must be a string.`);
  }
  if (value.length > max) {
    throw new BadRequest(`"${field}" is longer than ${max} characters.`);
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* The routes                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `POST /api/learner/favorite` with `{ assetId, favorite }`: star or unstar a
 * library asset. `true` writes the star with the time it was set, `false`
 * clears the row. A 400 for an asset the owner cannot read — a star can only
 * land on a row they may see.
 */
export async function favoriteTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (record) => ({ assetId: requireAssetId(record), favorite: requireBoolean(record, "favorite") }),
    async (db, input, owner) => {
      const [row] = await assetsByIds(db, [input.assetId], deps.scope);
      if (row === undefined) throw new StateError(`no asset in the catalog for "${input.assetId}"`);
      const key = favoriteKey(row.id);
      if (!input.favorite) {
        await clearPreference(db, key, owner);
        return { assetId: row.id, favorite: false, at: null };
      }
      const at = new Date().toISOString();
      await writePreference(db, key, { at }, owner);
      return { assetId: row.id, favorite: true, at };
    },
  );
}

/**
 * `POST /api/learner/watched` with `{ assetId }`: append one `watched` event —
 * "watched" for a video, "read" for anything else. Every press appends; the
 * event is study, never evidence, so it moves no p(L) and schedules no card.
 */
export async function watchedTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (record) => ({ assetId: requireAssetId(record) }),
    async (db, input, owner) => {
      const [row] = await assetsByIds(db, [input.assetId], deps.scope);
      if (row === undefined) throw new StateError(`no asset in the catalog for "${input.assetId}"`);
      const event = await appendEvent(db, { type: "watched", asset: row.id, kind: row.kind }, owner);
      return { assetId: row.id, at: event.at };
    },
  );
}

/** `seconds` in the playback route's parser. */
function seconds(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_DURATION_SECONDS) {
    throw new BadRequest(`"${field}" must be a number of seconds from 0 to ${MAX_DURATION_SECONDS}.`);
  }
  return value;
}

/**
 * `POST /api/learner/playback` with `{ assetId, duration, position, ranges }`:
 * save where the learner is in a library video and what of it they watched.
 * The ranges are merged into the stored ones under the learner lock, and the
 * save that takes coverage past `WATCHED_FRACTION` appends the one `watched`
 * event. Answers `{ coverage, watchedAt, watchedDay, position, crossed }`.
 */
export async function playbackTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (record) => {
      const assetId = requireAssetId(record);
      const duration = seconds(record.duration, "duration");
      if (duration <= 0) throw new BadRequest('"duration" must be more than zero.');
      const position = seconds(record.position, "position");
      const ranges = record.ranges ?? [];
      if (!Array.isArray(ranges) || ranges.length > MAX_RANGES || !ranges.every(isRange)) {
        throw new BadRequest(`"ranges" must be at most ${MAX_RANGES} [start, end] pairs of seconds.`);
      }
      return { assetId, duration, position, ranges: ranges as Range[] };
    },
    async (db, save, owner) => {
      const [row] = await assetsByIds(db, [save.assetId], deps.scope);
      if (row === undefined) throw new StateError(`no asset in the catalog for "${save.assetId}"`);
      if (row.kind !== "video") throw new StateError(`"${row.id}" is a ${row.kind}, not a video`);

      const key = playbackKey(row.id);
      const { playback, crossed } = await withLearnerLock(db, owner, async (tx) => {
        const stored = parsePlayback(await readPreference(tx, key, owner));
        const next = applySave(stored, save, new Date().toISOString());
        // One transaction: the event and the stored `watchedAt` land together or not at all.
        if (next.crossed) await appendEvent(tx, { type: "watched", asset: row.id, kind: row.kind }, owner);
        await writePreference(tx, key, next.playback, owner);
        return next;
      });
      return {
        assetId: row.id,
        coverage: coverage(playback.ranges, playback.duration),
        watchedAt: playback.watchedAt,
        // The same day the page prints, made where the app's time zone is known.
        watchedDay: playback.watchedAt === null ? null : dayKey(playback.watchedAt, appTimeZone(deps.env)),
        // What is stored now, which a slower overlapping save may have written.
        position: playback.position,
        crossed,
      };
    },
  );
}

/**
 * `POST /api/learner/progress` with `{ curriculumItemId, completed }`: tick or
 * untick one curriculum item.
 */
export async function progressTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (record) => ({
      curriculumItemId: requireId(record, "curriculumItemId"),
      completed: requireBoolean(record, "completed"),
    }),
    async (db, input, owner) => {
      await setProgress(db, input.curriculumItemId, input.completed, { learnerId: owner });
      return { curriculumItemId: input.curriculumItemId, completed: input.completed };
    },
  );
}

/**
 * `POST /api/learner/asset-name` with `{ assetId, name }`: the learner's own
 * name for an asset, or null or an empty one to go back to the source's title.
 * Stored cleaned and refused past `ASSET_NAME_MAX` characters rather than cut.
 */
export async function assetNameTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (record) => {
      const assetId = requireAssetId(record);
      const name = record.name;
      if (name !== null && typeof name !== "string") {
        throw new BadRequest('"name" must be a string, or null to clear it.');
      }
      const cleaned = cleanAssetName(name);
      if (cleaned !== null && cleaned.length > ASSET_NAME_MAX) {
        throw new BadRequest(`"name" must be at most ${ASSET_NAME_MAX} characters.`);
      }
      return { assetId, name: cleaned };
    },
    (db, input, owner) => writeAssetName(db, input.assetId, input.name, owner),
  );
}

/**
 * `POST /api/learner/note` with `{ curriculumItemId, note }`: write or clear
 * the learner's scratch note on one curriculum item. An empty note clears it.
 */
export async function noteTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (record) => ({
      curriculumItemId: requireId(record, "curriculumItemId"),
      note: requireString(record, "note", MAX_NOTE_CHARS),
    }),
    async (db, input, owner) => {
      await setNote(db, input.curriculumItemId, input.note, owner);
      return { curriculumItemId: input.curriculumItemId, cleared: input.note.trim() === "" };
    },
  );
}

/**
 * `POST /api/learner/name` with `{ name }`: what the learner asked to be
 * called. A string, or null or an empty one to clear it; stored cleaned and
 * refused past `DISPLAY_NAME_MAX` characters rather than cut.
 */
export async function nameTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (record) => {
      const name = record.name;
      if (name !== null && typeof name !== "string") {
        throw new BadRequest('"name" must be a string, or null to clear it.');
      }
      const cleaned = cleanDisplayName(name);
      if (cleaned !== null && cleaned.length > DISPLAY_NAME_MAX) {
        throw new BadRequest(`"name" must be at most ${DISPLAY_NAME_MAX} characters.`);
      }
      return cleaned;
    },
    (db, name, owner) => writeDisplayName(db, name, owner),
  );
}

/* -------------------------------------------------------------------------- */
/* Observe and session close                                                   */
/* -------------------------------------------------------------------------- */

/** The observe route's request shape, as its parser reads it. */
interface ObserveRequest {
  conceptSlug: string;
  correct: boolean;
  source: ObserveSource;
  requestId: string;
  sessionId: string | null;
  question: string | null;
  /** The correct answer, as `learn observe --answer` means it. */
  answer: string | null;
  /** What the learner picked; null for "I don't know". */
  chosen: string | null;
  /** Close the session once this answer is recorded: the page leaving mid-save. */
  closeSession: boolean;
  /** The module whose week check asked, or null. */
  module: string | null;
  /** The title and goal of the session this answer opens, when not the concept's. */
  sessionTitle: string | null;
  sessionGoal: string | null;
}

/** A collection id as the course files write them: lowercase letters, digits and hyphens. */
const MODULE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function optionalText(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new BadRequest(`"${field}" must be a string.`);
  if (value.length > SESSION_TEXT_LIMIT) {
    throw new BadRequest(`"${field}" is longer than ${SESSION_TEXT_LIMIT} characters.`);
  }
  return value.trim() === "" ? null : value;
}

/** A session's title: a short line of text. */
function sessionTitleOf(body: Record<string, unknown>): string | null {
  const value = body.sessionTitle;
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "" || value.length > 200) {
    throw new BadRequest(`"sessionTitle" must be 1 to 200 characters.`);
  }
  return value.trim();
}

/** A session's goal: an id, as the module and concept goals are. */
function sessionGoalOf(body: Record<string, unknown>): string | null {
  const value = body.sessionGoal;
  if (value === undefined || value === null) return null;
  if (!isSessionToken(value)) throw new BadRequest(`"sessionGoal" must be a short id of letters, digits, "-" and "_".`);
  return value;
}

function parseObserve(body: Record<string, unknown>): ObserveRequest {
  const conceptSlug = body.conceptSlug;
  if (!isConceptSlug(conceptSlug)) {
    throw new BadRequest(`"conceptSlug" must be a concept id: lowercase letters, digits and hyphens.`);
  }
  const correct = requireBoolean(body, "correct");
  const source = body.source;
  if (typeof source !== "string" || !(OBSERVE_SOURCES as readonly string[]).includes(source)) {
    throw new BadRequest(`"source" must be "probe" or "teach". A review grade goes to /api/review/grade.`);
  }
  if (!isSessionToken(body.requestId)) {
    throw new BadRequest(`"requestId" is required: a short token of letters, digits, "-" and "_".`);
  }
  const sessionId = body.sessionId;
  if (sessionId !== undefined && sessionId !== null && !isSessionToken(sessionId)) {
    throw new BadRequest(`"sessionId" must be a short token of letters, digits, "-" and "_".`);
  }
  const moduleId = body.module;
  if (
    moduleId !== undefined &&
    moduleId !== null &&
    (typeof moduleId !== "string" || moduleId.length > 128 || !MODULE_ID.test(moduleId))
  ) {
    throw new BadRequest(`"module" must be a module id: lowercase letters, digits and hyphens.`);
  }
  return {
    conceptSlug,
    correct,
    source: source as ObserveSource,
    requestId: body.requestId,
    sessionId: typeof sessionId === "string" ? sessionId : null,
    question: optionalText(body, "question"),
    answer: optionalText(body, "answer"),
    chosen: optionalText(body, "chosen"),
    closeSession: optionalBoolean(body, "closeSession", false),
    module: typeof moduleId === "string" ? moduleId : null,
    sessionTitle: sessionTitleOf(body),
    sessionGoal: sessionGoalOf(body),
  };
}

/**
 * `POST /api/learner/observe`: one graded answer from a session, recorded as
 * evidence — `recordObservation`, the same write `learn observe` and the web
 * route run: an `observation` event, then the mastery row (a correct answer
 * spread to the prerequisites), then the review card, all under the learner
 * lock in one transaction. The native session posts the same body the web's
 * session page does, and mastery is recomputed here, never taken from the
 * caller — a replayed `requestId` records nothing and answers `replayed`.
 */
export async function observeTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(deps, body, parseObserve, async (db, input: ObserveRequest, owner) => {
    // Only concepts this owner may read are nodes, so evidence cannot be
    // recorded against another owner's concept (phase 4).
    const graph = await readConceptGraph(db, deps.scope);
    const titleOf = (slug: string) => (graph.nodes.get(slug) as { title?: string } | undefined)?.title ?? slug;

    const recorded = await recordObservation(db, {
      learnerId: owner,
      conceptId: input.conceptSlug,
      correct: input.correct,
      graph,
      source: input.source,
      question: input.question,
      answer: input.answer,
      chosen: input.chosen,
      session: input.sessionId,
      // The first answer opens the session, in the answer's own transaction:
      // a refused answer leaves no `session-start`, and a closed session (or a
      // studio one) refuses the answer. Idempotent for every later answer.
      openSession:
        input.sessionId === null
          ? undefined
          : input.module === null
            ? { title: input.sessionTitle ?? titleOf(input.conceptSlug), goal: input.sessionGoal ?? input.conceptSlug }
            : { goal: input.module },
      module: input.module,
      requestId: input.requestId,
      // A page going away with an answer still saving sends it again with this:
      // the answer and the close commit together, so neither lands without the
      // other. The answer is idempotent by its request id, so whichever copy
      // arrives first records it and the other replays.
      closeSession: input.closeSession,
    });

    return {
      concept: recorded.concept,
      correct: recorded.correct,
      pLBefore: recorded.pLBefore,
      pLAfter: recorded.pLAfter,
      delta: recorded.pLAfter - recorded.pLBefore,
      mastery: recorded.mastery,
      mastered: recorded.mastered,
      due: recorded.due,
      propagated: recorded.propagated.map((p) => ({ ...p, title: titleOf(p.concept) })),
      card:
        recorded.card === null
          ? null
          : { due: recorded.card.due, intervalDays: recorded.card.intervalDays, created: recorded.cardCreated },
      session: input.sessionId,
      replayed: recorded.replayed,
      closed: recorded.closed,
    };
  });
}

/**
 * `POST /api/review/grade` with `{ conceptId, grade, requestId? }`, the
 * review page's route ported for the native app's queued mirror: `grade` is
 * the button pressed (0 Again, 1 Hard, 2 Good, 3 Easy), mapped onto SM-2's
 * 1, 3, 4, 5 by `gradeForRating`, and `gradeReview` writes the `review`
 * event, the rescheduled card and the mastery move in one transaction — the
 * same write `learn review grade` runs. `requestId` makes a retried grade
 * idempotent: a replay records nothing and answers the first write's rating,
 * since a review event cannot be deleted and a double count would be
 * permanent.
 */
export async function reviewGradeTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (b) => {
      const conceptId = requireId(b, "conceptId");
      const rating = b.grade;
      if (!isRating(rating)) {
        throw new BadRequest(`"grade" must be 0, 1, 2 or 3 (Again, Hard, Good, Easy).`);
      }
      const requestId = b.requestId;
      if (
        requestId !== undefined &&
        (typeof requestId !== "string" || !/^[A-Za-z0-9_-]+$/.test(requestId) || requestId.length > MAX_ID_CHARS)
      ) {
        throw new BadRequest(`"requestId" must be a short token of letters, digits, "-" and "_".`);
      }
      return { conceptId, rating, requestId };
    },
    async (db, input: { conceptId: string; rating: Rating; requestId?: string }, owner) => {
      const recorded = await gradeReview(db, {
        learnerId: owner,
        conceptId: input.conceptId,
        grade: gradeForRating(input.rating),
        now: new Date(),
        requestId: input.requestId,
      });
      const { card, pL, replayed, grade } = recorded;
      return {
        concept: input.conceptId,
        // On a replay, the rating that was recorded, not the one this retry
        // asked for: the first write stands, and the page counts what stood.
        rating: ratingForGrade(grade),
        grade,
        due: card.due,
        intervalDays: card.intervalDays,
        ease: Number(card.ease.toFixed(2)),
        lapses: card.lapses,
        leech: card.leech,
        pL,
        replayed,
      };
    },
  );
}

/**
 * `POST /api/learner/session/close` with `{ sessionId }`: a `session-close`
 * event naming the concepts the session's observations touched, and the row
 * moved to `closed`. Idempotent: an already-closed or never-opened session
 * writes nothing and answers `closed: false` with the counts.
 */
export async function sessionCloseTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (record) => {
      if (!isSessionToken(record.sessionId)) {
        throw new BadRequest(`"sessionId" is required: a short token of letters, digits, "-" and "_".`);
      }
      return { sessionId: record.sessionId };
    },
    (db, input: { sessionId: string }, owner) => closeTutorSession(db, input.sessionId, { learnerId: owner }),
  );
}

/* -------------------------------------------------------------------------- */
/* Preference — the one key the native app writes                              */
/* -------------------------------------------------------------------------- */

/** `object` in the web route: the `value` field read as a record, or a 400. */
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequest(`"value" must be an object.`);
  }
  return value as Record<string, unknown>;
}

/** `lastVisited` in the web route: the visit's validator, verbatim. */
function lastVisitedValue(value: unknown): LastVisited {
  const raw = object(value);
  const courseSlug = raw.courseSlug;
  if (typeof courseSlug !== "string" || courseSlug === "" || courseSlug.length > MAX_ID_CHARS) {
    throw new BadRequest(`"value.courseSlug" must be a non-empty slug.`);
  }
  const moduleSlug = raw.moduleSlug;
  if (
    moduleSlug !== undefined &&
    (typeof moduleSlug !== "string" || moduleSlug.length > MAX_ID_CHARS)
  ) {
    throw new BadRequest(`"value.moduleSlug" must be a slug.`);
  }
  return {
    courseSlug,
    ...(typeof moduleSlug === "string" ? { moduleSlug } : {}),
    at: typeof raw.at === "string" ? raw.at : new Date().toISOString(),
  };
}

/** A failed write's SQLSTATE, read down drizzle's `cause` chain; never its message, which carries the bind parameters. */
function failureCode(error: unknown): string {
  for (let at: unknown = error; at instanceof Error; at = at.cause) {
    const code = (at as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}

/** Whether a failed write names `constraint`, down the same chain. */
function mentions(error: unknown, constraint: string): boolean {
  for (let at: unknown = error; at instanceof Error; at = at.cause) {
    if ((at as { constraint?: unknown }).constraint === constraint) return true;
  }
  return false;
}

/**
 * `rememberVisit` in the web route: `lastVisited` written is also a `visit`
 * event appended and the front of `recentModules`, in the one transaction
 * under the learner's row lock so two module pages opened together cannot
 * drop each other's entry. The event goes in a nested transaction — a
 * savepoint, which `inTransaction` opens inside one — so a database
 * that has not taken migration 0025 loses the event and still keeps the
 * preferences, which Recent reads as well; any other refusal fails the
 * write. A `lastVisited` that is no visit still lands as the preference,
 * which is the web route's own last branch.
 */
async function rememberVisit(db: CatalogDatabase, value: unknown, owner: string): Promise<void> {
  const visit = asLastVisited(value);
  await withLearnerLock(db, owner, async (tx) => {
    if (visit !== undefined) {
      try {
        await inTransaction(tx, async (savepoint) =>
          appendEvent(
            savepoint,
            {
              type: "visit",
              course: visit.courseSlug,
              ...(visit.moduleSlug === undefined ? {} : { module: visit.moduleSlug }),
            },
            owner,
          ),
        );
      } catch (error) {
        if (failureCode(error) !== "23514" || !mentions(error, "event_type_check")) throw error;
        console.warn("preference: visit event not written, the database has not taken migration 0025");
      }
      const stored = asRecentModules(await readPreference(tx, PREFERENCE_KEYS.recentModules, owner));
      const previous = asLastVisited(await readPreference(tx, PREFERENCE_KEYS.lastVisited, owner));
      const list = stored ?? (previous !== undefined ? [previous] : []);
      await writePreference(tx, PREFERENCE_KEYS.recentModules, withRecentModule(list, visit), owner);
    }
    await writePreference(tx, PREFERENCE_KEYS.lastVisited, value, owner);
  });
}

/**
 * `POST /api/learner/preference` with `{ key: "lastVisited", value }`: the
 * one key of the web route's allow-list the native app writes — the rest
 * are the browser's own and refuse as the web's unlisted keys do. The write
 * is `rememberVisit`, so what the app records lands on the web's Recent and
 * Home exactly as a browser's visit does.
 */
export async function preferenceTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  return learnerWrite(
    deps,
    body,
    (record) => {
      if (record.key !== PREFERENCE_KEYS.lastVisited) {
        throw new BadRequest(`"key" must be "${PREFERENCE_KEYS.lastVisited}".`);
      }
      return { key: record.key, value: lastVisitedValue(record.value) };
    },
    async (db, input, owner) => {
      await rememberVisit(db, input.value, owner);
      return { key: input.key };
    },
  );
}
