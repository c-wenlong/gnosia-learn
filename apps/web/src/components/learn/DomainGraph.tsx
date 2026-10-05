"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";

import { cx } from "@/components/ui/classes";
import { wrapLabel, type GraphEdge } from "@/lib/concept-graph";
import type { DomainLayout } from "@/lib/domain-map";
import {
  AXES_CAPTIONS,
  axesCaptions,
  axesGeometry,
  axesViewBox,
  cullLabels,
  edgeEnds,
  fitTitle,
  GLIDE_MS,
  glideEase,
  groupBox,
  labelBaseline,
  labelBox,
  labelFont,
  labelFoot,
  labelRank,
  MIN_DRAW_SCALE,
  mixBox,
  mixPoint,
  neighbours,
  NODE_HALF_WIDTH,
  sideCaptionX,
  textEm,
  TITLE_INSET,
  titleBand,
  titleBaseline,
  titleBox,
  titleFont,
  titleRoom,
  titleWidth,
  toLayoutPoint,
  viewBoxFor,
  type Box,
  type LabelItem,
} from "@/lib/domain-view";
import type { MapLayout } from "@/lib/learn-index";
import { arcLength } from "@/lib/map-reading";
import { MASTERY_BUCKET_LABEL, type MasteryBucket } from "@/lib/mastery-bucket";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * One domain, or one of its topics, as a bounded picture (D3 of
 * docs/proposals/domain-map.md): a rounded group per topic, the concepts in
 * it, and the domain's own edges as straight lines between the dots. The
 * layout arrives from the server; this draws it at the width of its card,
 * and the page scrolls when it is tall. There is no pan and no zoom.
 *
 * Or on axes (D11): each concept by when it is learnt (its layer) and by how
 * many concepts need it, the server's second layout. Switching glides every
 * concept from one place to the other while the topic boxes and the axes
 * fade out and in. Nothing drags on the axes, where a place means something.
 */

export interface DomainGraphNode {
  id: string;
  title: string;
  bucket: MasteryBucket;
  pL: number;
}

/** What a concept carries beyond its bucket: ready to learn, a review overdue, one that keeps slipping. */
export interface MapMark {
  ready: boolean;
  overdue: boolean;
  leech: boolean;
}

const DOT: Record<MasteryBucket, string> = {
  mastered: "fill-m-hi stroke-m-hi",
  learning: "fill-m-mid stroke-m-hi",
  untouched: "fill-surface stroke-m-lo",
};

const ARC_RADIUS = 12;
const LABEL_CHARS = 15;
/** Small domains are not blown up past this, or one topic would fill the screen. */
const MAX_SCALE = 1.15;

/** A pointer that moves less than this is a press, not a drag. */
const DRAG_SLOP = 4;

type Point = { x: number; y: number };

