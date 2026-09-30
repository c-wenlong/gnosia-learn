"use client";

import { createContext, useContext } from "react";

/**
 * What `ConversationHost` lets a way into a conversation do, in a module of
 * its own so the plus card can reach it without importing the panel.
 */
export interface HostControls {
  /** A conversation is being made: open the dialog now. Returns the attempt's token. */
  begin: () => number;
  /** The attempt ended: go to `href`, or, with null, close the dialog again. */
  settle: (token: number, href: string | null) => void;
}

export const HostContext = createContext<HostControls | null>(null);

/** The host's controls, or null outside `/studio`, where a router push is the way in. */
export function useConversationHost(): HostControls | null {
  return useContext(HostContext);
}
