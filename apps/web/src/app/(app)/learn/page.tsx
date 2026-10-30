import type { Metadata } from "next";

import { LearnIndex } from "@/components/learn/LearnIndex";
import { Notice } from "@/components/ui/Notice";
import { getCourses } from "@/data/courses";
import { unlessUnreachable } from "@/data/source";
import { getTopics } from "@/data/topics";
import { defaultSelection } from "@gnosia/tutor/concept-graph";
import {
  cachedDomainLayouts,
  domainTree,
  type DomainMapData,
  type DomainNode,
  type DomainTopic,
} from "@/lib/domain-map";
import { readyConcepts } from "@/lib/map-reading";
import { currentOwner } from "@/lib/owner";
import { readRecentCourses } from "@/lib/recent-courses";
import { courseSlugsOf, placeOf } from "@/lib/concept-workspace";
import { appTimeZone } from "@gnosia/tutor/server/time-zone";
import { loadKnowledgeBase } from "@/lib/learner-store";
import type { KbConcept } from "@gnosia/catalog/state";
import {
  dueLabel,
  seenAgo,
  parseFilter,
  parseLayout,
  parseScope,
  parseView,
  type IndexRow,
} from "@/lib/learn-index";
import { bucketOf } from "@gnosia/tutor/mastery-bucket";
import type { Course } from "@gnosia/tutor/types";

export const metadata: Metadata = { title: "Learn" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

function toRow(
  concept: KbConcept,
  courses: readonly Course[],
  now: Date,
  timeZone: string | undefined,
): IndexRow {
  const bucket = bucketOf(concept);
  const due = dueLabel(concept.due, now, timeZone);
  const place = placeOf(courses, concept.topics);
  return {
    id: concept.id,
    title: concept.title,
    summary: concept.summary,
    bucket,
    pL: concept.pL,
    due: concept.due,
    isDue: concept.due !== null && new Date(concept.due).getTime() <= now.getTime(),
    dueLabel: due.label,
    overdue: due.overdue,
    lastSeenLabel: seenAgo(concept.lastSeen, now, timeZone),
    leech: concept.leech,
    courseLabel: place ? `${place.courseCode} M${place.moduleOrder}` : null,
    courses: courseSlugsOf(courses, concept.topics),
    domain: concept.domain,
    ready: false,
  };
}

/**
 * The Learn index (hi-fi 09). Reads the knowledge base on the server, turns
 * each concept into a row with its labels worked out in the learner's time
 * zone, and hands the rows and the edges to `LearnIndex`, which filters and
 * draws in the browser.
 *
 * Dynamic, because it reads the database, and it still says which kind of
 * empty it is: "you have no concepts" and "I could not ask" look identical and
 * are not. A database that does not answer fails the courses read as well as
 * the knowledge base's, so that read is caught too, or an outage would reach
 * the error boundary instead of this page's notice.
 */
export default async function LearnPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [{ kb, reachable }, courses, recentCourses, topics] = await Promise.all([
    loadKnowledgeBase(),
    unlessUnreachable(getCourses()),
    currentOwner().then(readRecentCourses),
    // The vocabulary places each concept in a domain (D1 of docs/proposals/domain-map.md).
    // Without it every concept falls back to its folder, which still draws a map, and
    // the page says so rather than passing folders off as the curated domains.
    getTopics().then(
      (list) => ({ list, read: true }),
      () => ({ list: [], read: false }),
    ),
  ]);

  if (courses === null || !reachable) {
    return (
      <div data-layout="app">
        <Unreachable />
      </div>
    );
  }
  if (kb.concepts.length === 0) {
    return (
      <div data-layout="app">
        <EmptyState />
      </div>
    );
  }

  const now = new Date();
  const timeZone = appTimeZone();
  // Studied first, then the untouched ones, alphabetical within each: the
  // untouched tail is long and says the least.
  const unmarked = kb.concepts
    .map((c) => toRow(c, courses, now, timeZone))
    .sort((a, b) => Number(a.bucket === "untouched") - Number(b.bucket === "untouched") || a.title.localeCompare(b.title));
  // Ready to learn in the courses being worked through (G5 of docs/proposals/knowledge-map.md).
  const ready = readyConcepts(unmarked, kb.edges, recentCourses);
  const rows = unmarked.map((r) => (ready.has(r.id) ? { ...r, ready: true } : r));

  const asked = first(params.concept);
  const known = asked !== null && rows.some((r) => r.id === asked);
  const view = parseView(first(params.view));
  // The table opens on a concept even when nobody named one; the map opens on
  // the domain cards, or on the domain of the concept the URL names.
  const selected = known ? asked : view === "table" ? defaultSelection(kb.concepts, kb.frontier, now) : null;
  // Every domain is laid out here, on the server, so dagre never reaches the
  // browser (D3), in groups and on axes (D11), and remembered per graph, so
  // a request whose graph has not changed does not pay for it again. The
  // pictures together are a few kilobytes, and moving between domains or
  // layouts then needs no round trip.
  const topicOf = new Map(kb.concepts.map((c) => [c.id, c.topic]));
  const domainNodes: DomainNode[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    bucket: r.bucket,
    pL: r.pL,
    courses: r.courses,
    domain: r.domain,
    topic: topicOf.get(r.id) ?? null,
  }));
  const vocabulary: DomainTopic[] = topics.list.map((t) => ({ slug: t.slug, title: t.title, domain: t.domain }));
  const tree = domainTree(domainNodes, kb.edges, vocabulary);
  const map: DomainMapData = {
    tree,
    layouts: cachedDomainLayouts(domainNodes, kb.edges, vocabulary, tree.map((d) => d.slug)),
  };

  return (
    <div data-layout="app">
      <LearnIndex
        rows={rows}
        edges={kb.edges}
        map={map}
        foldersOnly={!topics.read}
        initial={{
          selected,
          view,
          scope: parseScope(first(params.scope)),
          filter: parseFilter(first(params.filter)),
          domain: first(params.domain),
          topic: first(params.topic),
          layout: parseLayout(first(params.layout)),
        }}
      />
    </div>
  );
}

function Unreachable() {
  return (
    <Notice title="Knowledge base unavailable" command="npm run catalog -- status" className="max-w-2xl">
      The database could not be reached, so this page has nothing to show. Nothing has been lost: this is a view, and
      the concepts, the mastery model and the schedule are all still where they were.
    </Notice>
  );
}

function EmptyState() {
  return (
    <Notice
      title="No concepts yet"
      command={`npm run learn -- concept add --title "Softmax" \\
  --topic <topic-slug> --domain <folder> \\
  --summary "Normalises scores into a distribution."`}
      className="max-w-2xl"
    >
      The knowledge base is empty. This page is a view over the concept, mastery and review tables: the pipeline writes
      them, the site reads them. Start a session in Claude Code with /learn &lt;topic&gt;, or seed it by hand:
    </Notice>
  );
}
