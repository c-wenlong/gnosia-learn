"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/classes";
import { wrapLabel, type GraphEdge, type GraphNode } from "@/lib/concept-graph";
import type { MapLayout } from "@/lib/concept-map";
import type { GraphScope } from "@/lib/learn-index";
import { fitView, labelsShown, panView, scaleOf, scopeBox, titleFits, zoomView, type View } from "@/lib/map-viewport";
import { arcLength } from "@/lib/map-reading";
import { MASTERY_BUCKET_LABEL, type MasteryBucket } from "@/lib/mastery-bucket";

/**
 * The whole prerequisite graph as islands (docs/proposals/knowledge-map.md).
 * The layout arrives from the server (`mapLayout`, phase 1); this draws it with
 * the same dots, lines and tokens as `ConceptGraph`, and makes it a map you
 * move around (phase 2, G2): drag or two fingers to pan, the wheel or a pinch
 * to zoom about the pointer, buttons to zoom and to fit.
 *
 * A pan or a wheel zoom writes the SVG's `viewBox` straight to the DOM, every
 * frame, and tells React once the pointer rests, so 306 concepts are not
 * re-rendered sixty times a second. `data-fit` names the last fit
 * (`island`, `course`, `neighbourhood` or `all`, empty after a manual move) and
 * `data-labels` whether the concept labels show; the e2e walk reads both.
 */

const DOT: Record<MasteryBucket, string> = {
  mastered: "fill-m-hi stroke-m-hi",
  learning: "fill-m-mid stroke-m-hi",
  untouched: "fill-surface stroke-m-lo",
};

const LABEL_LINE = 14;
const TITLE_SIZE = 14;
/** The shape the server draws the first frame at, before the browser can measure the box. */
const ASSUMED = { width: 1000, height: 560 };
/** A pointer that moves less than this is a click, not a drag. */
const DRAG_SLOP = 4;
const BUTTON_ZOOM = 0.7;
const SCOPES: { key: GraphScope; label: string }[] = [
  { key: "neighbourhood", label: "Neighbourhood" },
  { key: "island", label: "Island" },
  { key: "course", label: "Course" },
];

type Fit = GraphScope | "all" | "";

/** What a concept carries on the map beyond its bucket (G4, G5). */
export interface MapMark {
  ready: boolean;
  overdue: boolean;
  leech: boolean;
}

/** A request from outside to move the map: fit a scope, or centre the selected concept at the present zoom. */
export interface FitRequest {
  to: GraphScope | "center";
  /** A new number asks again, even for the same target. */
  n: number;
}

const ARC_RADIUS = 12;

const routeKey = (e: { from: string; to: string; kind: string }) => `${e.from}>${e.to}>${e.kind}`;

/**
 * A smooth line through a route: a cubic between two points, otherwise a
 * quadratic bend at each point between, through the midpoints, into the last.
 */
