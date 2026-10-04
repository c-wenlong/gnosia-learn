"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { DomainGraph, type DomainGraphNode, type MapMark } from "@/components/learn/DomainGraph";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx, LABEL } from "@/components/ui/classes";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { GraphEdge, GraphNode } from "@/lib/concept-graph";
import type { DomainLayout, DomainMapData, DomainSummary } from "@/lib/domain-map";
import { domainTitle, movedKey, readMoved } from "@/lib/domain-view";
import type { IndexRow } from "@/lib/learn-index";
import { relatedTo, standingLine } from "@/lib/map-reading";
import { MASTERY_BUCKET_LABEL } from "@/lib/mastery-bucket";
import { prefersReducedMotion, scrollBehavior } from "@/lib/motion";
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
  panelFocus = 0,
  onPanelFocused,
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
  /** Bumped when a pick moved here from another place: the new panel's heading takes the focus. */
  panelFocus?: number;
  onPanelFocused?: () => void;
}) {
  const graphNodes = useMemo(() => new Map<string, DomainGraphNode>([...rows].map(([id, r]) => [id, r])), [rows]);
  const focus = selected === null ? null : (rows.get(selected) ?? null);
  // A pointer's hover and the list's focus are kept apart, so the mouse leaving a
  // focused row does not take the focus's light with it; the pointer wins while it lasts.
  const [pointerHover, setPointerHover] = useState<string | null>(null);
  const [focusHover, setFocusHover] = useState<string | null>(null);
  const hover = pointerHover ?? focusHover;
  const [hoverTopic, setHoverTopic] = useState<string | null>(null);
  const { moved, gliding, move, save, reset } = useMoved(domain.slug, layout);
  // The pill goes as Reset starts, not when the glide home ends.
  const anyMoved = Object.keys(moved).length > 0 && !gliding;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <Breadcrumb domain={domain} topic={topic} onGo={onGo} />
        {anyMoved && (
          <div
            role="status"
            data-moved
            className="flex animate-fade-in items-center gap-2 rounded-full bg-warn-tint px-3 py-1 text-[12px] text-text motion-reduce:animate-none"
          >
            Positions moved
            <button
              type="button"
              onClick={reset}
              className="rounded-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Reset
            </button>
          </div>
        )}
      </div>
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
              hover={hover}
              hoverTopic={hoverTopic}
              moved={moved}
              onSelect={onSelect}
              onTopic={(t) => {
                setHoverTopic(null);
                onGo({ domain: domain.slug, topic: t });
              }}
              onHover={setPointerHover}
              onHoverTopic={setHoverTopic}
              onMove={move}
              onMoveEnd={save}
              locked={gliding}
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
              focusRequest={panelFocus}
              onFocused={onPanelFocused}
            />
            <ConceptList
              domain={domain}
              layout={layout}
              topic={topic}
              rows={rows}
              selected={selected}
              dimmed={dimmed}
              hover={hover}
              onGo={onGo}
              onSelect={onSelect}
              onHover={setPointerHover}
              onFocusHover={setFocusHover}
              onHoverTopic={setHoverTopic}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type Point = { x: number; y: number };

/** How long Reset takes to glide the moved concepts home. */
const RESET_MS = 300;

/** Told when this tab writes a domain's moved concepts, since `storage` only fires in other tabs. */
const MOVED_EVENT = "learn-map-moved";

function subscribeMoved(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(MOVED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(MOVED_EVENT, onChange);
  };
}

function readSaved(domain: string): string | null {
  try {
    return window.sessionStorage.getItem(movedKey(domain));
  } catch {
    return null;
  }
}

/**
 * The concepts dragged in one domain (D6), kept in `sessionStorage` under the
 * domain so a reload in the same session draws them where they were left.
 * Read through `useSyncExternalStore`, which is null on the server and while
 * hydrating, so the page hydrates as it was sent. A drag in progress and
 * Reset's glide home are held in `live` and written when they end. Storage
 * can be missing or refuse a write (a private window); the drag still works,
 * it is only not remembered.
 */
function useMoved(domain: string, layout: DomainLayout) {
  const raw = useSyncExternalStore(
    subscribeMoved,
    () => readSaved(domain),
    () => null,
  );
  const known = useMemo(() => new Set(Object.keys(layout.positions)), [layout]);
  const saved = useMemo(() => readMoved(raw, known), [raw, known]);
  const [live, setLive] = useState<Record<string, Point> | null>(null);
  const [gliding, setGliding] = useState(false);
  const moved = live ?? saved;
  const frame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  /** True when storage took it; false when it refused, and the caller keeps what it holds. */
  const write = (value: Record<string, Point>): boolean => {
    let stored = true;
    try {
      if (Object.keys(value).length === 0) window.sessionStorage.removeItem(movedKey(domain));
      else window.sessionStorage.setItem(movedKey(domain), JSON.stringify(value));
    } catch {
      stored = false;
    }
    window.dispatchEvent(new Event(MOVED_EVENT));
    return stored;
  };
  // A drag during Reset's glide would be overwritten by its next frame, so the glide takes none.
  const move = (id: string, to: Point) => {
    if (!gliding) setLive((m) => ({ ...(m ?? saved), [id]: to }));
  };
  /** Remember a drag; one storage refuses stays drawn where it was dropped, only not remembered. */
  const save = () => {
    if (!gliding && write(moved)) setLive(null);
  };
  /** Back to the layout's places, gliding there unless motion is reduced. */
  const reset = () => {
    const from = moved;
    const reduced = prefersReducedMotion() || typeof requestAnimationFrame === "undefined";
    // Hold the dropped places until the first frame, so clearing storage does not flash them home.
    setLive(reduced ? null : from);
    write({});
    if (reduced) {
      setLive(null);
      return;
    }
    setGliding(true);
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / RESET_MS);
      if (t >= 1) {
        frame.current = null;
        setLive(null);
        setGliding(false);
        return;
      }
      const ease = 1 - (1 - t) ** 3;
      setLive(
        Object.fromEntries(
          Object.entries(from).map(([id, p]) => {
            const home = layout.positions[id] ?? p;
            return [id, { x: p.x + (home.x - p.x) * ease, y: p.y + (home.y - p.y) * ease }];
          }),
        ),
      );
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };
  return { moved, gliding, move, save, reset };
}

