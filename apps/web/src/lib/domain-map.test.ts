import { describe, expect, it } from "vitest";

import type { GraphEdge } from "@/lib/concept-graph";
import { axesLayout, cachedDomainLayouts, domainLayout, domainOfNode, domainTree, type DomainNode, type DomainTopic } from "@/lib/domain-map";
import { wrapLabel } from "@/lib/concept-graph";
import { domainShape, type ShapeName } from "@/test/domain-shapes";
import {
  AXES_DOT_CLEAR,
  axesViewBox,
  cullLabels,
  DOT_TOP,
  domainTitle,
  groupBox,
  labelBox,
  labelFont,
  MIN_DRAW_SCALE,
  NODE_HALF_WIDTH,
  textEm,
  TITLE_RESERVE,
  titleBand,
  titleBox,
  titleFont,
  titleWidth,
  viewBoxFor,
  type Box,
  type LabelItem,
} from "@/lib/domain-view";

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

  it("is deterministic whatever order the rows arrive in", () => {
    expect(domainLayout([...nodes].reverse(), [...edges].reverse(), topics, "algorithms")).toEqual(layout);
  });

  it("lays out an unknown domain as empty", () => {
    expect(domainLayout(nodes, edges, topics, "nowhere")).toMatchObject({ positions: {}, groups: [], edges: [] });
  });

  it("is remembered per graph, mastery aside", () => {
    const first = cachedDomainLayouts(nodes, edges, topics, ["algorithms"]).algorithms;
    expect(first).toEqual(layout);
    const relearned = nodes.map((n) => ({ ...n, bucket: "mastered" as const, pL: 0.99 }));
    expect(cachedDomainLayouts(relearned, edges, topics, ["algorithms"]).algorithms).toBe(first);
    expect(cachedDomainLayouts(nodes, [...edges, req("dfs", "knapsack")], topics, ["algorithms"]).algorithms).not.toBe(first);
  });

  it("lays out every domain asked for, each as domainLayout would", () => {
    const domains = ["algorithms", "foundations", "machine-learning", "nowhere"];
    const all = cachedDomainLayouts(nodes, edges, topics, domains);
    expect(Object.keys(all)).toEqual(domains);
    for (const d of domains) expect(all[d]).toEqual(domainLayout(nodes, edges, topics, d));
  });

  it("keeps a graph's layouts however many domains and graphs one request asks for", () => {
    // Forty domains, past the old cache's 32 entries, and then other graphs: the first graph's
    // layouts are still the ones remembered, where a cache of domains evicted its own entries.
    const many: DomainTopic[] = Array.from({ length: 40 }, (_, i) => ({ slug: `t${i}`, title: `T${i}`, domain: `d${i}` }));
    const ns = many.map((t) => node(`c-${t.slug}`, t.slug));
    const domains = many.map((t) => t.domain);
    const first = cachedDomainLayouts(ns, [], many, domains);
    for (let g = 0; g < 4; g++) cachedDomainLayouts([...ns, node(`extra-${g}`, "t0")], [], many, ["d0"]);
    const again = cachedDomainLayouts(ns, [], many, domains);
    for (const d of domains) expect(again[d]).toBe(first[d]);
  });
});

describe("labels on a picture drawn at its smallest (D10)", () => {
  it("fit a two-line label between one layer of a chain and the next, so a chain keeps its labels", () => {
    const chain = ["a", "b", "c", "d"].map((id) => node(id, "sorting"));
    const links = [req("a", "b"), req("b", "c"), req("c", "d")];
    const laid = domainLayout(chain, links, topics, "algorithms");
    const items: LabelItem[] = chain.map((n) => ({ ...laid.positions[n.id], id: n.id, lines: 2, em: 8.25, rank: 6, dependants: 0 }));
    expect([...cullLabels(items, MIN_DRAW_SCALE)].sort()).toEqual(["a", "b", "c", "d"]);
  });
});

/**
 * Written before the topic titles kept 11px on screen (D10): on a real layout,
 * drawn full size and at its smallest, a title sits inside its group, clear of
 * the group's concepts and of every other group, and a label that would run
 * into one is culled.
 */
