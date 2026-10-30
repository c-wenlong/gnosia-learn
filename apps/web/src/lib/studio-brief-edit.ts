import type { FilterOption } from "@/components/ui/filter-menu";
import type { PendingTopic } from "@/lib/studio-drafts";
import type { Refusal } from "@/lib/studio-client";
import { refusalReason, refusalString, runnerSlow } from "@/lib/studio-client";
import { sentence } from "@/lib/studio-chat";
import type { Brief } from "@/lib/studio-jobs";

/**
 * Editing a brief in place on the live confirm card (phase 3 of
 * docs/STUDIO-CHAT-FIRST.md, "The confirm message").
 *
 * Pure, like `studio-chat.ts`: the card is view code, so every judgement about
 * an edit (what the person changed, what the runner would refuse, which field
 * a refusal names) lives here where it can be a test.
 *
 * **Elements carry an id while they are edited, and arrows point at the id.**
 * A brief binds an arrow to an element by its label, so renaming an element
 * by label would have to chase every arrow through each keystroke, and two
 * elements briefly sharing a label would tangle them. With ids, a rename is
 * one field and an arrow follows it for free; labels are written back only
 * when the brief is saved.
 */

export interface EditElement {
  id: string;
  label: string;
  /** Kept as it was: the card does not edit notes, and a save must not drop them. */
  note?: string;
}

export interface EditRelation {
  id: string;
  /** An element id, or null once the element it named was removed. */
  from: string | null;
  to: string | null;
  label: string;
}

export interface BriefEdit {
  title: string;
  topic: string;
  elements: EditElement[];
  relations: EditRelation[];
}

let counter = 0;
/** A local id, unique for the page's life. Never sent. */
export function localId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

/** The brief as the card edits it. */
export function toEdit(brief: Brief, mint: (prefix: string) => string = localId): BriefEdit {
  const elements = brief.elements.map((element) => ({
    id: mint("e"),
    label: element.label,
    ...(element.note === undefined ? {} : { note: element.note }),
  }));
  // The first element with a label is the one an arrow meant; a valid brief
  // has no arrow naming a label nothing carries.
  const byLabel = new Map<string, string>();
  for (const element of elements) if (!byLabel.has(element.label)) byLabel.set(element.label, element.id);
  const relations = brief.relations.map((relation) => ({
    id: mint("r"),
    from: byLabel.get(relation.from) ?? null,
    to: byLabel.get(relation.to) ?? null,
    label: relation.label ?? "",
  }));
  return { title: brief.title, topic: brief.topic, elements, relations };
}

/**
 * The brief to send: the original with the four edited parts replaced and
 * every text trimmed. Everything the card does not show (intent, slug, mode,
 * layout, notes, model, source) goes back as it came, because
 * `PUT /api/drafts/{id}/brief` takes a whole brief; the concepts too, unless
 * the topic changed.
 */
export function fromEdit(base: Brief, edit: BriefEdit): Brief {
  const labelOf = new Map(edit.elements.map((element) => [element.id, element.label.trim()]));
  // The concepts a brief names are filed under its topic, and the runner
  // refuses one the new topic does not file. The card cannot tell which carry
  // over, so a new topic starts with none rather than failing its save.
  const concepts = edit.topic === base.topic ? {} : { concepts: [] };
  return {
    ...base,
    ...concepts,
    title: edit.title.trim(),
    topic: edit.topic,
    elements: edit.elements.map((element) => ({
      label: element.label.trim(),
      ...(element.note === undefined ? {} : { note: element.note }),
    })),
    relations: edit.relations.map((relation) => {
      const label = relation.label.trim();
      return {
        from: relation.from === null ? "" : (labelOf.get(relation.from) ?? ""),
        to: relation.to === null ? "" : (labelOf.get(relation.to) ?? ""),
        ...(label === "" ? {} : { label }),
      };
    }),
  };
}

