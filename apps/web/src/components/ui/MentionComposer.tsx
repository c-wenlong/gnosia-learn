"use client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type NodeKey,
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

import {
  filterMentionOptions,
  firstActive,
  isEmptyValue,
  isUsable,
  mapOffset,
  menuOpenedAnnouncement,
  plusMenuStays,
  rowAnnouncement,
  sameValue,
  serializeMentions,
  valuePieces,
  type MentionOption,
  type MentionValue,
  type PlusAnchor,
  type SerializedNodeLike,
  type TextEdit,
} from "@/lib/mentions";

import { Button } from "./Button";
import { cx } from "./classes";
import { ComposerBox, ComposerReason, ComposerRow, SendDisc } from "./ComposerBox";
import {
  COMPOSER_BOX_MIN_ROWS,
  COMPOSER_FRAME,
  COMPOSER_LINE_PX,
  COMPOSER_MAX_ROWS,
  COMPOSER_PLACEHOLDER,
  COMPOSER_TEXT,
  composerBoxFieldPx,
  composerGate,
  composerKey,
  isImeKey,
} from "./composer-keys";
import { Glyph } from "./Glyph";
import { IconButton } from "./IconButton";
import { $createMentionNode, $mentionNodes, MentionNode } from "./mention-node";
import { $insertChip, $placeAfter, $queryAtCaret, $selectionOffsets, $selectOffsets } from "./mention-selection";
import { MentionMenu } from "./MentionMenu";
import { moveActive } from "./roving";

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
 * `@/lib/mentions` and `composer-keys.ts`.
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
  /**
   * Keep the reason for a screen reader only: still the field's and Send's
   * description, but `sr-only`, so it takes no room under the box.
   */
  quietReason?: boolean;
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
  quietReason = false,
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
  // Cmd+Enter's `onModEnter`, waiting for the key's own update to commit.
  const modTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The frame the @ menu is placed against.
  const frame = useRef<HTMLDivElement | null>(null);

  // The latest props, for command handlers registered once.
  const latest = useRef({ value, onChange, onSubmit, mentions, onModEnter, disabled, sendDisabled });
  useEffect(() => {
    latest.current = { value, onChange, onSubmit, mentions, onModEnter, disabled, sendDisabled };
  });

  const { blocked, reason } = composerGate({ disabled, sendDisabled, empty: isEmptyValue(value), disabledReason });
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
      // Announced from inside the update: a pick by Enter or Tab runs inside
      // the key's own update, where this one is queued to run after it.
      const added = () => setAnnouncement(`${option.name} tag added.`);
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
          added();
          return;
        }
        if (!already && $insertChip(option) !== null) added();
      });
      openMenu(null);
      editor.focus();
    },
    [editor, openMenu],
  );

  const insertMention = useCallback(
    (kind: string) => {
      const option = latest.current.mentions.find((entry) => entry.id === kind);
      if (option === undefined || latest.current.disabled) return;
      openMenu(null);
      editor.update(() => {
        if ($mentionNodes().some((node) => node.getKind() === kind)) {
          if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
          return;
        }
        // At the caret the field last had, or at the end of a field nobody
        // has clicked into yet.
        if (!focusedOnce.current) $getRoot().selectEnd();
        if ($insertChip(option) !== null) setAnnouncement(`${option.name} tag added.`);
      });
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

  // What is in the field now: the value the editor last reported, which the
  // update listener sets as it happens. `latest.current.value` waits for the
  // parent's render and this component's effects, and a key the editor
  // handles natively (Enter after an autocorrect or a paste) can come first.
  const submit = useCallback((event?: FormEvent) => {
    event?.preventDefault();
    const { disabled: off, sendDisabled: held, onSubmit: send } = latest.current;
    const now = emitted.current;
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
          // uncancelled Escape as its own close request (T2). The menu's
          // `Popover` takes the press first once it is up; this covers the
          // moment before its layer is registered.
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
            const { onModEnter: mod } = latest.current;
            const now = emitted.current;
            // After the key's own update commits: a command listener runs
            // inside one, and its commit puts the DOM selection (and so the
            // focus) back in the field, which would undo a caller moving
            // focus to a card's button.
            if (mod !== undefined && isEmptyValue(now)) {
              if (modTimer.current !== null) clearTimeout(modTimer.current);
              modTimer.current = setTimeout(() => {
                modTimer.current = null;
                mod();
              }, 0);
            } else submit();
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
      () => {
        // A Cmd+Enter's hand-off still waiting when the field goes.
        if (modTimer.current !== null) clearTimeout(modTimer.current);
        modTimer.current = null;
      },
    );
  }, [editor, openMenu, pick, submit]);

  // Whether the field has ever had focus, for `insertMention`'s place. On
  // whichever element is the editor's root, as it is set and replaced.
  useEffect(() => {
    const mark = () => {
      focusedOnce.current = true;
    };
    let on: HTMLElement | null = null;
    const stop = editor.registerRootListener((root) => {
      on?.removeEventListener("focus", mark);
      root?.addEventListener("focus", mark);
      on = root;
    });
    return () => {
      stop();
      on?.removeEventListener("focus", mark);
    };
  }, [editor]);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  // A disabled field shows no menu, whatever was open when it was disabled.
  // Nothing points at a menu on its way out: the field's `aria-controls` and
  // `aria-activedescendant` read `open`.
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
    <form onSubmit={submit} className={cx("flex flex-col gap-1.5", className)}>
      <MentionMenu
        anchorRef={frame}
        menu={open ? menu : null}
        listId={listId}
        optionId={optionId}
        tagged={tagged}
        hint={mentionHint}
        // Under the box, beside its plus; over the row, which sits at the foot of a panel.
        placement={box ? "bottom-start" : "top-start"}
        onClose={() => openMenu(null)}
        onHover={(at) => {
          if (menuRef.current !== null) openMenu({ ...menuRef.current, active: at });
        }}
        onPick={pick}
      />

      {box ? (
        <ComposerBox
          ref={frame}
          disabled={disabled}
          field={field}
          leading={plus}
          toolbar={toolbar}
          send={<SendDisc label={sendLabel} disabled={blocked} describedBy={describedBy} />}
        />
      ) : (
        <ComposerRow
          field={
            <div
              ref={frame}
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
          }
          send={
            <Button type="submit" disabled={blocked} aria-describedby={describedBy}>
              {sendLabel}
            </Button>
          }
        />
      )}
      <ComposerReason id={reasonId} reason={reason} quiet={quietReason} />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </form>
  );
}

