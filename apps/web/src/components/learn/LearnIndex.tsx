"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConceptGraph, ConceptGraphKey } from "@/components/ConceptGraph";
import { ConceptMap, type FitRequest, type MapMark } from "@/components/learn/ConceptMap";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { cx, LABEL } from "@/components/ui/classes";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchField } from "@/components/ui/SearchField";
import { courseScope, neighbourhood, type GraphEdge, type GraphNode } from "@/lib/concept-graph";
import type { MapLayout } from "@/lib/concept-map";
import { firstMatch, relatedTo, standingLine } from "@/lib/map-reading";
import { MASTERY_BUCKET_LABEL } from "@/lib/mastery-bucket";
import { LEECH_LABEL } from "@/lib/review-core";
import {
  bucketCounts,
  indexSearch,
  matchesFilter,
  matchesQuery,
  statusFilterOptions,
  type GraphScope,
  type IndexFilter,
  type IndexRow,
  type IndexView,
} from "@/lib/learn-index";

/**
 * The Learn index (hi-fi 09): every concept in a table with search and
 * mastery filters, and the graph of the selected one docked beside it.
 *
 * The rows arrive with every label worked out on the server; filtering,
 * searching and picking a row happen here, with no round trip. The selection,
 * the view and the scope are mirrored into the query string with
 * `history.replaceState` (`indexSearch`), so "Open full course graph" in the
 * workspace can link straight to a concept's course on the map and a reload
 * keeps the place.
 */

export function LearnIndex({
  rows,
  edges,
  map,
  initial,
}: {
  rows: IndexRow[];
  edges: GraphEdge[];
  map: MapLayout;
  initial: { selected: string | null; view: IndexView; scope: GraphScope; filter: IndexFilter };
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(initial.filter);
  const [view, setView] = useState(initial.view);
  const [scope, setScope] = useState(initial.scope);
  const [selected, setSelected] = useState(initial.selected);
  const [fitRequest, setFitRequest] = useState<FitRequest | null>(null);

  useEffect(() => {
    const search = indexSearch({ selected, view, scope, filter }, window.location.search);
    const next = `${window.location.pathname}${search ? `?${search}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [selected, view, scope, filter]);

  const visible = useMemo(
    () => rows.filter((r) => matchesFilter(r, filter) && matchesQuery(r, query)),
    [rows, filter, query],
  );
  const counts = bucketCounts(rows);
  const statusOptions = useMemo(() => statusFilterOptions(rows), [rows]);
  const nodes: GraphNode[] = useMemo(
    () => rows.map((r) => ({ id: r.id, title: r.title, bucket: r.bucket, pL: r.pL, courses: r.courses, domain: r.domain })),
    [rows],
  );
  const focus = rows.find((r) => r.id === selected) ?? null;
  // The map dims what the table would hide, so the structure stays readable (docs/proposals/knowledge-map.md).
  const dimmed = useMemo(() => {
    const shown = new Set(visible.map((r) => r.id));
    return new Set(rows.filter((r) => !shown.has(r.id)).map((r) => r.id));
  }, [rows, visible]);
  const marks = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.id, { ready: r.ready, overdue: r.overdue, leech: r.leech } satisfies MapMark])),
    [rows],
  );
  /** Select a concept from outside the map and move the map to it. */
  const reveal = (id: string, to: FitRequest["to"]) => {
    setSelected(id);
    // A fit to a scope is the map's scope from now on, so the URL and a reload agree with it.
    if (to !== "center") setScope(to);
    setFitRequest({ to, n: Date.now() });
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[20rem] flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-[28px] leading-tight font-bold text-text">Learn</h1>
          <p className="text-[12px] text-text2">
            {rows.length} concept{rows.length === 1 ? "" : "s"} · {counts.mastered} mastered · {counts.learning} learning ·{" "}
            {counts.untouched} untouched
          </p>
        </div>
        <SearchField
          label="Search concepts"
          placeholder="Search concepts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // On the map, Enter lands on the best match and fits its neighbourhood.
            if (e.key !== "Enter" || view !== "graph") return;
            // Only among the rows on screen (the filter and the search both), so Enter
            // never lands on a concept the map has dimmed.
            const id = firstMatch(visible, query);
            if (id !== null) {
              e.preventDefault();
              reveal(id, "neighbourhood");
            }
          }}
          className="w-full sm:w-[280px]"
        />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu label="Status" options={statusOptions} value={filter} defaultValue="all" onChange={setFilter} />
        <div className="ml-auto flex gap-2" role="group" aria-label="View">
          <Chip active={view === "table"} onClick={() => { setView("table"); setScope("neighbourhood"); }}>
            Table
          </Chip>
          <Chip active={view === "graph"} onClick={() => { setView("graph"); setScope("island"); }}>
            Graph
          </Chip>
        </div>
      </div>

      {view === "table" ? (
        // Sized by the width the page actually has, not the viewport's: the
        // sidebar takes 60 or 260px of it, so a viewport breakpoint docked the
        // graph beside a table with no room left for the concept titles. It
        // fades in over the map it replaces.
        <div className="@container animate-fade-in motion-reduce:animate-none">
          <div className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
            <ConceptTable rows={visible} selected={selected} onSelect={setSelected} total={rows.length} />
            <GraphCard
              nodes={nodes}
              edges={edges}
              focus={focus}
              scope={scope}
              onScope={setScope}
              onSelect={setSelected}
            />
          </div>
        </div>
      ) : (
        <MapCard
          layout={map}
          nodes={nodes}
          edges={edges}
          focus={focus}
          scope={scope}
          onScope={setScope}
          onSelect={setSelected}
          onReveal={(id) => reveal(id, "center")}
          dimmed={dimmed}
          marks={marks}
          fitRequest={fitRequest}
        />
      )}
    </div>
  );
}

