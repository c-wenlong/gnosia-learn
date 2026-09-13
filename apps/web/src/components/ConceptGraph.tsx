import type { KbConcept, KbEdge, MasteryLabel } from "@/lib/kb/types";

/**
 * Layered DAG renderer, in plain SVG.
 *
 * No graph library: the layout is a longest-path layering, which is all a
 * prerequisite graph needs and keeps the page dependency-free. Server-safe,
 * so the whole graph ships as static markup.
 */

const NODE_W = 168;
const NODE_H = 52;
const GAP_X = 28;
const GAP_Y = 76;
const PAD = 20;

const FILL: Record<MasteryLabel, { bg: string; border: string; text: string }> = {
  mastered: { bg: "#dcfce7", border: "#16a34a", text: "#14532d" },
  solid: { bg: "#e0f2fe", border: "#0284c7", text: "#0c4a6e" },
  shaky: { bg: "#fef9c3", border: "#ca8a04", text: "#713f12" },
  weak: { bg: "#ffedd5", border: "#ea580c", text: "#7c2d12" },
  gap: { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d" },
};

/**
 * Longest-path layering: a node sits one level below its deepest
 * prerequisite, so every edge points strictly downward.
 */
function assignLayers(concepts: KbConcept[], edges: KbEdge[]): Map<string, number> {
  const incoming = new Map<string, string[]>();
  for (const c of concepts) incoming.set(c.id, []);
  // Both kinds constrain layout: a background edge still means "comes before".
  for (const e of edges) incoming.get(e.to)?.push(e.from);

  const layer = new Map<string, number>();
  const visiting = new Set<string>();

  const depth = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    // A cycle would otherwise recurse forever; doctor reports these, but the
    // renderer must not hang because of one.
    if (visiting.has(id)) return 0;
    visiting.add(id);

    const parents = incoming.get(id) ?? [];
    const value = parents.length === 0 ? 0 : Math.max(...parents.map(depth)) + 1;

    visiting.delete(id);
    layer.set(id, value);
    return value;
  };

  for (const c of concepts) depth(c.id);
  return layer;
}

export function ConceptGraph({
  concepts,
  edges,
  frontier = [],
}: {
  concepts: KbConcept[];
  edges: KbEdge[];
  frontier?: string[];
}) {
  if (concepts.length === 0) return null;

  const layers = assignLayers(concepts, edges);
  const byLayer = new Map<number, KbConcept[]>();
  for (const c of concepts) {
    const l = layers.get(c.id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(c);
  }
  for (const row of byLayer.values()) row.sort((a, b) => a.title.localeCompare(b.title));

  const depths = [...byLayer.keys()].sort((a, b) => a - b);
  const widest = Math.max(...[...byLayer.values()].map((r) => r.length));
  const width = PAD * 2 + widest * NODE_W + (widest - 1) * GAP_X;
  const height = PAD * 2 + depths.length * NODE_H + (depths.length - 1) * GAP_Y;

  const pos = new Map<string, { x: number; y: number }>();
  for (const d of depths) {
    const row = byLayer.get(d)!;
    const rowWidth = row.length * NODE_W + (row.length - 1) * GAP_X;
    const startX = (width - rowWidth) / 2;
    row.forEach((c, i) => {
      pos.set(c.id, {
        x: startX + i * (NODE_W + GAP_X),
        y: PAD + depths.indexOf(d) * (NODE_H + GAP_Y),
      });
    });
  }

  const frontierSet = new Set(frontier);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Concept dependency graph with ${concepts.length} concepts`}
        style={{ maxWidth: "100%", height: "auto" }}
      >
        <defs>
          <marker
            id="kb-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {edges.map((e) => {
          const from = pos.get(e.from);
          const to = pos.get(e.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const mid = (y1 + y2) / 2;
          // Background edges read as dotted: they order the plan without
          // gating it, so they should not look like a hard dependency.
          const background = e.kind === "assumes";
          return (
            <path
              key={`${e.from}-${e.to}-${e.kind}`}
              d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={background ? 1 : 1.5}
              strokeDasharray={background ? "4 4" : undefined}
              opacity={background ? 0.6 : 1}
              markerEnd="url(#kb-arrow)"
            />
          );
        })}

        {concepts.map((c) => {
          const p = pos.get(c.id);
          if (!p) return null;
          const colour = FILL[c.mastery];
          const onFrontier = frontierSet.has(c.id);
          const label =
            c.title.length > 24 ? `${c.title.slice(0, 23)}…` : c.title;

          return (
            <g key={c.id}>
              <rect
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={colour.bg}
                stroke={colour.border}
                strokeWidth={onFrontier ? 3 : 1.5}
                strokeDasharray={onFrontier ? "5 3" : undefined}
              />
              <text
                x={p.x + NODE_W / 2}
                y={p.y + 21}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill={colour.text}
                fontFamily="system-ui, sans-serif"
              >
                {label}
              </text>
              <text
                x={p.x + NODE_W / 2}
                y={p.y + 38}
                textAnchor="middle"
                fontSize={11}
                fill={colour.text}
                fontFamily="system-ui, sans-serif"
                opacity={0.75}
              >
                {Math.round(c.pL * 100)}% · {c.mastery}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
