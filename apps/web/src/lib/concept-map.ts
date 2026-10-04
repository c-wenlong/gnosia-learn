import { Graph, layout as dagreLayout } from "@dagrejs/dagre";

import { reduceEdges, type GraphEdge, type GraphNode } from "@/lib/concept-graph";
import { TITLE_CHAR_PX } from "@/lib/map-viewport";

/**
 * The whole prerequisite graph as one map: an island per connected cluster,
 * each laid out in layers with crossings minimised, titled by its courses and
 * packed beside the other islands of the same course. Phase 1 of
 * docs/proposals/knowledge-map.md (decisions G3 and G7).
 *
 * Runs on the server: the Learn page computes the layout once and hands the
 * browser plain positions, so dagre never reaches the client bundle. A client
 * component may import this module's types, never its functions.
 *
 * Every step sorts its input first, so the same graph always gives the same
 * map whatever order the rows came out of the database in.
 */

export interface MapIsland {
  /** Stable id: the smallest concept slug on the island. */
  id: string;
  title: string;
  /** What the island is grouped by: a course slug, or `~<folder>` for an island in no course. */
  key: string;
  nodes: string[];
  /** The island's rectangle. Its title sits in the band of `titleHeight` above `y`. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapLayout {
  width: number;
  height: number;
  titleHeight: number;
  islands: MapIsland[];
  /** Each concept's dot, in map coordinates. */
  positions: Record<string, { x: number; y: number }>;
  islandOf: Record<string, string>;
  /** The edges drawn: every island's edges, transitively reduced. */
  edges: GraphEdge[];
  /**
   * Each drawn edge's route, keyed `from>to>kind`: from under the
   * prerequisite's label to just above the dot that needs it, bending through
   * the layers between, so a long edge follows the lane the layout left for it
   * rather than cutting across the island.
   */
  routes: Record<string, { x: number; y: number }[]>;
}

/** The key `routes` is indexed by. */
export const routeKey = (e: GraphEdge) => `${e.from}>${e.to}>${e.kind}`;

export interface MapOptions {
  /** Course slug to its code, for island titles. A slug with none is shown as it is. */
  courseCodes?: Readonly<Record<string, string>>;
  /**
   * Islands wrap onto a new row past this width. By default 2,400, or the
   * widest island's width when that is wider, so one wide island does not
   * leave every other row half empty.
   */
  maxRowWidth?: number;
}

/** The box dagre lays out per concept: the dot and two lines of label under it. */
const NODE_WIDTH = 112;
const NODE_HEIGHT = 58;
/** Where the dot sits inside that box, from its top edge. */
const DOT_FROM_TOP = 12;
const ISLAND_GAP = 48;
const TITLE_HEIGHT = 30;
const TITLE_INSET = 8;

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const edgeKey = (e: GraphEdge) => `${e.from}\u0000${e.to}\u0000${e.kind}`;

/**
 * The connected components, ignoring direction and treating both kinds of
 * edge as joining. Each component's ids are sorted, and the components are
 * ordered by their first id.
 */
export function clusters(nodes: readonly { id: string }[], edges: readonly GraphEdge[]): string[][] {
  const ids = nodes.map((n) => n.id).sort(byId);
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    while (parent.get(x) !== root) {
      const next = parent.get(x) as string;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  for (const e of edges) {
    if (!parent.has(e.from) || !parent.has(e.to)) continue;
    const a = find(e.from);
    const b = find(e.to);
    // The smaller id wins, so the roots do not depend on the edge order.
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const group = groups.get(root);
    if (group === undefined) groups.set(root, [id]);
    else group.push(id);
  }
  return [...groups.values()].sort((a, b) => byId(a[0], b[0]));
}

/** A folder name as a title: `classical-ai` reads "Classical ai". */
function folderTitle(folder: string): string {
  const words = folder.replace(/[-_]+/g, " ").trim();
  return words.length === 0 ? "No course" : words[0].toUpperCase() + words.slice(1);
}

/** Most frequent first, then by name, so a tie is settled the same way every time. */
function ranked(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || byId(a[0], b[0]));
}

/**
 * An island's title (G7): the course most of its concepts belong to, or up to
 * three when it spans several, or its folder when none of them is in a course.
 *
 * A course is named when it holds at least two of the island's concepts and
 * at least 10% of them, so one concept borrowed from another course does not
 * put that course's code on a large island. When no course clears that bar,
 * the largest one is named alone.
 */
export function islandTitle(
  ids: readonly string[],
  nodesById: ReadonlyMap<string, GraphNode>,
  courseCodes: Readonly<Record<string, string>> = {},
): { title: string; key: string } {
  const courses = new Map<string, number>();
  const folders = new Map<string, number>();
  for (const id of ids) {
    const n = nodesById.get(id);
    if (n === undefined) continue;
    for (const c of n.courses) courses.set(c, (courses.get(c) ?? 0) + 1);
    if (n.domain !== null) folders.set(n.domain, (folders.get(n.domain) ?? 0) + 1);
  }
  const byCourse = ranked(courses);
  if (byCourse.length > 0) {
    const bar = Math.max(2, ids.length * 0.1);
    const named = byCourse.filter(([, count]) => count >= bar).slice(0, 3);
    const shown = named.length > 0 ? named : byCourse.slice(0, 1);
    return { title: shown.map(([slug]) => courseCodes[slug] ?? slug).join(", "), key: byCourse[0][0] };
  }
  const folder = ranked(folders)[0]?.[0];
  if (folder === undefined) return { title: "No course", key: "~" };
  return { title: `${folderTitle(folder)}, no course`, key: `~${folder}` };
}

