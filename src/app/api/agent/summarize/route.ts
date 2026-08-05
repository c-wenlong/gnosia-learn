import { NextResponse } from "next/server";
import { findTopicBySlugs } from "@/lib/agent/lookup";
import {
  buildSummarySystemPrompt,
  formatTranscript,
  parseKnowledgeResponse,
  type TranscriptTurn,
} from "@/lib/agent/summary";
import {
  availableProviderSummary,
  completeWithFallback,
  type ChatMessage,
} from "@/lib/agent/providers";

export const runtime = "nodejs";

interface SummarizeBody {
  courseSlug: string;
  moduleSlug: string;
  topicId: string;
  messages: TranscriptTurn[];
}

export async function POST(req: Request) {
  let body: SummarizeBody;
  try {
    body = (await req.json()) as SummarizeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { courseSlug, moduleSlug, topicId, messages } = body;
  if (!courseSlug || !moduleSlug || !topicId || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "courseSlug, moduleSlug, topicId, and messages are required" },
      { status: 400 },
    );
  }

  const turns = messages.filter(
    (m) =>
      (m?.role === "user" || m?.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim(),
  );
  if (turns.length < 2) {
    return NextResponse.json(
      { error: "Not enough dialogue to summarise yet", code: "TRANSCRIPT_TOO_SHORT" },
      { status: 400 },
    );
  }

  const found = findTopicBySlugs(courseSlug, moduleSlug, topicId);
  if (!found) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
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

  const outcome = await completeWithFallback(payload);

  if (!outcome.ok) {
    if (outcome.code === "MISSING_API_KEY") {
      return NextResponse.json(
        {
          error:
            "No free provider API keys configured. Write the recap by hand instead — it saves to the same place.",
          code: "MISSING_API_KEY",
          providers: availableProviderSummary(),
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error: "All free providers failed",
        code: "ALL_PROVIDERS_FAILED",
        attempts: outcome.attempts,
        providers: availableProviderSummary(),
      },
      { status: 502 },
    );
  }

  const knowledge = parseKnowledgeResponse(outcome.result.content);
  if (!knowledge) {
    // Hand the raw text back so the learner can salvage it by hand.
    return NextResponse.json(
      {
        error: "Model did not return a usable recap",
        code: "UNPARSEABLE_RECAP",
        raw: outcome.result.content.slice(0, 4000),
        provider: outcome.result.provider,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    knowledge,
    model: outcome.result.model,
    provider: outcome.result.provider,
    providerLabel: outcome.result.providerLabel,
  });
}
