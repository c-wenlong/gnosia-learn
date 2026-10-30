import { CustomProviderError, TutorModelError } from "@gnosia/catalog/state";
import {
  isCustomProviderId,
  isProviderName,
  PROVIDER_IDS,
  type ProviderName,
} from "@gnosia/schema/shared";

import { assetDisplayTitle } from "../asset-meta";
import {
  buildAgentSessionContext,
  buildConceptSessionContext,
  buildOpenTutorPrompt,
  buildPageAskPrompt,
  buildVideoAskPrompt,
  OPEN_SUBJECT_LIMIT,
  type CitationSource,
} from "../prompt";
import {
  availableProviderSummary,
  type ChatMessage,
  completeWithFallback,
  customProviderConfig,
  keyFor,
  missingKeyMessage,
  providerConfigs,
  type SavedKeys,
  skippedEntries,
  testProviderKey,
} from "../providers";
import { isConceptSlug, toConceptPromptInput } from "../concept-workspace-core";
import { findTopicBySlugs } from "../lookup";
import {
  buildJudgePrompt,
  COMMITMENT_RULE,
  isCommitment,
  judgeRequest,
  parseVerdict,
} from "../judge";
import {
  buildSessionQuestionPrompt,
  parseSessionQuestion,
  QUESTION_LIMITS,
  sessionQuestionRequest,
  type QuestionStep,
} from "../session-question";
import {
  buildSummarySystemPrompt,
  formatTranscript,
  parseKnowledgeResponse,
  type TranscriptTurn,
} from "../summary";
import type { TopicKnowledge } from "../types";
import { splitTurnCheck } from "../check-block";
import {
  CHAT_ANSWER_LIMIT,
  CHECK_QUESTION_LIMIT,
  matchCheck,
  topicCheck,
  type TurnCheck,
} from "../tutor-check";
import { MAX_ASSET_ID_CHARS, readAssetDetail, readAssetText } from "./asset-detail";
import { ContentUnavailableError } from "./content-source";
import { readConceptWorkspace } from "./concept-workspace";
import { entryCredential, keyTestCredential, tutorCredentials } from "./credentials";
import {
  changeCustomProvider,
  createCustomProvider,
  readOwnerCustomProviders,
  type CustomProvider,
} from "./custom-providers";
import type { Env, TutorDeps } from "./deps";
import { cachedModelList } from "./model-list";
import {
  failureCode,
  keySecret,
  NoKeySecretError,
  openSavedKeys,
  removeProviderKey,
  savedKeyStatuses,
  saveProviderKey,
  type SavedKeyStatus,
} from "./provider-keys";
import { checkKeyShape } from "./seal";
import { readTutorStyle } from "./settings";
import {
  addChainEntry,
  deleteChainProvider,
  moveChainEntry,
  moveChainProvider,
  readChain,
  removeChainEntry,
  setChainEntry,
} from "./tutor-models";
import { svgText } from "../svg-text";
import { parseTranscript } from "../transcript";
import { measurePayload, PAYLOAD_LIMITS } from "../guards";
import { checkModelId, KNOWLEDGE_LIMITS, providerLabel } from "@gnosia/schema/shared";

/**
 * The request-independent core of the `/api/agent/*` and the `/api/learner/*`
 * route handlers — the provider-call reads and the Settings writes alike.
 * Each function takes the request's resolved seams (`TutorDeps`) and a parsed
 * body, and answers a plain `{ status, body, headers }` the transport writes
 * out — the Next routes map it onto `NextResponse.json`, the sidecar writes
 * it directly. Nothing here knows `Request`/`NextResponse`/cookies.
 */

