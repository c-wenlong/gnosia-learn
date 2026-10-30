"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { cx, LABEL, NOTE } from "@/components/ui/classes";
import { FormRow } from "@/components/ui/FormRow";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { Textarea } from "@/components/ui/Textarea";
import { TextLink } from "@/components/ui/TextLink";
import { useCopied } from "@/components/ui/use-copied";
import type {
  Course,
  KnowledgeInput,
  Module,
  Topic,
  TopicKnowledge,
} from "@gnosia/tutor/types";
import { useLearner } from "@/lib/learner-context";
import { formatKnowledgeMarkdown } from "@gnosia/tutor/summary";

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
    <div>
      <p className={LABEL}>{label}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] text-text2">
        {items.map((item, index) => (
          // Two lines may read the same; the position tells them apart.
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Read-only view of a stored recap: a neutral kit `Callout` with a ring, so it
 * reads as one box on the session page's white card and on a topic's grey
 * panel alike.
 */
export function RecapCard({
  knowledge,
  course,
  module,
  topic,
  title = "What you established",
  onEdit,
  editRef,
}: {
  knowledge: TopicKnowledge;
  course: Course;
  module: Module;
  topic: Topic;
  title?: string;
  onEdit?: () => void;
  /** The Edit control, for a caller that hands focus back to it when its editor closes. */
  editRef?: Ref<HTMLButtonElement>;
}) {
  const { forgetKnowledge } = useLearner();
  // A refused copy says nothing, as it always has: the Markdown is a
  // convenience, and the recap is still on screen to select by hand.
  const { copied, copy } = useCopied<"markdown">();

  return (
    <Callout
      tone="neutral"
      bordered
      role="group"
      aria-label={title}
      actions={
        <>
          {onEdit && (
            <TextLink ref={editRef} onClick={onEdit}>
              Edit
            </TextLink>
          )}
          <TextLink onClick={() => void copy(formatKnowledgeMarkdown(knowledge, course, module, topic), "markdown")}>
            {copied === "markdown" ? "Copied" : "Copy as Markdown"}
          </TextLink>
          {/* Asks in place, never in a browser dialog, which froze the page in a
              box the app could not style or animate. */}
          <InlineConfirm
            size="text"
            label="Forget"
            question={`Delete the recap for "${topic.title}"? This cannot be undone.`}
            confirmLabel="Forget it"
            onConfirm={() => forgetKnowledge(topic.id)}
          />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[14px] font-semibold text-text">{title}</p>
          <p className={NOTE}>
            {knowledge.sessions} session{knowledge.sessions === 1 ? "" : "s"} ·{" "}
            {formatDate(knowledge.updatedAt)} ·{" "}
            {knowledge.source === "agent" ? "agent recap" : "written by hand"}
          </p>
        </div>

        {knowledge.summary && (
          <p className="text-[14px] leading-relaxed text-text">
            {knowledge.summary}
          </p>
        )}

        <RecapSection label="Key points" items={knowledge.keyPoints} />
        <RecapSection
          label="Misconceptions corrected"
          items={knowledge.misconceptions}
        />
        <RecapSection label="Open questions" items={knowledge.openQuestions} />
      </div>
    </Callout>
  );
}

/** Editable form for writing or correcting a recap by hand: kit `FormRow`s over kit `Textarea`s. */
export function RecapEditor({
  initial,
  submitLabel = "Save recap",
  onSave,
  onCancel,
  className,
  focusOnOpen = false,
}: {
  initial?: Partial<KnowledgeInput>;
  submitLabel?: string;
  onSave: (input: KnowledgeInput) => void;
  onCancel: () => void;
  className?: string;
  /** Focus Summary when the editor mounts: set when a press of the reader's opened it in place of that control. */
  focusOnOpen?: boolean;
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

  const summaryField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusOnOpen) summaryField.current?.focus();
  }, [focusOnOpen]);

  const empty =
    !summary.trim() &&
    !keyPoints.trim() &&
    !misconceptions.trim() &&
    !openQuestions.trim();

  // No ids of their own: two topics' editors can be open on one module page,
  // so each row makes its own (`FormRow`).
  const fields: Array<{
    key: string;
    label: string;
    hint?: string;
    value: string;
    set: (value: string) => void;
    rows: number;
    placeholder?: string;
  }> = [
    {
      key: "summary",
      label: "Summary",
      value: summary,
      set: setSummary,
      rows: 4,
      placeholder: "What did you actually work out? Write it for yourself in six months.",
    },
    { key: "key-points", label: "Key points", hint: "One per line.", value: keyPoints, set: setKeyPoints, rows: 3 },
    {
      key: "misconceptions",
      label: "Misconceptions corrected",
      hint: "One per line.",
      value: misconceptions,
      set: setMisconceptions,
      rows: 2,
    },
    {
      key: "open-questions",
      label: "Open questions",
      hint: "One per line. These are handed to the tutor next time you launch this topic.",
      value: openQuestions,
      set: setOpenQuestions,
      rows: 2,
    },
  ];

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {fields.map((field) => (
        <FormRow key={field.key} label={field.label} hint={field.hint}>
          {({ id, describedBy }) => (
            <Textarea
              ref={field.key === "summary" ? summaryField : undefined}
              id={id}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              rows={field.rows}
              placeholder={field.placeholder}
              aria-describedby={describedBy}
            />
          )}
        </FormRow>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
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
        >
          {submitLabel}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
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
  // Add recap or the card's Edit, whichever is drawn. Each is swapped for the
  // editor when pressed, so focus goes to Summary on opening and comes back
  // here when Save or Cancel closes it, rather than falling to the page.
  const opener = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) opener.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  // The editor and the card take turns in place; each fades in rather than
  // swapping in a frame.
  if (editing) {
    return (
      <div className="w-full animate-fade-in motion-reduce:animate-none">
        <RecapEditor
          focusOnOpen
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
      <TextLink ref={opener} onClick={() => setEditing(true)}>
        Add recap
      </TextLink>
    );
  }

  return (
    <div className="w-full animate-fade-in motion-reduce:animate-none">
      <RecapCard
        knowledge={knowledge}
        course={course}
        module={module}
        topic={topic}
        onEdit={() => setEditing(true)}
        editRef={opener}
      />
    </div>
  );
}
