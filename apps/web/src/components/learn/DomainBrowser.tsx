"use client";

import { useEffect, useMemo, useRef } from "react";

import { DomainGraph, type DomainGraphNode, type MapMark } from "@/components/learn/DomainGraph";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx, LABEL } from "@/components/ui/classes";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { GraphEdge, GraphNode } from "@/lib/concept-graph";
import type { DomainLayout, DomainMapData, DomainSummary } from "@/lib/domain-map";
import { domainTitle } from "@/lib/domain-view";
import type { IndexRow } from "@/lib/learn-index";
import { relatedTo, standingLine } from "@/lib/map-reading";
import { MASTERY_BUCKET_LABEL } from "@/lib/mastery-bucket";
import { scrollBehavior } from "@/lib/motion";
import { LEECH_LABEL } from "@/lib/review-core";

/**
 * The Learn map's two levels (phase 2 of docs/proposals/domain-map.md, D2):
 * a card per domain, and one domain (or one of its topics) as a picture with
 * its concepts listed beside it and the selected one's details above the
 * list. `LearnIndex` holds the place and the selection; these draw them.
 */

export type Place = { domain: string | null; topic: string | null };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The domain cards (D2, D8): what each holds, how much of it is known, and how much of it a search finds. */
export function DomainCards({
  tree,
  rows,
  matches,
  searching,
  onOpen,
}: {
  tree: readonly DomainSummary[];
  rows: ReadonlyMap<string, IndexRow>;
  /** Concepts per domain the search and the filter leave showing. */
  matches: Readonly<Record<string, number>>;
  searching: boolean;
  onOpen: (domain: string) => void;
}) {
  return (
    <section aria-label="Domains" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tree.map((d) => {
        const total = d.concepts.length;
        const found = matches[d.slug] ?? 0;
        const dim = searching && found === 0;
        const ready = d.concepts.filter((id) => rows.get(id)?.ready).length;
        const due = d.concepts.filter((id) => rows.get(id)?.isDue).length;
        const share = (n: number) => `${(n / Math.max(1, total)) * 100}%`;
        const links = d.links.slice(0, 3).map((l) => domainTitle(l.domain));
        return (
          <button
            key={d.slug}
            type="button"
            data-domain-card={d.slug}
            data-dim={dim}
            onClick={() => onOpen(d.slug)}
            className={cx(
              "flex min-w-0 flex-col gap-2 rounded-[20px] border-2 border-border bg-surface p-4 text-left transition-[opacity,border-color] duration-150 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
              dim && "opacity-40",
            )}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[16px] font-bold text-text">{d.title}</span>
              {searching && (
                <span className={cx("shrink-0 text-[12px] font-semibold", found > 0 ? "text-accent" : "text-text3")}>
                  {found === 1 ? "1 match" : `${found} matches`}
                </span>
              )}
            </span>
            <span className="text-[12px] text-text2">
              {plural(total, "concept")} · {plural(d.topics.length, "topic")}
            </span>
            <span
              role="img"
              aria-label={`${d.counts.mastered} mastered, ${d.counts.learning} learning, ${d.counts.untouched} untouched`}
              className="flex h-2 overflow-hidden rounded-full bg-surface2"
            >
              <span className="bg-m-hi" style={{ width: share(d.counts.mastered) }} />
              <span className="bg-m-mid" style={{ width: share(d.counts.learning) }} />
            </span>
            <span className="text-[12px] text-text2">
              {d.counts.mastered} mastered · {d.counts.learning} learning
              {ready > 0 && ` · ${ready} ready`}
              {due > 0 && <span className="text-danger"> · {due} due</span>}
            </span>
            {links.length > 0 && <span className="truncate text-[11px] text-text3">Links to {links.join(", ")}</span>}
          </button>
        );
      })}
    </section>
  );
}

/** Learn, the domain, the topic: each but the last goes back up (D2). */
export function Breadcrumb({ domain, topic, onGo }: { domain: DomainSummary; topic: string | null; onGo: (place: Place) => void }) {
  const topicTitle = topic === null ? null : (domain.topics.find((t) => t.slug === topic)?.title ?? topic);
  // The separator is drawn, not written, so a screen reader hears the levels and not the arrows.
  const after = "before:mr-1.5 before:text-text3 before:content-['›']";
  const crumb = "rounded-sm text-text2 underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px]">
        <li>
          <button type="button" className={crumb} onClick={() => onGo({ domain: null, topic: null })}>
            Learn
          </button>
        </li>
        <li className={after}>
          {topicTitle === null ? (
            <span aria-current="page" className="font-semibold text-text">
              {domain.title}
            </span>
          ) : (
            <button type="button" className={crumb} onClick={() => onGo({ domain: domain.slug, topic: null })}>
              {domain.title}
            </button>
          )}
        </li>
        {topicTitle !== null && (
            <li className={after}>
              <span aria-current="page" className="font-semibold text-text">
                {topicTitle}
              </span>
            </li>
        )}
      </ol>
    </nav>
  );
}