/** Whether the edit says anything the brief does not already say. */
export function isChanged(base: Brief, edit: BriefEdit): boolean {
  const next = fromEdit(base, edit);
  return (
    next.title !== base.title ||
    next.topic !== base.topic ||
    JSON.stringify(next.elements) !== JSON.stringify(base.elements) ||
    JSON.stringify(next.relations) !== JSON.stringify(base.relations.map(normalRelation))
  );
}

function normalRelation(relation: Brief["relations"][number]): Brief["relations"][number] {
  const label = relation.label?.trim() ?? "";
  return { from: relation.from, to: relation.to, ...(label === "" ? {} : { label }) };
}

/* -------------------------------------------------------------------------- */
/* Where a problem is shown                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The place on the card a problem belongs to: a field of the edit, or
 * `general` for a field the card does not show (the intent, the slug, the
 * mode) and for a refusal that is about the draft rather than the brief.
 */
export type FieldKey =
  | "title"
  | "topic"
  | "elements"
  | "relations"
  | "general"
  | `element:${string}`
  | `relation:${string}:${"from" | "to" | "label"}`;

export interface FieldProblem {
  field: FieldKey;
  message: string;
}

/** Past this length the runner refuses a label (`validateBrief`'s cap). */
const LABEL_LIMIT = 200;

/**
 * What the runner's validator would refuse, found before anything is sent,
 * in the order the card shows its fields. The runner checks again on save;
 * this is so the common mistakes cost no round trip and land on their field.
 */
export function checkEdit(edit: BriefEdit): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const title = edit.title.trim();
  if (title === "") problems.push({ field: "title", message: "Give the diagram a title." });
  else if (title.length > LABEL_LIMIT) {
    problems.push({ field: "title", message: `A title is at most ${LABEL_LIMIT} characters.` });
  }
  if (edit.elements.length === 0) {
    problems.push({ field: "elements", message: "A diagram needs at least one element." });
  }
  const seen = new Map<string, string>();
  for (const element of edit.elements) {
    const label = element.label.trim();
    if (label === "") {
      problems.push({ field: `element:${element.id}`, message: "Name this element, or remove it." });
    } else if (label.length > LABEL_LIMIT) {
      problems.push({ field: `element:${element.id}`, message: `A label is at most ${LABEL_LIMIT} characters.` });
    } else if (seen.has(label)) {
      // Arrows bind to elements by label, so two with one label are one
      // element to an arrow and two to the drawing.
      problems.push({ field: `element:${element.id}`, message: "Another element already has this label." });
    } else {
      seen.set(label, element.id);
    }
  }
  const ids = new Set(edit.elements.map((element) => element.id));
  for (const relation of edit.relations) {
    for (const end of ["from", "to"] as const) {
      const id = relation[end];
      if (id === null || !ids.has(id)) {
        problems.push({ field: `relation:${relation.id}:${end}`, message: "Pick an element for this end." });
      }
    }
    if (relation.label.trim().length > LABEL_LIMIT) {
      problems.push({ field: `relation:${relation.id}:label`, message: `A label is at most ${LABEL_LIMIT} characters.` });
    }
  }
  return problems;
}

/**
 * The card's field for a path `validateBrief` names (`title`,
 * `elements[2].label`, `relations[0].from`), read against the edit that was
 * sent, whose order the brief kept. Anything else is `general`.
 */
export function fieldFor(path: string | null, edit: BriefEdit): FieldKey {
  if (path === null) return "general";
  if (path === "title" || path === "topic" || path === "elements" || path === "relations") return path;
  const element = /^elements\[(\d+)\](?:\.label|\.note)?$/.exec(path);
  if (element !== null) {
    const id = edit.elements[Number(element[1])]?.id;
    return id === undefined ? "elements" : `element:${id}`;
  }
  const relation = /^relations\[(\d+)\](?:\.(from|to|label))?$/.exec(path);
  if (relation !== null) {
    const id = edit.relations[Number(relation[1])]?.id;
    if (id === undefined) return "relations";
    return `relation:${id}:${(relation[2] as "from" | "to" | "label" | undefined) ?? "from"}`;
  }
  return "general";
}

