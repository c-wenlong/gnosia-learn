"use client";

import { useEffect, useRef, useState } from "react";

import type { DomainGraphNode, MapMark } from "@/components/learn/DomainGraph";
import { badgeClasses, cx, FOCUS } from "@/components/ui/classes";
import { Collapse, CollapseChevron } from "@/components/ui/Collapse";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { domainTitle } from "@/lib/domain-view";
import { openByDefault, revealConcept, spineLit, toggleOpen, type Spine, type SpineEdge, type SpineNode } from "@/lib/domain-spine";
import { MASTERY_BUCKET_LABEL, type MasteryBucket } from "@hermes/tutor/mastery-bucket";

/**
 * One domain as a path (D12 to D16 of docs/proposals/domain-map.md): the
 * topics on one vertical spine, in the order the subject is learnt, each
 * topic's concepts branching off its node. There is no pan and no zoom; the
 * page scrolls, as it does for the groups.
 *
 * Edges that cannot sit on the line are labels beside the node, not lines
 * (D14). Hovering a concept keeps it and its neighbours lit and fades the
 * rest (D5); a node whose concepts are all mastered starts folded, and the
 * view opens at the first node holding a concept ready to learn (D15).
 */

/** How many concepts of other domains a node lists before the rest fold behind a disclosure. */
const OUTSIDE_SHOWN = 3;

