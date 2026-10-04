import { NextResponse } from "next/server";
import {
  CHAT_RATE_LIMIT,
  enforcePayloadBounds,
  enforceRateLimit,
  enforceSameOrigin,
} from "@/lib/agent/guard";
import { readCoursesOr503 } from "@/lib/agent/courses";
import { findTopicBySlugs } from "@/lib/agent/lookup";
import {
  buildAgentSessionContext,
  buildConceptSessionContext,
  buildOpenTutorPrompt,
  OPEN_SUBJECT_LIMIT,
  type CitationSource,
} from "@/lib/agent/prompt";
import { isConceptSlug, toConceptPromptInput } from "@/lib/concept-workspace-core";
import { readConceptWorkspace } from "@/lib/concept-workspace";
import { readTutorStyle } from "@/lib/settings";
import { splitCheck } from "@/lib/tutor-check";
import { tutorCredentials } from "@/lib/agent/credentials";
import {
  availableProviderSummary,
  completeWithFallback,
  missingKeyMessage,
  skippedEntries,
  type ChatMessage,
} from "@/lib/agent/providers";
import { requestOwner } from "@/lib/learner-api";
import { KNOWLEDGE_LIMITS } from "@/lib/storage";
import type { TopicKnowledge } from "@/lib/types";

export const runtime = "nodejs";

/**
 * One of three shapes. The topic tutor (the course session) sends
 * `courseSlug`, `moduleSlug` and `topicId`. The concept tutor (the workspace)
 * sends `conceptSlug` instead, and when it is present the three topic fields
 * are ignored. The open tutor (`/ask`, from Home's Ask box) sends `subject`,
 * the text the owner typed, and nothing else. The request and response shapes are written down in
 * docs/design/IMPLEMENTATION.md under "The concept tutor API".
 */
interface ChatBody {
  courseSlug?: string;
  moduleSlug?: string;
  topicId?: string;
  conceptSlug?: unknown;
  subject?: unknown;
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

export async function POST(req: Request) {
  // Cheapest first, so a refused request never costs a provider call: the
  // origin check needs no body at all.
  const crossOrigin = enforceSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  // Whose provider keys the turn is paid with (docs/BYOK.md). The proxy has
  // already turned away a request with no session; this is the 401 if not.
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "The body must be a JSON object" }, { status: 400 });
  }
  if (body.conceptSlug !== undefined) return conceptTurn(req, body, owner);
  if (body.subject !== undefined) return openTurn(req, body, owner);

  const { courseSlug, moduleSlug, topicId, messages, learnerNote, priorKnowledge } =
    body;
  if (!courseSlug || !moduleSlug || !topicId || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "courseSlug, moduleSlug, topicId, and messages are required" },
      { status: 400 },
    );
  }

  const tooLarge = enforcePayloadBounds(messages, learnerNote);
  if (tooLarge) return tooLarge;

  // Before the topic lookup on purpose: otherwise a caller could spin the
  // limiter for free by varying the slugs and collecting 404s.
  const rateLimited = enforceRateLimit(req, "chat", CHAT_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const read = await readCoursesOr503();
  if ("response" in read) return read.response;
  const found = findTopicBySlugs(read.courses, courseSlug, moduleSlug, topicId);
  if (!found) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const session = buildAgentSessionContext(
    found.course,
    found.module,
    found.topic,
    {
      learnerNote,
      priorKnowledge: sanitizeKnowledge(priorKnowledge, topicId),
    },
  );

  return completeTurn(owner, session.systemPrompt, messages);
}

/**
 * A turn of the concept tutor. The context is the concept's note, its
 * neighbours, the learner's mastery and recent answers on it, and their tutor
 * style preference, all read on the server from `conceptSlug`; nothing about
 * the concept is taken from the browser. The response adds `concept` and the numbered `sources` the reply
 * may cite as `[n]`.
 *
 * A reply that asks a check ends with a `CHECK: <question>` line
 * (docs/proposals/recall-in-chat.md, R5). It is taken off here and returned
 * as `check: { question }` beside the prose, or `check: null`, so the browser
 * never shows the marker and the thread knows the next message answers it.
 */
