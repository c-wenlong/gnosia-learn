"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { writeSidebarCookie } from "@/lib/sidebar-cookie";

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
  initialCollapsed,
  children,
}: {
  studio: boolean;
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

  const controls = useMemo<ShellControls>(
    () => ({ studio, drawer, openDrawer, closeDrawer, collapsed, setCollapsed, chats, setChats }),
    [studio, drawer, openDrawer, closeDrawer, collapsed, setCollapsed, chats],
  );

  return (
    <PublishContext.Provider value={setChats}>
      <ShellContext.Provider value={controls}>
        <div
          className={[
            "group/shell flex min-h-full bg-page text-text",
            "has-[[data-layout=full]]:h-dvh has-[[data-layout=full]]:overflow-hidden",
            "min-[900px]:has-[[data-layout=workspace]]:h-dvh min-[900px]:has-[[data-layout=workspace]]:overflow-hidden",
          ].join(" ")}
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
