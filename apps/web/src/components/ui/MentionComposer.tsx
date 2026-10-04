"use client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  DecoratorNode,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from "react";

import { Button } from "./Button";
import { cx } from "./classes";
import { ComposerBox, SendDisc } from "./ComposerBox";
import {
  COMPOSER_BOX_MIN_ROWS,
  COMPOSER_FRAME,
  COMPOSER_LINE_PX,
  COMPOSER_MAX_ROWS,
  COMPOSER_PLACEHOLDER,
  COMPOSER_REASON,
  COMPOSER_TEXT,
  composerBoxFieldPx,
  composerKey,
  isImeKey,
} from "./composer-keys";
import { Glyph, type GlyphName } from "./Glyph";
import { IconButton } from "./IconButton";
import { MentionChip } from "./MentionChip";
import {
  caretOffset,
  caretPoint,
  filterMentionOptions,
  firstActive,
  isEmptyValue,
  isUsable,
  mapOffset,
  MENTION_NODE_TYPE,
  mentionQuery,
  mentionToken,
  menuOpenedAnnouncement,
  moveActive,
  rowAnnouncement,
  sameValue,
  serializeMentions,
  valuePieces,
  plusMenuStays,
  type CaretLine,
  type MentionOption,
  type MentionValue,
  type PlusAnchor,
  type SerializedNodeLike,
  type TextEdit,
} from "./mention-text";

/**
 * Kit `MentionComposer`: the studio's chat input, with tags as chips inline
 * in the sentence (docs/STUDIO-MENTIONS.md, D55 to D57).
 *
 * `Composer`'s frame, keys and growth rule on a small rich-text field built
 * on Lexical, whose only rich content is the chips. Typing `@` at the start
 * of the field or after a space, or pressing the plus at its left, opens a
 * menu of what can be made; a pick puts a chip where the `@` was. Each chip
 * is one unit: the caret steps over it, Backspace takes it whole, undo puts
 * the typed `@vid` back. Paste is plain text, so a pasted `@video` stays text
 * and every tag is something the person chose.
 *
 * The field is controlled the way a textarea is, through `value` and
 * `onChange`, with the value `{ text, mentions }` rather than a string: the
 * editor reports every change, and a `value` the parent sets that differs
 * from the last one reported (a refused send's words coming back, a
 * suggestion's prefill, a clear after Send) rebuilds the field from it.
 * `insertMention` on the handle is for the suggestion buttons.
 *
 * `layout="box"` is the studio home's (D88 of docs/STUDIO-CHAT-FIRST.md): the
 * field three lines tall on top, and under it, inside the same frame, the
 * plus, the caller's `toolbar` and a round Send (`ComposerBox`). The menu then
 * opens under the box, beside the plus that opens it. Everything else is the
 * same field.
 *
 * Only the studio renders it, lazily, so Lexical stays out of every other
 * route (open question 4 of the mentions doc). The React-free rules are
 * `mention-text.ts` and `composer-keys.ts`.
 */

export interface MentionComposerHandle {
  /** Put `kind`'s chip at the caret, or at the end when the field has not been focused, and focus it. */
  insertMention: (kind: string) => void;
  focus: () => void;
  /**
   * Keep the caret through the next value the parent sets, when it is `next`
   * and was made from the current one by `edit` (a toggle's chip going in or
   * out): the field is rebuilt from the value as always, and the caret, or
   * the selection, goes back where it was, moved by the edit, instead of to
   * the end.
   */
  keepCaretThrough: (next: MentionValue, edit: TextEdit) => void;
}