interface LaidOutIsland {
  id: string;
  title: string;
  key: string;
  nodes: string[];
  width: number;
  height: number;
  /** Dot positions relative to the island's top left corner. */
  local: Map<string, { x: number; y: number }>;
  edges: GraphEdge[];
  /** Edge routes relative to the island's top left corner. */
  localRoutes: Map<string, { x: number; y: number }[]>;
}

function layoutIsland(ids: string[], edges: GraphEdge[]): Omit<LaidOutIsland, "id" | "title" | "key"> {
  const g = new Graph({ multigraph: true });
  g.setGraph({ rankdir: "TB", nodesep: 16, ranksep: 40, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of ids) g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  // A multigraph, so a `requires` and an `assumes` between the same two concepts each get a route.
  for (const e of edges) g.setEdge(e.from, e.to, {}, routeKey(e));
  dagreLayout(g);
  const local = new Map<string, { x: number; y: number }>();
  for (const id of ids) {
    const box = g.node(id);
    local.set(id, { x: Math.round(box.x), y: Math.round(box.y - NODE_HEIGHT / 2 + DOT_FROM_TOP) });
  }
  const localRoutes = new Map<string, { x: number; y: number }[]>();
  for (const e of edges) {
    const label = g.edge({ v: e.from, w: e.to, name: routeKey(e) }) as { points?: { x: number; y: number }[] } | undefined;
    const points = (label?.points ?? []).map((pt) => ({
      x: Math.round(pt.x),
      y: Math.round(pt.y),
    }));
    const from = local.get(e.from) as { x: number; y: number };
    const to = local.get(e.to) as { x: number; y: number };
    // dagre ends a route on each box's border; pin the ends under the label and above the dot.
    // A cycle's back edge runs upward: it leaves above its source and arrives under its target.
    const up = from.y > to.y;
    const start = { x: from.x, y: up ? from.y - DOT_FROM_TOP : from.y + NODE_HEIGHT - DOT_FROM_TOP };
    const end = { x: to.x, y: up ? to.y + NODE_HEIGHT - DOT_FROM_TOP : to.y - DOT_FROM_TOP };
    const [low, high] = up ? [end.y, start.y] : [start.y, end.y];
    const middle = points.slice(1, -1).filter((pt: { x: number; y: number }) => pt.y > low && pt.y < high);
    localRoutes.set(routeKey(e), [start, ...middle, end]);
  }
  const graph = g.graph();
  return {
    nodes: ids,
    width: Math.ceil(graph.width ?? NODE_WIDTH),
    height: Math.ceil(graph.height ?? NODE_HEIGHT),
    local,
    edges,
    localRoutes,
  };
}

/**
 * An island at least as wide as its title, its concepts centred in the extra
 * room, so a long title (three course codes) is never clipped at the map's edge.
 */
function widenForTitle<T extends { width: number; local: Map<string, { x: number; y: number }>; localRoutes: Map<string, { x: number; y: number }[]> }>(
  island: T,
  title: string,
): T {
  const needed = Math.ceil(title.length * TITLE_CHAR_PX + TITLE_INSET);
  if (island.width >= needed) return island;
  const dx = Math.round((needed - island.width) / 2);
  const shift = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y });
  return {
    ...island,
    width: needed,
    local: new Map([...island.local].map(([id, p]) => [id, shift(p)])),
    localRoutes: new Map([...island.localRoutes].map(([key, route]) => [key, route.map(shift)])),
  };
}

/**
 * Lay the whole graph out as islands. Islands are grouped by `key` (a course,
 * or a folder for an island in no course), the group with the most concepts
 * first, the larger island first within a group, and packed left to right in
 * rows no wider than `maxRowWidth` (an island wider than that gets a row of
 * its own).
 */