export interface TurnReply {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

function reply(status: number, body: unknown, headers?: Record<string, string>): TurnReply {
  return { status, body, headers };
}

/* -------------------------------------------------------------------------- */
/* Seam resolution — `deps.seams` overrides, else this package's own readers   */
/* -------------------------------------------------------------------------- */

function workspaceOf(deps: TutorDeps, slug: string) {
  return deps.seams?.readWorkspace ? deps.seams.readWorkspace(deps, slug) : readConceptWorkspace(deps, slug);
}

function tutorStyleOf(deps: TutorDeps) {
  return deps.seams?.tutorStyle ? deps.seams.tutorStyle(deps) : readTutorStyle(deps.db, deps.owner);
}

function credentialsOf(deps: TutorDeps) {
  return deps.seams?.credentials ? deps.seams.credentials(deps) : tutorCredentials(deps.db, deps.owner, deps.env);
}

function completeWith(deps: TutorDeps, messages: ChatMessage[], steps: readonly import("../providers").ChainStep[]) {
  return deps.seams?.complete ? deps.seams.complete(messages, steps) : completeWithFallback(messages, steps);
}

function assetDetailOf(deps: TutorDeps, id: string) {
  return deps.seams?.assetDetail ? deps.seams.assetDetail(deps, id) : readAssetDetail(deps, id);
}

function assetTextOf(deps: TutorDeps, db: Awaited<TutorDeps["db"]>, id: string, limit?: number) {
  return deps.seams?.assetText ? deps.seams.assetText(deps, db, id, limit) : readAssetText(deps, db, id, limit);
}

function keyCredentialOf(deps: TutorDeps, provider: ProviderName) {
  return deps.seams?.keyCredential ? deps.seams.keyCredential(deps, provider) : keyTestCredential(deps.db, deps.owner, provider, deps.env);
}

function entryCredentialOf(deps: TutorDeps, provider: ProviderName, model?: string) {
  return deps.seams?.entryCredential ? deps.seams.entryCredential(deps, provider, model) : entryCredential(deps.db, deps.owner, provider, model, deps.env);
}

async function chainOf(deps: TutorDeps) {
  return deps.seams?.chain ? deps.seams.chain(deps) : readChain(await deps.db, deps.owner);
}

function modelListOf(deps: TutorDeps, credential: import("../providers").ProviderCredential) {
  return deps.seams?.modelList ? deps.seams.modelList(deps.owner, credential) : cachedModelList(deps.owner, credential);
}

function testKeyOf(deps: TutorDeps, credential: import("../providers").ProviderCredential) {
  return deps.seams?.testKey ? deps.seams.testKey(credential) : testProviderKey(credential);
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One of four shapes. The topic tutor (the course session) sends
 * `courseSlug`, `moduleSlug` and `topicId`. The concept tutor (the workspace)
 * sends `conceptSlug` instead, and when it is present the three topic fields
 * are ignored. The open tutor (`/ask`, from Home's Ask box) sends `subject`,
 * the text the owner typed, and nothing else. Ask on a library video, note or
 * diagram sends `assetId` and, for a video when known, `at`, the player's
 * position in seconds.
 */
export interface ChatBody {
  courseSlug?: string;
  moduleSlug?: string;
  topicId?: string;
  conceptSlug?: unknown;
  subject?: unknown;
  assetId?: unknown;
  at?: unknown;
  messages: ChatMessage[];
  learnerNote?: string;
  priorKnowledge?: Partial<TopicKnowledge>;
}

/**
 * Recaps live in the learner's browser, so they arrive with the request.
 * Clamp them before they reach the prompt.
 */
function sanitizeKnowledge(
  raw: Partial<TopicKnowledge> | undefined,
  topicId: string,
): TopicKnowledge | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const list = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim().slice(0, KNOWLEDGE_LIMITS.itemChars))
          .filter(Boolean)
          .slice(0, KNOWLEDGE_LIMITS.listItems)
      : [];

  const summary =
    typeof raw.summary === "string"
      ? raw.summary.trim().slice(0, KNOWLEDGE_LIMITS.summaryChars)
      : "";
  const keyPoints = list(raw.keyPoints);
  const misconceptions = list(raw.misconceptions);
  const openQuestions = list(raw.openQuestions);
  if (
    !summary &&
    keyPoints.length === 0 &&
    misconceptions.length === 0 &&
    openQuestions.length === 0
  ) {
    return undefined;
  }

  return {
    topicId,
    summary,
    keyPoints,
    misconceptions,
    openQuestions,
    source: raw.source === "manual" ? "manual" : "agent",
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date().toISOString(),
    sessions:
      typeof raw.sessions === "number" && raw.sessions > 0
        ? Math.floor(raw.sessions)
        : 1,
  };
}

/** 413 when one request would forward more than `PAYLOAD_LIMITS` allows. */
export function payloadTooLarge(
  messages: readonly { content?: unknown }[],
  extraText?: string,
): TurnReply | null {
  const { count, chars } = measurePayload(messages, extraText);
  if (count <= PAYLOAD_LIMITS.maxMessages && chars <= PAYLOAD_LIMITS.maxTotalChars) {
    return null;
  }
  return reply(413, {
    error: `Session too large to send (messages: ${count}, characters: ${chars}; limit: ${PAYLOAD_LIMITS.maxMessages} messages, ${PAYLOAD_LIMITS.maxTotalChars} characters). Save a recap and start a fresh session.`,
    code: "PAYLOAD_TOO_LARGE",
  });
}

/** Every turn a `{ role, content }` pair, so a malformed one is a 400 before anything is read. */
function wellFormedTurns(messages: unknown): messages is ChatMessage[] {
  return (
    Array.isArray(messages) &&
    messages.every(
      (m: unknown) =>
        m !== null &&
        typeof m === "object" &&
        ["user", "assistant", "system"].includes((m as ChatMessage).role) &&
        typeof (m as ChatMessage).content === "string",
    )
  );
}

/** The courses a turn needs, or the 503 the route would answer. */
async function coursesOr503(
  deps: TutorDeps,
): Promise<{ courses: Awaited<ReturnType<TutorDeps["source"]["courses"]>> } | { reply: TurnReply }> {
  try {
    return { courses: deps.seams?.courses ? await deps.seams.courses() : await deps.source.courses() };
  } catch (error) {
    if (!(error instanceof ContentUnavailableError)) throw error;
    const body =
      error.reason === "not-flipped"
        ? { error: error.message, code: "CONTENT_NOT_FLIPPED" }
        : { error: "The course catalog could not be read, so the tutor has no topic to work from.", code: "CONTENT_UNAVAILABLE" };
    return { reply: reply(503, body) };
  }
}

/**
 * `POST /api/agent/chat`. Shape dispatch happens after the body is read, as
 * in the route: `conceptSlug` beats `subject` beats `assetId` beats the
 * topic triple.
 */
export async function chatTurn(deps: TutorDeps, body: ChatBody): Promise<TurnReply> {
  if (body === null || typeof body !== "object") {
    return reply(400, { error: "The body must be a JSON object" });
  }
  if (body.conceptSlug !== undefined) return conceptTurn(deps, body);
  if (body.subject !== undefined) return openTurn(deps, body);
  if (body.assetId !== undefined) return assetTurn(deps, body);

  const { courseSlug, moduleSlug, topicId, messages, learnerNote, priorKnowledge } = body;
  if (!courseSlug || !moduleSlug || !topicId || !Array.isArray(messages)) {
    return reply(400, { error: "courseSlug, moduleSlug, topicId, and messages are required" });
  }
  // As on the other paths: a turn with another role or non-text content
  // would otherwise reach every provider in the chain and fail at each.
  if (!wellFormedTurns(messages)) {
    return reply(400, { error: "messages must be an array of { role, content } turns", code: "BAD_REQUEST" });
  }

  const tooLarge = payloadTooLarge(messages, learnerNote);
  if (tooLarge) return tooLarge;

  const read = await coursesOr503(deps);
  if ("reply" in read) return read.reply;
  const found = findTopicBySlugs(read.courses, courseSlug, moduleSlug, topicId);
  if (!found) {
    return reply(404, { error: "Topic not found" });
  }

  const session = buildAgentSessionContext(found.course, found.module, found.topic, {
    learnerNote,
    priorKnowledge: sanitizeKnowledge(priorKnowledge, topicId),
  });

  // Phase 3: a check this tutor marks is kept only for a concept the topic declares.
  return completeTurn(deps, session.systemPrompt, messages, {}, { checks: found.topic.concepts ?? [] });
}

/**
 * A turn of the concept tutor. The context is the concept's note, its
 * neighbours, the learner's mastery and recent answers on it, and their tutor
 * style preference, all read on the server from `conceptSlug`; nothing about
 * the concept is taken from the browser. The response adds `concept` and the
 * numbered `sources` the reply may cite as `[n]`.
 */
async function conceptTurn(deps: TutorDeps, body: ChatBody): Promise<TurnReply> {
  const { conceptSlug, messages, learnerNote } = body;
  // Every turn checked here, so a malformed one is a 400 before anything is
  // read rather than a throw inside the provider call.
  if (!isConceptSlug(conceptSlug) || !wellFormedTurns(messages)) {
    return reply(400, {
      error:
        "conceptSlug must be a concept id (lowercase letters, digits and hyphens), and messages an array of { role, content } turns",
      code: "BAD_REQUEST",
    });
  }

  const tooLarge = payloadTooLarge(messages, learnerNote);
  if (tooLarge) return tooLarge;

  const read = await workspaceOf(deps, conceptSlug);
  if (read.state === "unreachable") {
    return reply(503, {
      error: "The knowledge base could not be reached, so the tutor has no note to work from.",
      code: "CONCEPT_UNAVAILABLE",
    });
  }
  if (read.state === "not-found") {
    return reply(404, { error: "Concept not found", code: "CONCEPT_NOT_FOUND" });
  }

  // The learner's Settings choice, read after the concept so a database that
  // is down has already answered 503 above.
  const style = await tutorStyleOf(deps);
  const session = buildConceptSessionContext(toConceptPromptInput(read.workspace), { style });
  const note =
    typeof learnerNote === "string" && learnerNote.trim()
      ? `\n## Learner notes (from their study hub)\n${learnerNote.trim()}\n`
      : "";
  return completeTurn(
    deps,
    session.systemPrompt + note,
    messages,
    { concept: { slug: read.workspace.slug, title: read.workspace.title }, sources: session.sources },
    { checks: "concept" },
  );
}

/**
 * A turn of the open tutor (docs/proposals/home-page.md, part 1): a subject
 * nothing in the catalog matched. No note, no mastery and nothing recorded
 * (H4); the prompt is built from the subject and the owner's tutor style only.
 */
async function openTurn(deps: TutorDeps, body: ChatBody): Promise<TurnReply> {
  const { subject, messages } = body;
  const text = typeof subject === "string" ? subject.trim() : "";
  if (text === "" || text.length > OPEN_SUBJECT_LIMIT || !wellFormedTurns(messages)) {
    return reply(400, {
      error: `subject must be the text to learn about (1 to ${OPEN_SUBJECT_LIMIT} characters), and messages an array of { role, content } turns`,
      code: "BAD_REQUEST",
    });
  }

  const tooLarge = payloadTooLarge(messages, undefined);
  if (tooLarge) return tooLarge;

  const style = await tutorStyleOf(deps);
  return completeTurn(deps, buildOpenTutorPrompt(text, { style }), messages);
}

/** The asset kinds Ask answers about, and what each is called in an error. */
const ASKABLE: Record<string, string> = { video: "video", note: "note", diagram_svg: "diagram" };

/**
 * The most bytes of a diagram's SVG read for its labels. A tldrawkc export
 * embeds its fonts, so one is a few hundred kilobytes, over the text preview
 * cap; the labels themselves are a few hundred characters.
 */
const DIAGRAM_SVG_BYTES = 4 * 1024 * 1024;

/**
 * A turn of Ask on a library asset: a quick question about the video, note or
 * diagram the learner has open. The asset and its words (a video's
 * transcript, a note's markdown, a diagram's labels) are read on the server
 * from `assetId`, under the owner's scope, so nothing about it is taken from
 * the browser but its id and a video's position. Nothing is recorded: the
 * thread lives in the page and goes when it closes.
 */
async function assetTurn(deps: TutorDeps, body: ChatBody): Promise<TurnReply> {
  const { assetId, at, messages } = body;
  const position = typeof at === "number" && Number.isFinite(at) && at >= 0 ? at : null;
  if (
    typeof assetId !== "string" ||
    assetId.trim() === "" ||
    assetId.length > MAX_ASSET_ID_CHARS ||
    (at !== undefined && at !== null && position === null) ||
    !wellFormedTurns(messages)
  ) {
    return reply(400, {
      error: `assetId must be a library asset id (at most ${MAX_ASSET_ID_CHARS} characters), at a number of seconds if given, and messages an array of { role, content } turns`,
      code: "BAD_REQUEST",
    });
  }

  const tooLarge = payloadTooLarge(messages, undefined);
  if (tooLarge) return tooLarge;

  const { asset, derivations, reachable, concepts: detailConcepts } = await assetDetailOf(deps, assetId);
  if (!reachable) {
    return reply(503, {
      error: "The catalog could not be reached, so the tutor has nothing to work from.",
      code: "ASSET_UNAVAILABLE",
    });
  }
  if (asset === null || ASKABLE[asset.kind] === undefined) {
    return reply(404, { error: "No video, note or diagram has that id", code: "ASSET_NOT_FOUND" });
  }

  const style = await tutorStyleOf(deps);
  const title = assetDisplayTitle(asset).text;
  // The pool handle, or null when it cannot be had: the text read below then
  // answers nothing, the same degradation `withCatalog` gave it.
  const db = await deps.db.catch(() => null);
  if (asset.kind !== "video") {
    // Unreadable words cost the prompt its text, not the turn: it says so.
    const raw =
      db === null
        ? null
        : await assetTextOf(deps, db, asset.id, asset.kind === "diagram_svg" ? DIAGRAM_SVG_BYTES : undefined);
    const text = raw === null ? null : asset.kind === "diagram_svg" ? svgText(raw) : raw;
    const kind = asset.kind === "note" ? "note" : "diagram";
    return completeTurn(deps, buildPageAskPrompt({ kind, title, text, concepts: detailConcepts ?? [] }, { style }), messages);
  }

  // A transcript that is missing or unreadable costs the prompt its
  // narration, not the turn: the prompt says it has none.
  const sidecar = derivations.derived.find((row) => row.kind === "transcript");
  const raw = sidecar === undefined || db === null ? null : await assetTextOf(deps, db, sidecar.id);
  const transcript = raw === null ? null : (parseTranscript(raw)?.cues ?? null);
  return completeTurn(deps, buildVideoAskPrompt({ title, transcript }, position, { style }), messages);
}

/** The concept tutor's check on its own concept: any concept id the reply named is dropped. */
function withoutConcept(check: TurnCheck | null): TurnCheck | null {
  if (check === null) return null;
  const rest = { ...check };
  delete rest.concept;
  return rest;
}

/** Send the turn to the provider cascade and shape the answer both tutors share. */
async function completeTurn(
  deps: TutorDeps,
  systemPrompt: string,
  messages: ChatMessage[],
  extra: { concept?: { slug: string; title: string }; sources?: CitationSource[] } = {},
  {
    checks = null,
  }: {
    /**
     * Which tutor's marker to read: `"concept"` (the concept tutor's, on its
     * own concept, so any id it names is ignored), a topic's concept ids (the
     * course topic tutor's, phase 3), or null for the open tutor, whose reply
     * is returned exactly as written.
     */
    checks?: "concept" | readonly string[] | null;
  } = {},
): Promise<TurnReply> {
  // Always inject our system prompt as the authoritative first message.
  const payloadMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.filter((m) => m.role !== "system"),
  ];