/**
 * A refused `PUT /api/drafts/{id}/brief`, placed on the card.
 *
 * A 400 is the validator's, with its field; a 409 is about the draft (a reply
 * is being written, a drawing started), which is said under the buttons; a
 * failed fetch or a 502 means the runner is not answering and the edits stay
 * on the card to be saved again.
 */
export function saveRefusal(status: number, refusal: Refusal, edit: BriefEdit): FieldProblem {
  if (status === 400) {
    const field = fieldFor(refusalString(refusal, "field"), edit);
    // The validator's topic sentence is written for the CLI (it names
    // `catalog topic add`); on the card the way out is the menu beside it.
    if (field === "topic" && /^no topic /i.test(refusal.error)) {
      return { field, message: `“${edit.topic}” is not in the topic list any more. Pick another topic.` };
    }
    return { field, message: sentence(refusal.error) };
  }
  if (status === 409) {
    switch (refusalReason(refusal)) {
      case "in-flight":
        return { field: "general", message: "The planner is answering. Save again once its reply is in." };
      case "draw-in-progress":
      case "drawing":
        return { field: "general", message: "This brief is already being drawn, so it can no longer change." };
      case "brief-changed":
        return {
          field: "general",
          message: "The brief changed while you were editing it, in a planner reply or another tab. Your edits are still here.",
        };
      case "done":
      case "abandoned":
        return { field: "general", message: "This conversation has moved on, so this brief can no longer change." };
      default:
        break;
    }
  }
  if (runnerSlow(status, refusal)) {
    // The save may still land, so it is not called refused.
    return { field: "general", message: "The studio runner did not answer in time, so the save may still land. Your edits are still here." };
  }
  if (status === 0 || status === 502) {
    return { field: "general", message: "The studio runner is not answering. Your edits are still here." };
  }
  if (status === 503) {
    return { field: "general", message: "The topic list cannot be read right now, so the brief cannot be checked. Try again shortly." };
  }
  return { field: "general", message: sentence(refusal.error) };
}

/* -------------------------------------------------------------------------- */
/* The topic menu                                                             */
/* -------------------------------------------------------------------------- */

export interface TopicChoice {
  slug: string;
  title: string;
  domain?: string;
}

/**
 * The topic menu's rows: the proposed topic first when the draft has one (it
 * stays what it is, a proposal the Draw press creates), then the vocabulary
 * grouped by domain in the order the domains first appear, titles sorted in
 * each. A brief whose topic is in neither (a topic archived since) still shows
 * it, so the menu never claims a value it does not hold; with no vocabulary
 * at all (the runner could not read it) it says that instead.
 */
export function topicMenu(
  topics: readonly TopicChoice[],
  pending: PendingTopic | null,
  current: string,
): FilterOption[] {
  const rows: FilterOption[] = [];
  if (pending !== null) {
    rows.push({
      value: pending.entry.slug,
      label: pending.entry.title,
      detail: "New topic, created when you draw",
      section: "Proposed",
    });
  }
  const byDomain = new Map<string, TopicChoice[]>();
  for (const topic of topics) {
    if (pending !== null && topic.slug === pending.entry.slug) continue;
    const domain = topic.domain?.trim() || "Other";
    const list = byDomain.get(domain) ?? [];
    list.push(topic);
    byDomain.set(domain, list);
  }
  const domains = [...byDomain.keys()].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  for (const domain of domains) {
    const list = byDomain.get(domain) ?? [];
    list.sort((a, b) => a.title.localeCompare(b.title));
    for (const topic of list) rows.push({ value: topic.slug, label: topic.title, section: domain });
  }
  if (current !== "" && !rows.some((row) => row.value === current)) {
    // With no list at all the runner could not read it, which says nothing
    // about whether this topic is in it.
    const detail = topics.length === 0 ? "The topic list could not be read" : "Not in the topic list";
    rows.unshift({ value: current, label: current, detail, section: "Current" });
  }
  return rows;
}
