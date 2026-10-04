import type { GraphEdge, GraphNode } from "@/lib/concept-graph";

/**
 * What the map says about a concept beyond where it sits (phase 3 of
 * docs/proposals/knowledge-map.md): which concepts are ready to learn in the
 * courses being worked through (G5), what one needs and leads to, its p(L)
 * arc (G4), and which concept a search lands on. Pure and React-free.
 */

/**
 * For each concept in no course, the courses whose concepts depend on it,
 * through a `requires` or `assumes` edge, directly or through other concepts
 * in no course. A concept that is in a course is not in the map.
 */
export function servesCourses(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Map<string, Set<string>> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dependants = new Map<string, string[]>();
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    const list = dependants.get(e.from);
    if (list === undefined) dependants.set(e.from, [e.to]);
    else list.push(e.to);
  }
  const out = new Map<string, Set<string>>();
  for (const n of nodes) {
    if (n.courses.length > 0) continue;
    const courses = new Set<string>();
    const seen = new Set([n.id]);
    const stack = [...(dependants.get(n.id) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const d = byId.get(id) as GraphNode;
      // A course concept files the background under its courses; a concept in
      // no course passes the walk on to what depends on it.
      if (d.courses.length > 0) for (const c of d.courses) courses.add(c);
      else stack.push(...(dependants.get(id) ?? []));
    }
    out.set(n.id, new Set([...courses].sort()));
  }
  return out;
}

/**
 * The concepts ready to learn in the recent courses (G5): not mastered, every
 * `requires` prerequisite mastered (a background `assumes` does not hold one
 * back), and either in one of those courses or in no course and serving one.
 */
export function readyConcepts(nodes: readonly GraphNode[], edges: readonly GraphEdge[], recentCourses: readonly string[]): Set<string> {
  const recent = new Set(recentCourses);
  if (recent.size === 0) return new Set();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const serves = servesCourses(nodes, edges);
  const needs = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== "requires" || !byId.has(e.from)) continue;
    const list = needs.get(e.to);
    if (list === undefined) needs.set(e.to, [e.from]);
    else list.push(e.from);
  }
  const ready = new Set<string>();
  for (const n of nodes) {
    if (n.bucket === "mastered") continue;
    const courses = n.courses.length > 0 ? n.courses : [...(serves.get(n.id) ?? [])];
    if (!courses.some((c) => recent.has(c))) continue;
    if ((needs.get(n.id) ?? []).every((p) => byId.get(p)?.bucket === "mastered")) ready.add(n.id);
  }
  return ready;
}

/** What a concept needs and what leads on from it, through either kind of edge, each once, by title. */
export function relatedTo(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  id: string,
): { needs: GraphNode[]; leadsTo: GraphNode[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pick = (ids: Iterable<string>) =>
    [...new Set(ids)]
      .map((x) => byId.get(x))
      .filter((n): n is GraphNode => n !== undefined)
      .sort((a, b) => a.title.localeCompare(b.title));
  return {
    needs: pick(edges.filter((e) => e.to === id).map((e) => e.from)),
    leadsTo: pick(edges.filter((e) => e.from === id).map((e) => e.to)),
  };
}

/** The length of a learning concept's p(L) arc on a ring of `radius`; none for any other bucket. */
export function arcLength(node: Pick<GraphNode, "bucket" | "pL">, radius: number): number {
  if (node.bucket !== "learning") return 0;
  return 2 * Math.PI * radius * Math.min(1, Math.max(0, node.pL));
}

const words = (text: string) => text.toLowerCase().split(/[\s-]+/).filter(Boolean);

/**
 * The concept a search lands on: a title that starts with the query first,
 * then one whose title or slug holds every word, in the order given.
 */
export function firstMatch(rows: readonly { id: string; title: string; summary: string }[], query: string): string | null {
  const q = words(query);
  if (q.length === 0) return null;
  const phrase = q.join(" ");
  const starts = rows.find((r) => words(r.title).join(" ").startsWith(phrase));
  if (starts !== undefined) return starts.id;
  const all = rows.find((r) => {
    const hay = `${words(r.title).join(" ")} ${words(r.id).join(" ")}`;
    return q.every((w) => hay.includes(w));
  });
  return all?.id ?? null;
}

/**
 * The panel's standing line: p(L), when the review is due, when the concept
 * was last seen. An overdue review says so in words and in the danger colour;
 * a concept nobody has studied says only that.
 */
export function standingLine(row: {
  bucket: GraphNode["bucket"];
  pL: number;
  due: string | null;
  dueLabel: string;
  overdue: boolean;
  lastSeenLabel: string;
}): { text: string; danger?: true }[] {
  if (row.bucket === "untouched") return [{ text: "Not studied yet" }];
  const parts: { text: string; danger?: true }[] = [{ text: `p(L) ${row.pL.toFixed(2)}` }];
  if (row.due !== null) parts.push(row.overdue ? { text: "review overdue", danger: true } : { text: `due ${row.dueLabel}` });
  parts.push({ text: `last seen ${row.lastSeenLabel}` });
  return parts;
}
