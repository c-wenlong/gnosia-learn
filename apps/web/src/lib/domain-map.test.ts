import { describe, expect, it } from "vitest";

import type { GraphEdge } from "@/lib/concept-graph";
import { cachedDomainLayout, domainLayout, domainOfNode, domainTree, type DomainNode, type DomainTopic } from "@/lib/domain-map";
import { cullLabels, domainTitle, groupBox, MIN_DRAW_SCALE, NODE_HALF_WIDTH, titleWidth, type LabelItem } from "@/lib/domain-view";

/**
 * Written before `domain-map.ts` (phase 1 of docs/proposals/domain-map.md),
 * from decisions D1 to D4, so they say what the grouping and the layout
 * promise rather than what an implementation happened to do.
 */

const node = (id: string, topic: string | null, bucket: DomainNode["bucket"] = "untouched", domain: string | null = null): DomainNode => ({
  id,
  title: id,
  bucket,
  pL: 0.25,
  courses: [],
  domain,
  topic,
});
const req = (from: string, to: string): GraphEdge => ({ from, to, kind: "requires" });
const bg = (from: string, to: string): GraphEdge => ({ from, to, kind: "assumes" });

const topics: DomainTopic[] = [
  { slug: "sorting", title: "Sorting", domain: "algorithms" },
  { slug: "graphs", title: "Graphs", domain: "algorithms" },
  { slug: "dp", title: "Dynamic programming", domain: "algorithms" },
  { slug: "attention", title: "Attention", domain: "machine-learning" },
  { slug: "linear-algebra", title: "Linear algebra", domain: "foundations" },
];

const nodes: DomainNode[] = [
  node("asym", "sorting", "mastered"),
  node("merge", "sorting", "mastered"),
  node("quick", "sorting", "learning"),
  node("heap", "sorting"),
  node("bfs", "graphs", "learning"),
  node("dfs", "graphs"),
  node("dijkstra", "graphs"),
  node("memo", "dp"),
  node("knapsack", "dp"),
  node("softmax", "attention", "learning"),
  node("dot", "linear-algebra", "mastered"),
  // Its topic is not one the reader holds: grouped by its folder instead.
  node("stray", "unknown-topic", "untouched", "algorithms"),
  // No topic row and no folder.
  node("orphan", null),
];
const edges: GraphEdge[] = [
  req("asym", "merge"),
  req("merge", "quick"),
  req("asym", "quick"), // implied by asym > merge > quick
  req("merge", "heap"),
  req("heap", "dijkstra"),
  req("bfs", "dfs"),
  req("bfs", "dijkstra"),
  req("merge", "memo"),
  req("memo", "knapsack"),
  req("dot", "softmax"),
  bg("dot", "memo"), // crosses from foundations into algorithms
  req("softmax", "knapsack"), // crosses from machine learning into algorithms
];

const byTopic = new Map(topics.map((t) => [t.slug, t]));

describe("domainOfNode (D1)", () => {
  it("takes the domain of the concept's topic", () => {
    expect(domainOfNode(node("x", "graphs", "untouched", "something-else"), byTopic)).toBe("algorithms");
  });
  it("falls back to the note's folder when the topic is not one the reader holds", () => {
    expect(domainOfNode(node("x", "unknown-topic", "untouched", "graphics"), byTopic)).toBe("graphics");
  });
  it("puts a concept with neither under other", () => {
    expect(domainOfNode(node("x", null), byTopic)).toBe("other");
  });
});

describe("domainTitle", () => {
  it("reads a domain slug as words in sentence case, keeping acronyms upper case", () => {
    expect(domainTitle("computer-architecture")).toBe("Computer architecture");
    expect(domainTitle("classical-ai")).toBe("Classical AI");
    expect(domainTitle("hci")).toBe("HCI");
    expect(domainTitle("llm-systems")).toBe("LLM systems");
    expect(domainTitle("other")).toBe("Other");
  });
});