  const credentials = await credentialsOf(deps);
  const outcome = await completeWith(deps, payloadMessages, credentials);

  if (!outcome.ok) {
    if (outcome.code === "MISSING_API_KEY") {
      return reply(503, {
        error: missingKeyMessage(credentials),
        code: "MISSING_API_KEY",
        attempts: outcome.attempts,
        providers: availableProviderSummary(credentials),
      });
    }

    return reply(502, {
      error: "All free providers failed",
      code: "ALL_PROVIDERS_FAILED",
      attempts: outcome.attempts,
      providers: availableProviderSummary(credentials),
    });
  }

  // The concept tutor's and the topic tutor's prompts ask for a check block
  // or the marker; the open tutor's reply is returned exactly as the model
  // wrote it. Both pages draw check cards (docs/proposals/structured-checks.md,
  // phases 1 to 3); the topic tutor's card is kept, as its marker is, only for
  // a concept the topic declares (`topicCheck`).
  const split = checks === null ? null : splitTurnCheck(outcome.result.content);
  if (split !== null) {
    // A block that could not be used falls back (K7); the reason goes to the log, never the learner.
    if (split.refused !== null) console.warn(`tutor check block refused: ${split.refused}`);
    split.check = checks === "concept" ? withoutConcept(split.check) : topicCheck(split.check, checks as readonly string[]);
  }
  return reply(200, {
    message: { role: "assistant", content: split ? split.content : outcome.result.content },
    ...(split ? { check: split.check } : {}),
    model: outcome.result.model,
    provider: outcome.result.provider,
    providerLabel: outcome.result.providerLabel,
    fallbackAttempts: outcome.attempts.length,
    ...skippedEntries(outcome.attempts),
    ...extra,
  });
}

