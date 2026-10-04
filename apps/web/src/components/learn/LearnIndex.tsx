"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConceptGraph, ConceptGraphKey } from "@/components/ConceptGraph";
import { DomainCards, DomainView, type Place } from "@/components/learn/DomainBrowser";
import type { MapMark } from "@/components/learn/DomainGraph";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx, LABEL } from "@/components/ui/classes";
import { isImeKey } from "@/components/ui/composer-keys";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedControl, type SegmentItem } from "@/components/ui/SegmentedControl";
import { courseScope, neighbourhood, type GraphEdge, type GraphNode } from "@/lib/concept-graph";
import type { DomainMapData } from "@/lib/domain-map";
import { domainOfConcepts, matchCounts } from "@/lib/domain-view";
import { firstMatch } from "@/lib/map-reading";
import { LEECH_LABEL } from "@/lib/review-core";
import {
  bucketCounts,
  indexSearch,
  matchesFilter,
  matchesQuery,
  parseFilter,
  parseScope,
  parseView,
  statusFilterOptions,
  type GraphScope,
  type IndexFilter,
  type IndexRow,
  type IndexView,
} from "@/lib/learn-index";

export { MapPanel } from "@/components/learn/DomainBrowser";

const VIEW_ITEMS: SegmentItem<IndexView>[] = [
  { id: "table", label: "Table" },
  { id: "graph", label: "Graph" },
];

/**
 * The Learn index (hi-fi 09). The map opens on a card per domain; a card
 * opens that domain as a picture, and a topic's title opens the topic
 * (docs/proposals/domain-map.md, D2). The table, every concept with search
 * and mastery filters and the selected one's graph beside it, is one press
 * away.
 *
 * The rows and the pictures arrive worked out on the server; filtering,
 * searching, picking and moving between levels happen here, with no round
 * trip. A move between levels is a history entry (`pushState`), so Back goes
 * back up; the selection, the view, the scope and the filter are mirrored
 * into the query string with `replaceState` (`indexSearch`), so a reload keeps
 * the place and "Open in the map" in the workspace can link to a concept.
 */

type Initial = {
  selected: string | null;
  view: IndexView;
  scope: GraphScope;
  filter: IndexFilter;
  domain: string | null;
  topic: string | null;
};

/**
 * The place a URL names, checked against what the page holds: a domain it
 * knows, a topic of that domain, and, when the map is asked for a concept
 * with no domain, the concept's own.
 */
function placeOf(
  map: DomainMapData,
  domainOf: Readonly<Record<string, string>>,
  asked: { view: IndexView; selected: string | null; domain: string | null; topic: string | null },
): Place {
  if (asked.view !== "graph") return { domain: null, topic: null };
  const domain =
    asked.domain !== null && asked.domain in map.layouts
      ? asked.domain
      : asked.domain === null && asked.selected !== null
        ? (domainOf[asked.selected] ?? null)
        : null;
  const topic = domain !== null && asked.topic !== null && map.layouts[domain].groups.some((g) => g.topic === asked.topic) ? asked.topic : null;
  return { domain, topic };
}

/** A selection the place cannot show is let go: a concept in another domain, or outside the open topic. */
function shownIn(map: DomainMapData, domainOf: Readonly<Record<string, string>>, place: Place, id: string | null): string | null {
  if (id === null || place.domain === null) return id;
  if (domainOf[id] !== place.domain) return null;
  if (place.topic !== null && !map.layouts[place.domain].groups.some((g) => g.topic === place.topic && g.concepts.includes(id))) return null;
  return id;
}