describe("domainTree (D1, D2)", () => {
  const tree = domainTree(nodes, edges, topics);
  const bySlug = new Map(tree.map((d) => [d.slug, d]));

  it("puts every concept in exactly one domain", () => {
    const all = tree.flatMap((d) => d.concepts);
    expect(all.sort()).toEqual(nodes.map((n) => n.id).sort());
  });

  it("groups each domain's concepts by topic, in the vocabulary's order", () => {
    const algorithms = bySlug.get("algorithms");
    expect(algorithms?.title).toBe("Algorithms");
    expect(algorithms?.topics.map((t) => t.slug)).toEqual(["sorting", "graphs", "dp", "unknown-topic"]);
    expect(algorithms?.topics[0]).toMatchObject({ title: "Sorting", concepts: ["asym", "heap", "merge", "quick"] });
    // A topic the reader does not hold keeps its slug as the title rather than vanishing.
    expect(algorithms?.topics[3]).toMatchObject({ title: "unknown-topic", concepts: ["stray"] });
  });

  it("counts mastery per domain", () => {
    expect(bySlug.get("algorithms")?.counts).toEqual({ mastered: 2, learning: 2, untouched: 6 });
  });

  it("counts the prerequisite edges that cross into each other domain", () => {
    expect(bySlug.get("algorithms")?.links).toEqual([
      { domain: "foundations", count: 1 },
      { domain: "machine-learning", count: 1 },
    ]);
    expect(bySlug.get("foundations")?.links).toEqual([
      { domain: "algorithms", count: 1 },
      { domain: "machine-learning", count: 1 },
    ]);
  });

  it("orders studied domains first, then by size, so the untouched ones come last", () => {
    expect(tree.map((d) => d.slug)).toEqual(["algorithms", "foundations", "machine-learning", "other"]);
  });

  it("is the same whatever order the rows arrive in", () => {
    expect(domainTree([...nodes].reverse(), [...edges].reverse(), [...topics].reverse().reverse())).toEqual(tree);
  });
});

