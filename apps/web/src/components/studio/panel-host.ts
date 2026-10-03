"use client";

import { createContext, useContext } from "react";

/**
 * What `PanelHost` lets a way into a panel do, in a module of its own so a
 * link or the plus card can reach it without importing the panels.
 */
export interface HostControls {
  /** A conversation is being made: open the dialog now. Returns the attempt's token. */
  begin: () => number;
  /** The attempt ended: go to `href`, or, with null, close the dialog again. */
  settle: (token: number, href: string | null) => void;
  /**
   * Go to `href` without a server render when it only opens, closes or swaps
   * a panel the browser draws (`browserPanelMove`). False when it does not,
   * and the caller navigates as it would have.
   */
  navigate: (href: string) => boolean;
  /** Start reading the settings panel's rows, so it opens with them: on a hover over its button. */
  warmSettings: () => void;
}

export const HostContext = createContext<HostControls | null>(null);

/** The host's controls, or null outside `/studio`, where a router push is the way in. */
export function usePanelHost(): HostControls | null {
  return useContext(HostContext);
}
