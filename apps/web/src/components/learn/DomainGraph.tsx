"use client";

import { useRef, useState, type PointerEvent } from "react";

import { cx } from "@/components/ui/classes";
import { wrapLabel, type GraphEdge } from "@/lib/concept-graph";
import type { DomainLayout } from "@/lib/domain-map";
import { edgeEnds, groupBox, neighbours, NODE_HALF_WIDTH, titleWidth, toLayoutPoint, viewBoxFor, type Box } from "@/lib/domain-view";
import { arcLength } from "@/lib/map-reading";
import { MASTERY_BUCKET_LABEL, type MasteryBucket } from "@/lib/mastery-bucket";

/**
 * One domain, or one of its topics, as a bounded picture (D3 of
 * docs/proposals/domain-map.md): a rounded group per topic, the concepts in
 * it, and the domain's own edges as straight lines between the dots. The
 * layout arrives from the server; this draws it at the width of its card,
 * and the page scrolls when it is tall. There is no pan and no zoom.
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
const LABEL_LINE = 14;
const LABEL_SIZE = 12.5;
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
  moved,
  onSelect,
  onTopic,
  onHover,
  onHoverTopic,
  onMove,
  onMoveEnd,
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
  /** Concepts dragged from where the layout put them (D6). */
  moved: Readonly<Record<string, Point>>;
  onSelect: (id: string) => void;
  onTopic: (topic: string) => void;
  onHover: (id: string | null) => void;
  onHoverTopic: (topic: string | null) => void;
  onMove: (id: string, to: Point) => void;
  onMoveEnd: () => void;
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
  // The frame holds still while a concept is being dragged, and takes in where it was left afterwards.
  const live = viewBoxFor(layout, topic, moved);
  const view = frozen ?? live;
  const count = shown.size;
  const label = `${title} map, ${count} concept${count === 1 ? "" : "s"} in ${groups.length} topic${groups.length === 1 ? "" : "s"}`;
  const at = (id: string) => moved[id] ?? layout.positions[id];
  const topicOf = new Map(groups.flatMap((g) => g.concepts.map((id) => [id, g.topic] as const)));
  const lines = (id: string) => wrapLabel(nodes.get(id)?.title ?? id, LABEL_CHARS).length;
  // What stays lit (D5): a concept and its neighbours, or a topic's group.
  const keep =
    hover !== null && shown.has(hover)
      ? neighbours(edges, hover)
      : hoverTopic !== null
        ? new Set(groups.find((g) => g.topic === hoverTopic)?.concepts ?? [])
        : null;
  const hot = (e: GraphEdge) => hover !== null && (e.from === hover || e.to === hover);
  const plate = hover !== null && shown.has(hover) ? nodes.get(hover) : undefined;

  const pointerAt = (event: { clientX: number; clientY: number }, frame: Box) =>
    svg.current === null ? { x: 0, y: 0 } : toLayoutPoint(event.clientX, event.clientY, svg.current.getBoundingClientRect(), frame);

  const edge = (e: GraphEdge) => (
    <Edge
      key={`${e.from}>${e.to}>${e.kind}`}
      edge={e}
      ends={edgeEnds(at(e.from), at(e.to), lines(e.from), lines(e.to))}
      faint={dimmed.has(e.from) || dimmed.has(e.to)}
      across={topicOf.get(e.from) !== topicOf.get(e.to)}
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
        style={{ maxWidth: view.width * MAX_SCALE, minWidth: view.width * 0.6 }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (d === null) return;
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
        {groups.map((g) => {
          const box = groupBox(g.concepts.map(at), titleWidth(g.title));
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
                x={box.x + 12}
                y={box.y + 20}
                fontSize={12.5}
                fontWeight={700}
                className={cx("outline-none", lit ? "fill-text" : "fill-text2", topic === null && "cursor-pointer")}
                onClick={() => onTopic(g.topic)}
                onMouseEnter={() => onHoverTopic(g.topic)}
                onMouseLeave={() => onHoverTopic(null)}
              >
                {g.title}
              </text>
            </g>
          );
        })}
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
                dragged.current = false;
                const frame = live;
                drag.current = { id, start: p, from: pointerAt(event, frame), moving: false, view: frame, pointer: event.pointerId };
              }}
            />
          );
        })}
        {plate !== undefined && <Plate node={plate} at={at(plate.id)} lines={lines(plate.id)} />}
      </svg>
    </div>
  );
}

/** The full title of the hovered concept on a plate over its label (D5), since a label is cut at two lines. */
function Plate({ node, at, lines }: { node: DomainGraphNode; at: Point; lines: number }) {
  const width = Math.ceil(node.title.length * 7 + 20);
  const top = at.y + 15;
  // Tall enough to cover the label it replaces, one line or two.
  const height = 8 + lines * LABEL_LINE;
  return (
    <g data-plate pointerEvents="none" className="animate-fade-in motion-reduce:animate-none">
      <rect x={at.x - width / 2} y={top} width={width} height={height} rx={6} className="fill-surface stroke-hair" strokeWidth={1} />
      <text x={at.x} y={top + height / 2 + 4.5} textAnchor="middle" fontSize={LABEL_SIZE} fontWeight={700} className="fill-text">
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
  hot,
  quiet,
}: {
  edge: GraphEdge;
  ends: [Point, Point];
  faint: boolean;
  across: boolean;
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
        hot ? "opacity-100" : quiet ? "opacity-10" : faint ? "opacity-15" : across ? "opacity-30" : "opacity-70",
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
  /** Under hover (D5): the hovered concept, a neighbour kept lit, a concept faded, or nothing hovered. */
  light: "hover" | "related" | "faded" | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onPointerDown: (event: PointerEvent<SVGGElement>) => void;
}) {
  const lines = wrapLabel(n.title, LABEL_CHARS);
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
      data-concept={n.id}
      data-dim={dim}
      data-ready={mark?.ready ?? false}
      data-overdue={mark?.overdue ?? false}
      data-leech={mark?.leech ?? false}
      data-hover={light === "hover"}
      data-related={light === "related"}
      data-faded={light === "faded"}
      role="button"
      // The list beside the graph is the keyboard's way in (D7).
      tabIndex={-1}
      aria-label={caption}
      aria-pressed={selected}
      className={cx(
        "cursor-grab touch-none outline-none transition-opacity duration-150 active:cursor-grabbing motion-reduce:transition-none",
        light === "faded" ? "opacity-10" : dim && light === null ? "opacity-20" : undefined,
      )}
      onClick={() => onSelect(n.id)}
      onMouseEnter={() => onHover(n.id)}
      onMouseLeave={() => onHover(null)}
      onPointerDown={onPointerDown}
    >
      <title>{caption}</title>
      {/* The whole dot and label take a press, not only the painted strokes. */}
      <rect x={x - NODE_HALF_WIDTH} y={y - 18} width={NODE_HALF_WIDTH * 2} height={36 + lines.length * LABEL_LINE} fill="transparent" />
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
          x={x}
          y={y + 28 + k * LABEL_LINE}
          textAnchor="middle"
          fontSize={LABEL_SIZE}
          fontWeight={selected ? 700 : 500}
          // A halo in the group's colour, so a line passing behind a label does not cut through it.
          className={selected ? "fill-text" : "fill-text2"}
          strokeWidth={4}
          strokeLinejoin="round"
          style={{ paintOrder: "stroke", stroke: "var(--surface2)" }}
        >
          {line}
        </text>
      ))}
    </g>
  );
}
