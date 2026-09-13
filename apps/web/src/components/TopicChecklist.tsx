"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Course, Module, Topic } from "@/lib/types";
import { useLearner } from "@/lib/learner-context";
import { TopicRecap } from "@/components/TopicRecap";

function TopicRowEditor({
  topic,
  course,
  module,
  done,
  initialNote,
  launchHref,
  hasRecap,
  onToggle,
  onSaveNote,
}: {
  topic: Topic;
  course: Course;
  module: Module;
  done: boolean;
  initialNote: string;
  launchHref: string;
  hasRecap: boolean;
  onToggle: () => void;
  onSaveNote: (note: string) => void;
}) {
  const [expanded, setExpanded] = useState(Boolean(initialNote));
  const [draft, setDraft] = useState(initialNote);

  useEffect(() => {
    if (draft === initialNote) return;
    const t = window.setTimeout(() => onSaveNote(draft), 400);
    return () => window.clearTimeout(t);
  }, [draft, initialNote, onSaveNote]);

  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start gap-3 px-3 py-3">
        <input
          id={`topic-${topic.id}`}
          type="checkbox"
          checked={done}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <label
              htmlFor={`topic-${topic.id}`}
              className={`block min-w-0 flex-1 cursor-pointer text-[15px] leading-snug ${
                done
                  ? "text-[var(--muted)] line-through decoration-[var(--muted)]"
                  : "text-[var(--foreground)]"
              }`}
            >
              {topic.title}
            </label>
            <Link
              href={launchHref}
              className="inline-flex shrink-0 items-center rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              {hasRecap ? "Resume Agent" : "Launch Agent"}
            </Link>
          </div>
          {topic.subtopics.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-[var(--muted-strong)]">
              {topic.subtopics.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
            >
              {expanded ? "Hide note" : draft ? "Edit note" : "Add note"}
            </button>
            <TopicRecap course={course} module={module} topic={topic} />
            {expanded && (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Personal notes for this topic…"
                rows={3}
                className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function TopicRow({
  topic,
  epoch,
  course,
  module,
}: {
  topic: Topic;
  epoch: number;
  course: Course;
  module: Module;
}) {
  const { state, toggleTopicCompletion, updateNote } = useLearner();
  const done = Boolean(state.completed[topic.id]);
  const savedNote = state.notes[topic.id] ?? "";
  const launchHref = `/courses/${course.slug}/${module.slug}/session?topic=${encodeURIComponent(topic.id)}`;

  return (
    <TopicRowEditor
      key={`${topic.id}-${epoch}`}
      topic={topic}
      course={course}
      module={module}
      done={done}
      initialNote={savedNote}
      launchHref={launchHref}
      hasRecap={Boolean(state.knowledge[topic.id])}
      onToggle={() => toggleTopicCompletion(topic.id)}
      onSaveNote={(note) => updateNote(topic.id, note)}
    />
  );
}

export function TopicChecklist({
  topics,
  course,
  module,
}: {
  topics: Topic[];
  course: Course;
  module: Module;
}) {
  const { state } = useLearner();
  return (
    <ul className="space-y-2">
      {topics.map((topic) => (
        <TopicRow
          key={topic.id}
          topic={topic}
          epoch={state.epoch}
          course={course}
          module={module}
        />
      ))}
    </ul>
  );
}