/* -------------------------------------------------------------------------- */
/* Judge                                                                       */
/* -------------------------------------------------------------------------- */

function bad(error: string): TurnReply {
  return reply(400, { error, code: "BAD_REQUEST" });
}

/**
 * `POST /api/agent/judge` with `{ conceptSlug, question, answer, commitment? }`:
 * the judge's verdict on one answer to a check the concept tutor asked in the
 * chat (R5 of docs/proposals/recall-in-chat.md). It writes nothing.
 * `commitment` is the answer a recall check's tutor committed to when it
 * asked (docs/proposals/structured-checks.md, phase 2), and the judge's first
 * reference, ahead of any note check `matchCheck` finds.
 */
export async function judgeTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return bad("The body must be a JSON object");
  const { conceptSlug, question, answer, commitment } = body as Record<string, unknown>;
  if (!isConceptSlug(conceptSlug)) return bad("conceptSlug must be a concept id (lowercase letters, digits and hyphens)");
  if (typeof question !== "string" || question.trim() === "" || question.length > CHECK_QUESTION_LIMIT) {
    return bad(`question must be the check the tutor asked, 1 to ${CHECK_QUESTION_LIMIT} characters`);
  }
  if (typeof answer !== "string" || answer.trim() === "" || answer.length > CHAT_ANSWER_LIMIT) {
    return bad(`answer must be the learner's reply, 1 to ${CHAT_ANSWER_LIMIT} characters`);
  }
  if (!isCommitment(commitment)) return bad(COMMITMENT_RULE);

  const read = await workspaceOf(deps, conceptSlug);
  if (read.state === "unreachable") {
    return reply(503, {
      error: "The knowledge base could not be reached, so there is no note to judge against.",
      code: "CONCEPT_UNAVAILABLE",
    });
  }
  if (read.state === "not-found") {
    return reply(404, { error: "Concept not found", code: "CONCEPT_NOT_FOUND" });
  }

  const concept = toConceptPromptInput(read.workspace);
  const match = matchCheck(question, read.workspace.checks);
  const credentials = await credentialsOf(deps);
  const outcome = await completeWith(deps,
    [
      {
        role: "system",
        content: buildJudgePrompt({
          title: concept.title,
          summary: concept.summary,
          body: concept.body ?? null,
          question: question.trim(),
          answer,
          commitment: typeof commitment === "string" ? commitment.trim() : null,
          reference: match ? { question: match.question, answer: match.answer, why: match.why } : null,
        }),
      },
      { role: "user", content: judgeRequest(answer) },
    ],
    credentials,
  );

  if (!outcome.ok) {
    return outcome.code === "MISSING_API_KEY"
      ? reply(503, {
          error: missingKeyMessage(credentials),
          code: "MISSING_API_KEY",
          attempts: outcome.attempts,
          providers: availableProviderSummary(credentials),
        })
      : reply(502, {
          error: "All free providers failed",
          code: "ALL_PROVIDERS_FAILED",
          attempts: outcome.attempts,
        });
  }

  const parsed = parseVerdict(outcome.result.content);
  if (!parsed.ok) {
    return reply(502, {
      error: `The judge did not return a usable verdict. ${parsed.reason}`,
      code: "UNSTRUCTURED_REPLY",
    });
  }
  return reply(
    200,
    {
      verdict: { correct: parsed.correct, feedback: parsed.feedback },
      model: outcome.result.model,
      provider: outcome.result.provider,
      providerLabel: outcome.result.providerLabel,
      ...skippedEntries(outcome.attempts),
    },
    { "Cache-Control": "no-store" },
  );
}

/* -------------------------------------------------------------------------- */
/* Session question                                                            */
/* -------------------------------------------------------------------------- */

const MAX_AVOID = 4;

/**
 * `POST /api/agent/session` with `{ conceptSlug, step: "probe" | "check",
 * avoid? }`: one multiple-choice question for a session step, written by the
 * tutor model as structured JSON.
 */
export async function sessionQuestionTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return bad("The body must be a JSON object");
  const { conceptSlug, step, avoid } = body as Record<string, unknown>;
  if (!isConceptSlug(conceptSlug)) return bad("conceptSlug must be a concept id (lowercase letters, digits and hyphens)");
  if (step !== "probe" && step !== "check") return bad('step must be "probe" or "check"');
  if (avoid !== undefined && (!Array.isArray(avoid) || avoid.length > MAX_AVOID || avoid.some((q) => typeof q !== "string"))) {
    return bad(`avoid must be a list of at most ${MAX_AVOID} questions`);
  }
  const asked = ((avoid as string[] | undefined) ?? []).map((q) => q.slice(0, QUESTION_LIMITS.prompt));

  const read = await workspaceOf(deps, conceptSlug);
  if (read.state === "unreachable") {
    return reply(503, {
      error: "The knowledge base could not be reached, so there is no note to ask from.",
      code: "CONCEPT_UNAVAILABLE",
    });
  }
  if (read.state === "not-found") {
    return reply(404, { error: "Concept not found", code: "CONCEPT_NOT_FOUND" });
  }

  // The learner's tutor style shapes the explanation; read after the concept,
  // as the chat does.
  const style = await tutorStyleOf(deps);
  const credentials = await credentialsOf(deps);
  const outcome = await completeWith(deps,
    [
      {
        role: "system",
        content: buildSessionQuestionPrompt(toConceptPromptInput(read.workspace), step as QuestionStep, asked, style),
      },
      { role: "user", content: sessionQuestionRequest(step as QuestionStep) },
    ],
    credentials,
  );

  if (!outcome.ok) {
    return outcome.code === "MISSING_API_KEY"
      ? reply(503, {
          error: missingKeyMessage(credentials),
          code: "MISSING_API_KEY",
          attempts: outcome.attempts,
          providers: availableProviderSummary(credentials),
        })
      : reply(502, {
          error: "All free providers failed",
          code: "ALL_PROVIDERS_FAILED",
          attempts: outcome.attempts,
        });
  }

  const parsed = parseSessionQuestion(outcome.result.content);
  if (!parsed.ok) {
    return reply(502, {
      error: `The tutor did not write a usable question. ${parsed.reason}`,
      code: "UNSTRUCTURED_REPLY",
    });
  }
  return reply(
    200,
    {
      question: parsed.question,
      model: outcome.result.model,
      provider: outcome.result.provider,
      providerLabel: outcome.result.providerLabel,
      ...skippedEntries(outcome.attempts),
    },
    { "Cache-Control": "no-store" },
  );
}

