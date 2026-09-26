"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { TopicRecap } from "@/components/TopicRecap";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { PathNode } from "@/components/ui/PathNode";
import { conceptHref, nodeCaption, topicSessionHref, type TopicMastery } from "@/lib/course-path";
import { useLearner } from "@/lib/learner-context";
import type { Course, Module, Topic } from "@/lib/types";

/**
 * One node on the path and the row beside it: the topic's title, its
 * mastery caption, Continue on the active node, and a toggle that opens the
 * topic's own tools underneath.
 *
 * Those tools are what the module page's checklist used to hold, folded in
 * so nothing was lost when the page became a unit on the path: the concepts
 * behind the node, the subtopics, the done tick, the personal note, the recap,
 * and the topic's tutor session.
 *
 * The node column is a fixed 72px track whose connector stretches to the
 * row's full height, so an open panel keeps the path joined up.
 */
export function PathTopicRow({
  course,
  module,
  topic,
  mastery,
  active,
  continueHref,
  last,
}: {
  course: Course;
  module: Module;
  topic: Topic;
  mastery: TopicMastery | undefined;
  active: boolean;
  continueHref: string;
  last: boolean;
}) {
  const { state } = useLearner();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ticked = Boolean(state.completed[topic.id]);

  const bucket = mastery ? mastery.bucket : ticked ? "mastered" : "untouched";

  return (
    <li className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-4">
      <div className="flex flex-col items-center">
        <PathNode bucket={bucket} active={active} glyph={!mastery && ticked ? "check" : "dot"} />
        {!last && <span aria-hidden className="min-h-[18px] w-[3px] flex-1 rounded-sm bg-border" />}
      </div>
      <div className={cx("min-w-0", !last && "pb-[18px]")}>
        <div className="flex min-h-[78px] items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 py-2">
            <div className="min-w-[min(100%,12rem)] flex-1">
              <h3 className={cx("text-[15px] leading-snug text-text", active ? "font-bold" : "font-medium")}>
                {topic.title}
              </h3>
              <p className="mt-0.5 text-[12px] text-text2">{nodeCaption(mastery, ticked)}</p>
            </div>
            {active && (
              <Button href={continueHref} size="sm">
                Continue
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? "Hide" : "Show"} notes and links for ${topic.title}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text3 transition-colors duration-100 hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg
              viewBox="0 0 20 20"
              className={cx("h-5 w-5 transition-transform duration-150", open && "rotate-180")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </button>
        </div>
        {open && (
          <TopicPanel
            // A reset clears the notes on the server; a new epoch remounts the
            // panel so the draft does not write the old note straight back.
            key={state.epoch}
            id={panelId}
            course={course}
            module={module}
            topic={topic}
            mastery={mastery}
          />
        )}
      </div>
    </li>
  );
}

function TopicPanel({
  id,
  course,
  module,
  topic,
  mastery,
}: {
  id: string;
  course: Course;
  module: Module;
  topic: Topic;
  mastery: TopicMastery | undefined;
}) {
  const { state, toggleTopicCompletion, updateNote } = useLearner();
  const saved = state.notes[topic.id] ?? "";
  const [draft, setDraft] = useState(saved);
  const checkboxId = useId();
  const noteId = useId();

  // Saved 400ms after the last keystroke, as the checklist did.
  useEffect(() => {
    if (draft === saved) return;
    const t = window.setTimeout(() => updateNote(topic.id, draft), 400);
    return () => window.clearTimeout(t);
  }, [draft, saved, topic.id, updateNote]);

  const hasRecap = Boolean(state.knowledge[topic.id]);

  return (
    <div id={id} className="mb-1 flex flex-col gap-4 rounded-xl bg-surface2 p-4 text-[14px]">
      {mastery && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.05em] text-text3">Concepts</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {mastery.concepts.map((c) => (
              <li key={c.slug} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Link
                  href={conceptHref(c.slug)}
                  className="font-medium text-accent-text underline-offset-4 hover:underline"
                >
                  {c.title}
                </Link>
                <MasteryDot bucket={c.bucket} pL={c.pL} showLabel size={12} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {topic.subtopics.length > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.05em] text-text3">Covers</h4>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-text2">
            {topic.subtopics.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2 text-text">
          <input
            id={checkboxId}
            type="checkbox"
            checked={Boolean(state.completed[topic.id])}
            onChange={() => toggleTopicCompletion(topic.id)}
            className="h-4 w-4 cursor-pointer accent-accent"
          />
          Mark done
        </label>
        <Link
          href={topicSessionHref(course.slug, module.slug, topic.id)}
          className="font-medium text-accent-text underline-offset-4 hover:underline"
        >
          {hasRecap ? "Resume tutor chat" : "Tutor chat"}
        </Link>
        <TopicRecap course={course} module={module} topic={topic} />
      </div>
      {mastery && (
        <p className="-mt-2 text-[12px] text-text3">
          Mastery moves this node. The tick is your own record and does not.
        </p>
      )}

      <div>
        <label htmlFor={noteId} className="text-[11px] font-bold uppercase tracking-[0.05em] text-text3">
          Your note
        </label>
        <textarea
          id={noteId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Personal notes for this topic"
          rows={3}
          className="mt-1.5 block w-full resize-y rounded-lg border-2 border-border bg-surface px-3.5 py-2.5 text-[14px] text-text outline-none transition-colors duration-100 placeholder:text-text3 focus:border-accent"
        />
      </div>
    </div>
  );
}
