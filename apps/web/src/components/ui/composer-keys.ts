/**
 * The rules behind `Composer`, kept apart from the component.
 *
 * React-free for the same reason `filter-menu.ts` is: a `"use client"`
 * module's exports are client references (AGENTS.md), and these are the parts
 * worth a test.
 */

import { cx, FIELD_TEXT, NOTE } from "./classes";

/**
 * The composer's frame, shared by `Composer` (a textarea) and
 * `MentionComposer` (a rich-text field with chips): radius 16, a 2px
 * `--border` that goes `--accent` on focus, `--surface` inside. 52px at one
 * line (the constants below), growing to six. The focus
 * rule is the caller's, since a textarea takes `focus:` and a frame around an
 * editable takes `focus-within:`.
 *
 * Here rather than in `classes.ts`, which every page's shell loads: only the
 * two composers read these, so no other route carries them.
 */
export const COMPOSER_FRAME = "rounded-2xl border-2 border-border bg-surface transition-colors duration-100";
/**
 * The composer's text: 15px on a 24px line, as the tutor's input always had,
 * with a mouse or trackpad from 768px up. On anything touched it is 16px (see
 * `FIELD_TEXT`: iOS Safari zooms the page when it focuses a field under 16px
 * and leaves it zoomed). The line stays 24px either way, so the height
 * arithmetic below holds at both sizes.
 */
export const COMPOSER_TEXT = cx(FIELD_TEXT.px15, "leading-6 text-text");
/** The placeholder, which has to match the text it stands in for. */
export const COMPOSER_PLACEHOLDER = cx(FIELD_TEXT.px15, "leading-6 text-text3");
/** The line under a composer saying why it, or Send, is disabled: the `NOTE` role. */
export const COMPOSER_REASON = cx("px-1", NOTE);

/** 15px text on a 24px line, as the tutor's input always had. */
export const COMPOSER_LINE_PX = 24;
/** Two 2px borders and two 12px paddings: one line is 52px, the kit height. */
export const COMPOSER_CHROME_PX = 28;
/** Past this the textarea scrolls rather than growing. */
export const COMPOSER_MAX_ROWS = 6;

/** The height a textarea holding `scrollHeight` of content should take. */
export function composerHeight(scrollHeight: number, maxRows: number = COMPOSER_MAX_ROWS): number {
  const min = COMPOSER_CHROME_PX + COMPOSER_LINE_PX;
  const max = COMPOSER_CHROME_PX + COMPOSER_LINE_PX * Math.max(1, maxRows);
  // `scrollHeight` counts the padding and not the border, so the two borders
  // (4px) are added back before clamping.
  return Math.min(max, Math.max(min, scrollHeight + 4));
}

/*
 * The box layout (`layout="box"`, D88 of docs/STUDIO-CHAT-FIRST.md): the
 * field on top and a row of controls inside the frame under it, as Gauth's
 * Atlas prompt box is laid out. Radius 20 as a card (DESIGN.md), the same 2px
 * border going `--accent` on focus, and no shadow: the kit has none.
 */
export const COMPOSER_BOX = "rounded-[20px] border-2 border-border bg-surface transition-colors duration-100";
/** The field's padding inside the box: 12px over the text and 4px under it, before the row of controls. */
export const COMPOSER_BOX_PAD_PX = 16;
/** Lines the box's field shows when empty, so it reads as a place to write a paragraph. */
export const COMPOSER_BOX_MIN_ROWS = 3;
/** The box's field height for `rows` lines: what both fields and the loading frame take. */
export function composerBoxFieldPx(rows: number): number {
  return COMPOSER_BOX_PAD_PX + COMPOSER_LINE_PX * Math.max(1, rows);
}

/**
 * The height a textarea in the box should take. Unlike the row's, it has no
 * border of its own (the box draws it), so `scrollHeight` is the whole of it.
 */
export function composerBoxHeight(
  scrollHeight: number,
  minRows: number = COMPOSER_BOX_MIN_ROWS,
  maxRows: number = COMPOSER_MAX_ROWS,
): number {
  const min = composerBoxFieldPx(minRows);
  const max = composerBoxFieldPx(Math.max(minRows, maxRows));
  return Math.min(max, Math.max(min, scrollHeight));
}

/**
 * Whether a key belongs to an input method that is composing a word
 * (Japanese, Chinese, Korean): Enter there confirms the word, and acting on
 * it would send or save half a sentence. Safari reports the Enter that
 * commits a word with `isComposing` already false and `keyCode` 229, the code
 * every browser gives a key the IME took, so 229 counts as composing too.
 *
 * Takes the native event (`event.nativeEvent` from a React handler), which
 * carries both.
 */
export function isImeKey(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

/** What a key press in the composer means. */
export type ComposerKey = "send" | "mod-send" | "newline" | "none";

/**
 * Enter sends, Shift+Enter is a new line, and Cmd or Ctrl+Enter is its own
 * thing: the studio's panel gives it to a live Draw (`aria-keyshortcuts`),
 * and a composer with no use for it sends.
 *
 * A key pressed while an input method is composing belongs to the IME
 * (`isImeKey`), and means nothing here.
 *
 * Shaped as a native `KeyboardEvent`, so a React handler passes
 * `event.nativeEvent` whole rather than rebuilding it.
 */
export function composerKey(event: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}): ComposerKey {
  if (event.key !== "Enter" || isImeKey(event)) return "none";
  if (event.metaKey || event.ctrlKey) return "mod-send";
  if (event.shiftKey || event.altKey === true) return "newline";
  return "send";
}

/**
 * Where Cmd or Ctrl+Enter goes: to the caller's `onModEnter` (the studio's
 * Draw) only from an empty field. Words in the field are sent instead, so a
 * correction typed under a brief is not turned into a paid drawing of the old
 * one, and the send takes the same checks a plain Enter does.
 */
export function modEnterTarget(value: string, hasModEnter: boolean): "mod" | "send" {
  return hasModEnter && value.trim() === "" ? "mod" : "send";
}

/**
 * Whether Send is refused (the field off, the caller holding Send, nothing
 * typed), and the reason line to show, which only a field or a Send that is
 * off has: an empty field needs no explaining.
 */
export function composerGate({
  disabled,
  sendDisabled,
  empty,
  disabledReason,
}: {
  disabled: boolean;
  sendDisabled: boolean;
  empty: boolean;
  disabledReason?: string;
}): { blocked: boolean; reason: string | null } {
  return {
    blocked: disabled || sendDisabled || empty,
    reason: (disabled || sendDisabled) && disabledReason ? disabledReason : null,
  };
}
