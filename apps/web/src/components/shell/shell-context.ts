"use client";

import { createContext, useContext, useEffect } from "react";

import type { DraftSummary } from "@/lib/studio-drafts";

/**
 * What the studio page tells the app's sidebar while it is on screen, so the
 * conversation list in the sidebar behaves as it did when the studio drew its
 * own: the open conversation is marked, one being made shows at the top, New
 * chat empties the composer without a server render, and a row opens its
 * conversation in the browser (`PanelHost`). Off the studio nothing is
 * published, and the same rows are plain links to `/studio?draft=`.
 */
export interface StudioChats {
  /** The conversation on screen, by id. */
  active: string | null;
  /** The words of a conversation being made, before it has an id. */
  pending: string | null;
  /** New chat: back to the home view's composer. */
  newChat: () => void;
  /** Open `href` in the browser when the host can (`HostControls.navigate`). */
  navigate: (href: string) => boolean;
  /** The address bar's `/studio?…`, which a row's link patches. */
  path: string;
  /** The list the page read on the server, or null when the runner did not answer. */
  initial: DraftSummary[] | null;
  /** Diagram titles by name, for a draft that extends one and has no words yet. */
  titles: Readonly<Record<string, string>>;
}

export interface ShellControls {
  /** Whether this deployment has a studio. Only the server can know (D11). */
  studio: boolean;
  /**
   * Whether the studio's runner is worth asking: it was listening when the
   * server drew the page, or the studio page has read its list since. While
   * it is not, nothing in the shell asks it (each request would fail, and say
   * so in the console), and Recent shows the conversations the catalog's
   * `draft` mirror holds. False without a studio.
   */
  runner: boolean;
  /** The phone's drawer. */
  drawer: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** The desktop rail. */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /** What the studio page published, or null anywhere else. */
  chats: StudioChats | null;
  setChats: (chats: StudioChats | null) => void;
}

export const ShellContext = createContext<ShellControls | null>(null);

/**
 * The publish half on its own: a setter that never changes, so a publisher
 * does not render again each time the shell's state moves. Reading it from
 * `ShellContext` made the studio page a consumer of what it publishes, and a
 * page that handed over a new array or object each render published forever.
 */
export const PublishContext = createContext<((chats: StudioChats | null) => void) | null>(null);

/** The shell's controls, or null outside the app's frame (a test, the landing page). */
export function useShell(): ShellControls | null {
  return useContext(ShellContext);
}

/**
 * Publish the studio's conversations to the sidebar while the caller is
 * mounted, and take them back when it goes. Each field is a dependency on its
 * own, so a render that changes none of them publishes nothing.
 */
export function usePublishStudioChats(chats: StudioChats): void {
  const setChats = useContext(PublishContext);
  const { active, pending, newChat, navigate, path, initial, titles } = chats;
  useEffect(() => {
    if (setChats === null) return;
    setChats({ active, pending, newChat, navigate, path, initial, titles });
  }, [setChats, active, pending, newChat, navigate, path, initial, titles]);
  useEffect(() => {
    if (setChats === null) return;
    return () => setChats(null);
  }, [setChats]);
}