describe("domainLayout (D3, D4)", () => {
  const layout = domainLayout(nodes, edges, topics, "algorithms");

  it("places exactly the domain's concepts", () => {
    expect(Object.keys(layout.positions).sort()).toEqual(
      ["asym", "bfs", "dfs", "dijkstra", "heap", "knapsack", "memo", "merge", "quick", "stray"].sort(),
    );
  });

  it("puts each prerequisite above what needs it inside a topic", () => {
    const p = layout.positions;
    expect(p.asym.y).toBeLessThan(p.merge.y);
    expect(p.merge.y).toBeLessThan(p.quick.y);
    expect(p.bfs.y).toBeLessThan(p.dfs.y);
    expect(p.memo.y).toBeLessThan(p.knapsack.y);
  });

  it("gives every topic a group whose box holds its concepts and overlaps no other", () => {
    // Sorting is needed by both other topics; the stray topic needs nothing, so it waits behind Sorting only.
    expect(layout.groups.map((g) => g.topic)).toEqual(["sorting", "unknown-topic", "graphs", "dp"]);
    const boxes = layout.groups.map((g) => ({ g, box: groupBox(g.concepts.map((id) => layout.positions[id]), titleWidth(g.title)) }));
    for (const { g, box } of boxes) {
      for (const id of g.concepts) {
        const p = layout.positions[id];
        expect(p.x - NODE_HALF_WIDTH).toBeGreaterThanOrEqual(box.x);
        expect(p.x + NODE_HALF_WIDTH).toBeLessThanOrEqual(box.x + box.width);
        expect(p.y).toBeGreaterThan(box.y);
        expect(p.y).toBeLessThan(box.y + box.height);
      }
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(layout.width);
      expect(box.y + box.height).toBeLessThanOrEqual(layout.height);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].box;
        const b = boxes[j].box;
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart, `${boxes[i].g.topic} and ${boxes[j].g.topic} overlap`).toBe(true);
      }
    }
  });

  it("keeps a prerequisite above what needs it in its topic when the reduced path runs through another topic", () => {
    const vocab: DomainTopic[] = [
      { slug: "t1", title: "T1", domain: "d" },
      { slug: "t2", title: "T2", domain: "d" },
    ];
    const ns = [node("a", "t1"), node("b", "t1"), node("x", "t2")];
    // a > b is implied by a > x > b over the domain, and both legs leave t1.
    const l = domainLayout(ns, [req("a", "x"), req("x", "b"), req("a", "b")], vocab, "d");
    expect(l.positions.a.y).toBeLessThan(l.positions.b.y);
  });

  it("makes a group wide enough for its topic's title", () => {
    const vocab: DomainTopic[] = [{ slug: "long", title: "Transformer architecture and training stages", domain: "d" }];
    const l = domainLayout([node("only", "long")], [], vocab, "d");
    const box = groupBox([l.positions.only], titleWidth(vocab[0].title));
    expect(box.width).toBeGreaterThanOrEqual(titleWidth(vocab[0].title));
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(l.width);
  });

  it("lays a prerequisite topic out before the topic that needs it", () => {
    const at = (topic: string) => layout.groups.findIndex((g) => g.topic === topic);
    expect(at("sorting")).toBeLessThan(at("dp"));
  });

  it("puts a topic many others need before a standalone one earlier in the vocabulary", () => {
    const vocab: DomainTopic[] = [
      { slug: "proofs", title: "Proofs", domain: "d" },
      { slug: "a", title: "A", domain: "d" },
      { slug: "b", title: "B", domain: "d" },
      { slug: "basics", title: "Basics", domain: "d" },
    ];
    const ns = [node("p1", "proofs"), node("a1", "a"), node("b1", "b"), node("x1", "basics")];
    const es = [req("x1", "a1"), req("x1", "b1")];
    expect(domainLayout(ns, es, vocab, "d").groups.map((g) => g.topic)).toEqual(["basics", "proofs", "a", "b"]);
  });

  it("treats topics that need each other as one level, so a loop does not push them to the end", () => {
    const vocab: DomainTopic[] = [
      { slug: "later", title: "Later", domain: "d" },
      { slug: "loner", title: "Loner", domain: "d" },
      { slug: "notation", title: "Notation", domain: "d" },
      { slug: "analysis", title: "Analysis", domain: "d" },
    ];
    const ns = [node("l1", "later"), node("s1", "loner"), node("n1", "notation"), node("n2", "notation"), node("a1", "analysis"), node("a2", "analysis")];
    // notation and analysis need each other; later needs both.
    const es = [req("n1", "a1"), req("a2", "n2"), req("a1", "l1"), req("n2", "l1")];
    expect(domainLayout(ns, es, vocab, "d").groups.map((g) => g.topic)).toEqual(["notation", "analysis", "loner", "later"]);
  });

  it("draws the domain's own edges, transitively reduced", () => {
    const keys = layout.edges.map((e) => `${e.from}>${e.to}`).sort();
    expect(keys).toContain("asym>merge");
    expect(keys).not.toContain("asym>quick");
    expect(keys).toContain("merge>memo"); // across two topics of the same domain
    expect(keys).not.toContain("dot>memo");
  });

  it("lists the edges that leave the domain, with the domain at the far end", () => {
    expect(layout.outside).toEqual([
      { from: "dot", to: "memo", kind: "assumes", domain: "foundations", inside: "memo" },
      { from: "softmax", to: "knapsack", kind: "requires", domain: "machine-learning", inside: "knapsack" },
    ]);
  });

  it("is deterministic whatever order the rows arrive in", () => {
    expect(domainLayout([...nodes].reverse(), [...edges].reverse(), topics, "algorithms")).toEqual(layout);
  });

  it("lays out an unknown domain as empty", () => {
    expect(domainLayout(nodes, edges, topics, "nowhere")).toMatchObject({ positions: {}, groups: [], edges: [] });
  });

  it("is remembered per graph, mastery aside", () => {
    const first = cachedDomainLayout(nodes, edges, topics, "algorithms");
    const relearned = nodes.map((n) => ({ ...n, bucket: "mastered" as const, pL: 0.99 }));
    expect(cachedDomainLayout(relearned, edges, topics, "algorithms")).toBe(first);
    expect(cachedDomainLayout(nodes, [...edges, req("dfs", "knapsack")], topics, "algorithms")).not.toBe(first);
  });
});

describe("labels on a picture drawn at its smallest (D10)", () => {
  it("fit a two-line label between one layer of a chain and the next, so a chain keeps its labels", () => {
    const chain = ["a", "b", "c", "d"].map((id) => node(id, "sorting"));
    const links = [req("a", "b"), req("b", "c"), req("c", "d")];
    const laid = domainLayout(chain, links, topics, "algorithms");
    const items: LabelItem[] = chain.map((n) => ({ ...laid.positions[n.id], id: n.id, lines: 2, chars: 15, rank: 6, dependants: 0 }));
    expect([...cullLabels(items, MIN_DRAW_SCALE)].sort()).toEqual(["a", "b", "c", "d"]);
  });
});
