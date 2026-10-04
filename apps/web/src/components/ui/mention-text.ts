/**
 * The rules behind `MentionComposer`, kept apart from the component and from
 * Lexical (docs/STUDIO-MENTIONS.md, "What it sends").
 *
 * React-free and editor-free, as `composer-keys.ts` is: a `"use client"`
 * module's exports are client references (AGENTS.md), and these are the parts
 * worth a test. The editor's state is read here as the plain JSON tree Lexical
 * serialises to, so the rule for turning a field with chips into
 * `{ text, mentions }` is tested without a browser.
 */

/** One chip in a message: the kind it names and where its `@<kind>` sits in `text`. */
export interface Mention<K extends string = string> {
  kind: K;
  start: number;
  end: number;
}

/** What the composer holds and sends: the text as typed, each chip written into it as `@<kind>`. */
export interface MentionValue<K extends string = string> {
  text: string;
  mentions: Mention<K>[];
}

/** An entry in the @ menu. */
export interface MentionOption<K extends string = string> {
  id: K;
  name: string;
  description: string;
  aliases?: readonly string[];
  /** A kit `Glyph` name for the row and the chip. */
  icon?: string;
  /** When set, the entry is shown disabled with this in place of its description. */
  disabledReason?: string | null;
}

export const EMPTY_MENTION_VALUE: MentionValue<never> = { text: "", mentions: [] };

/** The node type the chip serialises as in Lexical's JSON. */
export const MENTION_NODE_TYPE = "studio-mention";

/** The text a chip of `kind` stands for, in the sent text and on the clipboard. */
export function mentionToken(kind: string): string {
  return `@${kind}`;
}

/* -------------------------------------------------------------------------- */
/* Serialising the editor                                                     */
/* -------------------------------------------------------------------------- */

/** The part of Lexical's serialised node this reads. Anything else is ignored. */
export interface SerializedNodeLike {
  type: string;
  text?: string;
  kind?: string;
  children?: SerializedNodeLike[];
}

/**
 * The editor's JSON state (`editor.getEditorState().toJSON().root`) to
 * `{ text, mentions }`.
 *
 * Paragraphs are joined with `\n`, as the textarea's newlines are, and a line
 * break inside one is a `\n` too. A chip is written as `@<kind>` where it
 * sits, and its position is recorded in UTF-16 code units, the unit
 * `String.prototype.slice` counts in, which is how the runner checks it
 * (`text.slice(start, end) === "@<kind>"`).
 */
