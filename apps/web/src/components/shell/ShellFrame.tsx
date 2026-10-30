"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { cx } from "@/components/ui/classes";
import { readCookie } from "@/lib/client-cookie";
import { SIDEBAR_COOKIE, writeSidebarCookie } from "@/lib/sidebar-cookie";

import { AppSidebar } from "./AppSidebar";
import { PhoneHeader } from "./PhoneHeader";
import { PublishContext, ShellContext, type ShellControls, type StudioChats } from "./shell-context";

/**
 * The client half of `AppShell`: the sidebar beside a column holding the
 * phone header and whatever the server drew (the store banner and the page),
 * and the state the three share: the phone's drawer, the desktop fold, and
 * the conversations the studio page publishes (`usePublishStudioChats`).
 *
 * It lives in the `(app)` layout, which Next keeps mounted across
 * navigations, so the sidebar's scroll, its fold and the conversation list
 * it read survive moving between pages.
 */
export function ShellFrame({
  studio,
  runner = studio,
  initialCollapsed,
  children,
}: {
  studio: boolean;
  /** Whether the studio's runner was listening when the server drew the page (`runnerListening`). */
  runner?: boolean;
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsedState] = useState(initialCollapsed);
  const [chats, setChats] = useState<StudioChats | null>(null);

  // A navigation closes the drawer: the pick that caused it is done.
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    if (drawer) setDrawer(false);
  }

  // Back or Forward closes it too: on /studio they can move between views
  // without changing the path, and the drawer would cover the new one.
  useEffect(() => {
    if (!drawer) return;
    const onPop = () => setDrawer(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [drawer]);

  // The studio's own sidebar (#301) kept its fold in `localStorage`. Carried
  // into the cookie once, where the server can read it, and then dropped.
  useEffect(() => {
    const folded = takeLegacyFold();
    if (folded !== null && readCookie(SIDEBAR_COOKIE) === undefined) {
      // Only readable once in the browser, so the server drew it open; this
      // happens once per browser, the first visit after the move.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsedState(folded);
      writeSidebarCookie(folded);
    }
  }, []);

  // Widened past the drawer's range: the sidebar is a column again, and a
  // drawer left open would leave the page inert behind nothing.
  useEffect(() => {
    if (!drawer) return;
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => {
      if (wide.matches) setDrawer(false);
    };
    wide.addEventListener("change", onWide);
    return () => wide.removeEventListener("change", onWide);
  }, [drawer]);

  const openDrawer = useCallback(() => setDrawer(true), []);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    writeSidebarCookie(value);
  }, []);

  // A studio page that read the runner's list on the server has heard it
  // answer since, whatever the layout's earlier look found, and that holds
  // after the page is left: the frame outlives navigations, the look does
  // not run again, and a runner that stops later is caught by the reads
  // themselves (`useConversations`' `failed`).
  const [heard, setHeard] = useState(false);
  if (!heard && (chats?.initial ?? null) !== null) setHeard(true);
  const answering = studio && (runner || heard);
  const controls = useMemo<ShellControls>(
    () => ({ studio, runner: answering, drawer, openDrawer, closeDrawer, collapsed, setCollapsed, chats, setChats }),
    [studio, answering, drawer, openDrawer, closeDrawer, collapsed, setCollapsed, chats],
  );

  return (
    <PublishContext.Provider value={setChats}>
      <ShellContext.Provider value={controls}>
        {/*
          `min-h-dvh`, not `min-h-full`: the body has only a min-height, so a
          percentage of it resolved to nothing and a short page's shell
          stopped at its content. `relative` makes the shell the containing
          block for any absolute box nothing nearer claims (an `sr-only`
          label in a chat thread), so the fixed-height modes' `overflow-hidden`
          clips it instead of the document growing past the shell, which
          is what leaves a blank strip under the sticky sidebar.
        */}
        <div
          // Read by the `ws:` variant (globals.css): with the sidebar on its
          // rail the workspace's panels fit beside it at a narrower window.
          data-sidebar={collapsed ? "rail" : "open"}
          className={cx(
            "group/shell relative flex min-h-dvh bg-page text-text",
            "has-[[data-layout=full]]:h-dvh has-[[data-layout=full]]:overflow-hidden",
            "ws:has-[[data-layout=workspace]]:h-dvh ws:has-[[data-layout=workspace]]:overflow-hidden",
          )}
        >
          <AppSidebar />
          {/* Inert behind the phone's drawer, which holds focus meanwhile. */}
          <div inert={drawer} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PhoneHeader />
            {children}
          </div>
        </div>
      </ShellContext.Provider>
    </PublishContext.Provider>
  );
}

/** The fold the studio's sidebar saved before it became the app's, or null; the key is removed. */
function takeLegacyFold(): boolean | null {
  try {
    const stored = window.localStorage.getItem("studio:sidebar-collapsed");
    if (stored === null) return null;
    window.localStorage.removeItem("studio:sidebar-collapsed");
    return stored === "1";
  } catch {
    return null;
  }
}
