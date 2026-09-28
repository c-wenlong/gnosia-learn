/**
 * The rules behind `Composer`, kept apart from the component.
 *
 * React-free for the same reason `filter-menu.ts` is: a `"use client"`
 * module's exports are client references (AGENTS.md), and these are the parts
 * worth a test.
 */

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
 * would post half a sentence.
 */
export function composerKey(event: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}): ComposerKey {
  if (event.key !== "Enter" || event.isComposing === true) return "none";
  if (event.metaKey || event.ctrlKey) return "mod-send";
  if (event.shiftKey || event.altKey === true) return "newline";
  return "send";
}
