import { describe, expect, it } from "vitest";

import type { GraphEdge, GraphNode } from "@gnosia/tutor/concept-graph";
import { arcLength, firstMatch, readyConcepts, relatedTo, servesCourses, standingLine } from "@/lib/map-reading";

/**
 * Written before `map-reading.ts`: phase 3 of docs/proposals/knowledge-map.md,
 * what the map shows about each concept beyond its place (G4, G5, G8).
 */

const node = (id: string, courses: string[], bucket: GraphNode["bucket"] = "untouched", pL = 0.25): GraphNode => ({
  id,
  title: id.replace(/-/g, " "),
  bucket,
  pL,
  courses,
  domain: "d",
});
const req = (from: string, to: string): GraphEdge => ({ from, to, kind: "requires" });
const bg = (from: string, to: string): GraphEdge => ({ from, to, kind: "assumes" });

// CS3230: cost (no course) -> big-o -> theta; summations (no course) -> cost.
// CP4284: vector (no course) -> dot -> attention. loner: no course, no links.
const nodes = [
  node("summations", []),
  node("cost", []),
  node("big-o", ["cs3230"], "learning", 0.15),
  node("theta", ["cs3230"]),
  node("dp", ["cs3230"], "mastered", 0.97),
  node("knapsack", ["cs3230"]),
  node("vector", [], "learning", 0.38),
  node("dot", ["cp4284"]),
  node("attention", ["cp4284"]),
  node("loner", []),
];
const edges = [
  req("summations", "cost"),
  req("cost", "big-o"),
  req("big-o", "theta"),
  bg("cost", "theta"),
  req("dp", "knapsack"),
  req("vector", "dot"),
  req("dot", "attention"),
];

describe("servesCourses (G5)", () => {
  it("files a concept in no course under every course whose concepts depend on it, directly or through other such concepts", () => {
    const serves = servesCourses(nodes, edges);
    expect([...(serves.get("cost") ?? [])]).toEqual(["cs3230"]);
    // summations reaches CS3230 only through cost, which is in no course either.
    expect([...(serves.get("summations") ?? [])]).toEqual(["cs3230"]);
    expect([...(serves.get("vector") ?? [])]).toEqual(["cp4284"]);
    expect(serves.get("loner")?.size ?? 0).toBe(0);
    // A concept in a course is not in the map: it has its own courses.
    expect(serves.has("big-o")).toBe(false);
  });
});

describe("readyConcepts (G5)", () => {
  it("marks the ready concepts of the recent courses only: every required prerequisite mastered, not mastered itself", () => {
    const ready = readyConcepts(nodes, edges, ["cs3230"]);
    // knapsack's only prerequisite, dp, is mastered; summations has none and serves CS3230.
    expect([...ready].sort()).toEqual(["knapsack", "summations"]);
    // cost waits on summations; big-o on cost; dp is mastered already; CP4284's roots are not recent.
    for (const id of ["cost", "big-o", "dp", "vector", "dot"]) expect(ready.has(id), id).toBe(false);
  });

  it("marks the background a recent course builds on, which the course rule alone never would", () => {
    expect(readyConcepts(nodes, edges, ["cp4284"])).toEqual(new Set(["vector"]));
  });

  it("marks nothing with no recent course", () => {
    expect(readyConcepts(nodes, edges, []).size).toBe(0);
  });

  it("ignores a background edge when deciding readiness", () => {
    // theta assumes cost, which is not mastered; once big-o is, theta is ready all the same.
    const mastered = nodes.map((n) => (n.id === "big-o" ? { ...n, bucket: "mastered" as const } : n));
    expect(readyConcepts(mastered, edges, ["cs3230"]).has("theta")).toBe(true);
  });
});

describe("relatedTo", () => {
  it("lists what a concept needs and what leads on from it, by title, each once", () => {
    const r = relatedTo(nodes, edges, "cost");
    expect(r.needs.map((n) => n.id)).toEqual(["summations"]);
    expect(r.leadsTo.map((n) => n.id)).toEqual(["big-o", "theta"]);
    expect(relatedTo(nodes, edges, "loner")).toEqual({ needs: [], leadsTo: [] });
  });
});

describe("arcLength (G4)", () => {
  it("draws p(L) as the share of a full ring, for a learning concept only", () => {
    const ring = 2 * Math.PI * 12;
    expect(arcLength(node("a", [], "learning", 0.25), 12)).toBeCloseTo(ring * 0.25);
    expect(arcLength(node("a", [], "learning", 1.4), 12)).toBeCloseTo(ring);
    expect(arcLength(node("a", [], "untouched", 0.25), 12)).toBe(0);
    expect(arcLength(node("a", [], "mastered", 0.97), 12)).toBe(0);
  });
});

describe("firstMatch", () => {
  const rows = nodes.map((n) => ({ id: n.id, title: n.title, summary: "" }));

  it("prefers a title that starts with the query, then one that contains every word", () => {
    expect(firstMatch(rows, "dot")).toBe("dot");
    expect(firstMatch(rows, "  BIG o ")).toBe("big-o");
    expect(firstMatch(rows, "theta")).toBe("theta");
    expect(firstMatch(rows, "nothing like it")).toBeNull();
    // The search box's list matches summaries too, so Enter lands on what the list shows.
    const withSummary = [...rows.filter((r) => r.id !== "dot"), { id: "dot", title: "dot", summary: "Measures alignment." }];
    expect(firstMatch(withSummary, "alignment")).toBe("dot");
    // A title match still wins over a summary one.
    expect(firstMatch([{ id: "a", title: "x", summary: "theta" }, ...rows], "theta")).toBe("theta");
    expect(firstMatch(rows, "")).toBeNull();
  });
});

describe("standingLine", () => {
  it("says how well a concept is known and when it is due, without repeating itself", () => {
    expect(standingLine({ bucket: "learning", pL: 0.38, due: "2026-08-20T00:00:00Z", dueLabel: "overdue", overdue: true, lastSeenLabel: "6 weeks" })).toEqual([
      { text: "p(L) 0.38" },
      { text: "review overdue", danger: true },
      { text: "last seen 6 weeks" },
    ]);
    expect(standingLine({ bucket: "learning", pL: 0.6, due: "2026-10-10T00:00:00Z", dueLabel: "Sat", overdue: false, lastSeenLabel: "today" })).toEqual([
      { text: "p(L) 0.60" },
      { text: "due Sat" },
      { text: "last seen today" },
    ]);
    expect(standingLine({ bucket: "untouched", pL: 0.25, due: null, dueLabel: "–", overdue: false, lastSeenLabel: "never" })).toEqual([
      { text: "Not studied yet" },
    ]);
  });
});
