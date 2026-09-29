"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { chipClasses, cx, LABEL } from "@/components/ui/classes";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { Input } from "@/components/ui/Input";
import type { TopicOption } from "@/data/topics";
import {
  checkEdit,
  fromEdit,
  isChanged,
  localId,
  saveRefusal,
  toEdit,
  topicMenu,
  type BriefEdit,
  type EditElement,
  type EditRelation,
  type FieldKey,
  type FieldProblem,
} from "@/lib/studio-brief-edit";
import { composerKey } from "@/components/ui/composer-keys";
import { kindCardEditable, madeLine, pressLabel, type KindCardStatus } from "@/lib/studio-cards";
import { modeLine, type DrawBlock } from "@/lib/studio-chat";
import type { PendingTopic, Refusal } from "@/lib/studio-drafts";
import { candidatePathFor, type Brief } from "@/lib/studio-jobs";

/** What a save came back with: the card places a refusal on its field. */
export type SaveOutcome = { ok: true } | { ok: false; status: number; refusal: Refusal };

/** Where focus goes after the next render. */
type FocusKey = FieldKey | "edit" | "save" | "add-relation";

/**
 * The confirm message: the planner's brief as a card a person checks at a
 * glance, with the one Draw (docs/STUDIO-CHAT-FIRST.md, "The confirm message").
 *
 * Only the newest brief of a `briefed` draft is `live`; an older card is
 * greyed with its button gone, so there is one Draw on screen, ever. The
 * newest brief of a draft that went on to draw links to its job instead.
 *
 * **The live card edits in place** (phase 3). Edit turns the title and the
 * element labels into fields, the topic into a menu over the vocabulary, and
 * each arrow into its two ends and its label; Save sends the whole brief to
 * `PUT /api/drafts/{id}/brief`, whose studio note then carries the stored
 * brief as the new live card. Each field is the size of what it replaces (a
 * chip becomes a chip-sized field, a line of text a line-sized one), so the
 * card does not move when editing starts or stops. While editing there is no
 * Draw on the card: the brief drawn has to be the one the runner holds.
 *
 * A proposed topic (D39) is marked "New topic" with its domain, summary and
 * relations, plus any near matches the runner's dry run named, so the person
 * can pick one of those instead; the button then reads **Create topic and
 * draw**, because the press creates it.
 */
