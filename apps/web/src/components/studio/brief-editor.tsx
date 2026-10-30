"use client";

import { useState } from "react";

import { FADE_IN, POP_IN } from "@/components/studio/motion";
import { chipClasses, cx } from "@/components/ui/classes";
import { composerKey } from "@/components/ui/composer-keys";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { BriefEdit, EditRelation, FieldKey, FieldProblem } from "@/lib/studio-brief-edit";

/**
 * The diagram card's in-place editor (`ConfirmCard`, phase 3): the element
 * labels as chip-sized fields, each arrow as its two ends and its label, and
 * the line a refused field carries under it. The card holds the edit and its
 * save; these draw it and report each change back.
 */

/** The arrow between two ends, read as nothing by a screen reader. */
export function Arrow() {
  return (
    <span aria-hidden className="px-1.5 text-text3">
      →
    </span>
  );
}

export function Problem({ id, problem }: { id: string; problem: FieldProblem | null }) {
  if (problem === null) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[13px] leading-5 text-danger">
      {problem.message}
    </p>
  );
}

export function ElementsEditor({
  edit,
  locked,
  problemFor,
  messageId,
  onLabel,
  onAdd,
  onRemove,
}: {
  edit: BriefEdit;
  locked: boolean;
  problemFor: (field: FieldKey) => FieldProblem | null;
  messageId: (field: FieldKey) => string;
  onLabel: (id: string, label: string) => void;
  onAdd: (after: number) => void;
  onRemove: (id: string) => void;
}) {
  const only = edit.elements.length <= 1;
  // The elements editing started with fade in with the editor; one added
  // since pops in where it lands.
  const [initial] = useState(() => new Set(edit.elements.map((element) => element.id)));
  const refused = edit.elements
    .map((element, at) => ({ element, at, problem: problemFor(`element:${element.id}`) }))
    .filter((entry) => entry.problem !== null);
  const group = problemFor("elements");
  return (
    <div data-group="elements" className={FADE_IN}>
      <ul className="flex min-h-9 flex-wrap items-center gap-1.5" aria-label="Elements">
        {edit.elements.map((element, at) => {
          const field: FieldKey = `element:${element.id}`;
          const problem = problemFor(field);
          return (
            <li key={element.id} className={cx("relative flex max-w-full items-center", !initial.has(element.id) && POP_IN)}>
              {/* A chip's 28px pill as a field, so nothing moves when editing starts. */}
              <Input
                size="inline"
                data-field={field}
                aria-label={`Element ${at + 1}`}
                value={element.label}
                placeholder="Label"
                readOnly={locked}
                maxLength={200}
                htmlSize={Math.max(5, element.label.length + 1)}
                aria-invalid={problem !== null || undefined}
                aria-describedby={problem === null ? undefined : messageId(field)}
                onChange={(event) => onLabel(element.id, event.target.value)}
                onKeyDown={(event) => {
                  if (composerKey(event.nativeEvent) === "send") {
                    // Enter is the next element, the way a list editor works.
                    event.preventDefault();
                    if (!locked) onAdd(at);
                  } else if (event.key === "Backspace" && element.label === "" && !only && !locked) {
                    event.preventDefault();
                    onRemove(element.id);
                  }
                }}
                className="pr-7"
              />
              {/* Inside the chip's field, so its ring sits on its own edge. */}
              <IconButton
                label={`Remove ${element.label.trim() === "" ? `element ${at + 1}` : element.label}`}
                title={only ? "A diagram needs at least one element" : "Remove"}
                size="xs"
                tone="muted"
                inset
                onClick={() => onRemove(element.id)}
                disabled={locked || only}
                tabIndex={-1}
                className="absolute right-0.5"
              >
                <Glyph name="close" size={14} />
              </IconButton>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => onAdd(edit.elements.length - 1)}
            disabled={locked}
            className={chipClasses({ size: "sm", dashed: true })}
          >
            <span aria-hidden>+</span> Add
            <span className="sr-only"> an element</span>
          </button>
        </li>
      </ul>
      {group !== null && <Problem id={messageId("elements")} problem={group} />}
      {refused.map(({ element, at, problem }) => (
        <Problem
          key={element.id}
          id={messageId(`element:${element.id}`)}
          problem={problem === null ? null : { ...problem, message: `Element ${at + 1}: ${problem.message}` }}
        />
      ))}
    </div>
  );
}

export function RelationsEditor({
  edit,
  locked,
  problemFor,
  messageId,
  onChange,
  onAdd,
  onRemove,
}: {
  edit: BriefEdit;
  locked: boolean;
  problemFor: (field: FieldKey) => FieldProblem | null;
  messageId: (field: FieldKey) => string;
  onChange: (id: string, patch: Partial<EditRelation>, field: "from" | "to" | "label") => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const group = problemFor("relations");
  // As for the elements: an arrow added while editing pops in.
  const [initial] = useState(() => new Set(edit.relations.map((relation) => relation.id)));
  return (
    <div data-group="relations" className={cx("flex flex-col gap-1 pt-1", FADE_IN)}>
      {edit.relations.length > 0 && (
        <ul className="flex flex-col gap-2.5 sm:gap-1" aria-label="Arrows">
          {edit.relations.map((relation, at) => {
            const problem = (end: "from" | "to" | "label") => problemFor(`relation:${relation.id}:${end}`);
            const shown = (["from", "label", "to"] as const).filter((end) => problem(end) !== null);
            return (
              <li key={relation.id} className={cx("flex flex-col", !initial.has(relation.id) && POP_IN)}>
                {/* Three pieces that wrap as units on a narrow screen: an end
                    and its arrow, the label and its arrow, the other end and
                    its remove. A remove never lands on a line of its own. */}
                <div className="flex min-h-7 flex-wrap items-center gap-y-1">
                  <span className="inline-flex max-w-full items-center">
                    <EndSelect
                      relation={relation}
                      end="from"
                      at={at}
                      edit={edit}
                      locked={locked}
                      problem={problem("from")}
                      describedBy={messageId(`relation:${relation.id}:from`)}
                      onChange={onChange}
                    />
                    <Arrow />
                  </span>
                  <span className="inline-flex max-w-full items-center">
                    <Input
                      size="inline"
                      data-field={`relation:${relation.id}:label`}
                      aria-label={`Arrow ${at + 1} label`}
                      value={relation.label}
                      placeholder="No label"
                      readOnly={locked}
                      maxLength={200}
                      htmlSize={Math.max(8, relation.label.length + 1)}
                      aria-invalid={problem("label") !== null || undefined}
                      aria-describedby={problem("label") === null ? undefined : messageId(`relation:${relation.id}:label`)}
                      onChange={(event) => onChange(relation.id, { label: event.target.value }, "label")}
                    />
                    <Arrow />
                  </span>
                  <span className="inline-flex max-w-full items-center">
                    <EndSelect
                      relation={relation}
                      end="to"
                      at={at}
                      edit={edit}
                      locked={locked}
                      problem={problem("to")}
                      describedBy={messageId(`relation:${relation.id}:to`)}
                      onChange={onChange}
                    />
                    <IconButton
                      label={`Remove arrow ${at + 1}`}
                      title="Remove"
                      size="xs"
                      tone="muted"
                      onClick={() => onRemove(relation.id)}
                      disabled={locked}
                      className="ml-1"
                    >
                      <Glyph name="close" size={14} />
                    </IconButton>
                  </span>
                </div>
                {shown.map((end) => (
                  <Problem key={end} id={messageId(`relation:${relation.id}:${end}`)} problem={problem(end)} />
                ))}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex min-h-7 items-center">
        <button
          type="button"
          data-field="add-relation"
          onClick={onAdd}
          disabled={locked || edit.elements.length === 0}
          className={chipClasses({ size: "sm", dashed: true })}
        >
          <span aria-hidden>+</span> Add an arrow
        </button>
      </div>
      {group !== null && <Problem id={messageId("relations")} problem={group} />}
    </div>
  );
}

/** One end of an arrow: a pick among the elements, by their labels as they stand. */
function EndSelect({
  relation,
  end,
  at,
  edit,
  locked,
  problem,
  describedBy,
  onChange,
}: {
  relation: EditRelation;
  end: "from" | "to";
  at: number;
  edit: BriefEdit;
  locked: boolean;
  problem: FieldProblem | null;
  describedBy: string;
  onChange: (id: string, patch: Partial<EditRelation>, field: "from" | "to" | "label") => void;
}) {
  const value = relation[end] ?? "";
  return (
    <Select
      dataField={`relation:${relation.id}:${end}`}
      label={`Arrow ${at + 1} ${end}`}
      size="inline"
      className="inline-flex max-w-full"
      placeholder="Pick one"
      options={edit.elements.map((element, index) => ({
        value: element.id,
        label: element.label.trim() === "" ? `Element ${index + 1}` : element.label,
      }))}
      value={value}
      invalid={problem !== null}
      describedBy={problem === null ? undefined : describedBy}
      onChange={(next) => {
        if (locked) return;
        onChange(relation.id, { [end]: next }, end);
      }}
    />
  );
}