/** What a node's marker says: its concepts' standing, mastered when all are. */
function markerBucket(node: SpineNode): MasteryBucket {
  return node.done ? "mastered" : node.started > 0 ? "learning" : "untouched";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function DomainSpine({
  domain,
  spine,
  nodes,
  edges,
  marks,
  selected,
  reveal,
  dimmed,
  hover,
  hoverTopic,
  preview,
  onSelect,
  onPick,
  onTopic,
  onHover,
  onHoverTopic,
}: {
  /** The domain's slug and title, for the accessible name and the labels that name another domain. */
  domain: { slug: string; title: string };
  spine: Spine;
  nodes: ReadonlyMap<string, DomainGraphNode>;
  /** The whole graph's edges: a concept's neighbours lit by hover (D5). */
  edges: readonly SpineEdge[];
  marks: Readonly<Record<string, MapMark>>;
  selected: string | null;
  /** Bumped by every choice of a concept, the selected one again included: the topic holding it opens. */
  reveal: number;
  dimmed: ReadonlySet<string>;
  hover: string | null;
  hoverTopic: string | null;
  /** The concepts a legend chip previews (D9). */
  preview: ReadonlySet<string> | null;
  onSelect: (id: string) => void;
  /** A concept in another domain, chosen from a node's side label. */
  onPick: (id: string) => void;
  onTopic: (topic: string) => void;
  onHover: (id: string | null) => void;
  onHoverTopic: (topic: string | null) => void;
}) {
  // A concept chosen elsewhere (the list, the panel) is never left inside a folded node: the one open at the
  // start, and each one chosen after. Adjusted while rendering, as React asks, so no frame shows it hidden.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => revealConcept(openByDefault(spine), spine, selected));
  // Asked again on every choice (`reveal` counts them), not only when the concept changes: choosing the
  // one already selected, from the list, after folding its topic, must open it again.
  const [seen, setSeen] = useState({ selected, reveal });
  if (seen.selected !== selected || seen.reveal !== reveal) {
    setSeen({ selected, reveal });
    setOpen((o) => revealConcept(o, spine, selected));
  }
  /** The nodes whose list of other domains' concepts is shown whole, not cut at `OUTSIDE_SHOWN`. */
  const [whole, setWhole] = useState<ReadonlySet<string>>(() => new Set());
  const items = useRef(new Map<string, HTMLLIElement | null>());
  // The view opens at the first topic with something ready to learn (D15), unless a concept was asked for.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const first = spine.nodes[0]?.topic;
    if (spine.frontier === null || spine.frontier === first || selected !== null) return;
    items.current.get(spine.frontier)?.scrollIntoView({ block: "start", behavior: "auto" });
    // Once, as the path appears: the selection at that moment decides, and a later one does not scroll the page back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lit = spineLit(spine, edges, { hover, hoverTopic, preview });
  const concept = (id: string) => {
    const n = nodes.get(id);
    if (n === undefined) return null;
    const mark = marks[id];
    const on = id === selected;
    const faded = lit !== null ? !lit.has(id) : false;
    const related = lit !== null && hover !== null && lit.has(id) && id !== hover;
    const caption = [
      n.title,
      MASTERY_BUCKET_LABEL[n.bucket],
      mark?.ready ? "ready to learn" : null,
      mark?.overdue ? "review overdue" : null,
      mark?.leech ? "keeps slipping" : null,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <button
        key={id}
        type="button"
        // The list beside the path is the keyboard's way in (D7): a second tab stop per concept would double it.
        tabIndex={-1}
        data-spine-concept={id}
        data-hover={id === hover}
        data-related={related}
        data-faded={faded}
        data-ready={mark?.ready ?? false}
        aria-pressed={on}
        aria-label={caption}
        onClick={() => onSelect(id)}
        onMouseEnter={() => onHover(id)}
        onMouseLeave={() => onHover(null)}
        // The kit's small tint chip, but a long title wraps instead of being cut: on a phone the
        // title is the whole point of the concept.
        className={cx(
          "inline-flex min-w-0 max-w-full items-start gap-1.5 rounded-2xl border px-2.5 py-1 text-left text-[12px] leading-4 font-medium transition-[opacity,color,background-color,border-color] duration-150 motion-reduce:transition-none",
          FOCUS,
          on ? "border-accent bg-tint text-accent-text" : cx("bg-surface text-text hover:bg-surface2", id === hover || related ? "border-accent" : "border-border"),
          mark?.ready === true && !on && "border-dashed",
          faded ? "opacity-30" : dimmed.has(id) && lit === null && "opacity-40",
        )}
      >
        <MasteryDot bucket={n.bucket} size={10} className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">{n.title}</span>
        {mark?.overdue && <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger" />}
      </button>
    );
  };

  return (
    <ol aria-label={`${domain.title} as a path, ${plural(spine.nodes.length, "topic")}`} data-spine className="flex flex-col">
      {spine.nodes.map((node, i) => {
        const folded = !open.has(node.topic);
        const last = i === spine.nodes.length - 1;
        const body = `spine-${node.topic}`;
        const all = whole.has(node.topic);
        const extra = all ? 0 : Math.max(0, node.outside.length - OUTSIDE_SHOWN);
        const outside = (o: SpineNode["outside"][number]) => (
          <button
            key={`${o.kind}-${o.id}`}
            type="button"
            data-spine-outside={o.id}
            onClick={() => onPick(o.id)}
            className="rounded-sm text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {o.kind === "needs" ? "Needs" : "Leads to"} {nodes.get(o.id)?.title ?? o.id} ({domainTitle(o.domain)})
          </button>
        );
        return (
          <li
            key={node.topic}
            ref={(el) => {
              items.current.set(node.topic, el);
            }}
            data-spine-node={node.topic}
            data-done={node.done}
            data-frontier={spine.frontier === node.topic}
            data-open={!folded}
            // Clear of the phone header, 56px and the notch, which sticks over the page; the sidebar has none.
            className="grid scroll-mt-28 grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 md:scroll-mt-4"
          >
            <div className="flex flex-col items-center" aria-hidden="true">
              <span className="relative mt-1 inline-flex size-5 shrink-0 items-center justify-center">
                {spine.frontier === node.topic && <span className="absolute inset-0 rounded-full border-2 border-dashed border-accent" />}
                <MasteryDot bucket={markerBucket(node)} size={12} />
              </span>
              {!last && <span className={cx("w-0.5 flex-1 rounded-full", node.done ? "bg-m-hi" : "bg-border")} />}
            </div>
            <div className={cx("flex min-w-0 flex-col gap-1.5", last ? "pb-1" : "pb-5")}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  data-spine-toggle={node.topic}
                  aria-expanded={!folded}
                  aria-controls={body}
                  onClick={() => setOpen((o) => toggleOpen(o, node.topic))}
                  onMouseEnter={() => onHoverTopic(node.topic)}
                  onMouseLeave={() => onHoverTopic(null)}
                  className={cx("flex min-w-0 items-center gap-1 rounded-lg py-0.5 pr-1 text-left", FOCUS)}
                >
                  <span className="min-w-0 break-words text-[16px] leading-snug font-bold text-text">{node.title}</span>
                  <CollapseChevron open={!folded} className="shrink-0 text-text3" />
                </button>
                <span className="text-[12px] text-text2">
                  {plural(node.concepts.length, "concept")}
                  {node.mastered > 0 && !node.done && ` · ${node.mastered} mastered`}
                </span>
                {node.done && <span className={badgeClasses({ tone: "ok" })}>All mastered</span>}
                {node.ready.length > 0 && (
                  <span data-spine-ready className={badgeClasses({ tone: "accent" })}>
                    {node.ready.length} ready to learn
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onTopic(node.topic)}
                  className="rounded-sm text-[12px] text-text2 underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Open topic
                </button>
              </div>
              {(node.needs.length > 0 || node.outside.length > 0) && (
                <div data-spine-side className="flex flex-col gap-0.5 text-[12px] leading-4 text-text3">
                  {node.needs.length > 0 && (
                    <p>
                      Also needs {node.needs.map((n) => n.title + (n.later ? " (further down)" : "")).join(", ")}
                    </p>
                  )}
                  {node.outside.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {(all ? node.outside : node.outside.slice(0, OUTSIDE_SHOWN)).map(outside)}
                      {extra > 0 && (
                        <button
                          type="button"
                          onClick={() => setWhole((w) => new Set([...w, node.topic]))}
                          className="rounded-sm text-text2 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {extra} more
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Collapse open={!folded} id={body}>
                <div className="ml-1 flex flex-col gap-1.5 border-l-2 border-border py-1 pl-3">
                  {node.steps.map((step, s) => (
                    <div key={s} data-spine-step={s} className="flex flex-wrap items-center gap-1.5">
                      {step.map(concept)}
                    </div>
                  ))}
                </div>
              </Collapse>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