export function ConfirmCard({
  brief,
  pendingTopic,
  status,
  topics,
  block,
  busy,
  refusal,
  onDraw,
  onSave,
  onEditingChange,
  onEditNewest,
  editBlock = null,
  jobHref,
  jobRunning = false,
  holderHref,
  sourceChanged = false,
  holdReason = null,
  onUse,
  after,
  keyShortcut = true,
}: {
  brief: Brief;
  pendingTopic: PendingTopic | null;
  status: KindCardStatus;
  topics: readonly TopicOption[];
  /** Why Draw is disabled right now, or null. */
  block: DrawBlock | null;
  busy: boolean;
  /** A refused press (E7), until the transcript carries the runner's note. */
  refusal: { text: string | null; holder: string | null } | null;
  onDraw: () => void;
  /** Store an edited brief. Resolves once the thread holds the result. */
  onSave?: (brief: Brief) => Promise<SaveOutcome>;
  /** Told when editing starts and stops, so the panel holds Draw and Send meanwhile. */
  onEditingChange?: (editing: boolean) => void;
  /**
   * Starts editing the newest brief, when there is one to edit: offered on a
   * card whose brief was replaced while the person was editing it.
   */
  onEditNewest?: () => void;
  /** Why the brief cannot be edited right now (a reply being written, a press under way), or null. */
  editBlock?: string | null;
  /** On a `drawn` card: the job this brief started. */
  jobHref: string | null;
  /** On a `drawn` card: the job is still running, so the line says "Drawing". */
  jobRunning?: boolean;
  /** On an `onHold` card: the planner's few words for why (D60). */
  holdReason?: string | null;
  /** Use this brief on an `onHold` card: takes it off hold with no turn. */
  onUse?: () => Promise<string | null>;
  /** Under the card's own press: Make both, when this card is the later of a pair. */
  after?: ReactNode;
  /** Opens a job by id: the holder of a leased target. */
  holderHref: (jobId: string) => string;
  /**
   * C11: the diagram an extend brief is about moved on since the planner read
   * it. Draw is unaffected (the job copies the diagram as it is when it
   * starts), so this is said, not enforced.
   */
  sourceChanged?: boolean;
  /**
   * Whether Cmd or Ctrl+Enter presses this card: only when it is the one live
   * card (T9). With two, the key moves focus instead, and neither says so.
   */
  keyShortcut?: boolean;
}) {
  const live = status === "live";
  const [held, setHeld] = useState<BriefEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [focusNext, setFocusNext] = useState<FocusKey | null>(null);
  const [using, setUsing] = useState(false);
  const [useError, setUseError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const base = useId();

  // The brief in force edits, and so does the newest brief of a draft that
  // moved on from it (`held`), since saving puts it back in force. A newer
  // brief arriving mid-edit (a planner reply, another tab) makes this card an
  // older one: the edits stay on it, frozen and said so, rather than
  // vanishing, and the person is offered the newer brief to edit instead.
  const onHold = status === "onHold";
  // A held card is put back by editing it too, since editing is choosing it (D60).
  const editable = (kindCardEditable(status) || onHold) && onSave !== undefined;
  const edit = held;
  const editing = held !== null && editable;
  const frozen = held !== null && !editable;
  /** Nothing on the card may change: a save is in flight, or the edits are frozen. */
  const locked = saving || frozen;

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);

  useEffect(() => {
    if (focusNext === null) return;
    const box = root.current;
    const target =
      box?.querySelector<HTMLElement>(focusNext === "edit" ? "[data-card-edit]" : `[data-field="${focusNext}"]`) ??
      // A problem on a group (the topic, the elements, the arrows) goes to
      // the group's first control.
      box?.querySelector<HTMLElement>(`[data-group="${focusNext}"] :is(input, select, button)`) ??
      null;
    if (target instanceof HTMLInputElement) target.select();
    target?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusNext(null);
  }, [focusNext]);

  const topicMap = new Map(topics.map((topic) => [topic.slug, topic]));
  const shownTopic = edit?.topic ?? brief.topic;
  const proposed = pendingTopic !== null && pendingTopic.entry.slug === shownTopic ? pendingTopic : null;
  const topic = topicMap.get(shownTopic);
  const mode = modeLine(brief);
  const holder = block?.holder ?? refusal?.holder ?? null;
  const problemFor = (field: FieldKey) => problems.find((problem) => problem.field === field) ?? null;
  const messageId = (field: FieldKey) => `${base}-${field.replace(/[^a-z0-9]/gi, "-")}`;

  /* ---------------------------------------------------------------- */
  /* Edits                                                             */
  /* ---------------------------------------------------------------- */

  function start() {
    if (editBlock !== null) return;
    setHeld(toEdit(brief));
    setProblems([]);
    setFocusNext("title");
  }

  function cancel() {
    setHeld(null);
    setProblems([]);
    setFocusNext("edit");
  }

  /** Change the edit, and clear the problems on what changed (and any general one). */
  function change(next: (current: BriefEdit) => BriefEdit, fields: FieldKey[]) {
    if (locked) return;
    setHeld((current) => (current === null ? current : next(current)));
    setProblems((current) => current.filter((problem) => !fields.includes(problem.field) && problem.field !== "general"));
  }

  function addElement(after: number) {
    const element: EditElement = { id: localId("e"), label: "" };
    change((current) => {
      const elements = [...current.elements];
      elements.splice(after + 1, 0, element);
      return { ...current, elements };
    }, ["elements"]);
    setFocusNext(`element:${element.id}`);
  }

  function removeElement(id: string) {
    if (edit === null) return;
    const at = edit.elements.findIndex((element) => element.id === id);
    const neighbour = edit.elements[at - 1] ?? edit.elements[at + 1];
    change(
      (current) => ({
        ...current,
        elements: current.elements.filter((element) => element.id !== id),
        // An arrow to a removed element keeps its other end and asks for a
        // new one, rather than vanishing without being seen to.
        relations: current.relations.map((relation) => ({
          ...relation,
          from: relation.from === id ? null : relation.from,
          to: relation.to === id ? null : relation.to,
        })),
      }),
      [`element:${id}`],
    );
    setFocusNext(neighbour === undefined ? "elements" : `element:${neighbour.id}`);
  }

  function addRelation() {
    if (edit === null) return;
    const [first, second] = edit.elements;
    const relation: EditRelation = { id: localId("r"), from: first?.id ?? null, to: second?.id ?? first?.id ?? null, label: "" };
    change((current) => ({ ...current, relations: [...current.relations, relation] }), ["relations"]);
    setFocusNext(`relation:${relation.id}:from`);
  }

  function removeRelation(id: string) {
    if (edit === null) return;
    const at = edit.relations.findIndex((relation) => relation.id === id);
    const neighbour = edit.relations[at - 1] ?? edit.relations[at + 1];
    change((current) => ({ ...current, relations: current.relations.filter((relation) => relation.id !== id) }), [
      `relation:${id}:from`,
      `relation:${id}:to`,
      `relation:${id}:label`,
    ]);
    setFocusNext(neighbour === undefined ? "add-relation" : `relation:${neighbour.id}:from`);
  }

  async function save() {
    if (edit === null || !editing || saving || onSave === undefined) return;
    // A live brief saved unchanged is a no-op; a held one is sent anyway,
    // since the save is what puts it back in force.
    if (live && !isChanged(brief, edit)) {
      cancel();
      return;
    }
    const found = checkEdit(edit);
    if (found.length > 0) {
      setProblems(found);
      setFocusNext(found[0]!.field);
      return;
    }
    setSaving(true);
    setProblems([]);
    const sent = edit;
    const outcome = await onSave(fromEdit(brief, sent));
    setSaving(false);
    if (outcome.ok) {
      // The stored brief is the newest card now, under the runner's note.
      setHeld(null);
      return;
    }
    const problem = saveRefusal(outcome.status, outcome.refusal, sent);
    setProblems([problem]);
    setFocusNext(problem.field === "general" ? "save" : problem.field);
  }

  /** A held brief put back in force as it is: a save of the unchanged brief. */
  async function putBack() {
    if (!editable || status !== "held" || saving || onSave === undefined) return;
    setSaving(true);
    setProblems([]);
    const outcome = await onSave(brief);
    setSaving(false);
    if (!outcome.ok) setProblems([saveRefusal(outcome.status, outcome.refusal, toEdit(brief))]);
  }

  /** Use this brief on a card the planner put on hold. */
  async function takeOffHold() {
    if (onUse === undefined || using) return;
    setUsing(true);
    setUseError(null);
    const error = await onUse();
    setUsing(false);
    setUseError(error);
  }

  function discard() {
    setHeld(null);
    setProblems([]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!editing) return;
    const inList = (event.target as HTMLElement).closest('[role="listbox"]') !== null;
    if (event.key === "Escape") {
      // Escape inside the card leaves editing, never the whole panel: an
      // uncancelled Escape is also the dialog's close request. An open topic
      // list closes itself and stays in editing, and a save in flight is
      // waited for, since the brief it sends lands whatever this card shows.
      event.preventDefault();
      if (inList || saving) return;
      cancel();
      return;
    }
    // Save, not Draw: the panel's own Cmd+Enter sees this as handled. Not
    // from the open topic list, whose Enter is a pick that has not landed yet.
    if (enterKey(event) === "mod-send" && !inList) {
      event.preventDefault();
      void save();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  // A problem belongs to the edit it was found in: none shows on a card at rest.
  const titleProblem = held === null ? null : problemFor("title");
  const topicProblem = held === null ? null : problemFor("topic");
  const general = problemFor("general");

  return (
    <Card
      tight
      as="article"
      aria-label={`Brief: ${brief.title}`}
      className={cx("mt-1", !kindCardEditable(status) && !onHold && !frozen && "opacity-60")}
    >
      <div ref={root} onKeyDown={onKeyDown} aria-busy={saving || undefined} className="flex flex-col gap-3.5">
        <div className={cx("flex flex-col gap-3.5", onHold && held === null && "opacity-60")}>
        <div>
          <div className="flex min-h-9 items-center gap-3">
            {edit !== null ? (
              <Input
                size="sm"
                data-field="title"
                aria-label="Title"
                value={edit.title}
                readOnly={locked}
                maxLength={200}
                aria-invalid={titleProblem !== null || undefined}
                aria-describedby={titleProblem === null ? undefined : messageId("title")}
                onChange={(event) => {
                  const value = event.target.value;
                  change((current) => ({ ...current, title: value }), ["title"]);
                }}
                onKeyDown={(event) => {
                  if (enterKey(event) === "send") {
                    event.preventDefault();
                    void save();
                  }
                }}
                className="flex-1 text-[16px] font-bold"
              />
            ) : (
              <h2 className="min-w-0 flex-1 text-[16px] font-bold leading-snug text-text">{brief.title}</h2>
            )}
            {editable && held === null && (
              <Button
                size="sm"
                variant="ghost"
                data-card-edit
                onClick={start}
                disabled={editBlock !== null}
                title={editBlock ?? "Change the title, topic, elements or arrows"}
              >
                <PencilIcon />
                Edit
              </Button>
            )}
          </div>
          <Problem id={messageId("title")} problem={titleProblem} />
          {status === "stale" && !frozen && (
            <p className="mt-0.5 text-[12px] text-text3">An earlier brief. The newest one is below.</p>
          )}
        </div>

        <Row label="Topic">
          {edit !== null ? (
            <div data-group="topic" className="flex min-h-9 items-center">
              <FilterMenu
                label="Topic"
                bare
                options={topicMenu(topics, pendingTopic, edit.topic)}
                value={edit.topic}
                defaultValue={edit.topic}
                invalid={topicProblem !== null}
                describedBy={topicProblem === null ? undefined : messageId("topic")}
                onChange={(value) => change((current) => ({ ...current, topic: value }), ["topic"])}
                className="max-w-full"
              />
            </div>
          ) : proposed === null ? (
            <div className="flex min-h-9 items-center">
              <Chip size="sm" title={brief.topic}>
                {topic?.title ?? brief.topic}
              </Chip>
            </div>
          ) : null}
          {proposed !== null && (
            <ProposedTopic
              proposed={proposed}
              topics={topicMap}
              editing={edit !== null}
              onPick={(slug) => change((current) => ({ ...current, topic: slug }), ["topic"])}
            />
          )}
          <Problem id={messageId("topic")} problem={topicProblem} />
        </Row>

        <Row label="Saved as">
          <p className="flex min-h-9 flex-wrap items-center gap-x-1.5 text-[14px] text-text">
            {mode.lead} <code className="rounded bg-surface2 px-1 py-0.5 font-mono text-[13px]">{mode.slug}</code>
          </p>
          {live && sourceChanged && brief.mode === "extend" && (
            <p className="mt-1 text-[13px] text-warn-text">
              The diagram changed after this conversation started. The drawing starts from it as it is now.
            </p>
          )}
        </Row>

        <Row label="What will appear">
          {edit !== null ? (
            <ElementsEditor
              edit={edit}
              locked={locked}
              problemFor={problemFor}
              messageId={messageId}
              onLabel={(id, label) =>
                change(
                  (current) => ({
                    ...current,
                    elements: current.elements.map((element) => (element.id === id ? { ...element, label } : element)),
                  }),
                  [`element:${id}`],
                )
              }
              onAdd={addElement}
              onRemove={removeElement}
            />
          ) : (
            <div className="flex min-h-9 flex-wrap items-center gap-1.5">
              {brief.elements.map((element) => (
                <Chip key={element.label} size="sm" title={element.note}>
                  {element.label}
                </Chip>
              ))}
            </div>
          )}
        </Row>

        {(brief.relations.length > 0 || edit !== null) && (
          <Row label="What connects">
            {edit !== null ? (
              <RelationsEditor
                edit={edit}
                locked={locked}
                problemFor={problemFor}
                messageId={messageId}
                onChange={(id, patch, field) =>
                  change(
                    (current) => ({
                      ...current,
                      relations: current.relations.map((relation) => (relation.id === id ? { ...relation, ...patch } : relation)),
                    }),
                    [`relation:${id}:${field}`],
                  )
                }
                onAdd={addRelation}
                onRemove={removeRelation}
              />
            ) : (
              <ul className="flex flex-col gap-1 pt-1 text-[14px] leading-5 text-text">
                {brief.relations.map((relation, at) => (
                  <li key={at} className="flex min-h-7 flex-wrap items-center break-words">
                    {relation.from}
                    <Arrow />
                    {relation.label !== undefined && relation.label !== "" && (
                      <>
                        <span className="text-text2">{relation.label}</span>
                        <Arrow />
                      </>
                    )}
                    <span className="sr-only">{relation.label ? " to " : " connects to "}</span>
                    {relation.to}
                  </li>
                ))}
              </ul>
            )}
          </Row>
        )}

        </div>

        {onHold && held === null && (
          <div className="flex flex-col gap-2 border-t border-hair pt-3.5">
            <p className="text-[13px] leading-5 text-text">On hold: {holdReason ?? "the conversation contradicted this brief"}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Button size="sm" variant="secondary" onClick={() => void takeOffHold()} disabled={using || editBlock !== null} title={editBlock ?? undefined}>
                {using ? "Saving…" : "Use this brief"}
              </Button>
            </div>
            {useError !== null && (
              <p role="alert" className="text-[13px] leading-5 text-danger">
                {useError}
              </p>
            )}
          </div>
        )}

        {frozen && (
          <div role="status" className="flex flex-col gap-2 border-t border-hair pt-3.5">
            <p className="text-[13px] leading-5 text-text">
              This brief changed while you were editing it, in a planner reply or another tab. Your edits are kept
              here so nothing is lost; the newest brief is below.
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {onEditNewest !== undefined && (
                <Button size="sm" onClick={onEditNewest}>
                  Edit the newest brief
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={discard}>
                Discard my edits
              </Button>
            </div>
          </div>
        )}

        {editing && (
          <div className="flex flex-col gap-2 border-t border-hair pt-3.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Button onClick={() => void save()} disabled={saving} data-field="save" aria-keyshortcuts="Meta+Enter Control+Enter">
                {saving ? "Saving…" : live ? "Save" : "Save and use it"}
              </Button>
              <Button variant="ghost" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
            </div>
            {general !== null ? (
              <p role="alert" className="text-[13px] leading-5 text-danger">
                {general.message}
              </p>
            ) : (
              <p className="text-[12px] text-text3">
                The planner hears about your changes on its next reply.
                <span className="max-md:hidden"> Enter adds an element, ⌘/Ctrl+Enter saves, Esc cancels.</span>
              </p>
            )}
          </div>
        )}

        {status === "held" && editable && held === null && (
          <div className="flex flex-col gap-2 border-t border-hair pt-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button onClick={() => void putBack()} disabled={saving || editBlock !== null} title={editBlock ?? undefined}>
                {saving ? "Saving…" : "Use this brief"}
              </Button>
            </div>
            {general !== null ? (
              <p role="alert" className="text-[13px] leading-5 text-danger">
                {general.message}
              </p>
            ) : (
              <p className="text-[12px] leading-4 text-text2">
                The conversation moved on after this brief, so Draw would not use it. Use it as it is, or edit it first.
              </p>
            )}
          </div>
        )}

        {live && held === null && (
          <div className="flex flex-col gap-2 border-t border-hair pt-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button
                onClick={onDraw}
                disabled={busy || block !== null}
                aria-keyshortcuts={keyShortcut ? "Meta+Enter Control+Enter" : undefined}
                data-studio-draw
                data-card-kind="diagram"
              >
                {busy ? (proposed ? "Creating the topic…" : "Queuing…") : pressLabel("diagram", proposed)}
              </Button>
              <span className="min-w-0 break-all font-mono text-[12px] text-text3">{candidatePathFor(brief.slug)}</span>
            </div>
            {block !== null && <p className="text-[12px] leading-4 text-text2">{block.reason}</p>}
            {refusal !== null && refusal.text !== null && block === null && (
              <p role="alert" className="text-[13px] leading-5 text-text">
                {refusal.text}
              </p>
            )}
            {holder !== null && (
              <Link href={holderHref(holder)} scroll={false} className="w-fit text-[13px] font-medium text-accent-text underline-offset-4 hover:underline">
                Open that job
              </Link>
            )}
            {block === null && refusal === null && (
              <p className="text-[12px] text-text3">
                Nothing is drawn or spent until you press it.
                {keyShortcut && (
                  <span className="max-md:hidden">
                    {" "}
                    <kbd className="font-sans">⌘</kbd>/Ctrl+Enter works too.
                  </span>
                )}
              </p>
            )}
            {after}
          </div>
        )}

        {status === "drawn" && jobHref !== null && (
          <div className="border-t border-hair pt-3">
            <Link href={jobHref} scroll={false} className="text-[13px] font-medium text-accent-text underline-offset-4 hover:underline">
              {madeLine("diagram", jobRunning)}. Open the job
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What Enter means in a card field, by the composer's own rule: nothing while
 * an input method is composing a word (Enter there confirms the word), plain
 * Enter or Cmd/Ctrl+Enter otherwise.
 */
function enterKey(event: KeyboardEvent<HTMLElement>) {
  return composerKey({
    key: event.key,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    isComposing: event.nativeEvent.isComposing,
    keyCode: event.keyCode,
  });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[128px_1fr] sm:gap-3">
      <p className={cx(LABEL, "sm:pt-2.5")}>{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Arrow() {
  return (
    <span aria-hidden className="px-1.5 text-text3">
      →
    </span>
  );
}

function Problem({ id, problem }: { id: string; problem: FieldProblem | null }) {
  if (problem === null) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[13px] leading-5 text-danger">
      {problem.message}
    </p>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 3.5l3 3L7 16H4v-3z" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

/** A chip's box, as a field: the same 28px pill, so nothing moves when editing starts. */
const CHIP_FIELD = cx(
  "h-7 min-w-[5ch] max-w-full rounded-full border border-border bg-surface text-[13px] text-text outline-none",
  "transition-colors duration-100 placeholder:text-text3 focus:border-accent aria-invalid:border-danger",
  "[field-sizing:content]",
);

const REMOVE = cx(
  "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-text3 transition-colors",
  "hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
  "disabled:opacity-40",
);

function ElementsEditor({
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
  const refused = edit.elements
    .map((element, at) => ({ element, at, problem: problemFor(`element:${element.id}`) }))
    .filter((entry) => entry.problem !== null);
  const group = problemFor("elements");
  return (
    <div data-group="elements">
      <ul className="flex min-h-9 flex-wrap items-center gap-1.5" aria-label="Elements">
        {edit.elements.map((element, at) => {
          const field: FieldKey = `element:${element.id}`;
          const problem = problemFor(field);
          return (
            <li key={element.id} className="relative flex max-w-full items-center">
              <input
                data-field={field}
                aria-label={`Element ${at + 1}`}
                value={element.label}
                placeholder="Label"
                readOnly={locked}
                maxLength={200}
                size={Math.max(5, element.label.length + 1)}
                aria-invalid={problem !== null || undefined}
                aria-describedby={problem === null ? undefined : messageId(field)}
                onChange={(event) => onLabel(element.id, event.target.value)}
                onKeyDown={(event) => {
                  if (enterKey(event) === "send") {
                    // Enter is the next element, the way a list editor works.
                    event.preventDefault();
                    if (!locked) onAdd(at);
                  } else if (event.key === "Backspace" && element.label === "" && !only && !locked) {
                    event.preventDefault();
                    onRemove(element.id);
                  }
                }}
                className={cx(CHIP_FIELD, "pl-2.5 pr-7")}
              />
              <button
                type="button"
                onClick={() => onRemove(element.id)}
                disabled={locked || only}
                tabIndex={-1}
                aria-label={`Remove ${element.label.trim() === "" ? `element ${at + 1}` : element.label}`}
                title={only ? "A diagram needs at least one element" : "Remove"}
                className={cx(REMOVE, "absolute right-0.5")}
              >
                <RemoveIcon />
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => onAdd(edit.elements.length - 1)}
            disabled={locked}
            className={chipClasses({ size: "sm", className: "border-dashed text-text2" })}
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

function RelationsEditor({
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
  return (
    <div data-group="relations" className="flex flex-col gap-1 pt-1">
      {edit.relations.length > 0 && (
        <ul className="flex flex-col gap-2.5 sm:gap-1" aria-label="Arrows">
          {edit.relations.map((relation, at) => {
            const problem = (end: "from" | "to" | "label") => problemFor(`relation:${relation.id}:${end}`);
            const shown = (["from", "label", "to"] as const).filter((end) => problem(end) !== null);
            return (
              <li key={relation.id} className="flex flex-col">
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
                    <input
                      data-field={`relation:${relation.id}:label`}
                      aria-label={`Arrow ${at + 1} label`}
                      value={relation.label}
                      placeholder="No label"
                      readOnly={locked}
                      maxLength={200}
                      size={Math.max(8, relation.label.length + 1)}
                      aria-invalid={problem("label") !== null || undefined}
                      aria-describedby={problem("label") === null ? undefined : messageId(`relation:${relation.id}:label`)}
                      onChange={(event) => onChange(relation.id, { label: event.target.value }, "label")}
                      className={cx(CHIP_FIELD, "px-2.5")}
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
                    <button
                      type="button"
                      onClick={() => onRemove(relation.id)}
                      disabled={locked}
                      aria-label={`Remove arrow ${at + 1}`}
                      title="Remove"
                      className={cx(REMOVE, "ml-1")}
                    >
                      <RemoveIcon />
                    </button>
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
          className={chipClasses({ size: "sm", className: "border-dashed text-text2" })}
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
    <span className="relative inline-flex max-w-full">
      <select
        data-field={`relation:${relation.id}:${end}`}
        aria-label={`Arrow ${at + 1} ${end}`}
        value={value}
        aria-invalid={problem !== null || undefined}
        aria-describedby={problem === null ? undefined : describedBy}
        onChange={(event) => {
          if (locked) return;
          onChange(relation.id, { [end]: event.target.value === "" ? null : event.target.value }, end);
        }}
        className={cx(CHIP_FIELD, "cursor-pointer appearance-none truncate pl-2.5 pr-6")}
      >
        {value === "" && <option value="">Pick one</option>}
        {edit.elements.map((element, index) => (
          <option key={element.id} value={element.id}>
            {element.label.trim() === "" ? `Element ${index + 1}` : element.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-text3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </span>
  );
}

/** The topic the planner proposed (D39): what it is, and what it is close to. */
export function ProposedTopic({
  proposed,
  topics,
  editing,
  onPick,
}: {
  proposed: PendingTopic;
  topics: ReadonlyMap<string, TopicOption>;
  editing: boolean;
  onPick: (slug: string) => void;
}) {
  const matches = proposed.nearMatches;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", editing && "mt-2")}>
      {!editing && (
        <div className="flex min-h-9 flex-wrap items-center gap-2">
          <Chip size="sm" active title={proposed.entry.slug}>
            New topic
          </Chip>
          <span className="text-[14px] font-semibold text-text">{proposed.entry.title}</span>
          <span className="font-mono text-[12px] text-text3">{proposed.entry.slug}</span>
        </div>
      )}
      <p className="text-[13px] text-text2">
        {editing && <>A new topic, created when you draw. </>}
        In <span className="font-medium text-text">{proposed.entry.domain}</span>
        {proposed.entry.summary !== null && proposed.entry.summary !== "" && <>. {proposed.entry.summary}</>}
      </p>
      {proposed.entry.relations.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-text2">
          {proposed.entry.relations.map((relation) => (
            <li key={`${relation.kind}:${relation.to}`}>
              <span className="text-text3">{relation.kind}</span> {topics.get(relation.to)?.title ?? relation.to}
            </li>
          ))}
        </ul>
      )}
      {matches.length > 0 &&
        (editing ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-text2">
            <span>Close to</span>
            {matches.map((match) =>
              topics.has(match.slug) ? (
                <Chip key={match.slug} size="sm" title={`Use ${match.title} instead`} onClick={() => onPick(match.slug)}>
                  {match.title}
                </Chip>
              ) : (
                <span key={match.slug} className="font-medium text-text">
                  {match.title}
                </span>
              ),
            )}
          </div>
        ) : (
          <p className="text-[13px] text-text2">
            Close to{" "}
            {matches.map((match, at) => (
              <span key={match.slug}>
                {at > 0 && ", "}
                <span className="font-medium text-text" title={match.slug}>
                  {match.title}
                </span>
              </span>
            ))}
            . To use {matches.length === 1 ? "it" : "one of those"} instead, press Edit or say so.
          </p>
        ))}
    </div>
  );
}
