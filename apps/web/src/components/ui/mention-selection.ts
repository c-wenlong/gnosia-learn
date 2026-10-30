import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type NodeKey,
} from "lexical";

import { caretOffset, caretPoint, mentionQuery, type CaretLine, type MentionOption } from "@/lib/mentions";

import { $createMentionNode, $isMentionNode, type MentionNode } from "./mention-node";

/**
 * `MentionComposer`'s reads and writes of the selection, inside an editor
 * update or read: the `@query` before the caret, the caret as offsets into
 * the value's text and back, and a chip put in with the caret after it. The
 * offset arithmetic itself is React-free and tested in `@/lib/mentions`.
 */

/**
 * The `@query` just before the caret, if the caret sits after one: `@` at the
 * start of a line or after whitespace (a chip right before it does not
 * count), in the same text node.
 */
export function $queryAtCaret(): { nodeKey: NodeKey; offset: number; query: string } | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const node = selection.anchor.getNode();
  if (!$isTextNode(node) || selection.anchor.type !== "text") return null;
  const previous = node.getPreviousSibling();
  // What precedes the node, reduced to the one character the rule looks at.
  const lead = previous === null || $isLineBreakNode(previous) ? "" : $isMentionNode(previous) ? "x" : previous.getTextContent().slice(-1);
  const before = lead + node.getTextContent().slice(0, selection.anchor.offset);
  const found = mentionQuery(before);
  if (found === null || found.offset < lead.length) return null;
  return { nodeKey: node.getKey(), offset: found.offset - lead.length, query: found.query };
}

/** The field's paragraphs as plain lines, for `caretOffset` and `caretPoint`. */
function $caretLines(): CaretLine[] {
  return $getRoot()
    .getChildren()
    .map((block) => ({
      key: block.getKey(),
      children: $isElementNode(block)
        ? block.getChildren().map((child) => ({
            key: child.getKey(),
            type: $isMentionNode(child) ? ("chip" as const) : $isLineBreakNode(child) ? ("break" as const) : ("text" as const),
            length: child.getTextContentSize(),
          }))
        : [],
    }));
}

/** The selection as offsets into the value's text, or null when there is none to keep. */
export function $selectionOffsets(): { anchor: number; focus: number } | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const lines = $caretLines();
  const rootKey = $getRoot().getKey();
  const anchor = caretOffset(lines, { key: selection.anchor.key, offset: selection.anchor.offset, type: selection.anchor.type }, rootKey);
  const focus = caretOffset(lines, { key: selection.focus.key, offset: selection.focus.offset, type: selection.focus.type }, rootKey);
  return anchor === null || focus === null ? null : { anchor, focus };
}

/** Select from `anchor` to `focus`, offsets into the value's text. False when the field has no lines. */
export function $selectOffsets(anchor: number, focus: number): boolean {
  const lines = $caretLines();
  const from = caretPoint(lines, anchor);
  const to = caretPoint(lines, focus);
  if (from === null || to === null) return false;
  const selection = $createRangeSelection();
  selection.anchor.set(from.key, from.offset, from.type);
  selection.focus.set(to.key, to.offset, to.type);
  $setSelection(selection);
  return true;
}

/** After a chip: a space when the next character is not one, and the caret after it. */
export function $placeAfter(chip: MentionNode): void {
  const next = chip.getNextSibling();
  if ($isTextNode(next) && /^\s/.test(next.getTextContent())) {
    next.select(1, 1);
    return;
  }
  if ($isTextNode(next)) {
    next.setTextContent(` ${next.getTextContent()}`);
    next.select(1, 1);
    return;
  }
  const space = $createTextNode(" ");
  chip.insertAfter(space);
  space.select(1, 1);
}

/**
 * Put `option`'s chip at the selection, or at the end of a field with none,
 * then a space and the caret after it (`$placeAfter`). The one insert both a
 * pick from the plus menu and `insertMention` make. Null when there is no
 * place to put it.
 */
export function $insertChip(option: Pick<MentionOption, "id" | "name" | "icon">): MentionNode | null {
  if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const chip = $createMentionNode(option);
  selection.insertNodes([chip]);
  $placeAfter(chip);
  return chip;
}