export function DomainGraph({
  layout,
  title,
  nodes,
  topic,
  selected,
  dimmed,
  marks,
  hover,
  hoverTopic,
  preview = null,
  moved,
  onSelect,
  onTopic,
  onHover,
  onHoverTopic,
  onMove,
  onMoveEnd,
  locked = false,
  arrangement = "groups",
}: {
  layout: DomainLayout;
  /** The domain's title, for the accessible name. */
  title: string;
  nodes: ReadonlyMap<string, DomainGraphNode>;
  /** The open topic, or null for the whole domain. */
  topic: string | null;
  selected: string | null;
  dimmed: ReadonlySet<string>;
  marks: Readonly<Record<string, MapMark>>;
  /** The concept under the pointer or the list's focus (D5), and the topic whose title is. */
  hover: string | null;
  hoverTopic: string | null;
  /** The concepts a legend chip previews (D9), kept lit as a topic's group is. */
  preview?: ReadonlySet<string> | null;
  /** Concepts dragged from where the layout put them (D6). */
  moved: Readonly<Record<string, Point>>;
  onSelect: (id: string) => void;
  onTopic: (topic: string) => void;
  onHover: (id: string | null) => void;
  onHoverTopic: (topic: string | null) => void;
  onMove: (id: string, to: Point) => void;
  onMoveEnd: () => void;
  /** Reset is gliding the concepts home: no drag starts until it is done. */
  locked?: boolean;
  /** Groups or axes (D11). A topic is only ever drawn in groups. */
  arrangement?: MapLayout;
}) {
  const groups = topic === null ? layout.groups : layout.groups.filter((g) => g.topic === topic);
  const shown = new Set(groups.flatMap((g) => g.concepts));
  const edges = layout.edges.filter((e) => shown.has(e.from) && shown.has(e.to));
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ id: string; start: Point; from: Point; moving: boolean; view: Box; pointer: number } | null>(null);
  /** The frame a drag started in, held while it lasts so the picture does not rescale under the pointer. */
  const [frozen, setFrozen] = useState<Box | null>(null);
  /** Set when a drag ends, so the click the browser sends after it does not select. */
  const dragged = useRef(false);
  const count = shown.size;
  const onAxes = arrangement === "axes" && topic === null;
  const concepts = `${count} concept${count === 1 ? "" : "s"}`;
  const label = onAxes
    ? `${title} map, ${concepts} by when they are learnt and how many concepts need them, the most needed at the top left`
    : `${title} map, ${concepts} in ${groups.length} topic${groups.length === 1 ? "" : "s"}`;
  // How far the picture is from its groups (0) to its axes (1), gliding between (D11).
  const glide = useGlide(onAxes ? 1 : 0);
  const settled = glide === (onAxes ? 1 : 0);
  /** Where a concept is in groups: dragged there, or where the layout put it. The groups' boxes follow these. */
  const home = (id: string) => moved[id] ?? layout.positions[id];
  const at = (id: string) => (glide === 0 ? home(id) : mixPoint(home(id), layout.axes.positions[id] ?? home(id), glide));
  const topicOf = new Map(groups.flatMap((g) => g.concepts.map((id) => [id, g.topic] as const)));
  const lines = (id: string) => wrapLabel(nodes.get(id)?.title ?? id, LABEL_CHARS).length;
  // How wide the picture is drawn, for the labels' size on screen (D10); unknown until measured.
  const [drawn, setDrawn] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = svg.current;
    if (el === null) return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      setDrawn(width > 0 ? width : null);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // The frame's width does not depend on the title band, so the scale is measured from it before the band is known.
  // On the way to the axes the width glides with the rest of the frame.
  // A drag holds the frame still, in groups only: on the axes no drag is under way (it ends at the switch).
  const held = onAxes ? null : frozen;
  const frameWidth = (held ?? viewBoxFor(layout, topic, moved)).width * (1 - glide) + axesViewBox(layout.axes).width * glide;
  const scale = drawn === null ? 1 : drawn / frameWidth;
  const font = labelFont(scale);
  // A topic's title keeps 11px on screen too (D10), and its group's band grows upward to hold it.
  const heading = titleFont(scale);
  const band = titleBand(heading);
  const boxOf = (g: { concepts: readonly string[]; title: string }) => groupBox(g.concepts.map(home), titleWidth(g.title), band);
  // The frame holds still while a concept is being dragged, and takes in where it was left afterwards.
  const fit = viewBoxFor(layout, topic, moved, band);
  // A label drawn larger than the layout's size reaches further below its dot, so the frame grows to hold the bottom row's.
  const live = { ...fit, height: fit.height + Math.max(0, labelFoot(2, font) - labelFoot(2)) };
  const axes = axesGeometry(layout.axes, scale);
  const view = held ?? mixBox(live, axesViewBox(layout.axes, scale), glide);
  // What stays lit (D5, D9): a concept and its neighbours, a topic's group, or a legend chip's.
  const keep =
    hover !== null && shown.has(hover)
      ? neighbours(edges, hover)
      : hoverTopic !== null
        ? new Set(groups.find((g) => g.topic === hoverTopic)?.concepts ?? [])
        : preview;
  const hot = (e: GraphEdge) => hover !== null && (e.from === hover || e.to === hover);
  // Which labels are drawn (D10): placed in priority order, skipping any that would collide.
  // Not memoised: every render that reaches here (a hover, a drag frame, a selection) changes
  // its inputs, and the pass is a few thousand box tests for the largest domain.
  const labelled = (() => {
    const dependants = new Map<string, number>();
    for (const e of edges) dependants.set(e.from, (dependants.get(e.from) ?? 0) + 1);
    const items: LabelItem[] = [];
    for (const id of shown) {
      const n = nodes.get(id);
      const p = at(id);
      if (n === undefined || p === undefined) continue;
      const wrapped = wrapLabel(n.title, LABEL_CHARS);
      items.push({
        id,
        x: p.x,
        y: p.y,
        lines: wrapped.length,
        em: Math.max(0, ...wrapped.map((l) => textEm(l, id === selected))),
        rank: labelRank({
          hover: id === hover,
          selected: id === selected,
          related: id !== hover && keep !== null && keep.has(id),
          bucket: n.bucket,
          ready: marks[id]?.ready ?? false,
        }),
        dependants: dependants.get(id) ?? 0,
      });
    }
    // A topic's title stays clear of labels: the box it is drawn in, at its size, in the band above its concepts.
    // On the axes there are no titles, and the captions are kept clear instead.
    const titles = onAxes ? axesCaptions(layout.axes, axes.caption) : groups.map((g) => titleBox(boxOf(g), g.title, heading));
    return cullLabels(items, scale, titles, view);
  })();
  /** Lines of label drawn under a concept: none when its label is culled, so its edges run to the dot. */
  const drawnLines = (id: string) => (labelled.has(id) ? lines(id) : 0);
  const plate = hover !== null && shown.has(hover) ? nodes.get(hover) : undefined;

  const pointerAt = (event: { clientX: number; clientY: number }, frame: Box) =>
    svg.current === null ? { x: 0, y: 0 } : toLayoutPoint(event.clientX, event.clientY, svg.current.getBoundingClientRect(), frame);

  const edge = (e: GraphEdge) => (
    <Edge
      key={`${e.from}>${e.to}>${e.kind}`}
      edge={e}
      ends={edgeEnds(at(e.from), at(e.to), drawnLines(e.from), drawnLines(e.to), font)}
      faint={dimmed.has(e.from) || dimmed.has(e.to)}
      across={topicOf.get(e.from) !== topicOf.get(e.to)}
      soft={onAxes}
      hot={hot(e)}
      quiet={keep !== null && !hot(e) && !(hover === null && keep.has(e.from) && keep.has(e.to))}
    />
  );

  return (
    // Scrolls sideways only on a phone, where the picture would otherwise shrink past reading.
    <div className="overflow-x-auto">
      <svg
        ref={svg}
        data-domain-graph
        data-topic={topic ?? ""}
        data-hover={hover ?? ""}
        role="group"
        aria-label={label}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        className="mx-auto block h-auto w-full select-none"
        style={{ maxWidth: view.width * MAX_SCALE, minWidth: view.width * MIN_DRAW_SCALE }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (d === null) return;
          // No button down: the press was released outside the picture, before it became a drag.
          // Or the picture went to the axes while the pointer was down: the drag ends where it had got to.
          if (event.buttons === 0 || onAxes) {
            drag.current = null;
            if (d.moving) {
              setFrozen(null);
              // The click the release sends is the drag's, not a press to select.
              if (onAxes) dragged.current = true;
              onMoveEnd();
            }
            return;
          }
          const p = pointerAt(event, d.view);
          const dx = p.x - d.from.x;
          const dy = p.y - d.from.y;
          if (!d.moving && Math.hypot(dx, dy) < DRAG_SLOP) return;
          if (!d.moving) {
            setFrozen(d.view);
            // Captured only once it is a drag: a captured pointer's click goes to the svg,
            // so capturing on press would stop a plain press from selecting.
            try {
              svg.current?.setPointerCapture(d.pointer);
            } catch {
              // A synthetic pointer has no capture to take; the drag still follows the svg's own events.
            }
          }
          d.moving = true;
          onMove(d.id, { x: Math.round(d.start.x + dx), y: Math.round(d.start.y + dy) });
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          setFrozen(null);
          if (d?.moving) {
            dragged.current = true;
            onMoveEnd();
          }
        }}
        onPointerCancel={() => {
          if (drag.current?.moving) onMoveEnd();
          drag.current = null;
          setFrozen(null);
        }}
      >
        {/* The topic boxes: faded out, and out of reach, on the axes (D11). */}
        <g
          data-groups
          aria-hidden={onAxes ? true : undefined}
          className={cx(
            "transition-opacity duration-[400ms] ease-soft motion-reduce:transition-none",
            onAxes ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
        {groups.map((g) => {
          const box = boxOf(g);
          const lit = hoverTopic === g.topic;
          return (
            <g key={g.topic} data-group={g.topic}>
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                rx={14}
                className={cx("fill-surface2 transition-[stroke] duration-150 motion-reduce:transition-none", lit ? "stroke-accent" : "stroke-hair")}
                strokeWidth={lit ? 1.5 : 1}
              />
              <text
                data-topic-title={g.topic}
                // A pointer's shortcut: the list's topic buttons are the keyboard's (D7).
                aria-hidden="true"
                x={box.x + TITLE_INSET}
                y={box.y + titleBaseline(heading)}
                fontSize={heading}
                fontWeight={700}
                className={cx(
                  "outline-none transition-[fill] duration-150 motion-reduce:transition-none",
                  lit ? "fill-text" : "fill-text2",
                  topic === null && "cursor-pointer",
                )}
                onClick={() => onTopic(g.topic)}
                onMouseEnter={() => onHoverTopic(g.topic)}
                onMouseLeave={() => onHoverTopic(null)}
              >
                {/* The whole title, for a pointer resting on one cut short; the list beside the picture names it too. */}
                <title>{g.title}</title>
                {fitTitle(g.title, heading, titleRoom(box))}
              </text>
            </g>
          );
        })}
        </g>
        {topic === null && <Axes layout={layout} geometry={axes} on={onAxes} />}
        {edges.filter((e) => !hot(e)).map(edge)}
        {/* The lit edges go on top, so a faded one never crosses them. */}
        {edges.filter(hot).map(edge)}
        {[...shown].map((id) => {
          const n = nodes.get(id);
          const p = at(id);
          if (n === undefined || p === undefined) return null;
          return (
            <Concept
              key={id}
              node={n}
              x={p.x}
              y={p.y}
              selected={id === selected}
              dim={dimmed.has(id)}
              mark={marks[id]}
              font={font}
              frame={view}
              labelled={labelled.has(id)}
              draggable={!onAxes}
              light={id === hover ? "hover" : keep === null ? null : keep.has(id) ? "related" : "faded"}
              onSelect={(c) => {
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                onSelect(c);
              }}
              onHover={onHover}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                // A new press is not the end of an old drag, even where it cannot drag itself.
                dragged.current = false;
                // On the axes a place means something, and while gliding it is on its way: neither drags.
                if (locked || onAxes || !settled) return;
                const frame = live;
                drag.current = { id, start: p, from: pointerAt(event, frame), moving: false, view: frame, pointer: event.pointerId };
              }}
            />
          );
        })}
        {plate !== undefined && <Plate node={plate} at={at(plate.id)} lines={lines(plate.id)} font={font} frame={view} />}
      </svg>
    </div>
  );
}

