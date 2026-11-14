import { neighbours } from "@/lib/domain-view";
import { levels, topicOrder } from "@/lib/topic-order";

/**
 * The Path layout of a domain (D12 to D16 of docs/proposals/domain-map.md):
 * the topics on one vertical spine, ordered by what each needs, each topic's
 * concepts branching off its spine node, in the order they are learnt. Pure
 * and free of React and dagre, so the maths is tested on its own and a client
 * component can import it. The server's layout is not involved: the order is
 * worked out here from the same rule the groups are packed by (`topicOrder`).
 *
 * Every step sorts its input first, so the same graph always gives the same
 * spine whatever order the rows came in.
 */

/** A topic of the domain: the layout's groups, in any order. */
export interface SpineGroup {
  topic: string;
  title: string;
  concepts: readonly string[];
}

/** What the spine reads of a concept's standing: the bucket and whether it is ready to learn. */
export interface SpineStanding {
  bucket: "mastered" | "learning" | "untouched";
  ready: boolean;
}

export interface SpineEdge {
  from: string;
  to: string;
}

/** An edge that cannot sit on the line: listed beside the node it touches, never drawn (D4, D14). */
export interface SpineJoin {
  /** The topic this one needs. */
  topic: string;
  title: string;
  /** True when the spine puts that topic below this one: topics that need each other form a loop. */
  later: boolean;
}

export interface SpineOutside {
  id: string;
  domain: string;
  kind: "needs" | "leads-to";
}

export interface SpineNode {
  topic: string;
  title: string;
  /** The place on the spine, from 0. */
  index: number;
  /** The concepts in the order they are learnt: by level in the topic, then by id. */
  concepts: string[];
  /** The same concepts as steps: each step needs only earlier ones, as far as the topic's own edges say. */
  steps: string[][];
  /** Other topics this one needs, except the one just above it, which the line already says. */
  needs: SpineJoin[];
  /** Concepts of other domains this topic's concepts need or lead to (D4). */
  outside: SpineOutside[];
  mastered: number;
  /** Concepts with any evidence, mastered ones included: the node's mark is "learning" once this is above 0. */
  started: number;
  /** Concepts ready to learn and not mastered, in order. */
  ready: string[];
  /** Every concept is mastered, so the node starts collapsed (D15). */
  done: boolean;
}