export function mapLayout(nodes: readonly GraphNode[], edges: readonly GraphEdge[], options: MapOptions = {}): MapLayout {
  const { courseCodes = {} } = options;
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const known = (e: GraphEdge) => nodesById.has(e.from) && nodesById.has(e.to) && e.from !== e.to;
  const sortedEdges = [...new Map(edges.filter(known).map((e) => [edgeKey(e), e])).values()].sort((a, b) =>
    byId(edgeKey(a), edgeKey(b)),
  );

  const laidOut: LaidOutIsland[] = clusters(nodes, sortedEdges).map((ids) => {
    const members = new Set(ids);
    const own = reduceEdges(sortedEdges.filter((e) => members.has(e.from) && members.has(e.to)));
    const titled = islandTitle(ids, nodesById, courseCodes);
    return { id: ids[0], ...titled, ...widenForTitle(layoutIsland(ids, own), titled.title) };
  });

  const maxRowWidth = options.maxRowWidth ?? Math.max(2400, ...laidOut.map((i) => i.width));

  const groupSize = new Map<string, number>();
  for (const i of laidOut) groupSize.set(i.key, (groupSize.get(i.key) ?? 0) + i.nodes.length);
  laidOut.sort(
    (a, b) =>
      (groupSize.get(b.key) ?? 0) - (groupSize.get(a.key) ?? 0) ||
      byId(a.key, b.key) ||
      b.nodes.length - a.nodes.length ||
      byId(a.title, b.title) ||
      byId(a.id, b.id),
  );

  const islands: MapIsland[] = [];
  const positions: Record<string, { x: number; y: number }> = {};
  const islandOf: Record<string, string> = {};
  const drawn: GraphEdge[] = [];
  const routes: Record<string, { x: number; y: number }[]> = {};
  let x = 0;
  let rowTop = 0;
  let rowHeight = 0;
  for (const island of laidOut) {
    if (x > 0 && x + island.width > maxRowWidth) {
      x = 0;
      rowTop += rowHeight + ISLAND_GAP;
      rowHeight = 0;
    }
    const top = rowTop + TITLE_HEIGHT;
    islands.push({
      id: island.id,
      title: island.title,
      key: island.key,
      nodes: island.nodes,
      x,
      y: top,
      width: island.width,
      height: island.height,
    });
    for (const id of island.nodes) {
      const p = island.local.get(id) as { x: number; y: number };
      positions[id] = { x: x + p.x, y: top + p.y };
      islandOf[id] = island.id;
    }
    drawn.push(...island.edges);
    for (const [key, route] of island.localRoutes) routes[key] = route.map((pt) => ({ x: x + pt.x, y: top + pt.y }));
    x += island.width + ISLAND_GAP;
    rowHeight = Math.max(rowHeight, TITLE_HEIGHT + island.height);
  }

  return {
    width: islands.length === 0 ? 0 : Math.max(...islands.map((i) => i.x + i.width)),
    height: islands.length === 0 ? 0 : Math.max(...islands.map((i) => i.y + i.height)),
    titleHeight: TITLE_HEIGHT,
    islands,
    positions,
    islandOf,
    edges: drawn,
    routes,
  };
}

type Point = { x: number; y: number };

const orient = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));

/**
 * How many pairs of edges cross, drawn as straight lines between their dots.
 * A pair that shares an end is never counted. The measure phase 1 uses to
 * compare the map with the alphabetical rows it replaces.
 */
export function crossings(edges: readonly GraphEdge[], positions: Readonly<Record<string, Point>>): number {
  const segments = edges
    .map((e) => ({ e, a: positions[e.from], b: positions[e.to] }))
    .filter((s): s is { e: GraphEdge; a: Point; b: Point } => s.a !== undefined && s.b !== undefined);
  let count = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i];
      const t = segments[j];
      if (s.e.from === t.e.from || s.e.from === t.e.to || s.e.to === t.e.from || s.e.to === t.e.to) continue;
      const d1 = orient(s.a, s.b, t.a);
      const d2 = orient(s.a, s.b, t.b);
      const d3 = orient(t.a, t.b, s.a);
      const d4 = orient(t.a, t.b, s.b);
      if (d1 * d2 < 0 && d3 * d4 < 0) count++;
    }
  }
  return count;
}

/** The inputs the layout depends on: not mastery, not titles of concepts. */
function layoutKey(nodes: readonly GraphNode[], edges: readonly GraphEdge[], options: MapOptions): string {
  const ns = nodes
    .map((n) => [n.id, [...n.courses].sort().join(","), n.domain ?? ""].join("\u0001"))
    .sort(byId)
    .join("\u0002");
  const es = edges.map(edgeKey).sort(byId).join("\u0002");
  const codes = Object.entries(options.courseCodes ?? {})
    .sort(([a], [b]) => byId(a, b))
    .map(([slug, code]) => `${slug}=${code}`)
    .join(",");
  return `${ns}\u0003${es}\u0003${codes}\u0003${options.maxRowWidth ?? ""}`;
}

const CACHE_SIZE = 8;
const cache = new Map<string, MapLayout>();

/**
 * `mapLayout`, remembered per graph. The Learn page asks on every request and
 * the graph changes only when a note or a course does, so most requests get
 * the layout they got last time instead of paying for it again. Mastery is
 * not part of the key: the map's colours come from the nodes the page passes
 * to the client, never from the layout. A few graphs are kept, one per owner
 * or per recent change.
 */
export function cachedMapLayout(nodes: readonly GraphNode[], edges: readonly GraphEdge[], options: MapOptions = {}): MapLayout {
  const key = layoutKey(nodes, edges, options);
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const fresh = mapLayout(nodes, edges, options);
  cache.set(key, fresh);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return fresh;
}