export function serializeMentions<K extends string = string>(root: SerializedNodeLike): MentionValue<K> {
  let text = "";
  const mentions: Mention<K>[] = [];

  const walk = (node: SerializedNodeLike) => {
    if (node.type === MENTION_NODE_TYPE && typeof node.kind === "string") {
      const token = mentionToken(node.kind);
      mentions.push({ kind: node.kind as K, start: text.length, end: text.length + token.length });
      text += token;
      return;
    }
    if (node.type === "linebreak") {
      text += "\n";
      return;
    }
    if (typeof node.text === "string") {
      text += node.text;
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };

  const blocks = root.children ?? [];
  blocks.forEach((block, at) => {
    if (at > 0) text += "\n";
    walk(block);
  });
  return { text, mentions };
}

/**
 * The value as blocks of text and chips, one block per line, for building the
 * editor back from a value (a refused send putting the words back, a
 * suggestion prefilling the field). A mention whose range does not read
 * `@<kind>` is left as the text it covers: a value this side cannot vouch for
 * is words, never a chip nobody picked.
 */
export type ValuePiece<K extends string = string> = { type: "text"; text: string } | { type: "mention"; kind: K };

export function valuePieces<K extends string = string>(value: MentionValue<K>): ValuePiece<K>[][] {
  const pieces = inlinePieces(value);
  const lines: ValuePiece<K>[][] = [[]];
  for (const piece of pieces) {
    if (piece.type === "mention") {
      lines.at(-1)!.push(piece);
      continue;
    }
    const parts = piece.text.split("\n");
    parts.forEach((part, at) => {
      if (at > 0) lines.push([]);
      if (part !== "") lines.at(-1)!.push({ type: "text", text: part });
    });
  }
  return lines;
}

/**
 * The value as a run of text and chips in order, for drawing a sent message
 * with its chips inline (the transcript, D57). Positions that are out of
 * bounds, overlap, or do not read `@<kind>` are dropped and the text shown as
 * typed.
 */
export function inlinePieces<K extends string = string>(value: MentionValue<K>): ValuePiece<K>[] {
  const valid = validMentions(value.text, value.mentions);
  const pieces: ValuePiece<K>[] = [];
  let at = 0;
  for (const mention of valid) {
    if (mention.start > at) pieces.push({ type: "text", text: value.text.slice(at, mention.start) });
    pieces.push({ type: "mention", kind: mention.kind });
    at = mention.end;
  }
  if (at < value.text.length) pieces.push({ type: "text", text: value.text.slice(at) });
  return pieces;
}

/**
 * The runner's own checks on mentions (STUDIO-MENTIONS.md, "What it sends"),
 * applied here to what arrives rather than trusted: each range inside the
 * text and reading exactly `@<kind>`, no two overlapping, and a kind once.
 * Returns the ones that pass, in text order.
 */
/**
 * The tags a plain-text edit of `previous` still carries. A field that cannot
 * draw chips (the fallback when Lexical will not load) reports each change as
 * one contiguous edit, so the text splits into a common prefix, the edited
 * span and a common suffix. A tag wholly in the prefix stays where it was, one
 * wholly in the suffix moves by the edit's net length, and one the edit
 * touched is gone. Nothing is matched by token: an `@video` typed as text
 * never becomes a tag, even where a deleted one used to be (Greptile on #204).
 */
export function carryMentions<K extends string>(previous: MentionValue<K>, text: string): Mention<K>[] {
  const before = previous.text;
  const most = Math.min(before.length, text.length);
  let prefix = 0;
  while (prefix < most && before[prefix] === text[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < most - prefix && before[before.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix += 1;
  const tail = before.length - suffix;
  const shift = text.length - before.length;
  const kept: Mention<K>[] = [];
  for (const mention of validMentions(before, previous.mentions)) {
    if (mention.end <= prefix) kept.push(mention);
    else if (mention.start >= tail) kept.push({ ...mention, start: mention.start + shift, end: mention.end + shift });
  }
  return kept;
}

/** The fallback's line about adding a tag, where reloading the page costs nothing. */
export const FALLBACK_NOTE = "Tags could not load; reload the page to add one.";

/**
 * The fallback's line under the field. It cannot draw chips, so it names the
 * tags the message will send; an `@video` in the text that is not one of them
 * reads as the word it is (Greptile on #204). `note` is the closing sentence,
 * for a panel where a reload would lose what was typed.
 */
export function fallbackTagLine<K extends string>(
  value: MentionValue<K>,
  options: readonly MentionOption<K>[],
  note: string = FALLBACK_NOTE,
): string {
  const names = [...new Set(validMentions(value.text, value.mentions).map((mention) => mention.kind))].map(
    (kind) => options.find((option) => option.id === kind)?.name ?? kind,
  );
  return names.length === 0 ? note : `Sends tagged: ${names.join(" and ")}. ${note}`;
}

export function validMentions<K extends string>(text: string, mentions: readonly Mention<K>[] | null | undefined): Mention<K>[] {
  if (!Array.isArray(mentions)) return [];
  const sorted = [...mentions]
    .filter(
      (mention) =>
        mention !== null &&
        typeof mention === "object" &&
        typeof mention.kind === "string" &&
        Number.isInteger(mention.start) &&
        Number.isInteger(mention.end) &&
        mention.start >= 0 &&
        mention.end <= text.length &&
        mention.end > mention.start &&
        text.slice(mention.start, mention.end) === mentionToken(mention.kind),
    )
    .sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const out: Mention<K>[] = [];
  let end = 0;
  for (const mention of sorted) {
    if (mention.start < end || seen.has(mention.kind)) continue;
    seen.add(mention.kind);
    out.push(mention);
    end = mention.end;
  }
  return out;
}

/** Whether the field holds nothing to send: no words and no chip. */
export function isEmptyValue(value: MentionValue): boolean {
  return value.text.trim() === "" && value.mentions.length === 0;
}

/** Whether the field holds chips and nothing else: "@video" alone (T15, T16). */
export function isBareTag(value: MentionValue): boolean {
  if (value.mentions.length === 0) return false;
  let rest = value.text;
  for (const mention of [...value.mentions].sort((a, b) => b.start - a.start)) {
    rest = rest.slice(0, mention.start) + rest.slice(mention.end);
  }
  return rest.trim() === "";
}

/** The kinds a value tags, in the order they appear. */
export function mentionKinds<K extends string>(value: MentionValue<K>): K[] {
  return validMentions(value.text, value.mentions).map((mention) => mention.kind);
}

/**
 * A value trimmed for sending: leading and trailing whitespace removed and
 * every position moved to match, so the runner's `text.slice(start, end)`
 * check still reads `@<kind>`.
 */
export function trimValue<K extends string>(value: MentionValue<K>): MentionValue<K> {
  const lead = value.text.length - value.text.trimStart().length;
  const text = value.text.trim();
  const mentions = validMentions(value.text, value.mentions).map((mention) => ({
    kind: mention.kind,
    start: mention.start - lead,
    end: mention.end - lead,
  }));
  return { text, mentions };
}

export function sameValue(a: MentionValue, b: MentionValue): boolean {
  if (a.text !== b.text || a.mentions.length !== b.mentions.length) return false;
  return a.mentions.every(
    (mention, at) =>
      mention.kind === b.mentions[at]!.kind && mention.start === b.mentions[at]!.start && mention.end === b.mentions[at]!.end,
  );
}

/**
 * A value with `insert` added in front of what the field holds: a refused
 * send's words and chips coming back ahead of whatever was typed since
 * (`wordsBack`'s rule, with chips). A kind already in `held` is not added
 * twice: its chip in `insert` becomes plain text.
 */
export function prependValue<K extends string>(insert: MentionValue<K>, held: MentionValue<K>): MentionValue<K> {
  if (isEmptyValue(held)) return insert;
  if (isEmptyValue(insert)) return held;
  const heldKinds = new Set(held.mentions.map((mention) => mention.kind));
  const lead = insert.mentions.filter((mention) => !heldKinds.has(mention.kind));
  const offset = insert.text.length + 1;
  return {
    text: `${insert.text}\n${held.text}`,
    mentions: [
      ...lead,
      ...held.mentions.map((mention) => ({ kind: mention.kind, start: mention.start + offset, end: mention.end + offset })),
    ],
  };
}

/** A value built from a run of pieces: `valueOf([{type:"text",text:"A "},{type:"mention",kind:"diagram"}])`. */
export function valueOf<K extends string>(pieces: readonly ValuePiece<K>[]): MentionValue<K> {
  let text = "";
  const mentions: Mention<K>[] = [];
  for (const piece of pieces) {
    if (piece.type === "text") {
      text += piece.text;
      continue;
    }
    const token = mentionToken(piece.kind);
    mentions.push({ kind: piece.kind, start: text.length, end: text.length + token.length });
    text += token;
  }
  return { text, mentions };
}

/* -------------------------------------------------------------------------- */
/* A kind's toggle                                                            */
/* -------------------------------------------------------------------------- */

/*
 * The studio home's Diagram and Video buttons (D88 of
 * docs/STUDIO-CHAT-FIRST.md): one press puts the kind's chip in the message,
 * the next takes it out, and the button shows pressed whenever the chip is
 * there, however it got there. They work on the value, not the editor, so
 * the plain fallback (which cannot draw a chip) takes them the same way.
 */

/** Whether `value` tags `kind`: a chip of it that reads `@<kind>` where it sits. */
export function hasMention<K extends string>(value: MentionValue<K>, kind: K): boolean {
  return validMentions(value.text, value.mentions).some((mention) => mention.kind === kind);
}

/**
 * One change to the text: at `at`, `removed` characters out and `inserted`
 * in. A toggle reports it so the field can keep the person's caret where it
 * was (`mapOffset`), rather than rebuilding with the caret at the end.
 */
export interface TextEdit {
  at: number;
  removed: number;
  inserted: number;
}

/** A toggle's result: the new value, and the edit that made it, or null when nothing changed. */
export interface MentionEdit<K extends string> {
  value: MentionValue<K>;
  edit: TextEdit | null;
}

/**
 * `value` with `kind`'s chip at the start followed by a space of its own,
 * every other position moved to match. The space is always added, even
 * before text that already starts with one, so taking the chip out again
 * (`removeMention`) gives back exactly the text that was there. A value that
 * already tags `kind` comes back as it is: one chip per kind.
 */
export function addMention<K extends string>(value: MentionValue<K>, kind: K): MentionEdit<K> {
  const kept = validMentions(value.text, value.mentions);
  if (kept.some((mention) => mention.kind === kind)) return { value, edit: null };
  const token = mentionToken(kind);
  const lead = `${token} `;
  return {
    value: {
      text: lead + value.text,
      mentions: [
        { kind, start: 0, end: token.length },
        ...kept.map((mention) => ({ kind: mention.kind, start: mention.start + lead.length, end: mention.end + lead.length })),
      ],
    },
    edit: { at: 0, removed: 0, inserted: lead.length },
  };
}

/**
 * `value` without `kind`'s chip and the one space that separates it: the
 * space after it, which is the one `addMention` and a pick from the menu put
 * there, else the one before it. A value that does not tag `kind` comes back
 * as it is.
 */
export function removeMention<K extends string>(value: MentionValue<K>, kind: K): MentionEdit<K> {
  const kept = validMentions(value.text, value.mentions);
  const gone = kept.find((mention) => mention.kind === kind);
  if (gone === undefined) return { value, edit: null };
  let start = gone.start;
  let end = gone.end;
  if (value.text[end] === " ") end += 1;
  else if (start > 0 && value.text[start - 1] === " ") start -= 1;
  const cut = end - start;
  return {
    value: {
      text: value.text.slice(0, start) + value.text.slice(end),
      mentions: kept
        .filter((mention) => mention !== gone)
        .map((mention) => (mention.start >= end ? { kind: mention.kind, start: mention.start - cut, end: mention.end - cut } : mention)),
    },
    edit: { at: start, removed: cut, inserted: 0 },
  };
}

/** The toggle's press: the chip out when it is there, in at the start when it is not. */
export function toggleMentionEdit<K extends string>(value: MentionValue<K>, kind: K): MentionEdit<K> {
  return hasMention(value, kind) ? removeMention(value, kind) : addMention(value, kind);
}

export function withMention<K extends string>(value: MentionValue<K>, kind: K): MentionValue<K> {
  return addMention(value, kind).value;
}

export function withoutMention<K extends string>(value: MentionValue<K>, kind: K): MentionValue<K> {
  return removeMention(value, kind).value;
}

export function toggleMention<K extends string>(value: MentionValue<K>, kind: K): MentionValue<K> {
  return toggleMentionEdit(value, kind).value;
}

/**
 * Where a caret at `offset` in the text before `edit` sits after it. Text
 * after the edit moves with it, a caret inside what was removed lands where
 * the removal was, and a caret exactly where something was inserted ends up
 * after it, so a chip put in at the start pushes the caret along.
 */
export function mapOffset(offset: number, edit: TextEdit): number {
  if (offset >= edit.at + edit.removed) return offset - edit.removed + edit.inserted;
  if (offset > edit.at) return edit.at;
  return offset;
}

/*
 * The editor's lines as plain data, so a caret can be turned into an offset
 * in the value's text and back without Lexical: each line is a paragraph,
 * joined to the next by `\n` as `serializeMentions` joins them, and each
 * child is a text node, a chip (as long as its `@<kind>`) or a line break.
 */

export interface CaretLineChild {
  key: string;
  type: "text" | "chip" | "break";
  length: number;
}

export interface CaretLine {
  key: string;
  children: readonly CaretLineChild[];
}

/** A Lexical selection point: inside a text node, or between an element's children. */
export interface CaretPoint {
  key: string;
  offset: number;
  type: "text" | "element";
}

/** Where `point` sits in the value's text, or null when it names nothing in `lines`. */
export function caretOffset(lines: readonly CaretLine[], point: CaretPoint, rootKey: string): number | null {
  let at = 0;
  for (let line = 0; line < lines.length; line += 1) {
    if (line > 0) at += 1;
    const { key, children } = lines[line]!;
    if (point.type === "element" && point.key === rootKey && point.offset === line) return at;
    for (let child = 0; child < children.length; child += 1) {
      const node = children[child]!;
      if (point.type === "element" && point.key === key && point.offset === child) return at;
      if (point.type === "text" && node.type === "text" && node.key === point.key) return at + Math.min(Math.max(0, point.offset), node.length);
      at += node.length;
    }
    if (point.type === "element" && point.key === key) return at;
  }
  if (point.type === "element" && point.key === rootKey) return at;
  return null;
}

/**
 * The point at `offset` in the value's text: inside a text node where there
 * is one, else between children (a caret is never inside a chip; one that
 * would be goes after it). Past the end is the end. Null with no lines.
 */
export function caretPoint(lines: readonly CaretLine[], offset: number): CaretPoint | null {
  if (lines.length === 0) return null;
  let at = 0;
  for (let line = 0; line < lines.length; line += 1) {
    if (line > 0) at += 1;
    const { key, children } = lines[line]!;
    for (let child = 0; child < children.length; child += 1) {
      const node = children[child]!;
      if (node.type === "text" && offset >= at && offset <= at + node.length) return { key: node.key, offset: offset - at, type: "text" };
      if (node.type !== "text" && offset === at) return { key, offset: child, type: "element" };
      if (node.type !== "text" && offset > at && offset < at + node.length) return { key, offset: child + 1, type: "element" };
      at += node.length;
    }
    if (offset <= at) return { key, offset: children.length, type: "element" };
  }
  const last = lines.at(-1)!;
  return { key: last.key, offset: last.children.length, type: "element" };
}

/* -------------------------------------------------------------------------- */
/* The @ menu                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The open query, if the caret sits just after one: `@` at the start of the
 * text or after whitespace, then no whitespace up to the caret. `before` is
 * the line's text up to the caret, chips written as `@<kind>`.
 *
 * `@` inside a word (`a@b.com`) is text (T1), and a full-width `＠` from an
 * IME is not a trigger (T3). A space typed after the query ends it, which is
 * how "no entry matches" closes (the menu's table).
 */
export function mentionQuery(before: string): { query: string; offset: number } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(before);
  if (match === null) return null;
  const offset = match.index + match[1]!.length;
  return { query: match[2]!, offset };
}

/** Case-insensitive prefix match on the name and each alias (the menu's filter). */
export function filterMentionOptions<K extends string>(options: readonly MentionOption<K>[], query: string): MentionOption<K>[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...options];
  return options.filter((option) =>
    [option.name, option.id, ...(option.aliases ?? [])].some((word) => word.toLowerCase().startsWith(q)),
  );
}

export function isUsable(option: MentionOption): boolean {
  return option.disabledReason === undefined || option.disabledReason === null || option.disabledReason === "";
}

/** The first usable row, or -1 when every row is disabled or there are none. */
export function firstActive(options: readonly MentionOption[]): number {
  return options.findIndex(isUsable);
}

/**
 * Down and Up: the next usable row in that direction, wrapping, skipping a
 * disabled one. With nothing usable the active row stays where it is.
 */
export function moveActive(options: readonly MentionOption[], active: number, delta: 1 | -1): number {
  const count = options.length;
  if (count === 0) return -1;
  let at = active;
  for (let step = 0; step < count; step += 1) {
    at = (((at + delta) % count) + count) % count;
    if (isUsable(options[at]!)) return at;
  }
  return active;
}

/** What the live region says when the menu opens (STUDIO-MENTIONS.md, "Accessibility"). */
export function menuOpenedAnnouncement(options: readonly MentionOption[], active: number): string {
  if (options.length === 0) return "Nothing matches.";
  const count = `${options.length} ${options.length === 1 ? "option" : "options"}.`;
  const row = options[active];
  return row === undefined ? count : `${count} ${rowAnnouncement(row)}`;
}

/** A row's name and description, or its reason when disabled. */
export function rowAnnouncement(option: MentionOption): string {
  const detail = isUsable(option) ? option.description : option.disabledReason!;
  return `${option.name}, ${lowerFirst(detail)}${/[.!?]$/.test(detail) ? "" : "."}`;
}

function lowerFirst(text: string): string {
  return text === "" ? text : text[0]!.toLowerCase() + text.slice(1);
}

/** Where the plus menu opened: the caret's node and offset, and the text then. */
export interface PlusAnchor {
  key: string;
  offset: number;
  text: string;
}

/**
 * Whether the plus menu stays open after an update. It has no query, so any
 * typing (the text changed) or any caret move (the anchor moved, or the
 * selection is no longer a caret) closes it and leaves the words as typed:
 * otherwise a sentence typed after opening it would end with Enter picking a
 * chip rather than sending.
 */
export function plusMenuStays(
  opened: PlusAnchor,
  now: { key: string; offset: number; collapsed: boolean } | null,
  text: string,
): boolean {
  if (now === null || !now.collapsed) return false;
  return now.key === opened.key && now.offset === opened.offset && text === opened.text;
}
