import type { MasteryBucket } from "@/lib/mastery-bucket";

/**
 * Which concepts a graph shows, and where each one sits.
 *
 * Pure and React-free: the Learn index picks a neighbourhood in the browser as
 * the selected row changes, the workspace picks one on the server, and a test
 * checks both without a DOM. The drawing is `ConceptGraph.tsx`.
 *
 * Decision 13 in docs/design/DESIGN.md: a whole-vault graph is a hairball on
 * first open, so the default is the neighbourhood of one concept (the concept,
 * what it needs, what needs it) and the wider view is the concepts that share
 * its course, behind a toggle.
 */

/** A concept as a graph needs it. */
export interface GraphNode {
  id: string;
  title: string;
  bucket: MasteryBucket;
  pL: number;
  /** Course slugs this concept's curriculum items belong to. */
  courses: string[];
  /** The folder the note lives in, the fallback group for a concept in no course. */
  domain: string | null;
}

/** `from` is the prerequisite, `to` the concept that needs it (the catalog's direction). */
export interface GraphEdge {
  from: string;
  to: string;
  kind: "requires" | "assumes";
}

export interface GraphSelection {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Edges whose both ends are in `ids`. */
function edgesWithin(edges: readonly GraphEdge[], ids: ReadonlySet<string>): GraphEdge[] {
  return edges.filter((e) => ids.has(e.from) && ids.has(e.to));
}

function pick(nodes: readonly GraphNode[], edges: readonly GraphEdge[], ids: ReadonlySet<string>): GraphSelection {
  return { nodes: nodes.filter((n) => ids.has(n.id)), edges: edgesWithin(edges, ids) };
}

/** Concepts that name `slug` as a prerequisite, through the given kinds of edge. */
export function dependantsOf(
  edges: readonly GraphEdge[],
  slug: string,
  kinds: readonly GraphEdge["kind"][] = ["requires"],
): string[] {
  return [...new Set(edges.filter((e) => e.from === slug && kinds.includes(e.kind)).map((e) => e.to))].sort();
}

/**
 * Backlinks: every concept whose `requires` or `assumes` names this one.
 *
 * Read from the concepts' own lists rather than from the edge list, because
 * the catalog drops an edge whose other end is not indexed and a backlink is
 * still a backlink when the note that holds it is the one being looked at.
 */
export function backlinksOf(
  concepts: readonly { id: string; requires: readonly string[]; assumes: readonly string[] }[],
  slug: string,
): string[] {
  return concepts
    .filter((c) => c.id !== slug && (c.requires.includes(slug) || c.assumes.includes(slug)))
    .map((c) => c.id)
    .sort();
}

/**
 * The concept, everything it needs (hard and background), and everything that
 * needs it. Edges between any two of those are kept, so a prerequisite of a
 * prerequisite that happens to be in the set still draws its line.
 */
export function neighbourhood(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  slug: string,
): GraphSelection {
  if (!nodes.some((n) => n.id === slug)) return { nodes: [], edges: [] };
  const ids = new Set([slug]);
  for (const e of edges) {
    if (e.to === slug) ids.add(e.from);
    if (e.from === slug) ids.add(e.to);
  }
  return pick(nodes, edges, ids);
}

export type ScopeBasis = "course" | "domain" | "self";

/**
 * Every concept sharing a course with this one. A concept in no course falls
 * back to its folder, so the wider view still means something for the notes
 * nobody has tied to a course yet; one with neither is shown alone.
 */
export function courseScope(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  slug: string,
): GraphSelection & { basis: ScopeBasis } {
  const focus = nodes.find((n) => n.id === slug);
  if (focus === undefined) return { nodes: [], edges: [], basis: "self" };
  let basis: ScopeBasis = "self";
  let ids = new Set([slug]);
  if (focus.courses.length > 0) {
    basis = "course";
    ids = new Set(nodes.filter((n) => n.courses.some((c) => focus.courses.includes(c))).map((n) => n.id));
  } else if (focus.domain !== null) {
    basis = "domain";
    ids = new Set(nodes.filter((n) => n.courses.length === 0 && n.domain === focus.domain).map((n) => n.id));
  }
  ids.add(slug);
  const picked = pick(nodes, edges, ids);
  return { ...picked, edges: reduceEdges(picked.edges), basis };
}

/**
 * The transitive reduction: drop an edge a to c when c is already reachable
 * from a through other edges. A course graph drawn with every edge is a
 * hairball (one foundational note reaches most of the course directly and
 * again through each step), and the dropped edges say nothing the kept path
 * does not.
 *
 * A `requires` edge is only dropped for a path of `requires` edges: a hard
 * prerequisite reached through a background one would otherwise be drawn as
 * if it were background. An `assumes` edge goes for any path, since a hard
 * chain says at least as much as a background line.
 */
export function reduceEdges(edges: readonly GraphEdge[]): GraphEdge[] {
  const out = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const list = out.get(e.from);
    if (list === undefined) out.set(e.from, [e]);
    else list.push(e);
  }
  const implied = (edge: GraphEdge): boolean => {
    const usable = (e: GraphEdge) => edge.kind === "assumes" || e.kind === "requires";
    const seen = new Set<string>([edge.from]);
    const stack = (out.get(edge.from) ?? []).filter((e) => e.to !== edge.to && usable(e)).map((e) => e.to);
    while (stack.length > 0) {
      const next = stack.pop() as string;
      if (next === edge.to) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      for (const e of out.get(next) ?? []) if (usable(e)) stack.push(e.to);
    }
    return false;
  };
  return edges.filter((e) => !implied(e));
}