describe("topic titles on a laid out domain (D10)", () => {
  const long: DomainTopic[] = [
    { slug: "sorting", title: "Sorting and the lower bound on comparison sorts", domain: "algorithms" },
    { slug: "graphs", title: "Graphs", domain: "algorithms" },
    { slug: "dp", title: "Dynamic programming over subsets and intervals", domain: "algorithms" },
  ];
  const vocab = [...long, ...topics.filter((t) => !long.some((l) => l.slug === t.slug))];
  const laid = domainLayout(nodes, edges, vocab, "algorithms");
  const hits = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const at = (id: string) => laid.positions[id];
  const items = (): LabelItem[] =>
    Object.keys(laid.positions).map((id) => {
      const lines = wrapLabel(`Concept ${id}`, 15);
      return { id, ...at(id), lines: lines.length, em: Math.max(...lines.map((l) => textEm(l))), rank: 6, dependants: 0 };
    });

  for (const scale of [1, MIN_DRAW_SCALE]) {
    it(`keeps each title inside its group, off its concepts and every other group, at scale ${scale}`, () => {
      const font = titleFont(scale);
      const band = titleBand(font);
      const groups = laid.groups.map((g) => {
        const box = groupBox(g.concepts.map(at), titleWidth(g.title), band);
        return { g, box, title: titleBox(box, g.title, font) };
      });
      const frame = viewBoxFor(laid, null, {}, band);
      for (const { g, box, title } of groups) {
        expect(title.x, `${g.topic}'s title starts left of its group`).toBeGreaterThanOrEqual(box.x);
        expect(title.x + title.width, `${g.topic}'s title runs past its group`).toBeLessThanOrEqual(box.x + box.width);
        expect(title.y).toBeGreaterThanOrEqual(box.y);
        for (const id of g.concepts) {
          const p = at(id);
          // The dot and the room kept above it for its rings.
          const dot = { x: p.x - NODE_HALF_WIDTH, y: p.y - DOT_TOP, width: 2 * NODE_HALF_WIDTH, height: 2 * DOT_TOP };
          expect(hits(title, dot), `${g.topic}'s title overlaps ${id}'s dot`).toBe(false);
          const item = items().find((i) => i.id === id) as LabelItem;
          expect(hits(title, labelBox(item, labelFont(scale))), `${g.topic}'s title overlaps ${id}'s label`).toBe(false);
        }
        for (const other of groups) {
          if (other.g === g) continue;
          expect(hits(title, other.box), `${g.topic}'s title runs into ${other.g.topic}`).toBe(false);
          expect(hits(box, other.box), `${g.topic} and ${other.g.topic} overlap`).toBe(false);
        }
        // And the frame holds the whole group.
        expect(box.y).toBeGreaterThanOrEqual(frame.y);
        expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
      }
    });
  }

  it("cuts a title too long for its group at the smallest scale, and none at full size", () => {
    const cut = (scale: number) =>
      laid.groups.filter((g) => {
        const font = titleFont(scale);
        const box = groupBox(g.concepts.map(at), titleWidth(g.title), titleBand(font));
        return textEm(g.title, true) * font > titleBox(box, g.title, font).width;
      }).length;
    expect(cut(1)).toBe(0);
    expect(cut(MIN_DRAW_SCALE)).toBeGreaterThan(0);
  });

  it("packs the groups for the largest band, so a row's titles at the smallest scale do not reach the row above", () => {
    for (const g of laid.groups) {
      const box = groupBox(g.concepts.map(at), titleWidth(g.title), TITLE_RESERVE);
      expect(box.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("culls a label that would run into a title, at the smallest scale", () => {
    const font = titleFont(MIN_DRAW_SCALE);
    const titles = laid.groups.map((g) => titleBox(groupBox(g.concepts.map(at), titleWidth(g.title), titleBand(font)), g.title, font));
    const shown = cullLabels(items(), MIN_DRAW_SCALE, titles);
    expect(shown.size).toBeGreaterThan(0);
    for (const item of items()) {
      if (!shown.has(item.id)) continue;
      const box = labelBox(item, labelFont(MIN_DRAW_SCALE));
      for (const t of titles) expect(hits(box, t), `${item.id}'s label runs into a title`).toBe(false);
    }
  });
});

/**
 * Written before the axes layout (D11 of docs/proposals/domain-map.md): each
 * concept at x = its layer (the longest chain of prerequisites inside the
 * domain, a cycle counting once) and y = how many concepts of the domain need
 * it, on a log scale, most at the top, with no two dots on one spot.
 */
/** A domain's axes placement, with the layer and the count each concept was placed by. */
function placement(ns: readonly DomainNode[], es: readonly GraphEdge[], ts: readonly DomainTopic[], domain: string) {
  return axesLayout(Object.keys(domainLayout(ns, es, ts, domain).positions), es);
}

describe("the axes layout (D11)", () => {
  const layout = domainLayout(nodes, edges, topics, "algorithms");
  const axes = placement(nodes, edges, topics, "algorithms");
  const ids = Object.keys(layout.positions).sort();

  it("is what the domain's layout sends, without the numbers it was placed by", () => {
    const { layer, needed, ...sent } = axes;
    expect(layout.axes).toEqual(sent);
    expect(Object.keys(layer).sort()).toEqual(ids);
    expect(Object.keys(needed).sort()).toEqual(ids);
    expect(layout.axes).not.toHaveProperty("layer");
  });

  /** Every pair of dots at least the clearance apart, and every dot inside the picture. */
  function expectApart(a: typeof axes, name: string) {
    const list = Object.entries(a.positions);
    for (let i = 0; i < list.length; i++) {
      const [id, p] = list[i];
      expect(p.x, `${name}: ${id} is left of the picture`).toBeGreaterThanOrEqual(0);
      expect(p.x, `${name}: ${id} is right of the picture`).toBeLessThanOrEqual(a.width);
      expect(p.y, `${name}: ${id} is above the picture`).toBeGreaterThanOrEqual(0);
      expect(p.y, `${name}: ${id} is below the picture`).toBeLessThanOrEqual(a.height);
      for (let j = i + 1; j < list.length; j++) {
        const [other, q] = list[j];
        expect(Math.hypot(p.x - q.x, p.y - q.y), `${name}: ${id} and ${other} overlap`).toBeGreaterThanOrEqual(AXES_DOT_CLEAR);
      }
    }
  }

  /** Earlier layers to the left, more dependants higher up, everywhere in the picture. */
  function expectOrdered(a: typeof axes, name: string) {
    const list = Object.keys(a.positions);
    for (const x of list) {
      for (const y of list) {
        if (a.layer[x] < a.layer[y]) expect(a.positions[x].x, `${name}: ${x} is not left of ${y}`).toBeLessThan(a.positions[y].x);
        if (a.needed[x] > a.needed[y]) expect(a.positions[x].y, `${name}: ${x} is not above ${y}`).toBeLessThan(a.positions[y].y);
      }
    }
  }

  it("places exactly the domain's concepts", () => {
    expect(Object.keys(axes.positions).sort()).toEqual(ids);
    expect(Object.keys(axes.layer).sort()).toEqual(ids);
    expect(Object.keys(axes.needed).sort()).toEqual(ids);
  });

  it("gives each concept its longest chain of prerequisites inside the domain as its layer", () => {
    expect(axes.layer).toEqual({
      asym: 0,
      bfs: 0,
      stray: 0,
      merge: 1,
      dfs: 1,
      quick: 2,
      heap: 2,
      memo: 2,
      dijkstra: 3,
      knapsack: 3,
    });
    expect(axes.layers).toBe(4);
  });

  it("counts every concept of the domain that needs one, through others too, and none outside it", () => {
    expect(axes.needed).toEqual({
      asym: 6,
      merge: 5,
      heap: 1,
      memo: 1,
      bfs: 2,
      quick: 0,
      dfs: 0,
      dijkstra: 0,
      knapsack: 0,
      stray: 0,
    });
  });

  it("puts earlier layers to the left and the more needed higher up", () => {
    expectOrdered(axes, "fixture");
    // A column per layer: concepts of one layer share it.
    const center = (layer: number) => axes.plot.x + (layer + 0.5) * axes.column;
    for (const id of ids) expect(Math.abs(axes.positions[id].x - center(axes.layer[id]))).toBeLessThanOrEqual(axes.column / 2);
    // On a log scale: the gap between needed by 0 and by 1 is wider than between 5 and 6.
    const y = (id: string) => axes.positions[id].y;
    expect(y("stray") - y("heap")).toBeGreaterThan(y("merge") - y("asym"));
  });

  it("spreads concepts that would land on one spot, so no two dots overlap", () => {
    expectApart(axes, "fixture");
    // quick, heap and memo share layer 2; quick, dfs, dijkstra, knapsack and stray share needed 0.
    expect(new Set(["quick", "heap", "memo"].map((id) => `${axes.positions[id].x},${axes.positions[id].y}`)).size).toBe(3);
  });

  for (const name of ["algorithms", "hci"] as ShapeName[]) {
    it(`lays out the owner's ${name} domain in order, with no two dots overlapping`, () => {
      const shape = domainShape(name);
      const a = placement(shape.nodes, shape.edges, shape.topics, shape.domain);
      expect(Object.keys(a.positions)).toHaveLength(shape.nodes.length);
      expectApart(a, name);
      expectOrdered(a, name);
    });
  }

  it("fits the owner's largest domain on a phone at the smallest scale", () => {
    const shape = domainShape("algorithms");
    const a = placement(shape.nodes, shape.edges, shape.topics, shape.domain);
    expect(a.layers).toBe(10);
    // A 390px phone's card gives the picture 318px (measured in the built app), framed margin and all.
    expect(axesViewBox(a).width * MIN_DRAW_SCALE).toBeLessThanOrEqual(318);
    // The concept most needed is at the top, in the foundational zone at the top left.
    const top = Object.keys(a.positions).sort((x, y) => a.needed[y] - a.needed[x])[0];
    expect(a.needed[top]).toBe(30);
    expect(a.zone).not.toBeNull();
    const zone = a.zone as Box;
    expect(zone.x).toBe(a.plot.x);
    expect(zone.y).toBeLessThanOrEqual(a.plot.y);
    const p = a.positions[top];
    expect(p.x).toBeGreaterThan(zone.x);
    expect(p.x).toBeLessThan(zone.x + zone.width);
    expect(p.y).toBeLessThan(zone.y + zone.height);
    expect(zone.width).toBeLessThan(a.plot.width / 2);
  });

  it("counts concepts that need each other as one layer, each needed by the other", () => {
    const vocab: DomainTopic[] = [{ slug: "t", title: "T", domain: "d" }];
    const ns = ["a", "b", "c", "z"].map((id) => node(id, "t"));
    // a and b need each other; c needs both; z stands alone.
    const l = placement(ns, [req("a", "b"), req("b", "a"), req("b", "c")], vocab, "d");
    expect(l.layer).toEqual({ a: 0, b: 0, c: 1, z: 0 });
    expect(l.needed).toEqual({ a: 2, b: 2, c: 0, z: 0 });
    expectApart(l, "cycle");
    expectOrdered(l, "cycle");
  });

  it("is the same whatever order the rows arrive in", () => {
    const shape = domainShape("algorithms");
    const a = placement(shape.nodes, shape.edges, shape.topics, shape.domain);
    const shuffled = [...shape.nodes].sort((x, y) => (x.id.split("").reverse().join("") < y.id.split("").reverse().join("") ? -1 : 1));
    expect(placement(shuffled, [...shape.edges].reverse(), shape.topics, shape.domain)).toEqual(a);
  });

  it("lays out a domain with no edges along the baseline, and an empty one as nothing", () => {
    const vocab: DomainTopic[] = [{ slug: "t", title: "T", domain: "d" }];
    const flat = placement(["a", "b", "c"].map((id) => node(id, "t")), [], vocab, "d");
    expect(flat.layers).toBe(1);
    expect(flat.zone).toBeNull();
    expectApart(flat, "flat");
    expect(placement(nodes, edges, topics, "nowhere")).toMatchObject({ positions: {}, layers: 0, zone: null });
  });

  it("is remembered with the groups layout", () => {
    const first = cachedDomainLayouts(nodes, edges, topics, ["algorithms"]).algorithms;
    expect(cachedDomainLayouts(nodes, edges, topics, ["algorithms"]).algorithms.axes).toBe(first.axes);
    expect(first.axes).toEqual(layout.axes);
  });

  it("draws most labels of the owner's largest domain at full size", () => {
    const shape = domainShape("algorithms");
    const a = placement(shape.nodes, shape.edges, shape.topics, shape.domain);
    const items: LabelItem[] = shape.nodes.map((n) => {
      const lines = wrapLabel(n.title, 15);
      return { id: n.id, ...a.positions[n.id], lines: lines.length, em: Math.max(...lines.map((l) => textEm(l))), rank: 6, dependants: 0 };
    });
    expect(cullLabels(items, 1).size).toBeGreaterThanOrEqual(shape.nodes.length / 2);
  });
});
