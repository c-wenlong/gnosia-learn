import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConceptWorkspace } from "@/lib/concept-workspace-core";

/**
 * `POST /api/agent/judge`: the verdict on one answer to a chat check.
 * The provider cascade and the workspace read are mocked, as in the session
 * route's test; what is under test is the contract (validation, the codes the
 * row falls back on), that the note's matching check reaches the judge, and
 * that a reply with no boolean verdict is refused, never guessed at.
 */
const readConceptWorkspace = vi.hoisted(() => vi.fn());
const completeWithFallback = vi.hoisted(() => vi.fn());

vi.mock("@/lib/concept-workspace", () => ({ readConceptWorkspace }));
vi.mock("@/lib/agent/providers", async (importOriginal) => ({
  // The pure helpers (the missing-key message, the skipped entries) are real.
  ...(await importOriginal<typeof import("@/lib/agent/providers")>()),
  completeWithFallback,
  availableProviderSummary: () => "none",
}));
// The owner's keys (docs/BYOK.md): whose keys the turn is paid with, read per
// request for the signed-in owner. Mocked here; the ordering has its own test.
const tutorCredentials = vi.hoisted(() => vi.fn());
const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/agent/credentials", () => ({ tutorCredentials }));
// tutorDeps opens the catalog for every request. Unmocked, that is the
// owner's real ~/.gnosia/catalog.db on a laptop, and a rejected promise on CI,
// whose DATABASE_URL is a postgres:// tripwire the catalog refuses. Nothing
// this route reads here goes through the handle, so a stand-in will do.
vi.mock("@/lib/learner-store", () => ({ catalogDatabase: async () => ({}) }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => signedIn.value,
}));

/** A stand-in for `tutorCredentials`' answer; the route only passes it on. */
const CREDENTIALS = [{ config: { id: "gemini" }, apiKey: "own-gemini-key", source: "saved" }];

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
  return new Request(`${ORIGIN}/api/agent/judge`, {
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
  checks: [
    {
      id: "zero",
      question: "What does a dot product of zero tell you about two vectors?",
      answer: "They are orthogonal",
      why: "cos 90 degrees is 0",
      source: "",
      status: "untried",
    },
  ],
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

const OK = { conceptSlug: "dot-product", question: "What does a zero dot product tell you about the two vectors?", answer: "perpendicular" };

describe("POST /api/agent/judge", () => {
  beforeEach(() => {
    readConceptWorkspace.mockReset();
    completeWithFallback.mockReset();
    tutorCredentials.mockReset();
    tutorCredentials.mockResolvedValue(CREDENTIALS);
    signedIn.value = true;
    readConceptWorkspace.mockResolvedValue({ state: "ok", workspace });
  });

  it("refuses another origin before reading anything", async () => {
    expect((await call(OK, "https://evil.example")).status).toBe(403);
    expect(readConceptWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...OK, conceptSlug: "../x" }],
    [{ ...OK, question: "" }],
    [{ ...OK, question: "q".repeat(401) }],
    [{ ...OK, answer: "  " }],
    [{ ...OK, answer: "a".repeat(4001) }],
    [{ conceptSlug: "dot-product" }],
    [{ ...OK, commitment: "" }],
    [{ ...OK, commitment: 42 }],
    [{ ...OK, commitment: "c".repeat(801) }],
    ["not json"],
  ])("refuses %j as a 400 before any read", async (body) => {
    const { status, json } = await call(body);
    expect(status).toBe(400);
    expect(json.code).toBe("BAD_REQUEST");
    expect(readConceptWorkspace).not.toHaveBeenCalled();
    expect(completeWithFallback).not.toHaveBeenCalled();
  });

  it("judges against the note's matching check and returns the verdict", async () => {
    completeWithFallback.mockResolvedValue(reply('{"correct": true, "feedback": "Yes, orthogonal."}'));
    const { status, json } = await call(OK);
    expect(status).toBe(200);
    expect(json.verdict).toEqual({ correct: true, feedback: "Yes, orthogonal." });
    const [messages, credentials] = completeWithFallback.mock.calls[0] as [{ role: string; content: string }[], unknown];
    expect(credentials).toBe(CREDENTIALS);
    expect(messages[0]?.content).toContain("- Answer: They are orthogonal");
    expect(messages[0]?.content).toContain("The body.");
    expect(messages[1]?.content).toContain("<learner_answer>\nperpendicular\n</learner_answer>");
  });

  it("reads a recall check's commitment first, ahead of the note's matching check (structured checks, phase 2)", async () => {
    completeWithFallback.mockResolvedValue(reply('{"correct": false, "feedback": "Missing why."}'));
    const commitment = "They are orthogonal: the cosine of 90 degrees is zero, so the product vanishes.";
    const { status, json } = await call({ ...OK, commitment });
    expect(status).toBe(200);
    expect(json.verdict).toEqual({ correct: false, feedback: "Missing why." });
    const system = (completeWithFallback.mock.calls[0] as [{ role: string; content: string }[]])[0][0].content;
    expect(system).toContain(`## The answer the tutor committed to`);
    expect(system).toContain(commitment);
    expect(system.indexOf(commitment)).toBeLessThan(system.indexOf("- Answer: They are orthogonal"));
  });

  it("answers UNSTRUCTURED_REPLY for a verdict that is not true or false", async () => {
    completeWithFallback.mockResolvedValue(reply("Looks right to me!"));
    const { status, json } = await call(OK);
    expect(status).toBe(502);
    expect(json.code).toBe("UNSTRUCTURED_REPLY");
  });

  it("answers 404, 503 and the provider codes the row falls back on", async () => {
    readConceptWorkspace.mockResolvedValueOnce({ state: "not-found" });
    expect((await call(OK)).json.code).toBe("CONCEPT_NOT_FOUND");
    readConceptWorkspace.mockResolvedValueOnce({ state: "unreachable" });
    expect((await call(OK)).json.code).toBe("CONCEPT_UNAVAILABLE");
    completeWithFallback.mockResolvedValueOnce({ ok: false, code: "MISSING_API_KEY", attempts: [] });
    expect((await call(OK)).json.code).toBe("MISSING_API_KEY");
    completeWithFallback.mockResolvedValueOnce({ ok: false, code: "ALL_FAILED", attempts: [] });
    expect((await call(OK)).json.code).toBe("ALL_PROVIDERS_FAILED");
  });

  it("is a 401 with no session, before any read", async () => {
    signedIn.value = false;
    expect((await call(OK)).status).toBe(401);
    expect(readConceptWorkspace).not.toHaveBeenCalled();
  });
});
