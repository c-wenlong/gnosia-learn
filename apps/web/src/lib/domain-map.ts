import { Graph, layout as dagreLayout } from "@dagrejs/dagre";

import { reduceEdges, type GraphEdge, type GraphNode } from "@/lib/concept-graph";
import { DOT_TOP, domainTitle, groupBox } from "@/lib/domain-view";

/**
 * The prerequisite graph grouped by domain, then by topic, and one domain
 * laid out as a bounded picture: a group per topic, the concepts in each in
 * layers with prerequisites above, the groups packed in the order their
 * prerequisites run. Phase 1 of docs/proposals/domain-map.md (D1 to D4).
 *
 * Runs on the server, so dagre never reaches the browser. A client
 * component may import this module's types, never its functions; what it
 * needs to draw is in `domain-view.ts`.
 *
 * Every step sorts its input first, so the same graph always gives the same
 * picture whatever order the rows came out of the database in.
 */

/** A concept as the domain map reads it: a graph node and the catalog topic it is filed under. */
export interface DomainNode extends GraphNode {
  topic: string | null;
}

/** A topic of the vocabulary: its slug, its title and the domain it belongs to. */
export interface DomainTopic {
  slug: string;
  title: string;
  domain: string;
}

export interface DomainSummary {
  slug: string;
  title: string;
  /** Every concept in the domain, sorted. */
  concepts: string[];
  /** The domain's topics, in the vocabulary's order, each with its concepts sorted. */
  topics: { slug: string; title: string; concepts: string[] }[];
  counts: { mastered: number; learning: number; untouched: number };
  /** Prerequisite edges between this domain and each other one, most first. */
  links: { domain: string; count: number }[];
}

export interface DomainLayout {
  domain: string;
  width: number;
  height: number;
  /** Each concept's dot. */
  positions: Record<string, { x: number; y: number }>;
  /** One per topic, in the order they are packed: prerequisites first. */
  groups: { topic: string; title: string; concepts: string[] }[];
  /** The domain's own edges, both ends inside it, transitively reduced. */
  edges: GraphEdge[];
  /** Edges with one end in another domain, unreduced, `inside` naming the end in this one. */
  outside: (GraphEdge & { domain: string; inside: string })[];
}

/** The box dagre lays out per concept: the dot and two lines of label under it. */
const NODE_WIDTH = 112;
const NODE_HEIGHT = 58;
const GROUP_GAP = 24;
/** Packed groups aim for a picture this much wider than tall, which suits a page. */
const ASPECT = 1.8;
/**
 * And no wider than this, unless one topic is, so the picture is drawn at
 * full size beside the list and grows down the page instead: a page
 * scrolls, where a picture scaled to fit a wide domain had 7px labels.
 */
const MAX_ROW_WIDTH = 900;

const OTHER = "other";

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const edgeKey = (e: GraphEdge) => `${e.from}\u0000${e.to}\u0000${e.kind}`;

/**
 * Which domain a concept is shown under (D1): its topic's, then the folder
 * its note lives in when the topic is not one the reader holds, then "other".
 */
export function domainOfNode(node: DomainNode, topics: ReadonlyMap<string, DomainTopic>): string {
  const topic = node.topic === null ? undefined : topics.get(node.topic);
  return topic?.domain ?? node.domain ?? OTHER;
}

function cleanEdges(nodes: ReadonlyMap<string, DomainNode>, edges: readonly GraphEdge[]): GraphEdge[] {
  const known = (e: GraphEdge) => nodes.has(e.from) && nodes.has(e.to) && e.from !== e.to;
  return [...new Map(edges.filter(known).map((e) => [edgeKey(e), e])).values()].sort((a, b) => byId(edgeKey(a), edgeKey(b)));
}

/** A domain's topics in the vocabulary's order, a topic the vocabulary does not name after them by slug. */
function topicsOf(
  members: readonly DomainNode[],
  topics: readonly DomainTopic[],
  bySlug: ReadonlyMap<string, DomainTopic>,
): { slug: string; title: string; concepts: string[] }[] {
  const order = new Map(topics.map((t, i) => [t.slug, i]));
  const groups = new Map<string, string[]>();
  for (const n of members) {
    const key = n.topic ?? OTHER;
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [n.id]);
    else list.push(n.id);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || byId(a, b))
    .map(([slug, concepts]) => ({
      slug,
      title: bySlug.get(slug)?.title ?? (slug === OTHER ? "Other" : slug),
      concepts: concepts.sort(byId),
    }));
}

/**
 * Every concept under a domain and a topic (D1, D2), with each domain's
 * mastery counts and its links to the others. Domains with something studied
 * come first, the most studied first, then the larger, so the long untouched
 * tail sits at the end.
 */
