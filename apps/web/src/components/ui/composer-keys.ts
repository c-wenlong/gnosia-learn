/**
 * The rules behind `Composer`, kept apart from the component.
 *
 * React-free for the same reason `filter-menu.ts` is: a `"use client"`
 * module's exports are client references (AGENTS.md), and these are the parts
 * worth a test.
 */

import { FIELD_TEXT } from "./classes";

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
export const COMPOSER_TEXT = `${FIELD_TEXT.px15} leading-6 text-text`;
/** The placeholder, which has to match the text it stands in for. */
export const COMPOSER_PLACEHOLDER = `${FIELD_TEXT.px15} leading-6 text-text3`;
/** The 12px line under a composer saying why it, or Send, is disabled. */
export const COMPOSER_REASON = "px-1 text-[12px] leading-4 text-text2";

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

/** What a key press in the composer means. */
export type ComposerKey = "send" | "mod-send" | "newline" | "none";

/**
 * Enter sends, Shift+Enter is a new line, and Cmd or Ctrl+Enter is its own
 * thing: the studio's panel gives it to a live Draw (`aria-keyshortcuts`),
 * and a composer with no use for it sends.
 *
 * A key pressed while an input method is composing (Japanese, Chinese,
 * Korean) belongs to the IME: Enter there confirms a word, and sending on it
 * would post half a sentence. Safari reports the Enter that commits a word
 * with `isComposing` already false and `keyCode` 229, the code every browser
 * gives a key the IME took, so 229 counts as composing too.
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
  if (event.key !== "Enter" || event.isComposing === true || event.keyCode === 229) return "none";
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