/**
 * The concept a page should select when nobody has chosen one: the most
 * overdue due concept, then the first on the frontier, then the first row.
 */
export function defaultSelection(
  concepts: readonly { id: string; due: string | null }[],
  frontier: readonly string[],
  now: Date = new Date(),
): string | null {
  const due = concepts
    .filter((c) => c.due !== null && new Date(c.due).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.due ?? 0).getTime() - new Date(b.due ?? 0).getTime());
  if (due.length > 0) return due[0].id;
  const known = new Set(concepts.map((c) => c.id));
  const onFrontier = frontier.find((id) => known.has(id));
  if (onFrontier !== undefined) return onFrontier;
  return concepts[0]?.id ?? null;
}

/**
 * Longest-path layering: a node sits one layer below its deepest
 * prerequisite, so every edge points down. Both kinds of edge constrain it,
 * since a background edge still means "comes before". A cycle (which `doctor`
 * reports) is cut rather than recursed into forever.
 */
export function assignLayers(nodes: readonly { id: string }[], edges: readonly GraphEdge[]): Map<string, number> {
  const incoming = new Map<string, string[]>();
  for (const n of nodes) incoming.set(n.id, []);
  for (const e of edges) if (incoming.has(e.from)) incoming.get(e.to)?.push(e.from);

  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const value = parents.length === 0 ? 0 : Math.max(...parents.map(depth)) + 1;
    visiting.delete(id);
    layer.set(id, value);
    return value;
  };
  for (const n of nodes) depth(n.id);
  return layer;
}

export interface GraphLayout {
  width: number;
  height: number;
  positions: Map<string, { x: number; y: number }>;
}

/** Node centres for a layered drawing, rows centred, alphabetical within a row. */
export function layoutGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  { columnWidth = 112, rowHeight = 104, padX = 12, padY = 22 }: { columnWidth?: number; rowHeight?: number; padX?: number; padY?: number } = {},
): GraphLayout {
  const layers = assignLayers(nodes, edges);
  const rows = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const l = layers.get(n.id) ?? 0;
    const row = rows.get(l);
    if (row === undefined) rows.set(l, [n]);
    else row.push(n);
  }
  const depths = [...rows.keys()].sort((a, b) => a - b);
  for (const row of rows.values()) row.sort((a, b) => a.title.localeCompare(b.title));
  const widest = Math.max(1, ...[...rows.values()].map((r) => r.length));
  const width = padX * 2 + widest * columnWidth;
  const height = padY * 2 + Math.max(0, depths.length - 1) * rowHeight + 34;

  const positions = new Map<string, { x: number; y: number }>();
  depths.forEach((d, rowIndex) => {
    const row = rows.get(d) ?? [];
    const startX = (width - row.length * columnWidth) / 2;
    row.forEach((n, i) => {
      positions.set(n.id, { x: startX + i * columnWidth + columnWidth / 2, y: padY + rowIndex * rowHeight });
    });
  });
  return { width, height, positions };
}

/** A label broken into at most two lines of about `max` characters, the second truncated. */
export function wrapLabel(title: string, max = 16): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (next.length <= max || line === "") line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  if (lines.length <= 2) return lines.map((l) => (l.length > max + 2 ? `${l.slice(0, max)}…` : l));
  const second = lines.slice(1).join(" ");
  return [lines[0], second.length > max ? `${second.slice(0, max - 1)}…` : second];
}