export function domainTree(
  nodes: readonly DomainNode[],
  edges: readonly GraphEdge[],
  topics: readonly DomainTopic[],
): DomainSummary[] {
  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const sorted = [...nodes].sort((a, b) => byId(a.id, b.id));
  const nodesById = new Map(sorted.map((n) => [n.id, n]));
  const domainOf = new Map(sorted.map((n) => [n.id, domainOfNode(n, bySlug)]));

  const members = new Map<string, DomainNode[]>();
  for (const n of sorted) {
    const d = domainOf.get(n.id) as string;
    const list = members.get(d);
    if (list === undefined) members.set(d, [n]);
    else list.push(n);
  }

  const links = new Map<string, Map<string, number>>();
  const bump = (from: string, to: string) => {
    const row = links.get(from) ?? new Map<string, number>();
    row.set(to, (row.get(to) ?? 0) + 1);
    links.set(from, row);
  };
  for (const e of cleanEdges(nodesById, edges)) {
    const a = domainOf.get(e.from) as string;
    const b = domainOf.get(e.to) as string;
    if (a === b) continue;
    bump(a, b);
    bump(b, a);
  }

  const summaries: DomainSummary[] = [...members.entries()].map(([slug, list]) => {
    const counts = { mastered: 0, learning: 0, untouched: 0 };
    for (const n of list) counts[n.bucket] += 1;
    return {
      slug,
      title: domainTitle(slug),
      concepts: list.map((n) => n.id),
      topics: topicsOf(list, topics, bySlug),
      counts,
      links: [...(links.get(slug) ?? new Map<string, number>()).entries()]
        .sort((a, b) => b[1] - a[1] || byId(a[0], b[0]))
        .map(([domain, count]) => ({ domain, count })),
    };
  });
  const studied = (d: DomainSummary) => d.counts.mastered + d.counts.learning;
  return summaries.sort(
    (a, b) => studied(b) - studied(a) || b.concepts.length - a.concepts.length || byId(a.slug, b.slug),
  );
}

/** One topic's concepts in layers, positioned so its group box starts at the origin. */
function layoutTopic(ids: readonly string[], edges: readonly GraphEdge[]) {
  const g = new Graph({ multigraph: true });
  g.setGraph({ rankdir: "TB", nodesep: 16, ranksep: 40, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of ids) g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) g.setEdge(e.from, e.to, {}, edgeKey(e));
  dagreLayout(g);
  const raw = ids.map((id) => {
    const box = g.node(id);
    return { id, x: Math.round(box.x), y: Math.round(box.y - NODE_HEIGHT / 2 + DOT_TOP) };
  });
  const box = groupBox(raw);
  return {
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
    local: new Map(raw.map((p) => [p.id, { x: p.x - box.x, y: p.y - box.y }])),
  };
}

/**
 * Topics with their prerequisites first (D3). Topics that need each other
 * (a cycle, as asymptotic notation and analysis often are) count as one, so a
 * loop does not push them to the end. A topic's level is the longest chain of
 * topics it needs; topics are ordered by level, then the more topics that
 * need one the earlier it goes, then the vocabulary's order. So the
 * foundations come first, a standalone topic waits behind them, and the
 * picture reads the way the subject is learnt.
 */
function topicOrder(groups: readonly { slug: string }[], topicOf: ReadonlyMap<string, string>, edges: readonly GraphEdge[]): string[] {
  const slugs = groups.map((g) => g.slug);
  const needs = new Map<string, Set<string>>(slugs.map((t) => [t, new Set<string>()]));
  for (const e of edges) {
    const a = topicOf.get(e.from);
    const b = topicOf.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) needs.get(b)?.add(a);
  }
  const dependants = new Map<string, number>(slugs.map((t) => [t, 0]));
  for (const set of needs.values()) for (const t of set) dependants.set(t, (dependants.get(t) ?? 0) + 1);

  // Tarjan's strongly connected components over "needs", in vocabulary order.
  const component = new Map<string, number>();
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let counter = 0;
  let components = 0;
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of [...(needs.get(v) ?? [])].sort((x, y) => slugs.indexOf(x) - slugs.indexOf(y))) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v) as number, index.get(w) as number));
    }
    if (low.get(v) === index.get(v)) {
      let w: string;
      do {
        w = stack.pop() as string;
        onStack.delete(w);
        component.set(w, components);
      } while (w !== v);
      components++;
    }
  };
  for (const t of slugs) if (!index.has(t)) visit(t);

  // Tarjan numbers a component after every component it needs, so one pass in that order sets each level.
  const level = new Array<number>(components).fill(0);
  const members = new Map<number, string[]>();
  for (const t of slugs) members.set(component.get(t) as number, [...(members.get(component.get(t) as number) ?? []), t]);
  for (let c = 0; c < components; c++) {
    for (const t of members.get(c) ?? []) {
      for (const n of needs.get(t) ?? []) {
        const d = component.get(n) as number;
        if (d !== c) level[c] = Math.max(level[c], level[d] + 1);
      }
    }
  }
  const rank = new Map(slugs.map((t, i) => [t, i]));
  const levelOf = (t: string) => level[component.get(t) as number];
  return [...slugs].sort(
    (a, b) =>
      levelOf(a) - levelOf(b) ||
      (dependants.get(b) ?? 0) - (dependants.get(a) ?? 0) ||
      (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
  );
}

