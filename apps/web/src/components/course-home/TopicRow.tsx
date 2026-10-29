"use client";

import { useEffect, useId, useRef, useState } from "react";

import { TopicRecap } from "@/components/TopicRecap";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { cx, LABEL } from "@/components/ui/classes";
import { Collapse, CollapseChevron } from "@/components/ui/Collapse";
import { FormRow } from "@/components/ui/FormRow";
import { Textarea } from "@/components/ui/Textarea";
import { TextLink } from "@/components/ui/TextLink";
import { topicMark, topicMeta, topicSessionHref, type TopicMastery } from "@/lib/course-path";
import { useLearner } from "@/lib/learner-context";
import type { Course, Module, Topic } from "@/lib/types";

import { TopicMarkIcon } from "./icons";
import { ROW_BOX, ROW_HOVER, ROW_META, ROW_TITLE, STRETCHED } from "./rows";

/**
 * One topic as a Coursera item row: its status mark, its title over a grey
 * meta line ("3 concepts · Learning"), and on the active topic the tint and
 * Continue at the right, where Coursera puts Resume.
 *
 * The whole row opens the topic's own tools underneath: what it covers, the
 * done tick, the tutor chat, the recap and the learner's note. Those are what
 * the old module checklist held, so nothing it had is lost. Its concepts are
 * the steps the module path draws under the row, so the panel does not list
 * them again. Continue sits above the row's stretched toggle
 * and keeps its own click. On a phone it drops under the title, where the
 * row has room for it.
 */
export function TopicRow({
  course,
  module,
  topic,
  mastery,
  active,
  continueHref,
}: {
  course: Course;
  module: Module;
  topic: Topic;
  mastery: TopicMastery | undefined;
  active: boolean;
  continueHref: string;
}) {
  const { state } = useLearner();
  const [open, setOpen] = useState(false);
  // Mounted on first open and then only hidden, so closing the panel inside
  // the note's 400ms debounce still saves the last keystrokes.
  const [opened, setOpened] = useState(false);
  const panelId = useId();
  const ticked = Boolean(state.completed[topic.id]);

  return (
    <li>
      <div
        className={cx(
          ROW_BOX,
          ROW_HOVER,
          "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]",
          active && "bg-tint",
        )}
      >
        <button
          type="button"
          onClick={() => {
            setOpened(true);
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          aria-controls={panelId}
          className={cx("col-start-1 row-start-1 flex min-w-0 cursor-pointer items-center gap-2 text-left", STRETCHED)}
        >
          <TopicMarkIcon mark={topicMark(mastery, ticked)} />
          <span className="min-w-0 flex-1 pl-1">
            <span className={cx(ROW_TITLE, active && "font-semibold")}>{topic.title}</span>
            <span className={ROW_META}>{topicMeta(mastery, ticked)}</span>
          </span>
        </button>
        {active && (
          <Button
            href={continueHref}
            size="sm"
            className="relative z-10 col-start-1 row-start-2 ml-8 mt-2 animate-fade-in justify-self-start motion-reduce:animate-none sm:col-start-2 sm:row-start-1 sm:ml-0 sm:mt-1"
          >
            Continue
          </Button>
        )}
        <CollapseChevron open={open} className="col-start-2 row-start-1 shrink-0 text-text2 sm:col-start-3" />
      </div>
      {/* The panel glides open and shut; it is mounted on first open and then
          kept, so closing it keeps the note's pending keystrokes. */}
      <Collapse open={open}>
        {opened && (
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
      </Collapse>
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

  // Saved 400ms after the last keystroke, as the checklist did, and at once
  // when the field loses focus, the panel goes away or the page is left with
  // an edit pending:
  // following a sidebar or next-module link unmounts the panel, and a timer
  // cancelled then would drop the last edit. Clicking any link or Reset blurs
  // the field first, so the flush lands before a reset clears the notes and
  // the reset's remount never writes an old draft back.
  const pending = useRef<string | null>(null);
  const target = useRef({ updateNote, topicId: topic.id });
  useEffect(() => {
    target.current = { updateNote, topicId: topic.id };
  }, [updateNote, topic.id]);
  const [flush] = useState(() => () => {
    if (pending.current === null) return;
    const note = pending.current;
    pending.current = null;
    target.current.updateNote(target.current.topicId, note);
  });
  useEffect(() => {
    if (draft === saved) {
      pending.current = null;
      return;
    }
    pending.current = draft;
    const t = window.setTimeout(flush, 400);
    return () => window.clearTimeout(t);
  }, [draft, saved, flush]);
  useEffect(() => flush, [flush]);
  // Closing the tab unmounts nothing, so the pending edit goes on `pagehide`,
  // where the provider sends it with `keepalive` to outlive the page.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [flush]);

  const hasRecap = Boolean(state.knowledge[topic.id]);

  return (
    <div id={id} className="mb-2 ml-[40px] mr-2 mt-1 flex flex-col gap-4 rounded-xl bg-surface2 p-4 text-[14px]">
      {topic.subtopics.length > 0 && (
        <section>
          <h3 className={LABEL}>Covers</h3>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-text2">
            {topic.subtopics.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Checkbox id={checkboxId} checked={Boolean(state.completed[topic.id])} onChange={() => toggleTopicCompletion(topic.id)}>
          Mark done
        </Checkbox>
        <TextLink href={topicSessionHref(course.slug, module.slug, topic.id)}>
          {hasRecap ? "Resume tutor chat" : "Tutor chat"}
        </TextLink>
        <TopicRecap course={course} module={module} topic={topic} />
      </div>
      {mastery && (
        <p className="-mt-2 text-[12px] text-text2">
          Mastery sets this topic&apos;s mark. The tick is your own record and does not.
        </p>
      )}

      <FormRow id={noteId} label="Your note">
        {({ id }) => (
          <Textarea
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={flush}
            placeholder="Personal notes for this topic"
            rows={3}
          />
        )}
      </FormRow>
    </div>
  );
}
