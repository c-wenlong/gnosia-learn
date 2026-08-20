import Link from "next/link";
import { ConceptGraph } from "@/components/ConceptGraph";
import { dueConcepts, loadKnowledgeBase } from "@/lib/kb/load";
import type { KbConcept, MasteryLabel } from "@/lib/kb/types";
import { findTopicAcrossCourses } from "@/lib/agent/lookup";

export const metadata = { title: "Knowledge base" };

const MASTERY_STYLE: Record<MasteryLabel, string> = {
  mastered:
    "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
  solid: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  shaky: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/50 dark:text-yellow-200",
  weak: "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200",
  gap: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

function ConceptRow({
  concept,
  onFrontier,
}: {
  concept: KbConcept;
  onFrontier: boolean;
}) {
  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{concept.title}</span>
        <span className="flex items-center gap-2 text-xs">
          {onFrontier && (
            <span className="rounded px-1.5 py-0.5 font-medium text-[var(--accent-strong)] ring-1 ring-[var(--accent-strong)]">
              frontier
            </span>
          )}
          {concept.leech && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800 dark:bg-red-950/50 dark:text-red-200">
              leech
            </span>
          )}
          <span
            className={`rounded px-1.5 py-0.5 font-medium tabular-nums ${MASTERY_STYLE[concept.mastery]}`}
          >
            {Math.round(concept.pL * 100)}% {concept.mastery}
          </span>
        </span>
      </div>

      {concept.summary && (
        <p className="mt-1 text-sm text-[var(--muted-strong)]">{concept.summary}</p>
      )}

      <p className="mt-1.5 font-mono text-[11px] text-[var(--muted)]">
        {concept.id}
        {concept.requires.length > 0 && ` ← ${concept.requires.join(", ")}`}
        {concept.assumes.length > 0 && ` · assumes ${concept.assumes.join(", ")}`}
        {concept.observations > 0 &&
          ` · ${concept.correct}/${concept.observations} correct`}
        {concept.due && ` · review ${formatDate(concept.due)}`}
      </p>

      <TopicLinks topicIds={concept.topics} />
    </li>
  );
}

/** Concepts can name the course topics they support, linking the two halves. */
function TopicLinks({ topicIds }: { topicIds: string[] }) {
  const resolved = topicIds
    .map((id) => ({ id, found: findTopicAcrossCourses(id) }))
    .filter(
      (r): r is { id: string; found: NonNullable<typeof r.found> } =>
        r.found !== undefined,
    );

  if (resolved.length === 0) return null;

  return (
    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
      {resolved.map(({ id, found }) => (
        <Link
          key={id}
          href={`/courses/${found.course.slug}/${found.module.slug}`}
          className="text-[var(--accent-strong)] hover:underline"
        >
          {found.course.code} · {found.topic.title}
        </Link>
      ))}
    </p>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-lg font-semibold">No concepts yet</h2>
      <p className="mt-2 text-sm text-[var(--muted-strong)]">
        The knowledge base is empty, or the snapshot has not been generated.
        This page is a view over <code>learn/state/index.json</code> — the
        pipeline writes it, the site reads it.
      </p>
      <p className="mt-3 text-sm text-[var(--muted-strong)]">
        Start a session in Claude Code with{" "}
        <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5">
          /learn &lt;topic&gt;
        </code>
        , or seed it by hand:
      </p>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)] p-3 text-xs leading-relaxed">
        {`npm run learn -- concept add --title "Softmax" \\
  --summary "Normalises scores into a distribution."
npm run learn -- index`}
      </pre>
    </div>
  );
}

export default function LearnPage() {
  const kb = loadKnowledgeBase();
  const frontier = new Set(kb.frontier);
  const due = dueConcepts(kb);

  const ordered = [...kb.concepts].sort((a, b) => {
    const aFront = frontier.has(a.id) ? 0 : 1;
    const bFront = frontier.has(b.id) ? 0 : 1;
    return aFront - bFront || a.pL - b.pL || a.title.localeCompare(b.title);
  });

  return (
    <article className="prose-docs space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-sm text-[var(--muted)]">Knowledge base</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What I actually know
        </h1>
        <p className="text-sm text-[var(--muted-strong)]">
          Mastery is p(L) from Bayesian Knowledge Tracing — the probability you
          hold a concept given every answer you have given. Driven by the{" "}
          <code>learn</code> pipeline; regenerate with{" "}
          <code>npm run learn -- index</code>.
        </p>
      </header>

      {kb.concepts.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatCard label="concepts" value={kb.stats.total} />
            <StatCard label="mastered" value={kb.stats.mastered} />
            <StatCard label="learning" value={kb.stats.learning} />
            <StatCard label="untouched" value={kb.stats.untouched} />
            <StatCard label="due now" value={due.length} />
          </section>

          {kb.frontier.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">The frontier</h2>
              <p className="text-sm text-[var(--muted)]">
                Every prerequisite met, the concept itself not yet held. The only
                place teaching is efficient.
              </p>
              <ul className="space-y-2">
                {kb.frontier.map((id) => {
                  const concept = kb.concepts.find((c) => c.id === id);
                  return concept ? (
                    <ConceptRow key={id} concept={concept} onFrontier />
                  ) : null;
                })}
              </ul>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Dependency graph</h2>
            <p className="text-sm text-[var(--muted)]">
              Solid arrows are hard prerequisites: they gate teaching and carry
              evidence. Dotted arrows are background, which only affects
              ordering. Dashed borders mark the frontier.
            </p>
            <ConceptGraph
              concepts={kb.concepts}
              edges={kb.edges}
              frontier={kb.frontier}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">
              All concepts ({kb.concepts.length})
            </h2>
            <ul className="space-y-2">
              {ordered.map((concept) => (
                <ConceptRow
                  key={concept.id}
                  concept={concept}
                  onFrontier={frontier.has(concept.id)}
                />
              ))}
            </ul>
          </section>

          <footer className="border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            Snapshot generated {formatDate(kb.generatedAt)}. Notes live in{" "}
            <code>learn/concepts/</code>; the map in <code>learn/map.md</code>.{" "}
            <Link href="/" className="text-[var(--accent-strong)] hover:underline">
              Back to courses
            </Link>
          </footer>
        </>
      )}
    </article>
  );
}
