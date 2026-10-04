"use client";

import { cx } from "@/components/ui/classes";
import { wrapLabel, type GraphEdge } from "@/lib/concept-graph";
import type { DomainLayout } from "@/lib/domain-map";
import { edgeEnds, groupBox, NODE_HALF_WIDTH, viewBoxFor } from "@/lib/domain-view";
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

export function DomainGraph({
  layout,
  title,
  nodes,
  topic,
  selected,
  dimmed,
  marks,
  onSelect,
  onTopic,
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
  onSelect: (id: string) => void;
  onTopic: (topic: string) => void;
}) {
  const groups = topic === null ? layout.groups : layout.groups.filter((g) => g.topic === topic);
  const shown = new Set(groups.flatMap((g) => g.concepts));
  const edges = layout.edges.filter((e) => shown.has(e.from) && shown.has(e.to));
  const view = viewBoxFor(layout, topic);
  const count = shown.size;
  const label = `${title} map, ${count} concept${count === 1 ? "" : "s"} in ${groups.length} topic${groups.length === 1 ? "" : "s"}`;
  const at = (id: string) => layout.positions[id];
  const topicOf = new Map(groups.flatMap((g) => g.concepts.map((id) => [id, g.topic] as const)));
  const lines = (id: string) => wrapLabel(nodes.get(id)?.title ?? id, LABEL_CHARS).length;

  return (
    // Scrolls sideways only on a phone, where the picture would otherwise shrink past reading.
    <div className="overflow-x-auto">
      <svg
        data-domain-graph
        data-topic={topic ?? ""}
        role="group"
        aria-label={label}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        className="mx-auto block h-auto w-full"
        style={{ maxWidth: view.width * MAX_SCALE, minWidth: view.width * 0.6 }}
      >
        {groups.map((g) => {
          const box = groupBox(g.concepts.map(at));
          return (
            <g key={g.topic} data-group={g.topic}>
              <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={14} className="fill-surface2 stroke-hair" strokeWidth={1} />
              <text
                data-topic-title={g.topic}
                role="button"
                tabIndex={-1}
                aria-label={`Open the ${g.title} topic`}
                x={box.x + 12}
                y={box.y + 20}
                fontSize={12.5}
                fontWeight={700}
                className={cx("fill-text2 outline-none", topic === null && "cursor-pointer hover:fill-text")}
                onClick={() => onTopic(g.topic)}
              >
                {g.title}
              </text>
            </g>
          );
        })}
        {edges.map((e) => (
          <Edge
            key={`${e.from}>${e.to}>${e.kind}`}
            edge={e}
            ends={edgeEnds(at(e.from), at(e.to), lines(e.from), lines(e.to))}
            faint={dimmed.has(e.from) || dimmed.has(e.to)}
            across={topicOf.get(e.from) !== topicOf.get(e.to)}
          />
        ))}
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
              onSelect={onSelect}
            />
          );
        })}
      </svg>
    </div>
  );
}

/** An edge between two topics is drawn lighter than one inside a topic, so the groups read first. */
function Edge({
  edge,
  ends: [from, to],
  faint,
  across,
}: {
  edge: GraphEdge;
  ends: [{ x: number; y: number }, { x: number; y: number }];
  faint: boolean;
  across: boolean;
}) {
  return (
    <line
      data-edge={`${edge.from}>${edge.to}`}
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      strokeWidth={1}
      strokeDasharray={edge.kind === "assumes" ? "4 3" : undefined}
      data-across={across}
      className={cx("stroke-text3", faint ? "opacity-15" : across ? "opacity-30" : "opacity-70")}
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
  onSelect,
}: {
  node: DomainGraphNode;
  x: number;
  y: number;
  selected: boolean;
  dim: boolean;
  mark: MapMark | undefined;
  onSelect: (id: string) => void;
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
      role="button"
      // The list beside the graph is the keyboard's way in (D7).
      tabIndex={-1}
      aria-label={caption}
      aria-pressed={selected}
      className={cx("cursor-pointer outline-none transition-opacity duration-150 motion-reduce:transition-none", dim && "opacity-20")}
      onClick={() => onSelect(n.id)}
    >
      <title>{caption}</title>
      {/* The whole dot and label take a press, not only the painted strokes. */}
      <rect x={x - NODE_HALF_WIDTH} y={y - 18} width={NODE_HALF_WIDTH * 2} height={36 + lines.length * LABEL_LINE} fill="transparent" />
      {/* A knock-out under the dot, so the lines stop short of it rather than running into it. */}
      <circle cx={x} cy={y} r={13} className="fill-surface2" />
      {mark?.ready && <circle cx={x} cy={y} r={15} fill="none" className="stroke-accent" strokeWidth={1.5} strokeDasharray="3 2" />}
      {mark?.leech && <circle cx={x} cy={y} r={18} fill="none" className="stroke-danger" strokeWidth={1.5} />}
      {selected && <circle cx={x} cy={y} r={16} fill="none" className="stroke-accent" strokeWidth={2.5} />}
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
