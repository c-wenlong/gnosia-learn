import type { Metadata } from "next";

import { LearnIndex } from "@/components/learn/LearnIndex";
import { Card } from "@/components/ui/Card";
import { getCourses } from "@/data/courses";
import { defaultSelection } from "@/lib/concept-graph";
import { courseSlugsOf, placeOf } from "@/lib/concept-workspace";
import { appTimeZone } from "@/lib/time-zone";
import { loadKnowledgeBase } from "@/lib/kb/load";
import type { KbConcept } from "@/lib/kb/types";
import { dueLabel, lastSeenLabel, parseFilter, parseScope, parseView, type IndexRow } from "@/lib/learn-index";
import { bucketOf } from "@/lib/mastery-bucket";
import type { Course } from "@/lib/types";

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
    lastSeenLabel: lastSeenLabel(concept.lastSeen, now, timeZone),
    leech: concept.leech,
    courseLabel: place ? `${place.courseCode} M${place.moduleOrder}` : null,
    courses: courseSlugsOf(courses, concept.topics),
    domain: concept.domain,
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
 * are not.
 */
export default async function LearnPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [{ kb, reachable }, courses] = await Promise.all([loadKnowledgeBase(), getCourses()]);

  if (kb.concepts.length === 0) {
    return <div data-layout="app">{reachable ? <EmptyState /> : <Unreachable />}</div>;
  }

  const now = new Date();
  const timeZone = appTimeZone();
  // Studied first, then the untouched ones, alphabetical within each: the
  // untouched tail is long and says the least.
  const rows = kb.concepts
    .map((c) => toRow(c, courses, now, timeZone))
    .sort((a, b) => Number(a.bucket === "untouched") - Number(b.bucket === "untouched") || a.title.localeCompare(b.title));

  const asked = first(params.concept);
  const selected = asked !== null && rows.some((r) => r.id === asked) ? asked : defaultSelection(kb.concepts, kb.frontier, now);
  const view = parseView(first(params.view));

  return (
    <div data-layout="app">
      <LearnIndex
        rows={rows}
        edges={kb.edges}
        initial={{ selected, view, scope: parseScope(first(params.scope), view), filter: parseFilter(first(params.filter)) }}
      />
    </div>
  );
}

function Unreachable() {
  return (
    <Card title="Knowledge base unavailable" className="max-w-2xl">
      <p className="text-[14px] text-text2">
        The database could not be reached, so this page has nothing to show. Nothing has been lost: this is a view, and
        the concepts, the mastery model and the schedule are all still where they were.
      </p>
      <pre className="overflow-x-auto rounded-lg bg-surface2 p-3 text-[12px]">npm run catalog -- status</pre>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card title="No concepts yet" className="max-w-2xl">
      <p className="text-[14px] text-text2">
        The knowledge base is empty. This page is a view over the concept, mastery and review tables: the pipeline writes
        them, the site reads them. Start a session in Claude Code with /learn &lt;topic&gt;, or seed it by hand:
      </p>
      <pre className="overflow-x-auto rounded-lg bg-surface2 p-3 text-[12px] leading-relaxed">
        {`npm run learn -- concept add --title "Softmax" \\
  --topic <topic-slug> --domain <folder> \\
  --summary "Normalises scores into a distribution."`}
      </pre>
    </Card>
  );
}
