"use client";

import { useState } from "react";
import type {
  Course,
  KnowledgeInput,
  Module,
  Topic,
  TopicKnowledge,
} from "@/lib/types";
import { useLearner } from "@/lib/learner-context";
import { formatKnowledgeMarkdown } from "@/lib/agent/summary";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown date";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toLines(items: string[]): string {
  return items.join("\n");
}

function fromLines(value: string): string[] {
  return value
    .split("\n")
    .map((v) => v.replace(/^[-*\s]+/, "").trim())
    .filter(Boolean);
}

function RecapSection({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-[var(--muted-strong)]">
        {label}
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--muted-strong)]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Read-only view of a stored recap. */
export function RecapCard({
  knowledge,
  course,
  module,
  topic,
  title = "What you established",
  onEdit,
}: {
  knowledge: TopicKnowledge;
  course: Course;
  module: Module;
  topic: Topic;
  title?: string;
  onEdit?: () => void;
}) {
  const { forgetKnowledge } = useLearner();
  const [copied, setCopied] = useState(false);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(
        formatKnowledgeMarkdown(knowledge, course, module, topic),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--accent-strong)]">
          {title}
        </p>
        <p className="text-[11px] text-[var(--muted)]">
          {knowledge.sessions} session{knowledge.sessions === 1 ? "" : "s"} ·{" "}
          {formatDate(knowledge.updatedAt)} ·{" "}
          {knowledge.source === "agent" ? "agent recap" : "written by hand"}
        </p>
      </div>

      {knowledge.summary && (
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">
          {knowledge.summary}
        </p>
      )}

      <RecapSection label="Key points" items={knowledge.keyPoints} />
      <RecapSection
        label="Misconceptions corrected"
        items={knowledge.misconceptions}
      />
      <RecapSection label="Open questions" items={knowledge.openQuestions} />

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="font-medium text-[var(--accent-strong)] hover:underline"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={copyMarkdown}
          className="font-medium text-[var(--accent-strong)] hover:underline"
        >
          {copied ? "Copied" : "Copy as Markdown"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                `Delete the recap for "${topic.title}"? This cannot be undone.`,
              )
            ) {
              forgetKnowledge(topic.id);
            }
          }}
          className="font-medium text-[var(--muted)] hover:text-red-600 hover:underline dark:hover:text-red-400"
        >
          Forget
        </button>
      </div>
    </div>
  );
}

/** Editable form for writing or correcting a recap by hand. */
export function RecapEditor({
  initial,
  submitLabel = "Save recap",
  onSave,
  onCancel,
}: {
  initial?: Partial<KnowledgeInput>;
  submitLabel?: string;
  onSave: (input: KnowledgeInput) => void;
  onCancel: () => void;
}) {
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [keyPoints, setKeyPoints] = useState(
    toLines(initial?.keyPoints ?? []),
  );
  const [misconceptions, setMisconceptions] = useState(
    toLines(initial?.misconceptions ?? []),
  );
  const [openQuestions, setOpenQuestions] = useState(
    toLines(initial?.openQuestions ?? []),
  );

  const fieldClass =
    "mt-1 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2";
  const labelClass =
    "text-xs font-semibold text-[var(--muted-strong)]";

  const empty =
    !summary.trim() &&
    !keyPoints.trim() &&
    !misconceptions.trim() &&
    !openQuestions.trim();

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div>
        <label className={labelClass} htmlFor="recap-summary">
          Summary
        </label>
        <textarea
          id="recap-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="What did you actually work out? Write it for yourself in six months."
          className={fieldClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="recap-key-points">
          Key points — one per line
        </label>
        <textarea
          id="recap-key-points"
          value={keyPoints}
          onChange={(e) => setKeyPoints(e.target.value)}
          rows={3}
          className={fieldClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="recap-misconceptions">
          Misconceptions corrected — one per line
        </label>
        <textarea
          id="recap-misconceptions"
          value={misconceptions}
          onChange={(e) => setMisconceptions(e.target.value)}
          rows={2}
          className={fieldClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="recap-open-questions">
          Open questions — one per line
        </label>
        <textarea
          id="recap-open-questions"
          value={openQuestions}
          onChange={(e) => setOpenQuestions(e.target.value)}
          rows={2}
          placeholder="These get handed to the tutor next time you launch this topic."
          className={fieldClass}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={empty}
          onClick={() =>
            onSave({
              summary: summary.trim(),
              keyPoints: fromLines(keyPoints),
              misconceptions: fromLines(misconceptions),
              openQuestions: fromLines(openQuestions),
              source: "manual",
            })
          }
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Recap block for a topic row: shows the record, or an affordance to write one. */
export function TopicRecap({
  course,
  module,
  topic,
}: {
  course: Course;
  module: Module;
  topic: Topic;
}) {
  const { state, saveKnowledge } = useLearner();
  const knowledge = state.knowledge[topic.id];
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="w-full">
        <RecapEditor
          initial={knowledge}
          onSave={(input) => {
            saveKnowledge(topic.id, input, { countSession: false });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  if (!knowledge) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
      >
        Add recap
      </button>
    );
  }

  return (
    <div className="w-full">
      <RecapCard
        knowledge={knowledge}
        course={course}
        module={module}
        topic={topic}
        onEdit={() => setEditing(true)}
      />
    </div>
  );
}
