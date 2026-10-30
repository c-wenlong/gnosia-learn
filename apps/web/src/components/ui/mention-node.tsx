import {
  $getRoot,
  $isElementNode,
  DecoratorNode,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import type { ReactNode } from "react";

import { MENTION_NODE_TYPE, mentionToken, type MentionOption } from "@/lib/mentions";

import type { GlyphName } from "./Glyph";
import { MentionChip } from "./MentionChip";

/**
 * `MentionComposer`'s chip as a Lexical node, and the `$` helpers that make
 * and find one. Only that field imports it, so it rides in the field's lazy
 * chunk with Lexical.
 */

type SerializedMentionNode = SerializedLexicalNode & { kind: string; name: string; icon: string | null };

/**
 * The chip: an inline decorator node, one unit to the caret, that reports
 * `@<kind>` as its text, so copying it gives the words it sends and
 * `serializeMentions` finds it by its type.
 */
export class MentionNode extends DecoratorNode<ReactNode> {
  __kind: string;
  __name: string;
  __icon: string | null;

  static getType(): string {
    return MENTION_NODE_TYPE;
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__kind, node.__name, node.__icon, node.__key);
  }

  static importJSON(json: SerializedMentionNode): MentionNode {
    return new MentionNode(json.kind, json.name, json.icon ?? null);
  }

  constructor(kind: string, name: string, icon: string | null, key?: NodeKey) {
    super(key);
    this.__kind = kind;
    this.__name = name;
    this.__icon = icon;
  }

  exportJSON(): SerializedMentionNode {
    return { type: MENTION_NODE_TYPE, version: 1, kind: this.__kind, name: this.__name, icon: this.__icon };
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.contentEditable = "false";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createTextNode(mentionToken(this.__kind)) as unknown as HTMLElement };
  }

  getTextContent(): string {
    return mentionToken(this.__kind);
  }

  isInline(): boolean {
    return true;
  }

  /** Backspace and Delete beside a chip take it whole, rather than selecting it first. */
  isKeyboardSelectable(): boolean {
    return false;
  }

  getKind(): string {
    return this.getLatest().__kind;
  }

  decorate(): ReactNode {
    return <MentionChip name={this.__name} icon={(this.__icon as GlyphName | null) ?? null} />;
  }
}

export function $createMentionNode(option: Pick<MentionOption, "id" | "name" | "icon">): MentionNode {
  return new MentionNode(option.id, option.name, option.icon ?? null);
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}

/** Every chip in the field, in order. */
export function $mentionNodes(): MentionNode[] {
  const out: MentionNode[] = [];
  const walk = (node: LexicalNode) => {
    if ($isMentionNode(node)) out.push(node);
    else if ($isElementNode(node)) for (const child of node.getChildren()) walk(child);
  };
  walk($getRoot());
  return out;
}