function routePath(points: readonly { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  if (rest.length === 1) {
    const last = rest[0];
    const mid = (first.y + last.y) / 2;
    return `${d} C ${first.x} ${mid}, ${last.x} ${mid}, ${last.x} ${last.y}`;
  }
  for (let i = 0; i < rest.length - 1; i++) {
    const p = rest[i];
    const next = rest[i + 1];
    const end = i === rest.length - 2 ? next : { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 };
    d += ` Q ${p.x} ${p.y}, ${end.x} ${end.y}`;
  }
  return d;
}

const viewBoxOf = (v: View) => `${v.x} ${v.y} ${v.w} ${v.h}`;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ConceptMap({
  layout,
  nodes,
  edges,
  selected,
  onSelect,
  scope,
  onScope,
  dimmed,
  marks,
  fitRequest = null,
  className,
}: {
  layout: MapLayout;
  nodes: GraphNode[];
  /** Every edge, for the neighbourhood fit; the map draws `layout.edges`. */
  edges: GraphEdge[];
  selected: string | null;
  onSelect: (id: string) => void;
  scope: GraphScope;
  onScope: (scope: GraphScope) => void;
  /** Concepts the filter or the search leaves out, drawn faint rather than removed. */
  dimmed?: ReadonlySet<string>;
  marks?: Readonly<Record<string, MapMark>>;
  fitRequest?: FitRequest | null;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const boxOf = useCallback(
    (to: GraphScope | "all") => scopeBox(layout, nodes, edges, to, selected),
    [layout, nodes, edges, selected],
  );
  const [view, setView] = useState<View>(() => fitView(boxOf(scope), ASSUMED.width / ASSUMED.height, 40, ASSUMED.width));
  const [boxWidth, setBoxWidth] = useState(ASSUMED.width);
  const [fit, setFit] = useState<Fit>(scope);
  const live = useRef(view);
  const commitTimer = useRef<number | undefined>(undefined);
  const animation = useRef<number | undefined>(undefined);

  const widthPx = () => svgRef.current?.clientWidth || ASSUMED.width;
  const aspect = () => {
    const el = svgRef.current;
    return el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : ASSUMED.width / ASSUMED.height;
  };

  /** Write a view to the DOM now; React hears of it when the pointer rests. */
  const paint = useCallback((v: View) => {
    live.current = v;
    const el = svgRef.current;
    if (el === null) return;
    const scale = scaleOf(v, el.clientWidth || ASSUMED.width);
    el.setAttribute("viewBox", viewBoxOf(v));
    el.dataset.labels = labelsShown(scale) ? "shown" : "hidden";
    el.style.setProperty("--map-title-size", `${TITLE_SIZE / scale}px`);
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => setView(v), 120);
  }, []);

  const animateTo = useCallback(
    (target: View) => {
      if (animation.current !== undefined) cancelAnimationFrame(animation.current);
      const from = live.current;
      if (reducedMotion()) {
        paint(target);
        return;
      }
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / 280);
        const e = 1 - (1 - t) ** 3;
        paint({
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          w: from.w + (target.w - from.w) * e,
          h: from.h + (target.h - from.h) * e,
        });
        animation.current = t < 1 ? requestAnimationFrame(step) : undefined;
      };
      animation.current = requestAnimationFrame(step);
    },
    [paint],
  );

  const fitTo = useCallback(
    (to: GraphScope | "all", animate = true) => {
      const target = fitView(boxOf(to), aspect(), 40, widthPx());
      setFit(to);
      if (animate) animateTo(target);
      else paint(target);
    },
    [boxOf, animateTo, paint],
  );

  const centerOn = useCallback(
    (id: string | null) => {
      const p = id === null ? undefined : layout.positions[id];
      if (p === undefined) return;
      const v = live.current;
      setFit("");
      animateTo({ ...v, x: p.x - v.w / 2, y: p.y - v.h / 2 });
    },
    [layout, animateTo],
  );

  // The first frame was drawn at an assumed shape; fit again at the real one,
  // and keep the scale and centre when the box is resized.
  const fitRef = useRef(fitTo);
  const scopeRef = useRef(scope);
  const centerRef = useRef(centerOn);
  const selectedRef = useRef(selected);
  useEffect(() => {
    fitRef.current = fitTo;
    scopeRef.current = scope;
    centerRef.current = centerOn;
    selectedRef.current = selected;
  });
  // Declared after the refs are brought up to date, so a request made with a
  // new selection fits that selection.
  useEffect(() => {
    if (fitRequest === null) return;
    if (fitRequest.to === "center") centerRef.current(selectedRef.current);
    else fitRef.current(fitRequest.to);
  }, [fitRequest]);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (el === null) return;
    setBoxWidth(el.clientWidth || ASSUMED.width);
    fitRef.current(scopeRef.current, false);
    if (typeof ResizeObserver === "undefined") return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === 0 || (el.clientWidth === last.w && el.clientHeight === last.h)) return;
      const v = live.current;
      const w = v.w * (el.clientWidth / (last.w || el.clientWidth));
      const h = w / aspect();
      last = { w: el.clientWidth, h: el.clientHeight };
      setBoxWidth(el.clientWidth);
      paint({ x: v.x + v.w / 2 - w / 2, y: v.y + v.h / 2 - h / 2, w, h });
    });
    observer.observe(el);
    return () => observer.disconnect();
    // Once: later fits come from the controls, never from a selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(commitTimer.current);
      if (animation.current !== undefined) cancelAnimationFrame(animation.current);
    },
    [],
  );

  const toMap = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current as SVGSVGElement;
    const r = el.getBoundingClientRect();
    const v = live.current;
    return { x: v.x + ((clientX - r.left) / r.width) * v.w, y: v.y + ((clientY - r.top) / r.height) * v.h };
  }, []);

  // The wheel needs a listener that may call preventDefault, which React's is not.
  useEffect(() => {
    const el = svgRef.current;
    if (el === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (animation.current !== undefined) cancelAnimationFrame(animation.current);
      // A trackpad pinch arrives as a wheel with ctrlKey and small deltas.
      const factor = Math.exp(event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      setFit("");
      paint(zoomView(live.current, factor, toMap(event.clientX, event.clientY), el.clientWidth || ASSUMED.width));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [paint, toMap]);

  // Pointers: one drags, two pinch. A press that never moves past the slop is
  // left alone, so it reaches the concept under it as a click.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, startX: 0, startY: 0, distance: 0 });
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: false, startX: event.clientX, startY: event.clientY, distance: 0 };
    else gesture.current.distance = spread();
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (previous === undefined) return;
    const g = gesture.current;
    const far = Math.hypot(event.clientX - g.startX, event.clientY - g.startY) >= DRAG_SLOP;
    if (!g.moved && !far && pointers.current.size === 1) return;
    if (!g.moved) {
      g.moved = true;
      if (animation.current !== undefined) cancelAnimationFrame(animation.current);
      setFit("");
      svgRef.current?.setPointerCapture(event.pointerId);
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const width = svgRef.current?.clientWidth || ASSUMED.width;
    if (pointers.current.size >= 2) {
      const now = spread();
      if (g.distance > 0 && now > 0) {
        const [a, b] = [...pointers.current.values()];
        paint(zoomView(live.current, g.distance / now, toMap((a.x + b.x) / 2, (a.y + b.y) / 2), width));
      }
      g.distance = now;
      return;
    }
    paint(panView(live.current, event.clientX - previous.x, event.clientY - previous.y, width));
  };
  const onPointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current.distance = 0;
  };
  // A drag that ends over a concept must not select it.
  const onClickCapture = (event: React.MouseEvent) => {
    if (gesture.current.moved) {
      event.stopPropagation();
      gesture.current.moved = false;
    }
  };

  const zoomBy = (factor: number) => {
    const v = live.current;
    setFit("");
    animateTo(zoomView(v, factor, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, widthPx()));
  };

  const chooseScope = (next: GraphScope) => {
    onScope(next);
    fitTo(next);
  };

  if (layout.islands.length === 0) return <p className={cx("text-[13px] text-text3", className)}>Nothing to draw.</p>;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const labels = new Map(nodes.map((n) => [n.id, wrapLabel(n.title)]));
  const count = Object.keys(layout.positions).length;
  const scale = scaleOf(view, boxWidth);
  const selectedIsland = selected === null ? null : (layout.islandOf[selected] ?? null);
  const related = new Set<string>();
  if (selected !== null) {
    for (const e of edges) {
      if (e.from === selected) related.add(e.to);
      if (e.to === selected) related.add(e.from);
    }
  }

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex gap-1.5" role="group" aria-label="Map scope">
          {SCOPES.map((s) => (
            <Chip key={s.key} size="sm" active={fit === s.key} onClick={() => chooseScope(s.key)}>
              {s.label}
            </Chip>
          ))}
        </span>
        <Chip size="sm" active={fit === "all"} onClick={() => fitTo("all")}>
          Fit all
        </Chip>
      </div>
      <div className="relative overflow-hidden rounded-xl bg-surface2">
        <svg
          ref={svgRef}
          viewBox={viewBoxOf(view)}
          role="group"
          aria-label={`Concept map, ${count} concept${count === 1 ? "" : "s"} in ${layout.islands.length} island${layout.islands.length === 1 ? "" : "s"}`}
          data-fit={fit}
          data-labels={labelsShown(scale) ? "shown" : "hidden"}
          data-map-width={layout.width}
          className="group block h-[min(70vh,640px)] min-h-[360px] w-full cursor-grab touch-none select-none active:cursor-grabbing"
          style={{ ["--map-title-size" as string]: `${TITLE_SIZE / scale}px` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={onClickCapture}
        >
          {layout.islands.map((i) => (
            <g key={i.id} data-island={i.id}>
              <title>{i.title}</title>
              <rect x={i.x} y={i.y} width={i.width} height={i.height} rx={16} className="fill-surface stroke-hair" strokeWidth={1} />
              <text
                data-island-title
                x={i.x + 4}
                y={i.y - 10}
                fontWeight={700}
                // Zoomed out, a small island's title would sit on its neighbours'; the
                // selected concept's island keeps its title whatever the size.
                className={cx(
                  "fill-text",
                  !titleFits(i.width * scale, i.title) && selectedIsland !== i.id && "hidden",
                )}
                style={{ fontSize: "var(--map-title-size)" }}
              >
                {i.title}
              </text>
            </g>
          ))}

          {layout.edges.map((e) => {
            const route = layout.routes[routeKey(e)];
            if (!route) return null;
            const touches = e.from === selected || e.to === selected;
            const faint = dimmed !== undefined && (dimmed.has(e.from) || dimmed.has(e.to));
            return (
              <path
                key={routeKey(e)}
                d={routePath(route)}
                fill="none"
                className={touches ? "stroke-accent" : faint ? "stroke-text3 opacity-15" : "stroke-text3 opacity-60"}
                strokeWidth={e.kind === "assumes" ? 1 : 1.5}
                strokeDasharray={e.kind === "assumes" ? "4 4" : undefined}
              />
            );
          })}

          {Object.entries(layout.positions).map(([id, p]) => {
            const n = byId.get(id);
            if (n === undefined) return null;
            const isFocus = id === selected;
            const lines = labels.get(id) ?? [n.title];
            const mark = marks?.[id];
            const dim = dimmed?.has(id) ?? false;
            const arc = arcLength(n, ARC_RADIUS);
            const caption = [
              n.title,
              MASTERY_BUCKET_LABEL[n.bucket],
              n.bucket === "untouched" ? null : `p(L) ${n.pL.toFixed(2)}`,
              mark?.ready ? "ready to learn" : null,
              mark?.overdue ? "review overdue" : null,
              mark?.leech ? "keeps slipping" : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <g
                key={id}
                data-concept={id}
                data-courses={n.courses.join(",")}
                data-dim={dim}
                data-related={related.has(id)}
                data-ready={mark?.ready ?? false}
                data-overdue={mark?.overdue ?? false}
                data-leech={mark?.leech ?? false}
                role="button"
                tabIndex={0}
                aria-label={caption}
                aria-pressed={isFocus}
                className={cx(
                  "cursor-pointer outline-none transition-opacity duration-150 [&:focus-visible>circle[data-dot]]:stroke-accent",
                  dim && "opacity-20",
                )}
                onClick={() => onSelect(id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(id);
                  }
                }}
              >
                <title>{caption}</title>
                {mark?.ready && (
                  <circle cx={p.x} cy={p.y} r={15} fill="none" className="stroke-accent" strokeWidth={1.5} strokeDasharray="3 2" />
                )}
                {mark?.leech && <circle cx={p.x} cy={p.y} r={18} fill="none" className="stroke-danger" strokeWidth={1.5} />}
                {isFocus && <circle cx={p.x} cy={p.y} r={16} fill="none" className="stroke-accent" strokeWidth={2.5} />}
                {arc > 0 && (
                  <circle
                    data-arc
                    cx={p.x}
                    cy={p.y}
                    r={ARC_RADIUS}
                    fill="none"
                    className="stroke-m-hi"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeDasharray={`${arc} ${2 * Math.PI * ARC_RADIUS}`}
                    transform={`rotate(-90 ${p.x} ${p.y})`}
                  />
                )}
                <circle data-dot cx={p.x} cy={p.y} r={isFocus ? 9 : 8} className={DOT[n.bucket]} strokeWidth={2} />
                {mark?.overdue && <circle cx={p.x + 9} cy={p.y - 9} r={3.5} className="fill-danger" />}
                {lines.map((line, k) => (
                  <text
                    key={k}
                    x={p.x}
                    y={p.y + 30 + k * LABEL_LINE}
                    textAnchor="middle"
                    fontSize={11.5}
                    fontWeight={isFocus ? 700 : 500}
                    className={cx("group-data-[labels=hidden]:hidden", isFocus ? "fill-text" : "fill-text2")}
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          <Button variant="secondary" size="sm" aria-label="Zoom in" onClick={() => zoomBy(BUTTON_ZOOM)}>
            +
          </Button>
          <Button variant="secondary" size="sm" aria-label="Zoom out" onClick={() => zoomBy(1 / BUTTON_ZOOM)}>
            −
          </Button>
        </div>
      </div>
    </div>
  );
}
