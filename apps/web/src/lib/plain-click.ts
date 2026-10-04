/**
 * Whether a click is a plain one: the main button, no modifier. A modified
 * click (Cmd or Ctrl for a new tab, Shift for a new window, Alt to download)
 * or the middle button is the browser's, and a link that would otherwise take
 * the move in-page (a panel, a conversation, a menu that closes) lets it be.
 *
 * React-free, so a link component and a test share it; it reads the corner a
 * React `MouseEvent` and a DOM one have in common.
 */
export function isPlainClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