export interface Spine {
  nodes: SpineNode[];
  /** The first topic holding a concept ready to learn: where the view opens (D15). Null when none does. */
  frontier: string | null;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * One domain's topics as a spine. `groups` is the domain's topics, their order
 * the vocabulary's (the tie-break of last resort); `edges` are the whole
 * graph's, and those with a known end in another domain (by `domainOf`) become
 * `outside` labels. Topics come in `topicOrder`: foundations first, topics that
 * need each other counted as one level so a loop never throws or pushes them
 * out; within a topic a concept's step is the longest chain of the topic's own
 * concepts it needs, again a loop as one step.
 */
export function spineOf(
  groups: readonly SpineGroup[],
  edges: readonly SpineEdge[],
  standing: ReadonlyMap<string, SpineStanding>,
  domain: string,
  domainOf: Readonly<Record<string, string>> = {},
  domainTitleOf: (slug: string) => string = (slug) => slug,
): Spine {
  const topicOf = new Map(groups.flatMap((g) => g.concepts.map((id) => [id, g.topic] as const)));
  const own = edges.filter((e) => topicOf.has(e.from) && topicOf.has(e.to) && e.from !== e.to);
  const order = topicOrder(
    groups.map((g) => ({ slug: g.topic })),
    topicOf,
    own,
  );
  const index = new Map(order.map((slug, i) => [slug, i]));
  const bySlug = new Map(groups.map((g) => [g.topic, g]));

  const nodes = order.map((slug, i): SpineNode => {
    const group = bySlug.get(slug) as SpineGroup;
    const ids = [...group.concepts].sort(byId);
    const inTopic = new Set(ids);
    const needs = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
    for (const e of own) if (inTopic.has(e.from) && inTopic.has(e.to)) needs.get(e.to)?.add(e.from);
    const level = levels(ids, needs);
    const concepts = [...ids].sort((a, b) => (level.get(a) ?? 0) - (level.get(b) ?? 0) || byId(a, b));
    const steps: string[][] = [];
    for (const id of concepts) {
      const l = level.get(id) ?? 0;
      // Levels are dense from 0 (each is one above one it needs), so the step is its own level.
      (steps[l] ??= []).push(id);
    }

    // Joins between topics: one per topic needed, the neighbour just above left to the line.
    const joined = new Map<string, SpineJoin>();
    for (const e of own) {
      const a = topicOf.get(e.from) as string;
      const b = topicOf.get(e.to) as string;
      if (a === b) continue;
      // Only what this topic needs: what leads on from it is the other node's label.
      if (b !== slug || index.get(a) === i - 1) continue;
      joined.set(a, { topic: a, title: (bySlug.get(a) as SpineGroup).title, later: (index.get(a) as number) > i });
    }

    const outside = new Map<string, SpineOutside>();
    for (const e of edges) {
      const fromIn = inTopic.has(e.from);
      const toIn = inTopic.has(e.to);
      if (fromIn === toIn) continue;
      const other = fromIn ? e.to : e.from;
      const there = Object.hasOwn(domainOf, other) ? domainOf[other] : undefined;
      if (there === undefined || there === domain) continue;
      const kind = toIn ? "needs" : "leads-to";
      outside.set(`${kind}\u0000${other}`, { id: other, domain: there, kind });
    }

    const ready = concepts.filter((id) => {
      const s = standing.get(id);
      return s !== undefined && s.ready && s.bucket !== "mastered";
    });
    const mastered = concepts.filter((id) => standing.get(id)?.bucket === "mastered").length;
    return {
      topic: slug,
      title: group.title,
      index: i,
      concepts,
      steps: steps.filter((s) => s !== undefined),
      needs: [...joined.values()].sort((x, y) => (index.get(x.topic) as number) - (index.get(y.topic) as number)),
      outside: [...outside.values()].sort(
        // What it needs first, then what leads on from it.
        (x, y) => Number(x.kind === "leads-to") - Number(y.kind === "leads-to") ||byId(domainTitleOf(x.domain), domainTitleOf(y.domain)) || byId(x.id, y.id),
      ),
      mastered,
      started: concepts.filter((id) => (standing.get(id)?.bucket ?? "untouched") !== "untouched").length,
      ready,
      done: concepts.length > 0 && mastered === concepts.length,
    };
  });
  return { nodes, frontier: nodes.find((n) => n.ready.length > 0)?.topic ?? null };
}

/** The topics a spine starts open: every one but those whose concepts are all mastered (D15). */
export function openByDefault(spine: Spine): Set<string> {
  return new Set(spine.nodes.filter((n) => !n.done).map((n) => n.topic));
}

/** `open` with `topic` flipped: one press on a collapsed node expands it, and on an open one folds it. */
export function toggleOpen(open: ReadonlySet<string>, topic: string): Set<string> {
  return open.has(topic) ? new Set([...open].filter((t) => t !== topic)) : new Set([...open, topic]);
}

/** `open` with the topic holding `concept` opened, so a concept chosen in the list is never hidden. */
export function revealConcept(open: ReadonlySet<string>, spine: Spine, concept: string | null): ReadonlySet<string> {
  if (concept === null) return open;
  const node = spine.nodes.find((n) => n.concepts.includes(concept));
  return node === undefined || open.has(node.topic) ? open : new Set([...open, node.topic]);
}

/**
 * What stays lit (D5, D9): the hovered concept and its neighbours, else what a
 * legend chip previews, else the hovered topic's concepts. Null when nothing
 * is asked for, so nothing fades.
 */
export function spineLit(
  spine: Spine,
  edges: readonly SpineEdge[],
  ask: { hover: string | null; hoverTopic: string | null; preview: ReadonlySet<string> | null },
): ReadonlySet<string> | null {
  if (ask.hover !== null) return neighbours(edges, ask.hover);
  if (ask.preview !== null) return ask.preview;
  if (ask.hoverTopic !== null) {
    const node = spine.nodes.find((n) => n.topic === ask.hoverTopic);
    return node === undefined ? null : new Set(node.concepts);
  }
  return null;
}