function ConceptTable({
  rows,
  selected,
  onSelect,
  total,
}: {
  rows: IndexRow[];
  selected: string | null;
  onSelect: (id: string) => void;
  total: number;
}) {
  const th = cx("px-3 py-2.5 sm:px-4 text-left", LABEL);
  // The columns come in by the table's own width (container queries), so the
  // concept title keeps at least ~180px however the sidebar and the graph card
  // share the page: the mastery bar from 32rem, Last seen from 42rem, Course
  // from 56rem, where the title still has ~330px beside all 564px of them.
  return (
    <div className="@container min-w-0 overflow-hidden rounded-[20px] border-2 border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">Concepts, {rows.length} of {total} shown. Choose a row to show its graph.</caption>
          <thead>
            <tr className="border-b border-hair">
              <th scope="col" className={th}>Concept</th>
              <th scope="col" className={cx(th, "w-[64px] @lg:w-[236px]")}>Mastery</th>
              <th scope="col" className={cx(th, "w-[92px]")}>Due</th>
              <th scope="col" className={cx(th, "hidden w-[112px] @2xl:table-cell")}>Last seen</th>
              <th scope="col" className={cx(th, "hidden w-[124px] @4xl:table-cell")}>Course</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-[14px] text-text2">
                  No concept matches. Try another filter or a shorter search.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                aria-selected={r.id === selected}
                className={cx(
                  "cursor-pointer border-b border-hair transition-colors duration-100 last:border-b-0 motion-reduce:transition-none",
                  r.id === selected ? "bg-surface2" : "hover:bg-surface2/60",
                )}
              >
                <td className="px-3 py-2.5 sm:px-4">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <MasteryDot bucket={r.bucket} className="shrink-0" />
                    <Link
                      href={`/learn/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      // Tabbing through the titles moves the graph along with the focus.
                      onFocus={() => onSelect(r.id)}
                      className="min-w-0 truncate rounded-sm text-[14px] text-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {r.title}
                    </Link>
                    {r.leech && <span className="shrink-0 text-[12px] font-semibold text-danger">{LEECH_LABEL}</span>}
                  </span>
                </td>
                <td className="px-3 py-2.5 sm:px-4">
                  <span className="flex items-center gap-2">
                    {/* The width goes on the wrapper, not the bar: the bar's own
                        w-full wins over a width passed in className, and inside
                        a flex row that left this span sized to nothing. */}
                    <span className="hidden w-[160px] shrink-0 @lg:block">
                      <ProgressBar
                        percent={r.bucket === "untouched" ? 0 : r.pL * 100}
                        size="sm"
                        tone={r.bucket === "mastered" ? "hi" : "mid"}
                        label={`${r.title} mastery`}
                      />
                    </span>
                    <span className="w-8 text-[12px] text-text2 tabular-nums">{r.bucket === "untouched" ? "–" : r.pL.toFixed(2)}</span>
                  </span>
                </td>
                <td className={cx("px-3 py-2.5 sm:px-4 text-[12px] whitespace-nowrap", r.overdue ? "text-danger" : "text-text2")}>
                  {r.dueLabel}
                </td>
                <td className="hidden px-3 py-2.5 sm:px-4 text-[12px] whitespace-nowrap text-text2 @2xl:table-cell">{r.lastSeenLabel}</td>
                <td className="hidden px-3 py-2.5 sm:px-4 text-[12px] whitespace-nowrap text-text2 @4xl:table-cell">{r.courseLabel ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The Graph view: every concept on one map (docs/proposals/knowledge-map.md),
 * the selected one ringed, opened fitted to its island, neighbourhood or
 * course (the URL's `scope`).
 */
function MapCard({
  layout,
  nodes,
  edges,
  focus,
  scope,
  onScope,
  onSelect,
  onReveal,
  dimmed,
  marks,
  fitRequest,
}: {
  layout: MapLayout;
  nodes: GraphNode[];
  edges: GraphEdge[];
  focus: IndexRow | null;
  scope: GraphScope;
  onScope: (scope: GraphScope) => void;
  onSelect: (id: string) => void;
  onReveal: (id: string) => void;
  dimmed: ReadonlySet<string>;
  marks: Record<string, MapMark>;
  fitRequest: FitRequest | null;
}) {
  return (
    <Card title="Map">
      {/* Sized by the room the page has: the panel docks beside the map when it fits, under it otherwise. */}
      <div className="@container">
        <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_280px]">
          <ConceptMap
            layout={layout}
            nodes={nodes}
            edges={edges}
            selected={focus?.id ?? null}
            onSelect={onSelect}
            scope={scope}
            onScope={onScope}
            dimmed={dimmed}
            marks={marks}
            fitRequest={fitRequest}
          />
          <MapPanel focus={focus} nodes={nodes} edges={edges} onPick={onReveal} />
        </div>
      </div>
      <p className="text-[11px] leading-4 text-text3">
        Prerequisites sit above. Solid: required. Dashed: background. The arc round a dot is its p(L); a dashed ring is
        ready to learn; a red dot is a review overdue, a red ring keeps slipping.
      </p>
    </Card>
  );
}

/**
 * The selected concept, beside the map (phase 3 of docs/proposals/knowledge-map.md):
 * how well it is known, when it is due, where it is taught, what it needs and
 * what leads on from it. Choosing one of those moves the map to it.
 */
function MapPanel({
  focus,
  nodes,
  edges,
  onPick,
}: {
  focus: IndexRow | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onPick: (id: string) => void;
}) {
  if (focus === null) {
    return (
      <section aria-label="Concept details" className="rounded-xl bg-surface2 p-4 text-[13px] text-text2">
        Choose a concept on the map to see what it needs and what it leads to.
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
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                data-concept={n.id}
                onClick={() => onPick(n.id)}
                className="flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] text-text hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
              >
                <MasteryDot bucket={n.bucket} size={10} className="shrink-0" />
                <span className="min-w-0 truncate">{n.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <section aria-label="Concept details" className="flex min-w-0 flex-col gap-3 rounded-xl bg-surface2 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] leading-snug font-bold text-text">{focus.title}</h3>
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

function GraphCard({
  nodes,
  edges,
  focus,
  scope,
  onScope,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focus: IndexRow | null;
  scope: GraphScope;
  onScope: (scope: GraphScope) => void;
  onSelect: (id: string) => void;
}) {
  const course = focus ? courseScope(nodes, edges, focus.id) : null;
  const shown = focus === null ? null : scope === "course" && course ? course : neighbourhood(nodes, edges, focus.id);
  const wider = course?.basis === "domain" ? "Folder" : "Course";
  const graphBox = useRef<HTMLDivElement>(null);
  /** A node was chosen from inside the graph, which its key then replaces whole. */
  const refocus = useRef(false);
  const select = (id: string) => {
    // Only a new concept re-keys the graph; pressing the ringed one again changes nothing to follow.
    refocus.current = id !== focus?.id && (graphBox.current?.contains(document.activeElement) ?? false);
    onSelect(id);
  };
  const drawn = focus === null ? null : `${focus.id}:${scope}`;
  // The node pressed went with the old graph; the concept it chose, ringed in the new one, takes the focus.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    graphBox.current?.querySelector<SVGElement>('[aria-pressed="true"]')?.focus();
  }, [drawn]);

  return (
    <Card
      title="Graph"
      action={
        <span className="flex gap-1.5" role="group" aria-label="Graph scope">
          <Chip size="sm" active={scope === "neighbourhood"} onClick={() => onScope("neighbourhood")}>
            Neighbourhood
          </Chip>
          <Chip size="sm" active={scope === "course"} onClick={() => onScope("course")}>
            {wider}
          </Chip>
        </span>
      }
    >
      {focus === null || shown === null ? (
        <p className="text-[14px] text-text2">Choose a concept to see what it needs and what needs it.</p>
      ) : (
        <>
          <p className="flex min-w-0 items-center gap-2 text-[13px] text-text2">
            <MasteryDot bucket={focus.bucket} size={12} />
            <span className="min-w-0 truncate">
              <span className="font-semibold text-text">{focus.title}</span>
              {scope === "course" && course?.basis === "course" && focus.courseLabel && ` · ${focus.courseLabel.split(" ")[0]}`}
              {scope === "course" && course?.basis === "domain" && ` · no course, showing the ${focus.domain} folder`}
            </span>
          </p>
          <div ref={graphBox} className="min-h-[300px] rounded-xl bg-surface2 p-2">
            {/* Keyed on what it draws, so a new concept's graph fades in rather than snapping into the old one's place. */}
            <ConceptGraph
              key={drawn}
              className="animate-fade-in motion-reduce:animate-none"
              nodes={shown.nodes}
              edges={shown.edges}
              focus={focus.id}
              onSelect={select}
              fit={scope === "neighbourhood"}
              compact
              label={`${scope === "course" ? "Course" : "Neighbourhood"} graph of ${focus.title}`}
            />
          </div>
          <ConceptGraphKey />
          <span>
            <Button variant="secondary" size="sm" href={`/learn/${focus.id}`}>
              Open in workspace
            </Button>
          </span>
        </>
      )}
    </Card>
  );
}