/** One domain, or one topic of it (D2 to D4): the picture, the links out, the panel and the list. */
export function DomainView({
  domain,
  layout,
  topic,
  rows,
  nodes,
  edges,
  domainOf,
  selected,
  dimmed,
  marks,
  onGo,
  onSelect,
  onPick,
}: {
  domain: DomainSummary;
  layout: DomainLayout;
  topic: string | null;
  rows: ReadonlyMap<string, IndexRow>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  domainOf: Readonly<Record<string, string>>;
  selected: string | null;
  dimmed: ReadonlySet<string>;
  marks: Readonly<Record<string, MapMark>>;
  onGo: (place: Place) => void;
  onSelect: (id: string) => void;
  /** A concept chosen from the panel, maybe in another domain. */
  onPick: (id: string) => void;
}) {
  const graphNodes = useMemo(() => new Map<string, DomainGraphNode>([...rows].map(([id, r]) => [id, r])), [rows]);
  const focus = selected === null ? null : (rows.get(selected) ?? null);
  return (
    <div className="flex flex-col gap-3">
      <Breadcrumb domain={domain} topic={topic} onGo={onGo} />
      {/* Sized by the room the page has: the list docks beside the picture when it fits, under it otherwise. */}
      <div className="@container">
        <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            <DomainGraph
              layout={layout}
              title={domain.title}
              nodes={graphNodes}
              topic={topic}
              selected={selected}
              dimmed={dimmed}
              marks={marks}
              onSelect={onSelect}
              onTopic={(t) => onGo({ domain: domain.slug, topic: t })}
            />
            {domain.links.length > 0 && (
              <p data-outside className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text2">
                <span>Links to other domains:</span>
                {domain.links.map((l) => (
                  <button
                    key={l.domain}
                    type="button"
                    onClick={() => onGo({ domain: l.domain, topic: null })}
                    className="rounded-sm text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {domainTitle(l.domain)} ({l.count})
                  </button>
                ))}
              </p>
            )}
            <p className="text-[11px] leading-4 text-text3">
              Prerequisites sit above. Solid: required. Dashed: background. The arc round a dot is its p(L); a dashed ring is
              ready to learn; a red dot is a review overdue, a red ring keeps slipping.
            </p>
          </Card>
          <div className="flex min-w-0 flex-col gap-3">
            <MapPanel
              focus={focus}
              nodes={nodes}
              edges={edges}
              onPick={onPick}
              domainOf={domainOf}
              domain={domain.slug}
            />
            <ConceptList domain={domain} layout={layout} topic={topic} rows={rows} selected={selected} dimmed={dimmed} onGo={onGo} onSelect={onSelect} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The domain's topics and concepts as buttons, in the picture's reading order (D7). */
function ConceptList({
  domain,
  layout,
  topic,
  rows,
  selected,
  dimmed,
  onGo,
  onSelect,
}: {
  domain: DomainSummary;
  layout: DomainLayout;
  topic: string | null;
  rows: ReadonlyMap<string, IndexRow>;
  selected: string | null;
  dimmed: ReadonlySet<string>;
  onGo: (place: Place) => void;
  onSelect: (id: string) => void;
}) {
  const groups = topic === null ? layout.groups : layout.groups.filter((g) => g.topic === topic);
  const at = (id: string) => layout.positions[id] ?? { x: 0, y: 0 };
  const reading = (a: string, b: string) => at(a).y - at(b).y || at(a).x - at(b).x;
  return (
    <section aria-label={`Concepts in ${domain.title}`} className="flex min-w-0 flex-col gap-2 rounded-xl bg-surface2 p-3">
      {groups.map((g) => (
        <div key={g.topic} className="flex flex-col gap-0.5">
          <button
            type="button"
            data-list-topic={g.topic}
            disabled={topic !== null}
            onClick={() => onGo({ domain: domain.slug, topic: g.topic })}
            className="rounded-sm px-1.5 py-0.5 text-left text-[12px] font-semibold text-text2 enabled:hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            {g.title}
          </button>
          <ul className="flex flex-col">
            {[...g.concepts].sort(reading).map((id) => {
              const r = rows.get(id);
              if (r === undefined) return null;
              return (
                <li key={id}>
                  <button
                    type="button"
                    data-list-concept={id}
                    aria-pressed={id === selected}
                    onClick={() => onSelect(id)}
                    className={cx(
                      "flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] text-text hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent",
                      id === selected && "bg-surface font-semibold",
                      dimmed.has(id) && "opacity-40",
                    )}
                  >
                    <MasteryDot bucket={r.bucket} size={10} className="shrink-0" />
                    <span className="min-w-0 truncate">{r.title}</span>
                    {r.leech && <span className="shrink-0 text-[11px] font-semibold text-danger">{LEECH_LABEL}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * The selected concept: how well it is known, when it is due, where it is
 * taught, what it needs and what leads on from it, a concept in another
 * domain saying which (D4). Choosing one of those moves to it.
 */
export function MapPanel({
  focus,
  nodes,
  edges,
  onPick,
  domainOf = {},
  domain = null,
}: {
  focus: IndexRow | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onPick: (id: string) => void;
  domainOf?: Readonly<Record<string, string>>;
  /** The domain on screen; a related concept elsewhere names its own. */
  domain?: string | null;
}) {
  // A "Needs" or "Leads to" press redraws this panel for the concept it names,
  // and the button that had focus goes with it: focus moves to the new
  // concept's name, so a keyboard or a screen reader keeps its place.
  const heading = useRef<HTMLHeadingElement | null>(null);
  const picked = useRef(false);
  const focusId = focus?.id ?? null;
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, [focusId]);
  if (focus === null) {
    return (
      <section aria-label="Concept details" className="rounded-xl bg-surface2 p-4 text-[13px] text-text2">
        Choose a concept to see what it needs and what it leads to.
      </section>
    );
  }
  const { needs, leadsTo } = relatedTo(nodes, edges, focus.id);
  const list = (name: string, items: GraphNode[]) => (
    <div className="flex flex-col gap-1">
      <h4 className={LABEL}>{name}</h4>
      {items.length === 0 ? (
        <p className="text-[12px] text-text3">None</p>
      ) : (
        <ul aria-label={name} className="flex flex-col">
          {items.map((n) => {
            const elsewhere = domain !== null && domainOf[n.id] !== undefined && domainOf[n.id] !== domain ? domainOf[n.id] : null;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  data-concept={n.id}
                  onClick={() => {
                    picked.current = true;
                    onPick(n.id);
                  }}
                  className="flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] text-text hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <MasteryDot bucket={n.bucket} size={10} className="shrink-0" />
                  <span className="min-w-0 truncate">{n.title}</span>
                  {elsewhere !== null && <span className="ml-auto shrink-0 text-[11px] text-text3">{domainTitle(elsewhere)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
  return (
    <section aria-label="Concept details" className="flex min-w-0 flex-col gap-3 rounded-xl bg-surface2 p-4">
      <div className="flex flex-col gap-1">
        <h3 ref={heading} tabIndex={-1} className="text-[15px] leading-snug font-bold text-text outline-none">
          {focus.title}
        </h3>
        <p className="text-[12px] text-text2">
          {MASTERY_BUCKET_LABEL[focus.bucket]}
          {focus.leech && <span className="font-semibold text-danger"> · {LEECH_LABEL}</span>}
          {focus.ready && " · Ready to learn"}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <ProgressBar
          percent={focus.bucket === "untouched" ? 0 : focus.pL * 100}
          size="sm"
          tone={focus.bucket === "mastered" ? "hi" : "mid"}
          label={`${focus.title} mastery`}
        />
        <p className="text-[12px] text-text2">
          {standingLine(focus).map((part, i) => (
            <span key={part.text}>
              {i > 0 && " · "}
              <span className={part.danger ? "text-danger" : undefined}>{part.text}</span>
            </span>
          ))}
        </p>
        <p className="text-[12px] text-text2">{focus.courseLabel ?? "Not in a course"}</p>
      </div>
      {list("Needs", needs)}
      {list("Leads to", leadsTo)}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" href={`/learn/${focus.id}`}>
          Open in workspace
        </Button>
        <Button variant="secondary" size="sm" href={`/learn/${focus.id}/session`}>
          Start a session
        </Button>
      </div>
    </section>
  );
}

export type { DomainMapData };