async function conceptTurn(req: Request, body: ChatBody, owner: string) {
  const { conceptSlug, messages, learnerNote } = body;
  // Every turn checked here, so a malformed one is a 400 before anything is
  // read rather than a throw inside the provider call.
  const wellFormed =
    Array.isArray(messages) &&
    messages.every(
      (m: unknown) =>
        m !== null &&
        typeof m === "object" &&
        ["user", "assistant", "system"].includes((m as ChatMessage).role) &&
        typeof (m as ChatMessage).content === "string",
    );
  if (!isConceptSlug(conceptSlug) || !wellFormed) {
    return NextResponse.json(
      {
        error:
          "conceptSlug must be a concept id (lowercase letters, digits and hyphens), and messages an array of { role, content } turns",
        code: "BAD_REQUEST",
      },
      { status: 400 },
    );
  }

  const tooLarge = enforcePayloadBounds(messages, learnerNote);
  if (tooLarge) return tooLarge;

  // Before the lookup, for the same reason as the topic path: an unknown slug
  // must not be a free way to spin the limiter.
  const rateLimited = enforceRateLimit(req, "chat", CHAT_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const read = await readConceptWorkspace(conceptSlug);
  if (read.state === "unreachable") {
    return NextResponse.json(
      {
        error: "The knowledge base could not be reached, so the tutor has no note to work from.",
        code: "CONCEPT_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
  if (read.state === "not-found") {
    return NextResponse.json({ error: "Concept not found", code: "CONCEPT_NOT_FOUND" }, { status: 404 });
  }

  // The learner's Settings choice, read after the concept so a database that
  // is down has already answered 503 above.
  const style = await readTutorStyle();
  const session = buildConceptSessionContext(toConceptPromptInput(read.workspace), { style });
  const note =
    typeof learnerNote === "string" && learnerNote.trim()
      ? `\n## Learner notes (from their study hub)\n${learnerNote.trim()}\n`
      : "";
  return completeTurn(
    owner,
    session.systemPrompt + note,
    messages,
    { concept: { slug: read.workspace.slug, title: read.workspace.title }, sources: session.sources },
    { markChecks: true },
  );
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

/**
 * A turn of the open tutor (docs/proposals/home-page.md, part 1): a subject
 * nothing in the catalog matched. No note, no mastery and nothing recorded
 * (H4); the prompt is built from the subject and the owner's tutor style only.
 */
async function openTurn(req: Request, body: ChatBody, owner: string) {
  const { subject, messages } = body;
  const text = typeof subject === "string" ? subject.trim() : "";
  if (text === "" || text.length > OPEN_SUBJECT_LIMIT || !wellFormedTurns(messages)) {
    return NextResponse.json(
      {
        error: `subject must be the text to learn about (1 to ${OPEN_SUBJECT_LIMIT} characters), and messages an array of { role, content } turns`,
        code: "BAD_REQUEST",
      },
      { status: 400 },
    );
  }

  const tooLarge = enforcePayloadBounds(messages, undefined);
  if (tooLarge) return tooLarge;

  const rateLimited = enforceRateLimit(req, "chat", CHAT_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const style = await readTutorStyle();
  return completeTurn(owner, buildOpenTutorPrompt(text, { style }), messages);
}

/** Send the turn to the provider cascade and shape the answer both tutors share. */
async function completeTurn(
  owner: string,
  systemPrompt: string,
  messages: ChatMessage[],
  extra: { concept?: { slug: string; title: string }; sources?: CitationSource[] } = {},
  { markChecks = false }: { markChecks?: boolean } = {},
) {
  // Always inject our system prompt as the authoritative first message.
  const payloadMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.filter((m) => m.role !== "system"),
  ];

  const credentials = await tutorCredentials(owner);
  const outcome = await completeWithFallback(payloadMessages, credentials);

  if (!outcome.ok) {
    if (outcome.code === "MISSING_API_KEY") {
      return NextResponse.json(
        {
          error: missingKeyMessage(credentials),
          code: "MISSING_API_KEY",
          attempts: outcome.attempts,
          providers: availableProviderSummary(credentials),
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "All free providers failed",
        code: "ALL_PROVIDERS_FAILED",
        attempts: outcome.attempts,
        providers: availableProviderSummary(credentials),
      },
      { status: 502 },
    );
  }

  // Only the concept tutor's prompt asks for the marker; the other two keep
  // the reply exactly as the model wrote it.
  const split = markChecks ? splitCheck(outcome.result.content) : null;
  return NextResponse.json({
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