/* -------------------------------------------------------------------------- */
/* Summarize                                                                   */
/* -------------------------------------------------------------------------- */

export interface SummarizeBody {
  courseSlug: string;
  moduleSlug: string;
  topicId: string;
  messages: TranscriptTurn[];
}

/** `POST /api/agent/summarize`: a transcript condensed into a recap. */
export async function summarizeTurn(deps: TutorDeps, body: SummarizeBody): Promise<TurnReply> {
  const { courseSlug, moduleSlug, topicId, messages } = body;
  if (!courseSlug || !moduleSlug || !topicId || !Array.isArray(messages)) {
    return reply(400, { error: "courseSlug, moduleSlug, topicId, and messages are required" });
  }

  if (!wellFormedTurns(messages)) {
    return reply(400, { error: "messages must be an array of { role, content } turns", code: "BAD_REQUEST" });
  }

  const tooLarge = payloadTooLarge(messages);
  if (tooLarge) return tooLarge;

  // Blank turns and any system turn say nothing about the dialogue.
  const turns = messages.filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim());
  if (turns.length < 2) {
    return reply(400, { error: "Not enough dialogue to summarise yet", code: "TRANSCRIPT_TOO_SHORT" });
  }

  const read = await coursesOr503(deps);
  if ("reply" in read) return read.reply;
  const found = findTopicBySlugs(read.courses, courseSlug, moduleSlug, topicId);
  if (!found) {
    return reply(404, { error: "Topic not found" });
  }

  const payload: ChatMessage[] = [
    {
      role: "system",
      content: buildSummarySystemPrompt(found.course, found.module, found.topic),
    },
    {
      role: "user",
      content: `Here is the full session transcript. Return the recap JSON only.\n\n${formatTranscript(turns)}`,
    },
  ];

  const credentials = await credentialsOf(deps);
  const outcome = await completeWith(deps, payload, credentials);

  if (!outcome.ok) {
    if (outcome.code === "MISSING_API_KEY") {
      return reply(503, {
        error: `${missingKeyMessage(credentials)} Or write the recap by hand instead: it saves to the same place.`,
        code: "MISSING_API_KEY",
        attempts: outcome.attempts,
        providers: availableProviderSummary(credentials),
      });
    }
    return reply(502, {
      error: "All free providers failed",
      code: "ALL_PROVIDERS_FAILED",
      attempts: outcome.attempts,
      providers: availableProviderSummary(credentials),
    });
  }

  const knowledge = parseKnowledgeResponse(outcome.result.content);
  if (!knowledge) {
    // Hand the raw text back so the learner can salvage it by hand.
    return reply(502, {
      error: "Model did not return a usable recap",
      code: "UNPARSEABLE_RECAP",
      raw: outcome.result.content.slice(0, 4000),
      provider: outcome.result.provider,
    });
  }

  return reply(200, {
    knowledge,
    model: outcome.result.model,
    provider: outcome.result.provider,
    providerLabel: outcome.result.providerLabel,
    ...skippedEntries(outcome.attempts),
  });
}

/* -------------------------------------------------------------------------- */
/* The provider-call endpoints                                                 */
/* -------------------------------------------------------------------------- */

/** `body.provider` as a provider id, or the 400 to answer with. Never echoes what was sent. */
function readProvider(body: Record<string, unknown>): ProviderName | TurnReply {
  return isProviderName(body.provider)
    ? body.provider
    : reply(400, {
        ok: false,
        error: `"provider" must be one of ${PROVIDER_IDS.join(", ")}, or one of your own providers' ids (custom-…).`,
        code: "BAD_REQUEST",
      });
}

/**
 * `POST /api/learner/provider-key/test`: one provider call with the key the
 * tutor would use, answering `{ ok, provider, source, model, tested }`.
 */
export async function providerKeyTestTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return reply(400, { ok: false, error: "The body must be a JSON object.", code: "BAD_REQUEST" });
  }
  const provider = readProvider(body as Record<string, unknown>);
  if (typeof provider !== "string") return provider;

  const credential = await keyCredentialOf(deps, provider);
  if (credential === null) {
    return reply(400, { ok: false, error: "There is no key for this provider to test.", code: "NO_KEY" });
  }
  // A provider the owner added has no default model to test with (T14).
  if (credential.config.model === "") {
    return reply(400, { ok: false, error: "Add a model to this provider first, then Test it.", code: "NO_MODEL" });
  }

  const result = await testKeyOf(deps, credential);
  return reply(
    200,
    result.ok
      ? { ok: true, provider, source: credential.source, model: result.model, tested: credential.config.model }
      : {
          ok: false,
          provider,
          source: credential.source,
          status: result.status,
          message: result.message,
          tested: credential.config.model,
        },
    { "Cache-Control": "no-store" },
  );
}

/**
 * `POST /api/learner/tutor-model/test`: one provider call for a chain entry,
 * answering `{ ok, provider, model, source, served }`.
 */
export async function tutorModelTestTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return reply(400, { ok: false, error: "The body must be a JSON object.", code: "BAD_REQUEST" });
  }
  const record = body as Record<string, unknown>;
  const provider = readProvider(record);
  if (typeof provider !== "string") return provider;
  const checked = checkModelId(record.model);
  if (!checked.ok) return reply(400, { ok: false, error: checked.reason, code: "BAD_REQUEST" });
  const model = checked.model;

  // Only an entry the owner holds: Test is for the chain, not for spending a
  // request on any id a caller names.
  try {
    const chain = await chainOf(deps);
    if (!chain.some((e) => e.provider === provider && e.model === model)) {
      return reply(404, { ok: false, error: "That model is not in the chain.", code: "NOT_FOUND" });
    }
  } catch {
    return reply(503, {
      ok: false,
      error: "Not read: the database is unreachable.",
      code: "STORE_UNAVAILABLE",
    });
  }

  const credential = await entryCredentialOf(deps, provider, model);
  if (credential === null) {
    return reply(400, {
      ok: false,
      error: `There is no key for ${providerLabel(provider)} to test with.`,
      code: "NO_KEY",
    });
  }

  const result = await testKeyOf(deps, credential);
  return reply(
    200,
    result.ok
      ? { ok: true, provider, model, source: credential.source, served: result.model }
      : { ok: false, provider, model, source: credential.source, status: result.status, message: result.message },
    { "Cache-Control": "no-store" },
  );
}

