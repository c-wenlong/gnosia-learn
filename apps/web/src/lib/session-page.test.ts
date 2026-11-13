import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConceptWorkspace, NeighbourRef } from "@hermes/tutor/concept-workspace-core";

import { loadSessionPage, noteResolvers, sessionWillAsk } from "./session-page";

/**
 * `noteResolvers`: how a concept's note resolves on the workspace and the
 * session page, which both call it. The catalog read behind the embeds is
 * mocked, so which files were asked about is a recorded fact.
 */
const readFileProblems = vi.hoisted(() => vi.fn());
const readAssetAccess = vi.hoisted(() => vi.fn());
const tutorCredentials = vi.hoisted(() => vi.fn());
const conceptSummaries = vi.hoisted(() => vi.fn());
const readWrittenOptions = vi.hoisted(() => vi.fn());
const catalogDatabase = vi.hoisted(() => vi.fn());
const readKb = vi.hoisted(() => vi.fn());
const currentOwner = vi.hoisted(() => vi.fn());
const currentScope = vi.hoisted(() => vi.fn());

vi.mock("@/lib/asset-library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asset-library")>()),
  readFileProblems,
  readAssetAccess,
}));
vi.mock("@/lib/agent/credentials", () => ({ tutorCredentials }));
vi.mock("@hermes/catalog/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hermes/catalog/state")>()),
  conceptSummaries,
}));
vi.mock("@hermes/tutor/server/check-options", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hermes/tutor/server/check-options")>()),
  readWrittenOptions,
}));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase, readKb }));
vi.mock("@/lib/owner", () => ({ currentOwner, currentScope }));

const ref = (slug: string): NeighbourRef => ({ slug, title: slug, bucket: "untouched", pL: 0 });

const WORKSPACE = {
  slug: "vectors",
  requires: [ref("numbers")],
  assumes: [ref("arithmetic")],
  dependants: [ref("matrices")],
  // A concept whose `assumes` names this one, so a backlink and not a dependant.
  backlinks: [ref("matrices"), ref("dot-product")],
};

/** A workspace as `loadSessionPage` and `sessionWillAsk` read it: the fields they touch, overridden per case. */
const workspace = (extra: Record<string, unknown> = {}): ConceptWorkspace =>
  ({
    slug: "vectors",
    title: "Vectors",
    summary: "An arrow with a length.",
    domain: null,
    bucket: "untouched",
    pL: 0.2,
    mastery: "gap",
    observations: 0,
    correct: 0,
    lastSeen: null,
    place: null,
    note: { available: false, code: "no-note", message: "none" },
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
    frontier: false,
    ...extra,
  }) as ConceptWorkspace;

const check = (id: string, question: string, answer: string) => ({ id, question, answer, why: "", source: "", status: "untried" as const });

/** Three checks whose answers fill each other's wrong options without the tutor or another note. */
const THREE_CHECKS = [
  check("c1", "What is a vector?", "A length with a direction."),
  check("c2", "What is a scalar?", "A length without a direction."),
  check("c3", "What is a basis?", "A set of vectors that spans."),
];

const asset = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind,
  path: null,
  url: null,
  bytes: null,
  title: id,
  sourceRepo: "learn",
  ...extra,
});

