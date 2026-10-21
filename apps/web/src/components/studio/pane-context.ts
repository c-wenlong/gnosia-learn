"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether a panel is drawn full screen (`StudioPane`) rather than in the
 * centred dialog, in a module of its own so a panel can ask without
 * importing the dialog, and a test that stubs the dialog still gets an
 * answer (false, the dialog).
 *
 * A conversation takes the whole of the studio beside the sidebar since the
 * home composer (docs/STUDIO-CHAT-FIRST.md, "Home and the full-screen
 * conversation"). Its thread and composer then keep to a reading column in
 * the middle, the way a chat app's do, with the scrollbar still at the edge.
 */
export interface PaneLayout {
  /** True inside `StudioPane`. */
  inline: boolean;
  /** What the header draws before its title: the conversation's harness picker. */
  leading: ReactNode;
}

export const PaneContext = createContext<PaneLayout>({ inline: false, leading: null });

export function usePaneLayout(): PaneLayout {
  return useContext(PaneContext);
}

/**
 * The side padding that keeps a full-width scroller's content to a 48rem
 * column in the middle: half of whatever is left over, and never under the
 * dialog's own 20px. Padding rather than a narrower box, so the scrollbar
 * stays at the pane's edge and the whole width scrolls.
 */
export const PANE_GUTTER = "px-[max(1.25rem,calc((100%_-_48rem)/2))]";