/**
 * `POST /api/learner/tutor-model/models`: a provider's live model list,
 * cached per owner for a few minutes, answering `{ ok, provider, models, cached }`.
 */
export async function modelListTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return reply(400, { ok: false, error: "The body must be a JSON object.", code: "BAD_REQUEST" });
  }
  const provider = readProvider(body as Record<string, unknown>);
  if (typeof provider !== "string") return provider;

  const credential = await entryCredentialOf(deps, provider);
  if (credential === null) {
    return reply(400, {
      ok: false,
      error: `There is no key for ${providerLabel(provider)}. Add one under Providers first.`,
      code: "NO_KEY",
    });
  }

  const result = await modelListOf(deps, credential);
  return reply(
    200,
    result.ok
      ? { ok: true, provider, models: result.models, cached: result.cached }
      : { ok: false, provider, status: result.status, message: result.message },
    { "Cache-Control": "no-store" },
  );
}

/* -------------------------------------------------------------------------- */
/* The Settings writes                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The request-independent core of the `/api/learner/provider-key`,
 * `/api/learner/custom-provider` and `/api/learner/tutor-model` write
 * routes (docs/BYOK.md,
 * docs/TUTOR-MODELS.md): the same bodies, the same `{ ok, error, code }`
 * answers and statuses the Next routes give. What is not ported is what a
 * loopback single-owner service does not have — the session, origin and
 * rate-limit guards (the sidecar's own `guard.ts` answers origin) — and the
 * `byok` mirror, which is the web deployment pushing a saved key into the
 * studio runner's `byok.json`; a deployment without the runner omits the
 * field there too, so its absence here is the same contract.
 *
 * `AUTH_SECRET` reads `process.env`, never `deps.env`: `env` is the provider
 * map a request resolves keys and models against (a test hands in `{}` for
 * "the server holds no key"), while the secret the saved keys are sealed
 * under is the process's own and is never part of that map — the same split
 * `credentials.ts` makes.
 */

/** `answer` in the web routes' requests.ts: `Cache-Control: no-store` on everything. */
function writeAnswer(body: unknown, status = 200): TurnReply {
  return reply(status, body, { "Cache-Control": "no-store" });
}

/** `refuse` there: `{ ok: false, error, code }`, a 400 unless said otherwise. */
function writeRefuse(error: string, code = "BAD_REQUEST", status = 400): TurnReply {
  return writeAnswer({ ok: false, error, code }, status);
}

/** The body as a record, or the refusal the web's `readBody` gives a non-object. */
function writeRecord(body: unknown): { record: Record<string, unknown> } | { refused: TurnReply } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { refused: writeRefuse("The body must be a JSON object.") };
  }
  return { record: body as Record<string, unknown> };
}

/**
 * `POST /api/learner/provider-key` with `{ provider, key }`: seal and save
 * the owner's key for that provider, replacing any there. 200
 * `{ ok, key: { provider, last4, updatedAt, readable } }`. 404 `NOT_FOUND`
 * for a `custom-…` id that is not the owner's, 503 `NO_SECRET` when there is
 * no `AUTH_SECRET` to seal with, 503 `STORE_UNAVAILABLE` when the write
 * could not happen. No answer carries the key or its ciphertext.
 */
export async function providerKeySaveTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = writeRecord(body);
  if ("refused" in read) return read.refused;
  const provider = readProvider(read.record);
  if (typeof provider !== "string") return provider;
  const shape = checkKeyShape(read.record.key);
  if (!shape.ok) return writeRefuse(shape.reason);
  // The sealer would throw `NoKeySecretError` inside `saveProviderKey`, before
  // the write — but `deps.db` is awaited first, and a store that rejects its
  // handle would hide it behind STORE_UNAVAILABLE. The web's order is the
  // sealer first (its pool handle resolves before the write), so check it here.
  if (keySecret(process.env) === null) {
    return writeRefuse("This server has no AUTH_SECRET, so it cannot store a key.", "NO_SECRET", 503);
  }

  try {
    const key = await saveProviderKey(await deps.db, deps.owner, provider, shape.key, process.env);
    return writeAnswer({ ok: true, key });
  } catch (error) {
    return keyWriteFailed("save", error);
  }
}

/**
 * `DELETE /api/learner/provider-key` with `{ provider }`: the owner's saved
 * key for it goes. 200 `{ ok, removed }` — `removed` false when there was
 * none. The same refusals as a save.
 */
export async function providerKeyRemoveTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = writeRecord(body);
  if ("refused" in read) return read.refused;
  const provider = readProvider(read.record);
  if (typeof provider !== "string") return provider;

  try {
    const removed = await removeProviderKey(await deps.db, deps.owner, provider);
    return writeAnswer({ ok: true, removed });
  } catch (error) {
    return keyWriteFailed("remove", error);
  }
}

/** A failed provider-key write, mapped exactly as the web route's `failed`. */
function keyWriteFailed(what: string, error: unknown): TurnReply {
  if (error instanceof CustomProviderError && error.code === "NOT_FOUND") {
    return writeRefuse("That is not one of your providers.", "NOT_FOUND", 404);
  }
  if (error instanceof NoKeySecretError) {
    return writeRefuse("This server has no AUTH_SECRET, so it cannot store a key.", "NO_SECRET", 503);
  }
  console.warn(`provider key ${what} failed (${failureCode(error)})`);
  return writeRefuse("Not saved: the database is unreachable.", "STORE_UNAVAILABLE", 503);
}

/** One provider's row in the status answer: what Settings may know — never the key, never its ciphertext. */
export interface ProviderKeyRow {
  id: ProviderName;
  label: string;
  /** The model the provider's key Test would call: its default, or "" for an owner's own provider. */
  model: string;
  keyUrl?: string;
  /** A provider the owner added (T14): its base URL. Absent for a built-in. */
  custom?: { baseUrl: string };
  saved: { last4: string; /** ISO instant of the last save. */ updatedAt: string; readable: boolean } | null;
  /** The server's environment holds a key for this provider. */
  server: boolean;
  /** Whose key the tutor calls this provider with now, or null when it has none. */
  inUse: "saved" | "server" | null;
}

/**
 * `GET /api/learner/provider-key`: the Provider keys card's rows — every
 * provider, built-in and the owner's own, with its key state. The web page
 * builds the same rows server-side (`providerKeyViews`); a native client has
 * no server component, so the sidecar answers them. Never throws: a database
 * that cannot be read answers `reachable: false` and rows holding the
 * server's keys only, as the web's `loadProviderKeys` does.
 */