export interface MentionComposerProps<K extends string = string> {
  value: MentionValue<K>;
  onChange: (value: MentionValue<K>) => void;
  /** Called with the value as typed; the caller trims and decides. */
  onSubmit: (value: MentionValue<K>) => void;
  /** What a screen reader hears for the field. */
  label: string;
  placeholder?: string;
  /** The @ menu's entries. */
  mentions: readonly MentionOption<K>[];
  /** The menu's foot line: "Tag one or both" in the studio. */
  mentionHint?: string;
  disabled?: boolean;
  sendDisabled?: boolean;
  disabledReason?: string;
  onModEnter?: () => void;
  maxRows?: number;
  sendLabel?: string;
  className?: string;
  handleRef?: Ref<MentionComposerHandle>;
  /**
   * Focus the field once it is on screen. It loads lazily, so a caller that
   * wants focus on open cannot know when to ask: this asks when the field
   * mounts. A function is asked with the element that has focus by then and
   * decides whether the field may take it, so a person who has already gone
   * somewhere else keeps their focus.
   */
  autoFocus?: boolean | ((active: Element | null) => boolean);
  /**
   * What the plain stand-in says under the field when this one will not load,
   * in place of its "reload the page" line. Not read here.
   */
  fallbackNote?: string;
  /** `row`, the default: Send beside the field. `box`: the field over a row of controls, in one frame. */
  layout?: "row" | "box";
  /** The box's controls, between the plus and Send. Not drawn in the row layout. */
  toolbar?: ReactNode;
  /** Lines the box's field shows when empty. */
  minRows?: number;
}

export function MentionComposer<K extends string = string>(props: MentionComposerProps<K>) {
  const [config] = useState(() => ({
    namespace: "studio-composer",
    nodes: [MentionNode],
    editable: !props.disabled,
    onError: (error: Error) => {
      // A Lexical invariant is a bug in this file; it should not take the
      // whole panel down with it.
      console.error(error);
    },
    theme: { paragraph: "m-0" },
  }));
  return (
    <LexicalComposer initialConfig={config}>
      <Field {...props} />
    </LexicalComposer>
  );
}

/* -------------------------------------------------------------------------- */
/* The chip                                                                   */
/* -------------------------------------------------------------------------- */

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

function $createMentionNode(option: Pick<MentionOption, "id" | "name" | "icon">): MentionNode {
  return new MentionNode(option.id, option.name, option.icon ?? null);
}

function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}

/** Every chip in the field, in order. */
function $mentionNodes(): MentionNode[] {
  const out: MentionNode[] = [];
  const walk = (node: LexicalNode) => {
    if ($isMentionNode(node)) out.push(node);
    else if ($isElementNode(node)) for (const child of node.getChildren()) walk(child);
  };
  walk($getRoot());
  return out;
}

/* -------------------------------------------------------------------------- */
/* The field                                                                  */
/* -------------------------------------------------------------------------- */

/** Where the menu is open, and what it replaces when a row is picked. */
interface MenuState<K extends string> {
  /** `typed`: after an `@`; `plus`: from the plus button, replacing nothing. */
  mode: "typed" | "plus";
  /** The text node holding `@query`, and where the `@` is in it. */
  nodeKey: NodeKey | null;
  offset: number;
  query: string;
  options: MentionOption<K>[];
  active: number;
  /** The plus menu only: where the caret was, and the text, when it opened. */
  anchor?: PlusAnchor;
}

/** Updates this file makes itself, which must not be reported as the person's. */
const EXTERNAL = "mention-external";