/** The domain's topics and concepts as buttons, in the picture's reading order (D7). */
function ConceptList({
  domain,
  layout,
  topic,
  rows,
  selected,
  dimmed,
  hover,
  onGo,
  onSelect,
  onHover,
  onFocusHover,
  onHoverTopic,
}: {
  domain: DomainSummary;
  layout: DomainLayout;
  topic: string | null;
  rows: ReadonlyMap<string, IndexRow>;
  selected: string | null;
  dimmed: ReadonlySet<string>;
  hover: string | null;
  onGo: (place: Place) => void;
  onSelect: (id: string) => void;
  /** Hover and focus here light the graph, as the graph's hover lights a row (D5, D7). */
  onHover: (id: string | null) => void;
  onFocusHover: (id: string | null) => void;
  onHoverTopic: (topic: string | null) => void;
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
            onClick={() => {
              onHoverTopic(null);
              onGo({ domain: domain.slug, topic: g.topic });
            }}
            onMouseEnter={() => onHoverTopic(g.topic)}
            onMouseLeave={() => onHoverTopic(null)}
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
                    data-hover={id === hover}
                    aria-pressed={id === selected}
                    onClick={() => onSelect(id)}
                    onMouseEnter={() => onHover(id)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onFocusHover(id)}
                    onBlur={() => onFocusHover(null)}
                    className={cx(
                      "flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] text-text transition-colors duration-100 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none",
                      id === selected && "bg-surface font-semibold",
                      id === hover && id !== selected && "bg-surface",
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
  focusRequest = 0,
  onFocused,
}: {
  focus: IndexRow | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onPick: (id: string) => void;
  domainOf?: Readonly<Record<string, string>>;
  /** The domain on screen; a related concept elsewhere names its own. */
  domain?: string | null;
  /**
   * Bumped by a pick that moved to another place. That mounts this panel
   * afresh, so the button pressed is gone; the heading takes the focus.
   */
  focusRequest?: number;
  /** The request was served, so a later remount does not take the focus again. */
  onFocused?: () => void;
}) {
  // A "Needs" or "Leads to" press redraws this panel for the concept it names,
  // and the button that had focus goes with it: focus moves to the new
  // concept's name, so a keyboard or a screen reader keeps its place.
  const heading = useRef<HTMLHeadingElement | null>(null);
  const picked = useRef(false);
  const focusId = focus?.id ?? null;
  useEffect(() => {
    if (focusRequest === 0 || heading.current === null) return;
    heading.current.focus({ preventScroll: true });
    heading.current.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
    onFocused?.();
    // Asked once per request; `onFocused` is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);
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