export async function providerKeyStatusTurn(deps: TutorDeps): Promise<TurnReply> {
  let statuses: SavedKeyStatus[] = [];
  let custom: CustomProvider[] = [];
  let reachable = true;
  try {
    const db = await deps.db;
    [statuses, custom] = await Promise.all([
      savedKeyStatuses(db, deps.owner, process.env),
      readOwnerCustomProviders(db, deps.owner),
    ]);
  } catch (error) {
    console.warn(`settings: saved provider keys unavailable (${failureCode(error)})`);
    reachable = false;
  }

  const byProvider = new Map<string, SavedKeyStatus>(statuses.map((s) => [s.provider, s]));
  const configs = [...providerConfigs(deps.env), ...custom.map(customProviderConfig)];
  const rows = configs.map((config): ProviderKeyRow => {
    const status = byProvider.get(config.id);
    const server = config.apiKeyEnv !== "" && Boolean(deps.env[config.apiKeyEnv]?.trim());
    const own = status?.readable === true;
    return {
      id: config.id,
      label: config.label,
      model: config.model,
      ...(config.keyUrl === undefined ? {} : { keyUrl: config.keyUrl }),
      ...(config.custom ? { custom: { baseUrl: config.baseUrl } } : {}),
      saved:
        status === undefined
          ? null
          : { last4: status.last4, updatedAt: status.updatedAt, readable: status.readable },
      server,
      inUse: own ? "saved" : server ? "server" : null,
    };
  });
  // `providerKeyViews`' order: the owner's usable keys in the cascade's
  // order, then the server's. A custom provider has no built-in default and
  // is never in it (T14).
  const builtIn = rows.filter((row) => row.custom === undefined);
  const order = [
    ...builtIn.filter((row) => row.inUse === "saved"),
    ...builtIn.filter((row) => row.inUse === "server"),
  ].map((row) => ({ id: row.id, label: `${row.label} (${row.model})`, source: row.inUse }));
  return writeAnswer({ ok: true, reachable, rows, order });
}

/** `{ provider, model }` read from a body, or the refusal the web's `entry` gives. */
function chainEntryOf(body: unknown): { entry: { provider: ProviderName; model: string } } | { refused: TurnReply } {
  const read = writeRecord(body);
  if ("refused" in read) return read;
  const provider = readProvider(read.record);
  if (typeof provider !== "string") return { refused: provider };
  const checked = checkModelId(read.record.model);
  if (!checked.ok) return { refused: writeRefuse(checked.reason) };
  return { entry: { provider, model: checked.model } };
}

/**
 * The key gate an add and a replace share (docs/TUTOR-MODELS.md): the
 * provider must hold a key — a saved key that cannot be read because the
 * database is down is not "no key" — and the model id must not be, hold, or
 * be a long part of any key the tutor could call with (T11). Answers the
 * refusal, or `serverKey` for the write's own under-lock check.
 */
async function chainKeyGate(
  deps: TutorDeps,
  provider: ProviderName,
  model: string,
  what: "added" | "saved",
): Promise<{ serverKey: boolean } | { refused: TurnReply }> {
  let saved: SavedKeys;
  try {
    saved = await openSavedKeys(await deps.db, deps.owner, process.env);
  } catch (error) {
    console.warn(`tutor model ${what === "added" ? "add" : "set"}: saved provider keys unavailable (${failureCode(error)})`);
    return { refused: writeRefuse(`Not ${what}: your saved keys could not be read just now. Try again in a moment.`, "STORE_UNAVAILABLE", 503) };
  }
  if (keyFor(provider, saved, deps.env) === null) {
    return { refused: writeRefuse(`There is no key for ${providerLabel(provider)}. Add one under Providers first.`, "NO_KEY") };
  }
  if (echoesKey(model, saved, deps.env)) {
    return { refused: writeRefuse("That is one of your API keys, not a model id. Keys go in a provider's API key field.") };
  }
  return { serverKey: keyFor(provider, {}, deps.env) !== null };
}

/** Whether `model` is, holds, or is a long part of any key the tutor could call with. */
function echoesKey(model: string, saved: SavedKeys, env: Env): boolean {
  // The server's keys come through `keyFor`; every saved key is checked as
  // well, a custom provider's included, which `PROVIDER_IDS` does not name.
  const keys = [
    ...PROVIDER_IDS.flatMap((id) => {
      const key = keyFor(id, saved, env);
      return key === null ? [] : [key.apiKey];
    }),
    ...Object.values(saved).filter((key): key is string => typeof key === "string" && key !== ""),
  ];
  return keys.some((key) => model.includes(key) || (model.length >= 12 && key.includes(model)));
}

const CHAIN_STATUS: Record<TutorModelError["code"], number> = {
  INVALID: 400,
  DUPLICATE: 409,
  FULL: 409,
  NOT_FOUND: 404,
  NO_KEY: 400,
};

/** `chainFailed` in the web routes: the chain's own refusal, or a database that could not be reached. */
function chainWriteFailed(what: string, error: unknown): TurnReply {
  if (error instanceof TutorModelError) return writeRefuse(error.message, error.code, CHAIN_STATUS[error.code]);
  console.warn(`tutor model ${what} failed (${failureCode(error)})`);
  return writeRefuse(`Not ${what === "read" ? "read" : "saved"}: the database is unreachable.`, "STORE_UNAVAILABLE", 503);
}

/**
 * `POST /api/learner/tutor-model` with `{ provider, model }`: the entry joins
 * the chain at the bottom of its provider's models. 200 `{ ok, chain }`, the
 * whole chain after the change, top first.
 */
export async function tutorModelAddTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = chainEntryOf(body);
  if ("refused" in read) return read.refused;
  const gate = await chainKeyGate(deps, read.entry.provider, read.entry.model, "added");
  if ("refused" in gate) return gate.refused;
  try {
    const chain = await addChainEntry(await deps.db, deps.owner, read.entry.provider, read.entry.model, gate.serverKey);
    return writeAnswer({ ok: true, chain });
  } catch (error) {
    return chainWriteFailed("add", error);
  }
}

/**
 * `PUT /api/learner/tutor-model` with `{ provider, model }`: the whole chain
 * becomes this one entry, in one locked rewrite — a refused write keeps the
 * chain it would have replaced (T16). 200 `{ ok, chain }`.
 */
export async function tutorModelSetTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = chainEntryOf(body);
  if ("refused" in read) return read.refused;
  const gate = await chainKeyGate(deps, read.entry.provider, read.entry.model, "saved");
  if ("refused" in gate) return gate.refused;
  try {
    const chain = await setChainEntry(await deps.db, deps.owner, read.entry.provider, read.entry.model, gate.serverKey);
    return writeAnswer({ ok: true, chain });
  } catch (error) {
    return chainWriteFailed("saved", error);
  }
}

/**
 * `DELETE /api/learner/tutor-model` with `{ provider, model }`: the entry
 * leaves the chain. 200 `{ ok, chain }`; 404 `NOT_FOUND` for one that is not
 * there.
 */