/**
 * How far the picture is from its groups (0) to its axes (1). A change of
 * `target` glides there over `GLIDE_MS`, eased, from wherever a glide in
 * progress had got to; with motion reduced it is there at once.
 */
function useGlide(target: 0 | 1): number {
  const [glide, setGlide] = useState<{ target: 0 | 1; t: number }>({ target, t: target });
  let shown = glide.t;
  if (glide.target !== target) {
    // A new target, noticed while rendering: reached at once with motion reduced, else glided to from here.
    const instant = prefersReducedMotion() || typeof requestAnimationFrame === "undefined";
    shown = instant ? target : glide.t;
    setGlide({ target, t: shown });
  }
  /** Where the glide has got to, for the next one to start from. */
  const now = useRef(glide.t);
  const frame = useRef<number | null>(null);
  useLayoutEffect(() => {
    now.current = glide.t;
  }, [glide.t]);
  useLayoutEffect(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const from = now.current;
    if (from === target) return;
    const began = performance.now();
    const step = (time: number) => {
      const k = (time - began) / GLIDE_MS;
      const t = k >= 1 ? target : from + (target - from) * glideEase(k);
      now.current = t;
      setGlide({ target, t });
      frame.current = k >= 1 ? null : requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [target]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return shown;
}

/**
 * The axes (D11): the soft foundational zone at the top left, the two axis
 * lines with their arrows, and the captions, at 11px on screen as a topic's
 * title is. Drawn under the edges and the concepts, and faded out with
 * nothing to press while the picture is in groups.
 */
function Axes({ layout, geometry: g, on }: { layout: DomainLayout; geometry: ReturnType<typeof axesGeometry>; on: boolean }) {
  const { plot, zone } = layout.axes;
  const f = g.caption;
  const arrow = 5;
  const side = sideCaptionX(f);
  return (
    <g
      data-axes
      aria-hidden="true"
      pointerEvents="none"
      className={cx("transition-opacity duration-[400ms] ease-soft motion-reduce:transition-none", on ? "opacity-100" : "opacity-0")}
    >
      {zone !== null && (
        <g data-zone>
          <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx={16} className="fill-tint" />
          <text x={zone.x + TITLE_INSET} y={zone.y + titleBaseline(f)} fontSize={f} fontWeight={700} className="fill-accent">
            {AXES_CAPTIONS.zone}
          </text>
        </g>
      )}
      <g className="stroke-text3" strokeWidth={1} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1={g.left} y1={g.axisY} x2={g.left} y2={g.top} />
        <polyline points={`${g.left - arrow},${g.top + arrow} ${g.left},${g.top} ${g.left + arrow},${g.top + arrow}`} />
        <line x1={g.left} y1={g.axisY} x2={g.right} y2={g.axisY} />
        <polyline points={`${g.right - arrow},${g.axisY - arrow} ${g.right},${g.axisY} ${g.right - arrow},${g.axisY + arrow}`} />
      </g>
      <g fontSize={f} fontWeight={600} className="fill-text2">
        <text x={plot.x} y={g.captionY}>
          {AXES_CAPTIONS.earlier}
        </text>
        <text x={g.right} y={g.captionY} textAnchor="end">
          {AXES_CAPTIONS.later}
        </text>
        <text x={side} y={g.top} textAnchor="end" transform={`rotate(-90 ${side} ${g.top})`}>
          {AXES_CAPTIONS.side}
        </text>
      </g>
    </g>
  );
}

/** The full title of the hovered concept on a plate over its label (D5), since a label is cut at two lines. */
function Plate({ node, at, lines, font, frame }: { node: DomainGraphNode; at: Point; lines: number; font: number; frame: Box }) {
  const width = Math.ceil(textEm(node.title, true) * font + 20);
  // Centred on the dot, and pushed inside the frame as a label is (D10); one wider than the frame is centred on it.
  const left =
    width >= frame.width ? frame.x + (frame.width - width) / 2 : Math.max(frame.x, Math.min(at.x - width / 2, frame.x + frame.width - width));
  const top = at.y + 15;
  // Tall enough to cover the label it replaces, one line or two.
  const height = labelFoot(lines, font) - 15;
  return (
    <g data-plate pointerEvents="none" className="animate-fade-in motion-reduce:animate-none">
      <rect x={left} y={top} width={width} height={height} rx={6} className="fill-surface stroke-hair" strokeWidth={1} />
      <text x={left + width / 2} y={top + height / 2 + font * 0.36} textAnchor="middle" fontSize={font} fontWeight={700} className="fill-text">
        {node.title}
      </text>
    </g>
  );
}

/** An edge between two topics is drawn lighter than one inside a topic, so the groups read first. */
function Edge({
  edge,
  ends: [from, to],
  faint,
  across,
  soft = false,
  hot,
  quiet,
}: {
  edge: GraphEdge;
  ends: [Point, Point];
  faint: boolean;
  across: boolean;
  /** On the axes, with no groups to read first, every edge is drawn as lightly as one between topics. */
  soft?: boolean;
  /** Touches the hovered concept: the accent colour, thicker. */
  hot: boolean;
  /** Something else is hovered: nearly gone. */
  quiet: boolean;
}) {
  return (
    <line
      data-edge={`${edge.from}>${edge.to}`}
      data-across={across}
      data-hot={hot}
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      strokeWidth={hot ? 2 : 1}
      strokeDasharray={edge.kind === "assumes" ? "4 3" : undefined}
      className={cx(
        "transition-opacity duration-150 motion-reduce:transition-none",
        hot ? "stroke-accent" : "stroke-text3",
        hot ? "opacity-100" : quiet ? "opacity-10" : faint ? "opacity-15" : across || soft ? "opacity-30" : "opacity-70",
      )}
    />
  );
}

function Concept({
  node: n,
  x,
  y,
  selected,
  dim,
  mark,
  font,
  frame,
  labelled,
  draggable = true,
  light,
  onSelect,
  onHover,
  onPointerDown,
}: {
  node: DomainGraphNode;
  x: number;
  y: number;
  selected: boolean;
  dim: boolean;
  mark: MapMark | undefined;
  /** The label's size in layout units, so it holds its size on screen (D10). */
  font: number;
  /** The picture's frame, which a label is kept inside. */
  frame: Box;
  /** False when the label is culled (D10): the dot stays, and the name is still the accessible one. */
  labelled: boolean;
  /** False on the axes (D11), where a press selects and nothing drags. */
  draggable?: boolean;
  /** Under hover (D5): the hovered concept, a neighbour kept lit, a concept faded, or nothing hovered. */
  light: "hover" | "related" | "faded" | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onPointerDown: (event: PointerEvent<SVGGElement>) => void;
}) {
  const lines = wrapLabel(n.title, LABEL_CHARS);
  const arc = arcLength(n, ARC_RADIUS);
  const label = labelBox({ x, y, lines: lines.length, em: Math.max(0, ...lines.map((l) => textEm(l, selected))) }, font, frame);
  const labelX = label.x + label.width / 2;
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
      data-concept={n.id}
      data-dim={dim}
      data-ready={mark?.ready ?? false}
      data-overdue={mark?.overdue ?? false}
      data-leech={mark?.leech ?? false}
      data-label={labelled ? "shown" : "hidden"}
      data-hover={light === "hover"}
      data-related={light === "related"}
      data-faded={light === "faded"}
      role="button"
      // The list beside the graph is the keyboard's way in (D7).
      tabIndex={-1}
      aria-label={caption}
      aria-pressed={selected}
      className={cx(
        "outline-none transition-opacity duration-150 motion-reduce:transition-none",
        draggable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer",
        light === "faded" ? "opacity-10" : dim && light === null ? "opacity-20" : undefined,
      )}
      onClick={() => onSelect(n.id)}
      onMouseEnter={() => onHover(n.id)}
      // A move inside the concept counts as the latest input too, so it takes the light back
      // from a row Tabbed to meanwhile; with nothing changed, the state bails out of a render.
      onMouseMove={() => onHover(n.id)}
      onMouseLeave={() => onHover(null)}
      onPointerDown={onPointerDown}
    >
      <title>{caption}</title>
      {/* The whole dot and label take a press, not only the painted strokes: the dot's row, and the
          label's own box when it is drawn, so a wide label never covers the dot beside it. */}
      <rect data-press="dot" x={x - NODE_HALF_WIDTH} y={y - 18} width={NODE_HALF_WIDTH * 2} height={36} fill="transparent" />
      {/* Exactly the box the culling kept clear of other dots, so it never takes another concept's press. */}
      {labelled && (
        <rect data-press="label" x={label.x} y={y + 18} width={label.width} height={label.y + label.height - (y + 18)} fill="transparent" />
      )}
      {/* A knock-out under the dot, so the lines stop short of it rather than running into it. */}
      <circle cx={x} cy={y} r={13} className="fill-surface2" />
      {mark?.ready && <circle cx={x} cy={y} r={15} fill="none" className="stroke-accent" strokeWidth={1.5} strokeDasharray="3 2" />}
      {mark?.leech && <circle cx={x} cy={y} r={18} fill="none" className="stroke-danger" strokeWidth={1.5} />}
      {selected && <circle cx={x} cy={y} r={16} fill="none" className="stroke-accent" strokeWidth={2.5} />}
      {light === "hover" && <circle cx={x} cy={y} r={20} fill="none" className="stroke-accent opacity-40" strokeWidth={3} />}
      {arc > 0 && (
        <circle
          data-arc
          cx={x}
          cy={y}
          r={ARC_RADIUS}
          fill="none"
          className="stroke-m-hi"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${2 * Math.PI * ARC_RADIUS}`}
          transform={`rotate(-90 ${x} ${y})`}
        />
      )}
      <circle data-dot cx={x} cy={y} r={selected ? 9 : 8} className={DOT[n.bucket]} strokeWidth={2} />
      {mark?.overdue && <circle cx={x + 9} cy={y - 9} r={3.5} className="fill-danger" />}
      {lines.map((line, k) => (
        <text
          key={k}
          x={labelX}
          y={y + labelBaseline(font, k)}
          textAnchor="middle"
          fontSize={font}
          fontWeight={selected ? 700 : 500}
          // Culled, it fades out and takes no pointer, so the dot under a neighbour's label stays reachable.
          pointerEvents={labelled ? undefined : "none"}
          // A halo in the group's colour, so a line passing behind a label does not cut through it.
          className={cx(
            "transition-opacity duration-150 motion-reduce:transition-none",
            selected ? "fill-text" : "fill-text2",
            labelled ? "opacity-100" : "opacity-0",
          )}
          strokeWidth={(font * 8) / 25}
          strokeLinejoin="round"
          style={{ paintOrder: "stroke", stroke: "var(--surface2)" }}
        >
          {line}
        </text>
      ))}
    </g>
  );
}