function Field<K extends string>({
  value,
  onChange,
  onSubmit,
  label,
  placeholder,
  mentions,
  mentionHint,
  disabled = false,
  sendDisabled = false,
  disabledReason,
  onModEnter,
  maxRows = COMPOSER_MAX_ROWS,
  sendLabel = "Send",
  className,
  handleRef,
  autoFocus,
  layout = "row",
  toolbar,
  minRows = COMPOSER_BOX_MIN_ROWS,
}: MentionComposerProps<K>) {
  const [editor] = useLexicalComposerContext();
  const base = useId();
  const reasonId = `${base}-reason`;
  const listId = `${base}-list`;
  const [menu, setMenu] = useState<MenuState<K> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const menuRef = useRef<MenuState<K> | null>(null);
  // Empty, not `value`: the editor starts empty, so a value the parent holds
  // when the field mounts (an opener's words and chips, taken while the panel
  // showed a job) is built into it by the effect below rather than skipped.
  const emitted = useRef<MentionValue<K>>({ text: "", mentions: [] });
  const focusedOnce = useRef(false);
  // A caret to put back after the next rebuild, already moved by the edit, and
  // the text that rebuild must be to.
  const pendingCaret = useRef<{ text: string; anchor: number; focus: number } | null>(null);
  // The last caret the field had, as offsets into the text it had then: the
  // editor drops its selection when focus leaves, so a toggle pressed from
  // the keyboard would otherwise find none to keep.
  const lastCaret = useRef<{ text: string; anchor: number; focus: number } | null>(null);

  // The latest props, for command handlers registered once.
  const latest = useRef({ value, onChange, onSubmit, mentions, onModEnter, disabled, sendDisabled });
  useEffect(() => {
    latest.current = { value, onChange, onSubmit, mentions, onModEnter, disabled, sendDisabled };
  });

  const reason = (disabled || sendDisabled) && disabledReason ? disabledReason : null;
  const empty = isEmptyValue(value);
  const blocked = disabled || sendDisabled || empty;
  const optionId = (option: MentionOption<K>) => `${base}-opt-${option.id}`;

  const openMenu = useCallback((next: MenuState<K> | null) => {
    const previous = menuRef.current;
    menuRef.current = next;
    setMenu(next);
    if (next === null) return;
    const active = next.options[next.active];
    if (previous === null) setAnnouncement(menuOpenedAnnouncement(next.options, next.active));
    else if (active !== undefined && previous.options[previous.active]?.id !== active.id) setAnnouncement(rowAnnouncement(active));
    else if (next.options.length === 0 && previous.options.length > 0) setAnnouncement("Nothing matches.");
  }, []);

  /* ---------------------------------------------------------------- */
  /* Value in and out                                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, tags }) => {
      const next = serializeMentions<K>(editorState.toJSON().root as unknown as SerializedNodeLike);
      const caret = editorState.read(() => $selectionOffsets());
      if (caret !== null) lastCaret.current = { text: next.text, ...caret };
      if (!sameValue(next, emitted.current)) {
        emitted.current = next;
        if (!tags.has(EXTERNAL)) latest.current.onChange(next);
      }
      // The menu follows the caret, and waits for an input method to commit.
      if (editor.isComposing()) return;
      editorState.read(() => {
        const current = menuRef.current;
        // Pasted text is words (T14): a paste ending in " @video" opens no menu.
        if (tags.has("paste")) {
          if (current !== null) openMenu(null);
          return;
        }
        if (current !== null && current.mode === "plus") {
          // The plus menu has no query: typing, or the caret leaving where it
          // opened, closes it and leaves what was typed, so the Enter that
          // ends the sentence sends it rather than picking a chip.
          if (tags.has(EXTERNAL)) return;
          const selection = $getSelection();
          const now = $isRangeSelection(selection)
            ? { key: selection.anchor.key, offset: selection.anchor.offset, collapsed: selection.isCollapsed() }
            : null;
          if (current.anchor === undefined || !plusMenuStays(current.anchor, now, next.text)) openMenu(null);
          return;
        }
        const found = $queryAtCaret();
        if (found === null) {
          if (current !== null) openMenu(null);
          return;
        }
        const options = filterMentionOptions(latest.current.mentions, found.query);
        const keep = current !== null && current.nodeKey === found.nodeKey && current.offset === found.offset;
        const activeId = keep ? current.options[current.active]?.id : undefined;
        const kept = activeId === undefined ? -1 : options.findIndex((option) => option.id === activeId && isUsable(option));
        openMenu({ mode: "typed", ...found, options, active: kept >= 0 ? kept : firstActive(options) });
      });
    });
  }, [editor, openMenu]);

  // A value the parent set that the editor did not report: rebuild from it.
  useEffect(() => {
    if (sameValue(value, emitted.current)) return;
    emitted.current = value;
    const pending = pendingCaret.current;
    pendingCaret.current = null;
    const keep = pending !== null && pending.text === value.text ? pending : null;
    const rootElement = editor.getRootElement();
    // A kept caret is for a field the caller focuses next (a toggle pressed
    // from the keyboard has the focus on itself). Focus it first: the browser
    // applies a selection the editor sets only to a focused field, and would
    // otherwise put the caret back where its own was, at the end.
    if (keep !== null && rootElement !== null && rootElement !== document.activeElement) rootElement.focus({ preventScroll: true });
    const focused = rootElement !== null && rootElement === document.activeElement;
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const byId = new Map(latest.current.mentions.map((option) => [option.id as string, option]));
        for (const line of valuePieces(value)) {
          const paragraph = $createParagraphNode();
          for (const piece of line) {
            if (piece.type === "text") paragraph.append($createTextNode(piece.text));
            else paragraph.append($createMentionNode(byId.get(piece.kind) ?? { id: piece.kind, name: piece.kind }));
          }
          root.append(paragraph);
        }
        if (keep !== null && $selectOffsets(keep.anchor, keep.focus)) return;
        if (focused) root.selectEnd();
        else $setSelection(null);
      },
      { tag: focused ? EXTERNAL : [EXTERNAL, "skip-dom-selection"] },
    );
    openMenu(null);
  }, [value, editor, openMenu]);

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // A chip removed by the person (Backspace, a cut, an undo) is announced.
  useEffect(() => {
    return editor.registerMutationListener(
      MentionNode,
      (nodes, { updateTags, prevEditorState }) => {
        if (updateTags.has(EXTERNAL)) return;
        for (const [key, mutation] of nodes) {
          if (mutation !== "destroyed") continue;
          const gone = prevEditorState.read(() => $getNodeByKey<MentionNode>(key));
          const name = gone === null ? null : prevEditorState.read(() => gone.__name);
          if (name !== null) setAnnouncement(`${name} tag removed.`);
        }
      },
      { skipInitialization: true },
    );
  }, [editor]);

  /* ---------------------------------------------------------------- */
  /* Picking                                                           */
  /* ---------------------------------------------------------------- */

  const pick = useCallback(
    (option: MentionOption<K>) => {
      const current = menuRef.current;
      if (!isUsable(option)) return;
      let added = false;
      editor.update(() => {
        const already = $mentionNodes().some((node) => node.getKind() === option.id);
        if (current !== null && current.mode === "typed" && current.nodeKey !== null) {
          // Replace `@query` in place with the chip.
          const node = $getNodeByKey(current.nodeKey);
          const selection = $getSelection();
          if (!$isTextNode(node) || !$isRangeSelection(selection)) return;
          const end = selection.anchor.offset;
          const parts = node.splitText(current.offset, end);
          const query = current.offset === 0 ? parts[0] : parts[1];
          if (query === undefined) return;
          if (already) {
            // One chip per kind: the query goes, and nothing is added.
            const before = query.getPreviousSibling();
            query.remove();
            if ($isTextNode(before)) before.select(before.getTextContentSize(), before.getTextContentSize());
            return;
          }
          const chip = $createMentionNode(option);
          query.replace(chip);
          $placeAfter(chip);
          added = true;
          return;
        }
        if (already) return;
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) $getRoot().selectEnd();
        const range = $getSelection();
        if (!$isRangeSelection(range)) return;
        const chip = $createMentionNode(option);
        range.insertNodes([chip]);
        $placeAfter(chip);
        added = true;
      });
      openMenu(null);
      if (added) setAnnouncement(`${option.name} tag added.`);
      editor.focus();
    },
    [editor, openMenu],
  );

  const insertMention = useCallback(
    (kind: string) => {
      const option = latest.current.mentions.find((entry) => entry.id === kind);
      if (option === undefined || latest.current.disabled) return;
      openMenu(null);
      let added = false;
      editor.update(() => {
        if ($mentionNodes().some((node) => node.getKind() === kind)) {
          if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
          return;
        }
        // At the caret the field last had, or at the end of a field nobody
        // has clicked into yet.
        let selection = $getSelection();
        if (!focusedOnce.current || !$isRangeSelection(selection)) {
          $getRoot().selectEnd();
          selection = $getSelection();
        }
        if (!$isRangeSelection(selection)) return;
        const chip = $createMentionNode(option);
        selection.insertNodes([chip]);
        $placeAfter(chip);
        added = true;
      });
      if (added) setAnnouncement(`${option.name} tag added.`);
      editor.focus();
    },
    [editor, openMenu],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      insertMention,
      focus: () => editor.focus(),
      keepCaretThrough: (next: MentionValue, edit: TextEdit) => {
        // Read now, before the caller focuses the field (which, with no
        // selection, puts one at the end): the selection the field has, else
        // the one it had when focus left it.
        const now = editor.getEditorState().read(() => $selectionOffsets());
        const last = lastCaret.current;
        const caret = now ?? (last !== null && last.text === emitted.current.text ? last : null);
        pendingCaret.current =
          caret === null ? null : { text: next.text, anchor: mapOffset(caret.anchor, edit), focus: mapOffset(caret.focus, edit) };
      },
    }),
    [insertMention, editor],
  );

  // Once, when the field mounts: the panel behind it asked for focus before
  // this chunk arrived, and the asking has to happen here.
  useEffect(() => {
    if (!autoFocus || latest.current.disabled) return;
    if (autoFocus === true || autoFocus(document.activeElement)) editor.focus();
    // Mount only: a later render must not pull focus back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const openFromPlus = useCallback(() => {
    if (latest.current.disabled) return;
    editor.focus(() => {
      // A caret to open at: where the field last had one, else the end.
      editor.update(
        () => {
          if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
        },
        { discrete: true },
      );
      const anchor = editor.getEditorState().read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) ? { key: selection.anchor.key, offset: selection.anchor.offset } : null;
      });
      if (anchor === null) return;
      const options = [...latest.current.mentions];
      openMenu({
        mode: "plus",
        nodeKey: null,
        offset: 0,
        query: "",
        options,
        active: firstActive(options),
        anchor: { ...anchor, text: emitted.current.text },
      });
    });
  }, [editor, openMenu]);

  /* ---------------------------------------------------------------- */
  /* Keys                                                              */
  /* ---------------------------------------------------------------- */

  const submit = useCallback((event?: FormEvent) => {
    event?.preventDefault();
    const { value: now, disabled: off, sendDisabled: held, onSubmit: send } = latest.current;
    if (off || held || isEmptyValue(now)) return;
    send(now);
  }, []);

  useEffect(() => {
    const moving = (delta: 1 | -1) => (event: KeyboardEvent) => {
      const current = menuRef.current;
      if (current === null) return false;
      event.preventDefault();
      openMenu({ ...current, active: moveActive(current.options, current.active, delta, isUsable) });
      return true;
    };
    const choose = (event: KeyboardEvent | null) => {
      const current = menuRef.current;
      // With nothing to pick ("Nothing matches", or every row disabled), the
      // menu closes and the key does what it would have done without it.
      if (current === null || !current.options.some(isUsable)) {
        if (current !== null) openMenu(null);
        return false;
      }
      // Cmd or Ctrl+Enter with the menu open is ignored: a key meant for the
      // menu never sends and never presses a card.
      event?.preventDefault();
      if (event !== null && (event.metaKey || event.ctrlKey)) return true;
      const option = current.options[current.active];
      if (option !== undefined) pick(option);
      return true;
    };
    return mergeRegister(
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, moving(1), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, moving(-1), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_TAB_COMMAND, (event) => choose(event), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (menuRef.current === null) return false;
          // The menu only: the `<dialog>` around the panel would take an
          // uncancelled Escape as its own close request (T2).
          event.preventDefault();
          event.stopPropagation();
          openMenu(null);
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event !== null && isImeKey(event)) {
            // The input method's Enter confirms a word; leave it to the browser.
            return true;
          }
          if (menuRef.current !== null && choose(event)) return true;
          if (event === null) return false;
          const meaning = composerKey(event);
          if (meaning === "send") {
            event.preventDefault();
            submit();
            return true;
          }
          if (meaning === "mod-send") {
            event.preventDefault();
            const { value: now, onModEnter: mod } = latest.current;
            // After the key's own update commits: a command listener runs
            // inside one, and its commit puts the DOM selection (and so the
            // focus) back in the field, which would undo a caller moving
            // focus to a card's button.
            if (mod !== undefined && isEmptyValue(now)) setTimeout(mod, 0);
            else submit();
            return true;
          }
          // Shift+Enter: the plain-text plugin's line break.
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          openMenu(null);
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, openMenu, pick, submit]);

  useEffect(() => {
    const root = editor.getRootElement();
    if (root === null) return;
    const mark = () => {
      focusedOnce.current = true;
    };
    root.addEventListener("focus", mark);
    return () => root.removeEventListener("focus", mark);
  });

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  // A disabled field shows no menu, whatever was open when it was disabled.
  const open = menu !== null && !disabled;
  const activeOption = menu?.options[menu.active];
  const tagged = new Set(value.mentions.map((mention) => mention.kind as string));
  const maxHeight = COMPOSER_LINE_PX * Math.max(1, maxRows) + 24;
  const box = layout === "box";
  const describedBy = reason === null ? undefined : reasonId;

  const plus = (
    // A 44px target under a finger, the face still 32px.
    <IconButton
      label="Tag what to make"
      size="md"
      touch
      aria-haspopup="listbox"
      aria-expanded={open && menu.mode === "plus"}
      aria-controls={open ? listId : undefined}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => (open && menu.mode === "plus" ? openMenu(null) : openFromPlus())}
    >
      <Glyph name="add" size={20} />
    </IconButton>
  );

  const field = (
    <div className="relative min-w-0 flex-1">
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            role="textbox"
            aria-multiline
            aria-label={label}
            aria-describedby={describedBy}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open && activeOption !== undefined ? optionId(activeOption) : undefined}
            aria-autocomplete="list"
            spellCheck
            style={
              box
                ? { minHeight: composerBoxFieldPx(minRows), maxHeight: composerBoxFieldPx(Math.max(minRows, maxRows)) }
                : { maxHeight }
            }
            className={cx(
              "block w-full overflow-y-auto outline-none",
              box ? "px-4 pb-1 pt-3" : "min-h-12 py-3 pl-1 pr-4",
              "whitespace-pre-wrap break-words",
              COMPOSER_TEXT,
              disabled && "cursor-not-allowed",
            )}
            aria-placeholder={placeholder ?? ""}
            placeholder={
              <div
                aria-hidden
                className={cx(
                  "pointer-events-none absolute top-3",
                  // The box has room for a placeholder that wraps; the row's is one line.
                  box ? "left-4 right-4" : "left-1 right-4 truncate",
                  COMPOSER_PLACEHOLDER,
                )}
              >
                {placeholder}
              </div>
            }
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
    </div>
  );

  return (
    <form onSubmit={submit} className={cx("relative flex flex-col gap-1.5", className)}>
      {open && (
        <div
          className={cx(
            "absolute left-0 z-20 w-full md:max-w-[360px]",
            // Under the box, beside its plus; over the row, which sits at the foot of a panel.
            box ? "top-full mt-2" : "bottom-full mb-2",
            "overflow-hidden rounded-xl border border-border bg-surface",
            // It pops in from the corner it hangs off, the plus's side. Once,
            // as it opens: typing a query re-renders the rows, not this box.
            box ? "origin-top-left" : "origin-bottom-left",
            "animate-pop-in motion-reduce:animate-none",
          )}
        >
          <ul id={listId} role="listbox" aria-label="What to make" className="flex flex-col py-1">
            {menu.options.length === 0 ? (
              <li className="px-3 py-2.5 text-[13px] text-text2">Nothing matches</li>
            ) : (
              menu.options.map((option, at) => {
                const usable = isUsable(option);
                const active = at === menu.active;
                return (
                  <li
                    key={option.id}
                    id={optionId(option)}
                    role="option"
                    aria-selected={active}
                    aria-disabled={!usable || undefined}
                    // The field keeps focus, and a phone keeps its keyboard up.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => {
                      if (usable && menuRef.current !== null) openMenu({ ...menuRef.current, active: at });
                    }}
                    onClick={() => pick(option)}
                    className={cx(
                      "mx-1 flex min-h-10 items-start gap-3 rounded-lg px-2.5 py-2 pointer-coarse:min-h-12",
                      usable ? "cursor-pointer" : "cursor-not-allowed",
                      active && usable && "bg-tint",
                    )}
                  >
                    {option.icon && (
                      <Glyph
                        name={option.icon as GlyphName}
                        className={cx("mt-0.5", !usable ? "text-text3" : active ? "text-accent-text" : "text-text2")}
                      />
                    )}
                    {/* The name over its description, always: side by side, a
                        longer description wrapped under its name at one width
                        and sat beside it at another, so two rows of one menu
                        were laid out two ways. */}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cx("text-[14px] font-medium leading-5", usable ? "text-text" : "text-text3")}>{option.name}</span>
                      <span className="min-w-0 text-[13px] leading-5 text-text2">{usable ? option.description : option.disabledReason}</span>
                    </span>
                    {tagged.has(option.id) && (
                      <>
                        <Glyph name="tick" size={16} className="mt-1 text-accent-text" />
                        <span className="sr-only">, already tagged</span>
                      </>
                    )}
                  </li>
                );
              })
            )}
          </ul>
          {mentionHint !== undefined && <p className="px-3.5 pb-2 text-[12px] leading-4 text-text3">{mentionHint}</p>}
        </div>
      )}

      {box ? (
        <ComposerBox
          disabled={disabled}
          field={field}
          leading={plus}
          toolbar={toolbar}
          send={<SendDisc label={sendLabel} disabled={blocked} describedBy={describedBy} />}
        />
      ) : (
        <div className="flex items-end gap-2.5">
          <div
            className={cx(
              "relative flex min-w-0 flex-1 items-end",
              COMPOSER_FRAME,
              "focus-within:border-accent",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <div className="shrink-0 p-2">{plus}</div>
            {field}
          </div>
          <div className="pb-0.5">
            <Button type="submit" disabled={blocked} aria-describedby={describedBy}>
              {sendLabel}
            </Button>
          </div>
        </div>
      )}
      {reason !== null && (
        <p id={reasonId} className={COMPOSER_REASON}>
          {reason}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The `@query` just before the caret, if the caret sits after one: `@` at the
 * start of a line or after whitespace (a chip right before it does not
 * count), in the same text node.
 */
function $queryAtCaret(): { nodeKey: NodeKey; offset: number; query: string } | null {
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
function $selectionOffsets(): { anchor: number; focus: number } | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const lines = $caretLines();
  const rootKey = $getRoot().getKey();
  const anchor = caretOffset(lines, { key: selection.anchor.key, offset: selection.anchor.offset, type: selection.anchor.type }, rootKey);
  const focus = caretOffset(lines, { key: selection.focus.key, offset: selection.focus.offset, type: selection.focus.type }, rootKey);
  return anchor === null || focus === null ? null : { anchor, focus };
}

/** Select from `anchor` to `focus`, offsets into the value's text. False when the field has no lines. */
function $selectOffsets(anchor: number, focus: number): boolean {
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
function $placeAfter(chip: MentionNode): void {
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