export async function tutorModelRemoveTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = chainEntryOf(body);
  if ("refused" in read) return read.refused;
  try {
    const chain = await removeChainEntry(await deps.db, deps.owner, read.entry.provider, read.entry.model);
    return writeAnswer({ ok: true, chain });
  } catch (error) {
    return chainWriteFailed("remove", error);
  }
}

/**
 * `PATCH /api/learner/tutor-model` with `{ provider, model, direction }`:
 * the entry moves a place among its provider's models. 200 `{ ok, chain }`.
 */
export async function tutorModelMoveTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = chainEntryOf(body);
  if ("refused" in read) return read.refused;
  const direction = (body as Record<string, unknown>).direction;
  if (direction !== "up" && direction !== "down") return writeRefuse(`"direction" must be "up" or "down".`);
  try {
    const chain = await moveChainEntry(await deps.db, deps.owner, read.entry.provider, read.entry.model, direction);
    return writeAnswer({ ok: true, chain });
  } catch (error) {
    return chainWriteFailed("move", error);
  }
}

/**
 * `PATCH /api/learner/tutor-model/provider` with `{ provider, direction }`:
 * the provider's models move together past the next provider's (T12) — how
 * the card's provider order is stored.
 */
export async function tutorProviderMoveTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = writeRecord(body);
  if ("refused" in read) return read.refused;
  const provider = readProvider(read.record);
  if (typeof provider !== "string") return provider;
  const direction = read.record.direction;
  if (direction !== "up" && direction !== "down") return writeRefuse(`"direction" must be "up" or "down".`);
  try {
    const chain = await moveChainProvider(await deps.db, deps.owner, provider, direction);
    return writeAnswer({ ok: true, chain });
  } catch (error) {
    return chainWriteFailed("move", error);
  }
}

/**
 * `DELETE /api/learner/tutor-model/provider` with `{ provider }`: the
 * provider's models leave the chain and the owner's saved key for it goes,
 * in one transaction under the learner lock. 200 `{ ok, chain, keyRemoved }`.
 */
export async function tutorProviderRemoveTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = writeRecord(body);
  if ("refused" in read) return read.refused;
  const provider = readProvider(read.record);
  if (typeof provider !== "string") return provider;
  try {
    const removed = await deleteChainProvider(await deps.db, deps.owner, provider);
    return writeAnswer({ ok: true, ...removed });
  } catch (error) {
    return chainWriteFailed("remove", error);
  }
}

/**
 * `GET /api/learner/tutor-model`: the owner's chain, top first. The web page
 * reads it server-side (`loadTutorModels`); a native client has no server
 * component, so the sidecar answers it. Never throws: a database that cannot
 * be read answers `reachable: false` and an empty chain.
 */
export async function tutorModelChainTurn(deps: TutorDeps): Promise<TurnReply> {
  try {
    return writeAnswer({ ok: true, reachable: true, chain: await readChain(await deps.db, deps.owner) });
  } catch (error) {
    console.warn(`settings: model chain unavailable (${failureCode(error)})`);
    return writeAnswer({ ok: true, reachable: false, chain: [] });
  }
}

/** `failed` in the web's `/api/learner/custom-provider` route: its own refusal, or a dead store. */
function customProviderFailed(what: string, error: unknown): TurnReply {
  if (error instanceof CustomProviderError) {
    return writeRefuse(error.message, error.code, error.code === "NOT_FOUND" ? 404 : error.code === "FULL" ? 409 : 400);
  }
  if (error instanceof NoKeySecretError) {
    return writeRefuse("This server has no AUTH_SECRET, so it cannot store a key.", "NO_SECRET", 503);
  }
  console.warn(`custom provider ${what} failed (${failureCode(error)})`);
  return writeRefuse("Not saved: the database is unreachable.", "STORE_UNAVAILABLE", 503);
}

/**
 * `POST /api/learner/custom-provider` with `{ label, baseUrl, key }`: a
 * provider the owner adds themselves (docs/TUTOR-MODELS.md, T14) — a name
 * and an OpenAI-compatible base URL, stored with its sealed key in one
 * transaction, so a provider never exists without its key. The id is made
 * from the name (`custom-<slug>`); the answer names it, never the key.
 * 200 `{ ok, provider, key }`; 409 `FULL` past the owner's limit, 503
 * `NO_SECRET` with no `AUTH_SECRET` to seal under.
 */
export async function customProviderAddTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = writeRecord(body);
  if ("refused" in read) return read.refused;
  const shape = checkKeyShape(read.record.key);
  if (!shape.ok) return writeRefuse(shape.reason);
  // As `providerKeySaveTurn`: on the web's path the sealer runs before the
  // database is awaited, so a missing secret is NO_SECRET even when the
  // store is down.
  if (keySecret(process.env) === null) {
    return writeRefuse("This server has no AUTH_SECRET, so it cannot store a key.", "NO_SECRET", 503);
  }
  try {
    const created = await createCustomProvider(
      await deps.db,
      deps.owner,
      { label: read.record.label, baseUrl: read.record.baseUrl },
      shape.key,
      process.env,
    );
    return writeAnswer({ ok: true, ...created });
  } catch (error) {
    return customProviderFailed("add", error);
  }
}

/**
 * `PATCH /api/learner/custom-provider` with `{ provider, label?, baseUrl?,
 * key? }`: rename the provider, move it, and replace its key, all in one
 * transaction — a key that cannot be stored leaves the name and the URL as
 * they were. Its id and its models stay. Delete is the provider route's
 * (`tutorProviderRemoveTurn`), which removes it whole. 200 `{ ok, provider,
 * key }`, `key` null when none was sent.
 */
export async function customProviderChangeTurn(deps: TutorDeps, body: unknown): Promise<TurnReply> {
  const read = writeRecord(body);
  if ("refused" in read) return read.refused;
  if (!isCustomProviderId(read.record.provider)) {
    return writeRefuse(`"provider" must be the id of one of your providers (custom-…).`);
  }
  const { label, baseUrl, key } = read.record;
  if (label === undefined && baseUrl === undefined && key === undefined) {
    return writeRefuse("Send a new name, a new base URL, a new key, or any of them.");
  }
  let checked: string | undefined;
  if (key !== undefined) {
    const shape = checkKeyShape(key);
    if (!shape.ok) return writeRefuse(shape.reason);
    checked = shape.key;
  }
  // Same ordering as the add: a replacement key with no secret to seal
  // under is NO_SECRET, and it is checked before the store is reached.
  if (checked !== undefined && keySecret(process.env) === null) {
    return writeRefuse("This server has no AUTH_SECRET, so it cannot store a key.", "NO_SECRET", 503);
  }
  try {
    const changed = await changeCustomProvider(
      await deps.db,
      deps.owner,
      read.record.provider,
      { label, baseUrl },
      checked,
      process.env,
    );
    return writeAnswer({ ok: true, ...changed });
  } catch (error) {
    return customProviderFailed("change", error);
  }
}