/**
 * One domain as a picture (D3, D4): a group per topic, packed left to right in
 * rows sized so the whole is about `ASPECT` wide (at most `MAX_ROW_WIDTH`),
 * prerequisite topics first.
 * The edges drawn are the domain's own, reduced over the whole domain; the
 * ones that reach another domain are listed in `outside`, not drawn.
 */
export function domainLayout(
  nodes: readonly DomainNode[],
  edges: readonly GraphEdge[],
  topics: readonly DomainTopic[],
  domain: string,
): DomainLayout {
  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const sorted = [...nodes].sort((a, b) => byId(a.id, b.id));
  const nodesById = new Map(sorted.map((n) => [n.id, n]));
  const domainOf = new Map(sorted.map((n) => [n.id, domainOfNode(n, bySlug)]));
  const members = sorted.filter((n) => domainOf.get(n.id) === domain);
  const inside = new Set(members.map((n) => n.id));
  const all = cleanEdges(nodesById, edges);
  const own = all.filter((e) => inside.has(e.from) && inside.has(e.to));
  const drawn = reduceEdges(own);
  const outside = all
    .filter((e) => inside.has(e.from) !== inside.has(e.to))
    .map((e) => {
      const here = inside.has(e.from) ? e.from : e.to;
      const there = here === e.from ? e.to : e.from;
      return { ...e, domain: domainOf.get(there) as string, inside: here };
    });

  const groups = topicsOf(members, topics, bySlug);
  const topicOf = new Map(groups.flatMap((g) => g.concepts.map((id) => [id, g.slug] as const)));
  const laid = new Map(
    groups.map((g) => {
      const members = new Set(g.concepts);
      return [g.slug, layoutTopic(g.concepts, drawn.filter((e) => members.has(e.from) && members.has(e.to)))];
    }),
  );
  const order = topicOrder(groups, topicOf, own);

  const area = [...laid.values()].reduce((sum, t) => sum + (t.width + GROUP_GAP) * (t.height + GROUP_GAP), 0);
  const widest = Math.max(0, ...[...laid.values()].map((t) => t.width));
  const rowWidth = Math.max(widest, Math.min(MAX_ROW_WIDTH, Math.round(Math.sqrt(area * ASPECT))));

  const positions: Record<string, { x: number; y: number }> = {};
  let x = 0;
  let top = 0;
  let rowHeight = 0;
  let width = 0;
  for (const slug of order) {
    const t = laid.get(slug) as ReturnType<typeof layoutTopic>;
    if (x > 0 && x + t.width > rowWidth) {
      x = 0;
      top += rowHeight + GROUP_GAP;
      rowHeight = 0;
    }
    for (const [id, p] of t.local) positions[id] = { x: x + p.x, y: top + p.y };
    width = Math.max(width, x + t.width);
    rowHeight = Math.max(rowHeight, t.height);
    x += t.width + GROUP_GAP;
  }
  const byOrder = new Map(order.map((slug, i) => [slug, i]));

  return {
    domain,
    width,
    height: groups.length === 0 ? 0 : top + rowHeight,
    positions,
    groups: [...groups]
      .sort((a, b) => (byOrder.get(a.slug) ?? 0) - (byOrder.get(b.slug) ?? 0))
      .map((g) => ({ topic: g.slug, title: g.title, concepts: g.concepts })),
    edges: drawn,
    outside,
  };
}

/** The inputs a domain's layout depends on: not mastery, not titles of concepts. */
function layoutKey(nodes: readonly DomainNode[], edges: readonly GraphEdge[], topics: readonly DomainTopic[], domain: string): string {
  const ns = nodes
    .map((n) => [n.id, n.topic ?? "", n.domain ?? ""].join("\u0001"))
    .sort(byId)
    .join("\u0002");
  const es = edges.map(edgeKey).sort(byId).join("\u0002");
  const ts = topics.map((t) => [t.slug, t.title, t.domain].join("\u0001")).join("\u0002");
  return `${domain}\u0003${ns}\u0003${es}\u0003${ts}`;
}

const CACHE_SIZE = 32;
const cache = new Map<string, DomainLayout>();

/**
 * `domainLayout`, remembered per graph and domain. The Learn page asks on
 * every request and the graph changes only when a note or a topic does.
 * Mastery is not part of the key: colours come from the rows the page sends,
 * never from the layout.
 */
export function cachedDomainLayout(
  nodes: readonly DomainNode[],
  edges: readonly GraphEdge[],
  topics: readonly DomainTopic[],
  domain: string,
): DomainLayout {
  const key = layoutKey(nodes, edges, topics, domain);
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const fresh = domainLayout(nodes, edges, topics, domain);
  cache.set(key, fresh);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return fresh;
}

/** What the Learn page sends the browser: every domain, and each one's picture. */
export interface DomainMapData {
  tree: DomainSummary[];
  layouts: Record<string, DomainLayout>;
}
