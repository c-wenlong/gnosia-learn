import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConceptWorkspace } from "@/lib/concept-workspace-core";

/**
 * `POST /api/agent/session`: one structured question from the tutor model.
 * The provider cascade and the workspace read are mocked, as in the chat
 * route's test; what is under test is the contract (validation, the codes the
 * page falls back on) and that a prose reply is refused, never graded.
 */
const readConceptWorkspace = vi.hoisted(() => vi.fn());
const completeWithFallback = vi.hoisted(() => vi.fn());
const readTutorStyle = vi.hoisted(() => vi.fn());

vi.mock("@/lib/concept-workspace", () => ({ readConceptWorkspace }));
vi.mock("@/lib/settings", () => ({ readTutorStyle }));
vi.mock("@/lib/agent/providers", () => ({
  completeWithFallback,
  availableProviderSummary: () => "none",
}));

const ORIGIN = "http://localhost:3000";
let ip = 0;

function post(body: unknown, origin: string | null = ORIGIN): Request {
  ip += 1;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "localhost:3000",
    "x-forwarded-for": `10.1.0.${ip}`,
  };
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}/api/agent/session`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const workspace = {
  slug: "dot-product",
  title: "Dot product",
  summary: "Measures alignment.",
  domain: "foundations",
  bucket: "untouched",
  pL: 0.25,
  mastery: "gap",
  observations: 0,
  correct: 0,
  lastSeen: null,
  place: null,
  note: { available: true, path: "learn/concepts/foundations/dot-product.md", source: "---\nid: dot-product\n---\nThe body." },
  sources: [],
  tags: [],
  requires: [],
  assumes: [],
  dependants: [],
  backlinks: [],
  checks: [],
  history: [],
  review: null,
  assets: [],
  graph: { nodes: [], edges: [] },
  frontier: true,
} satisfies ConceptWorkspace;

const reply = (content: string) => ({
  ok: true,
  result: { content, model: "m", provider: "nvidia", providerLabel: "NVIDIA NIM" },
  attempts: [],
});

async function call(body: unknown, origin?: string | null) {
  const { POST } = await import("./route");
  const res = await POST(post(body, origin));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("POST /api/agent/session", () => {
  beforeEach(() => {
    readConceptWorkspace.mockReset();
    completeWithFallback.mockReset();
    readConceptWorkspace.mockResolvedValue({ state: "ok", workspace });
    readTutorStyle.mockReset();
    readTutorStyle.mockResolvedValue("guide-concise");
  });

  it("refuses another origin before reading anything", async () => {
    expect((await call({ conceptSlug: "dot-product", step: "probe" }, "https://evil.example")).status).toBe(403);
    expect(readConceptWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    [{ conceptSlug: "../x", step: "probe" }],
    [{ conceptSlug: "dot-product", step: "teach" }],
    [{ conceptSlug: "dot-product", step: "check", avoid: "Why?" }],
    [{ conceptSlug: "dot-product", step: "check", avoid: ["a", "b", "c", "d", "e"] }],
    ["not json"],
  ])("refuses %j as a 400 before any read", async (body) => {
    const { status, json } = await call(body);
    expect(status).toBe(400);
    expect(json.code).toBe("BAD_REQUEST");
    expect(readConceptWorkspace).not.toHaveBeenCalled();
    expect(completeWithFallback).not.toHaveBeenCalled();
  });

  it("builds the prompt on the server from the concept and returns a shuffled question", async () => {
    completeWithFallback.mockResolvedValue(
      reply(JSON.stringify({ question: "Q?", options: ["Right", "W1", "W2", "W3"], correct: 0, explanation: "Because." })),
    );
    const { status, json } = await call({ conceptSlug: "dot-product", step: "check", avoid: ["Earlier?"] });
    expect(status).toBe(200);
    const question = json.question as { choices: string[]; correct: number; origin: string };
    expect(question.choices[question.correct]).toBe("Right");
    expect(question.origin).toBe("model");

    const [messages] = completeWithFallback.mock.calls[0] as [{ role: string; content: string }[]];
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("Dot product");
    expect(messages[0]?.content).toContain("- Earlier?");
    expect(messages[1]?.role).toBe("user");
  });

  it("writes the explanation in the learner's tutor style", async () => {
    readTutorStyle.mockResolvedValue("guide-detailed");
    completeWithFallback.mockResolvedValue(
      reply(JSON.stringify({ question: "Q?", options: ["Right", "W1", "W2", "W3"], correct: 0, explanation: "Because." })),
    );
    await call({ conceptSlug: "dot-product", step: "probe" });
    const [messages] = completeWithFallback.mock.calls[0] as [{ role: string; content: string }[]];
    expect(messages[0]?.content).toContain("three or four sentences");
  });

  it("answers UNSTRUCTURED_REPLY when the model writes prose, so the page falls back", async () => {
    completeWithFallback.mockResolvedValue(reply("What do you think a dot product measures?"));
    const { status, json } = await call({ conceptSlug: "dot-product", step: "probe" });
    expect(status).toBe(502);
    expect(json.code).toBe("UNSTRUCTURED_REPLY");
  });

  it("passes on the provider codes the page tells apart", async () => {
    completeWithFallback.mockResolvedValue({ ok: false, attempts: [], code: "MISSING_API_KEY" });
    expect(await call({ conceptSlug: "dot-product", step: "probe" })).toMatchObject({
      status: 503,
      json: { code: "MISSING_API_KEY" },
    });
    completeWithFallback.mockResolvedValue({ ok: false, attempts: [], code: "ALL_PROVIDERS_FAILED" });
    expect((await call({ conceptSlug: "dot-product", step: "probe" })).status).toBe(502);
  });

  it("is a 404 for an unknown concept and a 503 when the knowledge base is down", async () => {
    readConceptWorkspace.mockResolvedValue({ state: "not-found" });
    expect((await call({ conceptSlug: "nope", step: "probe" })).json.code).toBe("CONCEPT_NOT_FOUND");
    readConceptWorkspace.mockResolvedValue({ state: "unreachable", message: "down" });
    expect((await call({ conceptSlug: "nope", step: "probe" })).status).toBe(503);
    expect(completeWithFallback).not.toHaveBeenCalled();
  });
});
