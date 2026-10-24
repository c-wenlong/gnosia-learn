/**
 * What a key press means on a quiz page (Review and a learning session),
 * before each page decides what to do with it: the part the two share.
 *
 * `null` when the key is not the page's at all: a modifier is held (Cmd+R
 * reloads, it does not rate), a write is still in flight, or the press is in
 * a field, where 1 to 4, Space and Enter are typing. Otherwise `number` is the
 * option 1 to 4 pressed, zero-based, or null, and `enter` and `space` say
 * whether that key was pressed with no focused link or button to take it:
 * Enter on a focused Exit leaves, it does not answer. A radio (a segment of
 * the session page's "How sure are you?") takes Space but not Enter, which a
 * radio group gives no meaning, so Enter there still checks the answer.
 *
 * React-free, so it can be tested with a plain object for the event.
 */

/** The corner of a `KeyboardEvent` this reads. */
export interface QuizKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

export interface QuizKey {
  /** 1 to 4 pressed, as 0 to 3; null for any other key. */
  number: number | null;
  /** Enter, and no focused control to take it. */
  enter: boolean;
  /** Space, and no focused control to take it. */
  space: boolean;
}

export function quizKey(event: QuizKeyEvent, pending: boolean): QuizKey | null {
  if (event.metaKey || event.ctrlKey || event.altKey || pending) return null;
  const target = event.target as HTMLElement | null;
  if (target !== null && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return null;
  // Space and Enter on a focused link or button belong to that control.
  const control = target === null ? null : target.closest("a[href], button:not(:disabled)");
  const onControl = control !== null;
  const n = Number(event.key);
  return {
    number: Number.isInteger(n) && n >= 1 && n <= 4 ? n - 1 : null,
    enter: event.key === "Enter" && (!onControl || control.getAttribute?.("role") === "radio"),
    space: event.key === " " && !onControl,
  };
}