beforeEach(() => {
  readFileProblems.mockReset();
  readFileProblems.mockResolvedValue(new Map());
  readAssetAccess.mockReset();
  readAssetAccess.mockResolvedValue({ served: new Set(), posters: new Set() });
  tutorCredentials.mockReset();
  tutorCredentials.mockResolvedValue([]);
  conceptSummaries.mockReset();
  conceptSummaries.mockResolvedValue([]);
  readWrittenOptions.mockReset();
  readWrittenOptions.mockResolvedValue(new Map());
  catalogDatabase.mockReset();
  catalogDatabase.mockResolvedValue({});
  readKb.mockReset();
  readKb.mockResolvedValue({ kb: { concepts: [], frontier: [], edges: [] }, reachable: true });
  currentOwner.mockReset();
  currentOwner.mockResolvedValue("local");
  currentScope.mockReset();
  currentScope.mockResolvedValue({ owner: "local", readable: ["local", "commons"] });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("noteResolvers", () => {
  it("links the concept, its neighbours and its backlinks, and nothing else", async () => {
    const { resolveNote } = await noteResolvers(WORKSPACE, "");
    for (const slug of ["vectors", "numbers", "arithmetic", "matrices", "dot-product"]) {
      expect(resolveNote(slug)).toBe(`/learn/${slug}`);
    }
    // A session log, or a concept the note never neighbours, stays plain text.
    expect(resolveNote("2026-10-01-vectors")).toBeUndefined();
    expect(resolveNote("eigenvalues")).toBeUndefined();
  });

  it("asks about each embed in the source once, and shows a known problem instead of a picture", async () => {
    readFileProblems.mockResolvedValue(
      new Map([
        ["diagram:learn/assets/gone.svg", "not-uploaded"],
        ["diagram:learn/assets/here.svg", null],
      ]),
    );
    const { resolveEmbed } = await noteResolvers(WORKSPACE, "![[gone.svg]]\n\n![[here.svg]]");

    expect(readFileProblems).toHaveBeenCalledTimes(1);
    expect(readFileProblems).toHaveBeenCalledWith(["diagram:learn/assets/gone.svg", "diagram:learn/assets/here.svg"]);
    expect(resolveEmbed("gone.svg")).toEqual({ problem: "not-uploaded" });
    const id = encodeURIComponent("diagram:learn/assets/here.svg");
    expect(resolveEmbed("here.svg")).toEqual({ src: `/api/assets/${id}/file`, statusHref: `/api/assets/${id}/status` });
  });

  it("reads nothing for an empty source, and still resolves an embed to the asset routes", async () => {
    const { resolveEmbed } = await noteResolvers(WORKSPACE, "");
    expect(readFileProblems).not.toHaveBeenCalled();
    const id = encodeURIComponent("diagram:learn/assets/a.svg");
    expect(resolveEmbed("a.svg")).toEqual({ src: `/api/assets/${id}/file`, statusHref: `/api/assets/${id}/status` });
  });
});

/**
 * `loadSessionPage`: the one read behind the session page. The five seams it
 * joins (summaries, stored options, the teach asset, the knowledge base, the
 * model chain) are mocked, so each branch shows what it joins them into.
 */
describe("loadSessionPage", () => {
  it("shows no teach asset when the concept has none", async () => {
    const data = await loadSessionPage(workspace(), "learn");
    expect(data.asset).toEqual({ kind: "none" });
    expect(readFileProblems).not.toHaveBeenCalled();
    expect(readAssetAccess).not.toHaveBeenCalled();
  });

  it("prefers a diagram over a video, and links the routes the widget plays", async () => {
    const data = await loadSessionPage(
      workspace({ assets: [asset("video:learn/v.mp4", "video"), asset("diagram:learn/d.svg", "diagram_svg")] }),
      "learn",
    );
    expect(data.asset).toEqual({
      kind: "diagram",
      id: "diagram:learn/d.svg",
      title: "diagram:learn/d.svg",
      src: `/api/assets/${encodeURIComponent("diagram:learn/d.svg")}/file`,
      statusHref: `/api/assets/${encodeURIComponent("diagram:learn/d.svg")}/status`,
    });
    // A diagram asks about its file, never its poster: `readAssetAccess` is a video's read.
    expect(readAssetAccess).not.toHaveBeenCalled();
  });

  it("plays a video with its poster only when the store kept one", async () => {
    const video = asset("video:learn/v.mp4", "video", { title: "The lecture" });
    const id = encodeURIComponent("video:learn/v.mp4");
    const data = await loadSessionPage(workspace({ assets: [video] }), "learn");
    expect(data.asset).toEqual({
      kind: "video",
      id: "video:learn/v.mp4",
      title: "The lecture",
      src: `/api/assets/${id}/file`,
      statusHref: `/api/assets/${id}/status`,
      poster: null,
      sourceRepo: "learn",
    });

    readAssetAccess.mockResolvedValueOnce({ served: new Set(), posters: new Set(["video:learn/v.mp4"]) });
    const withPoster = await loadSessionPage(workspace({ assets: [video] }), "learn");
    expect(withPoster.asset).toMatchObject({ poster: `/api/assets/${id}/poster` });
  });

  it("is a sentence, not a broken image, when the server knows the file will not load", async () => {
    readFileProblems.mockResolvedValue(new Map([["diagram:learn/gone.svg", "not-uploaded"]]));
    const data = await loadSessionPage(
      workspace({ assets: [asset("diagram:learn/gone.svg", "diagram_svg", { title: null, path: "learn/assets/gone.svg" })] }),
      "learn",
    );
    // The title falls back to the file's own name, so the sentence has something to call it.
    expect(data.asset).toEqual({ kind: "failed", title: "gone.svg", code: "not-uploaded", sourceRepo: "learn" });
  });

  it("drops the question steps a note with no checks cannot fill, and says so", async () => {
    const data = await loadSessionPage(workspace(), "learn");
    expect(data.plan.map((s) => s.kind)).toEqual(["teach", "close"]);
    expect(data.nothingToAsk).toBe(true);
    expect(data.modelAvailable).toBe(false);
  });

  it("keeps the empty question steps when a model can be asked to fill them", async () => {
    tutorCredentials.mockResolvedValue([{ config: { provider: "gemini", model: "m" }, apiKey: "key", source: "server" }]);
    const data = await loadSessionPage(workspace(), "learn");
    expect(data.modelAvailable).toBe(true);
    expect(data.nothingToAsk).toBe(false);
    expect(data.plan.map((s) => s.kind)).toEqual(["probe", "teach", "check", "close"]);
  });

  it("probes the first check and asks the next after teaching, filled from the note's other answers", async () => {
    const data = await loadSessionPage(workspace({ checks: THREE_CHECKS }), "learn");
    expect(data.plan.map((s) => s.kind)).toEqual(["probe", "teach", "check", "close"]);
    expect(data.plan[0]?.question?.prompt).toBe("What is a vector?");
    expect(data.plan[2]?.question?.prompt).toBe("What is a scalar?");
    // Wrong options came from the notes, so the question says so rather than crediting the tutor.
    expect(data.plan[2]?.question?.wrong).toBe("notes");
    expect(data.nothingToAsk).toBe(false);
  });

  it("asks a check with the wrong options the tutor stored for it", async () => {
    readWrittenOptions.mockResolvedValue(new Map([["vectors", { c2: ["A line.", "A plane.", "A point."] }]]));
    const data = await loadSessionPage(workspace({ checks: THREE_CHECKS }), "learn");
    const asked = data.plan[2]?.question;
    expect(asked?.prompt).toBe("What is a scalar?");
    expect(asked?.wrong).toBe("tutor");
    expect(asked?.choices).toEqual(expect.arrayContaining(["A line.", "A plane.", "A point."]));
  });

  it("walks each of the note's checks once in check mode", async () => {
    const data = await loadSessionPage(workspace({ checks: THREE_CHECKS }), "check");
    expect(data.plan.map((s) => s.kind)).toEqual(["check", "check", "check", "close"]);
  });

  it("names the frontier concept Keep going leads to, preferring a dependant", async () => {
    readKb.mockResolvedValue({
      kb: {
        concepts: [
          { id: "vectors", title: "Vectors", domain: null },
          { id: "matrices", title: "Matrices", domain: null },
          { id: "eigenvalues", title: "Eigenvalues", domain: null },
        ],
        frontier: ["eigenvalues", "matrices"],
        edges: [],
      },
      reachable: true,
    });
    const data = await loadSessionPage(
      workspace({ dependants: [{ slug: "matrices", title: "Matrices", bucket: "untouched", pL: 0 }] }),
      "learn",
    );
    // `matrices` depends on the concept and sits on the frontier, so it leads before the frontier's own order does.
    expect(data.next).toEqual({ slug: "matrices", title: "Matrices" });
  });

  it("still answers when the summaries cannot be read, from the note alone", async () => {
    conceptSummaries.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const data = await loadSessionPage(workspace({ checks: THREE_CHECKS }), "learn");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("concept summaries unavailable"));
    expect(data.plan[0]?.question?.prompt).toBe("What is a vector?");
  });
});

/**
 * `sessionWillAsk`: the workspace's preview of the plan, decided from the
 * same rules. What it skips reading is the contract: a model, or a note with
 * no check, needs neither the summaries nor the stored options.
 */
describe("sessionWillAsk", () => {
  it("answers true from the model alone, without reading summaries or stored options", async () => {
    tutorCredentials.mockResolvedValue([{ config: { provider: "gemini", model: "m" }, apiKey: "key", source: "server" }]);
    await expect(sessionWillAsk(workspace({ checks: THREE_CHECKS }))).resolves.toBe(true);
    expect(conceptSummaries).not.toHaveBeenCalled();
    expect(readWrittenOptions).not.toHaveBeenCalled();
  });

  it("answers false for a note with no checks and no model, still reading neither", async () => {
    await expect(sessionWillAsk(workspace())).resolves.toBe(false);
    expect(conceptSummaries).not.toHaveBeenCalled();
    expect(readWrittenOptions).not.toHaveBeenCalled();
  });

  it("reads summaries and stored options only when the notes must fill the questions", async () => {
    await expect(sessionWillAsk(workspace({ checks: THREE_CHECKS }))).resolves.toBe(true);
    expect(conceptSummaries).toHaveBeenCalledTimes(1);
    expect(readWrittenOptions).toHaveBeenCalledTimes(1);
  });

  it("answers false when a lone check has no wrong options from anywhere", async () => {
    await expect(sessionWillAsk(workspace({ checks: [check("c1", "What is a vector?", "A length with a direction.")] }))).resolves.toBe(
      false,
    );
  });
});