export function LearnIndex({
  rows,
  edges,
  map,
  initial,
  foldersOnly = false,
}: {
  rows: IndexRow[];
  edges: GraphEdge[];
  map: DomainMapData;
  initial: Initial;
  /** The topic vocabulary could not be read, so the domains are the notes' folders. */
  foldersOnly?: boolean;
}) {
  const domainOf = useMemo(() => domainOfConcepts(map.tree), [map]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(initial.filter);
  const [view, setView] = useState(initial.view);
  const [scope, setScope] = useState(initial.scope);
  const [place, setPlace] = useState<Place>(() => placeOf(map, domainOf, initial));
  const [selected, setSelected] = useState(() => shownIn(map, domainOf, placeOf(map, domainOf, initial), initial.selected));
  /** Asked when a pick moves to another place, which mounts a new panel: its heading takes the focus. */
  const [panelFocus, setPanelFocus] = useState(0);

  const state = { selected, view, scope, filter, domain: place.domain, topic: place.topic };
  useEffect(() => {
    const search = indexSearch(state, window.location.search);
    const next = `${window.location.pathname}${search ? `?${search}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
    // `state` is rebuilt every render from the values listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, view, scope, filter, place]);

  // Back and Forward move between levels: read the place back off the URL.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const asked = {
        view: parseView(params.get("view")),
        selected: params.get("concept"),
        domain: params.get("domain"),
        topic: params.get("topic"),
      };
      setView(asked.view);
      setScope(parseScope(params.get("scope")));
      setFilter(parseFilter(params.get("filter")));
      const next = placeOf(map, domainOf, asked);
      setSelected(shownIn(map, domainOf, next, asked.selected));
      setPlace(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [map, domainOf]);

  /** Move to another level, as a history entry. A selection outside the new place is let go. */
  const go = (next: Place, pick: string | null = selected) => {
    const kept = next.domain === null ? null : shownIn(map, domainOf, next, pick);
    setPlace(next);
    setSelected(kept);
    const search = indexSearch({ ...state, selected: kept, domain: next.domain, topic: next.topic }, window.location.search);
    window.history.pushState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  };

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
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
  const focus = byId.get(selected ?? "") ?? null;
  const shown = useMemo(() => new Set(visible.map((r) => r.id)), [visible]);
  // The map dims what the table would hide, so the structure stays readable (D8).
  const dimmed = useMemo(() => new Set(rows.filter((r) => !shown.has(r.id)).map((r) => r.id)), [rows, shown]);
  const matches = useMemo(() => matchCounts(map.tree, shown), [map, shown]);
  const marks = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.id, { ready: r.ready, overdue: r.overdue, leech: r.leech } satisfies MapMark])),
    [rows],
  );
  const domain = place.domain === null ? null : (map.tree.find((d) => d.slug === place.domain) ?? null);
  const layout = place.domain === null ? null : map.layouts[place.domain];

  /** Select a concept; one in another domain, or outside the open topic, moves there. */
  const pick = (id: string) => {
    const there = domainOf[id] ?? null;
    if (there === null) return;
    const inTopic = place.topic === null || (layout?.groups.some((g) => g.topic === place.topic && g.concepts.includes(id)) ?? false);
    if (there === place.domain && inTopic) setSelected(id);
    else {
      go({ domain: there, topic: null }, id);
      setPanelFocus((n) => n + 1);
    }
  };

  const toView = (next: IndexView) => {
    setView(next);
    if (next === "graph") setPlace(selected !== null ? { domain: domainOf[selected] ?? null, topic: null } : { domain: null, topic: null });
    else setScope("neighbourhood");
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
          onClear={() => setQuery("")}
          onKeyDown={(e) => {
            // On the map, Enter opens the best match in its domain (D8).
            // The Enter that confirms an input method's word is not a search.
            if (e.key !== "Enter" || isImeKey(e.nativeEvent) || view !== "graph") return;
            // Only among the rows on screen (the filter and the search both), so Enter
            // never lands on a concept the map has dimmed.
            const id = firstMatch(visible, query);
            if (id !== null) {
              e.preventDefault();
              if (domainOf[id] === place.domain && place.topic === null) setSelected(id);
              else go({ domain: domainOf[id] ?? null, topic: null }, id);
            }
          }}
          className="w-full sm:w-[280px]"
        />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu label="Status" options={statusOptions} value={filter} defaultValue="all" onChange={setFilter} />
        {/* One view of two, so a segmented radio group rather than two toggles. */}
        <SegmentedControl
          label="View"
          value={view}
          onChange={toView}
          items={VIEW_ITEMS}
          className="ml-auto"
        />
      </div>

      {view === "graph" && foldersOnly && (
        <p role="status" className="rounded-xl bg-warn-tint px-4 py-2 text-[13px] text-text">
          Topics could not be read, so concepts are grouped by their note folders until they can.
        </p>
      )}

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
      ) : domain === null || layout === null ? (
        // Keyed by level, so each one fades in over the one it replaces.
        <div key="domains" className="animate-fade-in motion-reduce:animate-none">
          <DomainCards
            tree={map.tree}
            rows={byId}
            matches={matches}
            searching={query.trim() !== "" || filter !== "all"}
            onOpen={(slug) => go({ domain: slug, topic: null })}
          />
        </div>
      ) : (
        <div key={`${domain.slug}:${place.topic ?? ""}`} className="animate-fade-in motion-reduce:animate-none">
          <DomainView
            domain={domain}
            layout={layout}
            topic={place.topic}
            rows={byId}
            nodes={nodes}
            edges={edges}
            domainOf={domainOf}
            selected={selected}
            dimmed={dimmed}
            marks={marks}
            filter={filter}
            onFilter={setFilter}
            onGo={(next) => go(next)}
            onSelect={setSelected}
            onPick={pick}
            panelFocus={panelFocus}
            onPanelFocused={() => setPanelFocus(0)}
          />
        </div>
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
        <SegmentedControl
          label="Graph scope"
          value={scope}
          onChange={onScope}
          items={[
            { id: "neighbourhood", label: "Neighbourhood" },
            { id: "course", label: wider },
          ]}
        />
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
