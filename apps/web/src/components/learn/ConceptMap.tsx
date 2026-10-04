"use client";

import { useEffect, useRef } from "react";

import { cx } from "@/components/ui/classes";
import { wrapLabel, type GraphNode } from "@/lib/concept-graph";
import type { MapLayout } from "@/lib/concept-map";

const routeKey = (e: { from: string; to: string; kind: string }) => `${e.from}>${e.to}>${e.kind}`;

/**
 * A smooth line through a route: straight down out of the first point, then a
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
import { MASTERY_BUCKET_LABEL, type MasteryBucket } from "@/lib/mastery-bucket";

/**
 * The whole prerequisite graph as islands (phase 1 of
 * docs/proposals/knowledge-map.md). The layout arrives from the server
 * (`mapLayout`); this only draws it, with the same dots, lines and tokens as
 * `ConceptGraph`, so both themes come from one drawing.
 *
 * Phase 1 draws the map at its natural size in a scrolling box and scrolls the
 * selected concept into view once, when the map first shows. Pan and zoom are
 * phase 2.
 */

const DOT: Record<MasteryBucket, string> = {
  mastered: "fill-m-hi stroke-m-hi",
  learning: "fill-m-mid stroke-m-hi",
  untouched: "fill-surface stroke-m-lo",
};

const LABEL_LINE = 14;

export function ConceptMap({
  layout,
  nodes,
  selected,
  onSelect,
  className,
}: {
  layout: MapLayout;
  nodes: GraphNode[];
  selected: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const initial = useRef(selected);

  useEffect(() => {
    const id = initial.current;
    const el = box.current;
    if (id === null || el === null) return;
    const p = layout.positions[id];
    if (p === undefined) return;
    el.scrollTo({ left: p.x - el.clientWidth / 2, top: p.y - el.clientHeight / 2 });
  }, [layout]);

  if (layout.islands.length === 0) return <p className={cx("text-[13px] text-text3", className)}>Nothing to draw.</p>;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const labels = new Map(nodes.map((n) => [n.id, wrapLabel(n.title)]));
  const count = Object.keys(layout.positions).length;
  const pad = 12;

  return (
    <div ref={box} className={cx("overflow-auto rounded-xl bg-surface2", className)}>
      <svg
        viewBox={`${-pad} ${-pad} ${layout.width + pad * 2} ${layout.height + pad * 2}`}
        width={layout.width + pad * 2}
        height={layout.height + pad * 2}
        role="group"
        aria-label={`Concept map, ${count} concept${count === 1 ? "" : "s"} in ${layout.islands.length} island${layout.islands.length === 1 ? "" : "s"}`}
        className="block"
      >
        {layout.islands.map((i) => (
          <g key={i.id} data-island={i.id}>
            <rect x={i.x} y={i.y} width={i.width} height={i.height} rx={16} className="fill-surface stroke-hair" strokeWidth={1} />
            <text data-island-title x={i.x + 4} y={i.y - 10} fontSize={14} fontWeight={700} className="fill-text">
              {i.title}
            </text>
          </g>
        ))}

        {layout.edges.map((e) => {
          const route = layout.routes[routeKey(e)];
          if (!route) return null;
          const touches = e.from === selected || e.to === selected;
          return (
            <path
              key={routeKey(e)}
              d={routePath(route)}
              fill="none"
              className={touches ? "stroke-accent" : "stroke-text3 opacity-60"}
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
          const caption = `${n.title}, ${MASTERY_BUCKET_LABEL[n.bucket]}${n.bucket === "untouched" ? "" : `, p(L) ${n.pL.toFixed(2)}`}`;
          return (
            <g
              key={id}
              data-concept={id}
              role="button"
              tabIndex={0}
              aria-label={caption}
              aria-pressed={isFocus}
              className="cursor-pointer outline-none [&:focus-visible>circle:last-of-type]:stroke-accent"
              onClick={() => onSelect(id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(id);
                }
              }}
            >
              <title>{caption}</title>
              {isFocus && <circle cx={p.x} cy={p.y} r={16} fill="none" className="stroke-accent" strokeWidth={2} />}
              <circle cx={p.x} cy={p.y} r={isFocus ? 10 : 8} className={DOT[n.bucket]} strokeWidth={2} />
              {lines.map((line, k) => (
                <text
                  key={k}
                  x={p.x}
                  y={p.y + 30 + k * LABEL_LINE}
                  textAnchor="middle"
                  fontSize={11.5}
                  fontWeight={isFocus ? 700 : 500}
                  className={isFocus ? "fill-text" : "fill-text2"}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
