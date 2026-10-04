import type { GraphEdge, GraphNode } from "@/lib/concept-graph";
import type { MapLayout } from "@/lib/concept-map";
import type { GraphScope } from "@/lib/learn-index";

/**
 * The map viewer's arithmetic (phase 2 of docs/proposals/knowledge-map.md,
 * G2). A view is the SVG viewBox in map units; a scale is screen pixels per
 * map unit. Pure, so the browser component stays a thin layer of pointer
 * events over it, and React-free, so a test needs no DOM.
 */

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The farthest out the map zooms: the whole 306-concept map fits a phone with room to spare. */
export const MIN_SCALE = 0.05;
/** The nearest in: labels at a little over twice their size. */
export const MAX_SCALE = 2.5;
/** Below this the concept labels hide and only the island titles stay. */
export const LABELS_MIN_SCALE = 0.55;

/** Half a concept's width and its label's depth, so a fitted box shows the words too. */
const NODE_HALF_WIDTH = 60;
const ABOVE_DOT = 18;
const BELOW_DOT = 52;

export function scaleOf(view: View, widthPx: number): number {
  return widthPx / view.w;
}

export function labelsShown(scale: number): boolean {
  return scale >= LABELS_MIN_SCALE;
}


/**
 * Whether an island `widthPx` wide on screen has room for its title. Zoomed
 * out, small islands shrink to a few pixels and their titles would pile on top
 * of each other, so a title shows only over an island it fits.
 */
/**
 * About how wide a title character is at the title's size (14px, bold). The
 * layout sizes islands with it too; it lives here, in a module without dagre,
 * so the browser bundle can read it without taking the layout along.
 */
export const TITLE_CHAR_PX = 8.5;

export function titleFits(widthPx: number, title: string): boolean {
  return widthPx >= title.length * TITLE_CHAR_PX;
}

/**
 * The view that shows `box` with `pad` units around it at the container's
 * aspect (width over height), centred. With `widthPx`, never nearer than
 * `MAX_SCALE`, so one concept does not fill the screen.
 */
export function fitView(box: Box, aspect: number, pad = 40, widthPx?: number): View {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  let w = Math.max(box.x1 - box.x0 + pad * 2, (box.y1 - box.y0 + pad * 2) * aspect, 1);
  if (widthPx !== undefined) w = Math.max(w, widthPx / MAX_SCALE);
  const h = w / aspect;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Zoom by `factor` (under 1 is nearer), keeping the map point `at` under the pointer. */
export function zoomView(view: View, factor: number, at: { x: number; y: number }, widthPx: number): View {
  const w = Math.min(widthPx / MIN_SCALE, Math.max(widthPx / MAX_SCALE, view.w * factor));
  const r = w / view.w;
  return { x: at.x - (at.x - view.x) * r, y: at.y - (at.y - view.y) * r, w, h: view.h * r };
}

/** Move the view so the map follows a pointer that moved `dx`, `dy` screen pixels. */
export function panView(view: View, dx: number, dy: number, widthPx: number): View {
  const k = view.w / widthPx;
  return { ...view, x: view.x - dx * k, y: view.y - dy * k };
}

const union = (boxes: Box[]): Box => ({
  x0: Math.min(...boxes.map((b) => b.x0)),
  y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)),
  y1: Math.max(...boxes.map((b) => b.y1)),
});

/**
 * The part of the map a scope fits to, for the selected concept:
 * - `island`: its island, title band included;
 * - `course`: every island holding a concept of its course (its island alone
 *   when it is in no course);
 * - `neighbourhood`: it, what it needs and what needs it, labels included;
 * - `all`, or no selection, or one the map does not hold: the whole map.
 */
export function scopeBox(
  layout: MapLayout,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  scope: GraphScope | "all",
  selected: string | null,
): Box {
  const all = { x0: 0, y0: 0, x1: layout.width, y1: layout.height };
  if (scope === "all" || selected === null || layout.positions[selected] === undefined) return all;
  const islandBox = (id: string): Box => {
    const i = layout.islands.find((island) => island.id === id);
    return i === undefined ? all : { x0: i.x, y0: i.y - layout.titleHeight, x1: i.x + i.width, y1: i.y + i.height };
  };
  const own = islandBox(layout.islandOf[selected]);
  if (scope === "island") return own;
  if (scope === "course") {
    const courses = new Set(nodes.find((n) => n.id === selected)?.courses ?? []);
    if (courses.size === 0) return own;
    const islands = new Set(nodes.filter((n) => n.courses.some((c) => courses.has(c))).map((n) => layout.islandOf[n.id]));
    return union([...islands].filter((id) => id !== undefined).map(islandBox));
  }
  const ids = new Set([selected]);
  for (const e of edges) {
    if (e.from === selected) ids.add(e.to);
    if (e.to === selected) ids.add(e.from);
  }
  const points = [...ids].map((id) => layout.positions[id]).filter((p) => p !== undefined);
  return {
    x0: Math.min(...points.map((p) => p.x)) - NODE_HALF_WIDTH,
    y0: Math.min(...points.map((p) => p.y)) - ABOVE_DOT,
    x1: Math.max(...points.map((p) => p.x)) + NODE_HALF_WIDTH,
    y1: Math.max(...points.map((p) => p.y)) + BELOW_DOT,
  };
}
