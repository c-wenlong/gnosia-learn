"use client";

import { createContext, useContext } from "react";

import type { MentionValue } from "@/components/ui/mention-text";
import type { DraftKind } from "@/lib/studio-drafts";

/**
 * What `PanelHost` lets a way into a panel do, in a module of its own so a
 * link or the plus card can reach it without importing the panels.
 */
export interface HostControls {
  /**
   * A conversation is being made: open it now, showing `first` as the
   * person's turn when there is one. Returns the attempt's token.
   */
  begin: (first: MentionValue<DraftKind> | null) => number;
  /**
   * The attempt ended: go to `href`, or, with null, close the conversation
   * again. True when it went to `href`; false when the person had moved on.
   */
  settle: (token: number, href: string | null) => boolean;
  /**
   * Go to `href` without a server render when it only opens, closes or swaps
   * a panel the browser draws (`browserPanelMove`). False when it does not,
   * and the caller navigates as it would have.
   */
  navigate: (href: string) => boolean;
  /**
   * The address bar's `/studio?…`, less a verb's outcome: what a link on the
   * page patches. The server's copy goes stale once a panel or a view change
   * has moved the URL in the browser.
   */
  path: string;
  /** Start reading the settings panel's rows, so it opens with them: on a hover over its button. */
  warmSettings: () => void;
}

export const HostContext = createContext<HostControls | null>(null);

/** The host's controls, or null outside `/studio`, where a router push is the way in. */
export function usePanelHost(): HostControls | null {
  return useContext(HostContext);
}

/**
 * Said on `window` by New chat once the home view is back, so the home
 * composer takes focus: typing straight away should land in it.
 */
export const NEW_CHAT_EVENT = "studio:new-chat";

/** The current studio path inside the host, else `fallback` (the server's). */
export function useStudioPath(fallback: string): string {
  return useContext(HostContext)?.path ?? fallback;
}
