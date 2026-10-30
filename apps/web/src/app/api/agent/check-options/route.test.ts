import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConceptWorkspace } from "@gnosia/tutor/concept-workspace-core";

/**
 * `POST /api/agent/check-options`: the tutor's wrong options for one of a
 * note's checks. The provider cascade and the workspace read are mocked, as
 * in the session route's test, and the catalog is a stand-in that cannot
 * answer (the store's own behaviour is `checkOptionsTurn`'s suite in
 * packages/tutor); what is under test is the route's guards and that it
 * hands back the turn's answer.
 */
const readConceptWorkspace = vi.hoisted(() => vi.fn());
const completeWithFallback = vi.hoisted(() => vi.fn());
const readTutorStyle = vi.hoisted(() => vi.fn());

vi.mock("@/lib/concept-workspace", () => ({ readConceptWorkspace }));
vi.mock("@/lib/settings", () => ({ readTutorStyle }));
vi.mock("@gnosia/tutor/providers", async (importOriginal) => ({
  // The pure helpers (the missing-key message, the skipped entries) are real.
  ...(await importOriginal<typeof import("@gnosia/tutor/providers")>()),
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
// The limiter, watched: a body the turn refuses must not spend a token.
const enforceRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent/guard", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agent/guard")>();
  enforceRateLimit.mockImplementation(real.enforceRateLimit);
  return { ...real, enforceRateLimit };
});
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
  return new Request(`${ORIGIN}/api/agent/check-options`, {
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
  checks: [{ id: "c1", question: "What does it measure?", answer: "The cosine of the angle.", why: "", source: "", status: "untried" }],
  history: [],
  review: null,
  assets: [],
  graph: { nodes: [], edges: [] },
  frontier: true,
} satisfies ConceptWorkspace;

const WRONG = ["The sine of the angle.", "The sum of the lengths.", "The area they span."];

async function call(body: unknown, origin?: string | null) {
  const { POST } = await import("./route");
  const res = await POST(post(body, origin));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("POST /api/agent/check-options", () => {
  beforeEach(() => {
    readConceptWorkspace.mockReset();
    completeWithFallback.mockReset();
    tutorCredentials.mockReset();
    tutorCredentials.mockResolvedValue(CREDENTIALS);
    signedIn.value = true;
    readConceptWorkspace.mockResolvedValue({ state: "ok", workspace });
    readTutorStyle.mockResolvedValue("guide-concise");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("refuses another origin before reading anything", async () => {
    expect((await call({ conceptSlug: "dot-product", checkId: "c1" }, "https://evil.example")).status).toBe(403);
    expect(readConceptWorkspace).not.toHaveBeenCalled();
  });

  it.each([[{ conceptSlug: "../x", checkId: "c1" }], [{ conceptSlug: "dot-product", checkId: "1" }], [{ conceptSlug: "dot-product" }], ["not json"]])(
    "refuses %j as a 400 before the limiter or any read",
    async (body) => {
      enforceRateLimit.mockClear();
      const { status, json } = await call(body);
      expect(status).toBe(400);
      expect(json.code).toBe("BAD_REQUEST");
      expect(enforceRateLimit).not.toHaveBeenCalled();
      expect(readConceptWorkspace).not.toHaveBeenCalled();
    },
  );

  it("answers the options the tutor wrote, with the answer they were written for, paid with the owner's keys", async () => {
    completeWithFallback.mockResolvedValue({
      ok: true,
      result: { content: JSON.stringify({ wrong: WRONG }), model: "m", provider: "nvidia", providerLabel: "NVIDIA NIM" },
      attempts: [],
    });
    const { status, json } = await call({ conceptSlug: "dot-product", checkId: "c1" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ options: WRONG, answer: "The cosine of the angle.", cached: false });
    expect(tutorCredentials).toHaveBeenCalledWith("local");
    expect(readConceptWorkspace).toHaveBeenCalledWith("dot-product", "local");
  });

  it("passes on the codes the page falls back on", async () => {
    completeWithFallback.mockResolvedValue({ ok: false, attempts: [], code: "MISSING_API_KEY" });
    expect((await call({ conceptSlug: "dot-product", checkId: "c1" })).json.code).toBe("MISSING_API_KEY");
    completeWithFallback.mockResolvedValue({
      ok: true,
      result: { content: "The sine.", model: "m", provider: "nvidia", providerLabel: "NVIDIA NIM" },
      attempts: [],
    });
    expect((await call({ conceptSlug: "dot-product", checkId: "c1" })).json.code).toBe("UNSTRUCTURED_REPLY");
    expect((await call({ conceptSlug: "dot-product", checkId: "c2" })).json.code).toBe("CHECK_NOT_FOUND");
  });
});
