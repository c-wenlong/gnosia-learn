import Link from "next/link";

import { cx } from "@/components/ui/classes";
import { layoutGraph, wrapLabel, type GraphEdge, type GraphNode } from "@gnosia/tutor/concept-graph";
import { MASTERY_BUCKET_LABEL, type MasteryBucket } from "@gnosia/tutor/mastery-bucket";

/**
 * A layered prerequisite graph in plain SVG, coloured by mastery bucket.
 *
 * Which concepts to draw is the caller's choice (`neighbourhood` or
 * `courseScope` in `@/lib/concept-graph`); this only lays them out and draws
 * them. Prerequisites sit above what needs them, so every line runs downward
 * and no arrowhead is needed. A solid line is a hard prerequisite, a dashed one
 * background (`assumes`), which orders teaching without gating it.
 *
 * No hooks, so it renders on the server for the workspace, where a node is a
 * link (`hrefFor`), and in the browser for the Learn index, where a node
 * selects a row (`onSelect`). Every colour is a token utility, so both themes
 * come from one drawing.
 */

const DOT: Record<MasteryBucket, string> = {
  mastered: "fill-m-hi stroke-m-hi",
  learning: "fill-m-mid stroke-m-hi",
  untouched: "fill-surface stroke-m-lo",
};

export function ConceptGraph({
  nodes,
  edges,
  focus = null,
  hrefFor,
  onSelect,
  fit = true,
  compact = false,
  label,
  className,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The selected concept, drawn larger inside an accent ring. */
  focus?: string | null;
  /** Makes each node a link. */
  hrefFor?: (id: string) => string;
  /** Makes each node a button. Ignored when `hrefFor` is given. */
  onSelect?: (id: string) => void;
  /** Scale to the container's width (a neighbourhood) or keep the natural size and scroll (a course). */
  fit?: boolean;
  /** Narrower columns and shorter label lines, for a graph in a side card. */
  compact?: boolean;
  /** Accessible name for the drawing. */
  label?: string;
  className?: string;
}) {
  if (nodes.length === 0) {
    return <p className={cx("text-[13px] text-text3", className)}>Nothing to draw.</p>;
  }

  const { width, height, positions } = layoutGraph(nodes, edges, compact ? { columnWidth: 84, rowHeight: 96 } : {});
  const labels = new Map(nodes.map((n) => [n.id, wrapLabel(n.title, compact ? 12 : 16)]));
  const fontSize = compact ? 12 : 11.5;
  const name = label ?? `Concept graph, ${nodes.length} concept${nodes.length === 1 ? "" : "s"}`;

  return (
    <div className={cx("overflow-x-auto", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="group"
        aria-label={name}
        className="mx-auto block"
        style={fit ? { width: "100%", maxWidth: width, height: "auto" } : undefined}
      >
        {edges.map((e) => {
          const from = positions.get(e.from);
          const to = positions.get(e.to);
          if (!from || !to) return null;
          // From under the prerequisite's label to just above the dot it feeds.
          const y1 = from.y + 22 + (labels.get(e.from)?.length ?? 1) * 14;
          const y2 = to.y - (e.to === focus ? 18 : 12);
          const mid = (y1 + y2) / 2;
          return (
            <path
              key={`${e.from}>${e.to}>${e.kind}`}
              d={`M ${from.x} ${y1} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${y2}`}
              fill="none"
              // The selected concept's own lines in the accent, the rest quieter.
              className={cx(
                "transition-[stroke,opacity] duration-150 motion-reduce:transition-none",
                e.from === focus || e.to === focus ? "stroke-accent" : "stroke-text3 opacity-70",
              )}
              strokeWidth={e.kind === "assumes" ? 1 : 1.5}
              strokeDasharray={e.kind === "assumes" ? "4 4" : undefined}
            />
          );
        })}

        {nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const isFocus = n.id === focus;
          const lines = labels.get(n.id) ?? [n.title];
          const caption = `${n.title}, ${MASTERY_BUCKET_LABEL[n.bucket]}${n.bucket === "untouched" ? "" : `, p(L) ${n.pL.toFixed(2)}`}`;
          const body = (
            <>
              <title>{caption}</title>
              {isFocus && <circle cx={p.x} cy={p.y} r={16} fill="none" className="stroke-accent" strokeWidth={2} />}
              <circle
                cx={p.x}
                cy={p.y}
                r={isFocus ? 10 : 8}
                className={cx(DOT[n.bucket], "transition-[fill,stroke] duration-150 motion-reduce:transition-none")}
                strokeWidth={2}
              />
              {lines.map((line, i) => (
                <text
                  key={i}
                  x={p.x}
                  y={p.y + 30 + i * 14}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fontWeight={isFocus ? 700 : 500}
                  className={cx("transition-[fill] duration-150 motion-reduce:transition-none", isFocus ? "fill-text" : "fill-text2")}
                >
                  {line}
                </text>
              ))}
            </>
          );
          const focusRing = "outline-none [&:focus-visible>circle:last-of-type]:stroke-accent";
          if (hrefFor) {
            return (
              <Link key={n.id} href={hrefFor(n.id)} aria-label={caption} className={focusRing}>
                {body}
              </Link>
            );
          }
          if (onSelect) {
            return (
              <g
                key={n.id}
                role="button"
                tabIndex={0}
                aria-label={caption}
                aria-pressed={isFocus}
                className={cx("cursor-pointer", focusRing)}
                onClick={() => onSelect(n.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(n.id);
                  }
                }}
              >
                {body}
              </g>
            );
          }
          return <g key={n.id}>{body}</g>;
        })}
      </svg>
    </div>
  );
}

/** The two-line key under a graph: what the line styles and the ring mean. */
export function ConceptGraphKey({ className }: { className?: string }) {
  return (
    <p className={cx("text-[12px] leading-4 text-text3", className)}>
      Prerequisites sit above. Solid: required. Dashed: background. Ringed: selected.
    </p>
  );
}
