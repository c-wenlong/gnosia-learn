import type { MouseEvent } from "react";

import { isPlainClick } from "@/lib/plain-click";

/**
 * What a conversation row (or a search hit) does when pressed: close the
 * drawer, and on the studio open the conversation in the browser through the
 * page's own move (`StudioChats.navigate`) instead of a server render. A
 * modified click (new tab, new window) is the link it always was, and off the
 * studio `navigate` is null, so the link is followed.
 */
export function rowClick(navigate: ((href: string) => boolean) | null, href: string, onPick: () => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    onPick();
    if (navigate === null) return;
    if (!isPlainClick(event)) return;
    if (navigate(href)) event.preventDefault();
  };
}
