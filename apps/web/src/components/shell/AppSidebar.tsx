"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { GnosiaWordmark } from "@/components/brand";
import { cx } from "@/components/ui/classes";
import { activeDestination, DESTINATIONS, STUDIO_DESTINATION } from "@/lib/nav";

import mark from "../../../public/brand/mark.png";
import { AccountMenu } from "./AccountMenu";
import { ChatHistory } from "./ChatHistory";
import { NavIcon } from "./NavIcon";
import { useShell } from "./shell-context";

/**
 * The app's one sidebar, laid out the way a chat app's is: the wordmark and
 * the fold at the top, New chat (the studio, when this deployment has one),
 * the five learning destinations, the studio's conversations, and the account
 * at the foot. It replaced the top bar, the phone tab bar and the studio's
 * own conversation list, so moving between making something and learning
 * from it is one column of links.
 *
 * From 768px up it is a column, 260px wide or folded to a 60px rail of icons
 * (the fold is a cookie, `SIDEBAR_COOKIE`, so the first paint has the right
 * width). It sticks to the viewport while the page scrolls under it. Resting
 * the mouse on the rail slides the whole sidebar out over the page, without
 * moving the page, and moving off slides it back; the fold button, pressed
 * then, keeps it open (#301 built this for the studio's own sidebar). On a
 * `data-layout="focus"` page it is hidden from 768px up: focus mode draws its
 * own step bar and exit instead.
 *
 * Below 768px it is a drawer the phone header's button opens, closed again
 * by a pick, the backdrop, Escape or a navigation. While it is open focus
 * starts on its first item and Tab stays inside it (the page behind is inert,
 * `ShellFrame`), and closing it hands focus back to whatever opened it.
 */
export function AppSidebar() {
  const shell = useShell();
  const pathname = usePathname();
  const panel = useRef<HTMLElement | null>(null);
  const studio = shell?.studio ?? false;
  const drawer = shell?.drawer ?? false;
  const closeDrawer = shell?.closeDrawer;
  const collapsed = (shell?.collapsed ?? false) && !drawer;
  const active = activeDestination(pathname);

  /** The folded sidebar slid out over the page, while the pointer is on it. */
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A short wait each way, so a pointer passing over the rail on its way
  // somewhere else does not flash the sidebar open.
  const peekAfter = useCallback((next: boolean, ms: number) => {
    if (peekTimer.current !== null) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(next), ms);
  }, []);
  const stopPeek = useCallback(() => {
    if (peekTimer.current !== null) clearTimeout(peekTimer.current);
    setPeek(false);
  }, []);
  useEffect(
    () => () => {
      if (peekTimer.current !== null) clearTimeout(peekTimer.current);
    },
    [],
  );
  const peeking = collapsed && peek;
  useEffect(() => {
    if (!peeking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPeek(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peeking]);
  // Drawn as icons only: folded and not slid out. The drawer is always the full width.
  const rail = collapsed && !peeking;

  useEffect(() => {
    if (!drawer || closeDrawer === undefined) return;
    // Back to whatever opened the drawer when it closes, if it is still there.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
        return;
      }
      // Tab stays inside the drawer: the page behind it is covered.
      if (event.key !== "Tab" || panel.current === null) return;
      const stops = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")];
      const first = stops[0];
      const last = stops.at(-1);
      if (first === undefined || last === undefined) return;
      const inside = panel.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Only to an opener still on screen.
      if (opener !== null && opener.isConnected && opener.getClientRects().length > 0) opener.focus({ preventScroll: true });
    };
  }, [drawer, closeDrawer]);

  const pick = () => {
    stopPeek();
    closeDrawer?.();
  };
  const newChatOn = pathname === STUDIO_DESTINATION.href && shell?.chats?.active == null && shell?.chats?.pending == null;

  return (
    <>
      {drawer && (
        <button
          type="button"
          aria-label="Close the sidebar"
          onClick={pick}
          className="fixed inset-0 z-40 bg-page/60 backdrop-blur-[2px] md:hidden"
        />
      )}
      {/* The sidebar's room beside the page, from 768px up: 260px open, 60px
          folded, whether or not the folded one is slid out over the page. The
          drawer takes no room; it is fixed over the page. */}
      <div
        className={cx(
          drawer
            ? "contents"
            : // z-30: a sticky box is a layer of its own, so the slid-out sidebar
              // inside it only sits over the page if the box does.
              "sticky top-0 z-30 hidden h-dvh shrink-0 self-start md:block md:group-has-[[data-layout=focus]]/shell:hidden",
          !drawer && (collapsed ? "w-[60px]" : "w-[260px]"),
        )}
        onPointerEnter={(event) => {
          if (collapsed && event.pointerType === "mouse") peekAfter(true, 120);
        }}
        onPointerLeave={() => {
          if (collapsed) peekAfter(false, 200);
        }}
      >
        <nav
          ref={panel}
          aria-label="Primary"
          aria-modal={drawer ? true : undefined}
          role={drawer ? "dialog" : undefined}
          className={cx(
            "flex flex-col border-r border-hair bg-surface",
            drawer
              ? "fixed inset-y-0 left-0 z-50 w-[min(85vw,300px)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl"
              : peeking
                ? "absolute inset-y-0 left-0 z-40 w-[260px] shadow-xl"
                : "h-full w-full",
          )}
        >
          <div className={cx("flex h-14 shrink-0 items-center px-2", rail ? "justify-center" : "justify-between pl-3.5")}>
            {!rail && (
              <Link
                href={studio ? STUDIO_DESTINATION.href : "/home"}
                onClick={pick}
                aria-label={studio ? "Gnosia, Studio" : "Gnosia, Home"}
                className="rounded-sm text-[15px] text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                <GnosiaWordmark />
              </Link>
            )}
            {drawer ? (
              <IconButton label="Close the sidebar" onClick={pick}>
                <path d="M5 5l10 10M15 5 5 15" />
              </IconButton>
            ) : (
              <FoldButton rail={rail} peeking={peeking} onPress={stopPeek} />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3">
            <ul className="flex flex-col gap-0.5">
              {studio && (
                <li>
                  <NewChatLink onPick={pick} className={item(newChatOn, rail)} current={newChatOn} label={rail ? "New chat" : undefined}>
                    <ComposeIcon />
                    <Label rail={rail}>New chat</Label>
                  </NewChatLink>
                </li>
              )}
              {DESTINATIONS.map((d) => {
                const on = d.key === active;
                return (
                  <li key={d.key}>
                    <Link
                      href={d.href}
                      onClick={pick}
                      aria-current={on ? "page" : undefined}
                      aria-label={rail ? d.label : undefined}
                      title={rail ? d.label : undefined}
                      className={item(on, rail)}
                    >
                      <NavIcon name={d.key} className="size-[18px] shrink-0 text-text2" />
                      <Label rail={rail}>{d.label}</Label>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Hidden on the rail rather than unmounted, so it keeps reading
                while folded and is current the moment it unfolds. */}
            {studio && (
              <div hidden={rail} className="mt-5">
                <ChatHistory onPick={pick} />
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-hair p-2">
            <AccountMenu collapsed={rail} onPick={pick} />
          </div>
        </nav>
      </div>
    </>
  );
}

function item(on: boolean, rail: boolean): string {
  return cx(
    "flex h-10 w-full items-center gap-2.5 rounded-lg text-[14px] text-text transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
    rail ? "justify-center px-0" : "px-2.5",
    on ? "bg-surface2 font-medium" : "hover:bg-surface2",
  );
}

function Label({ rail, children }: { rail: boolean; children: ReactNode }) {
  return rail ? <span className="sr-only">{children}</span> : <span className="min-w-0 flex-1 truncate">{children}</span>;
}

/**
 * New chat: the studio's home and its composer. On `/studio` it empties the
 * composer in the browser (`StudioChats.newChat`), as the studio's own button
 * did; anywhere else, and on a modified click, it is a link to `/studio`.
 */
export function NewChatLink({
  onPick,
  className,
  current = false,
  label,
  children,
}: {
  onPick: () => void;
  className: string;
  current?: boolean;
  /** An accessible name, for a button drawn as an icon alone. */
  label?: string;
  children: ReactNode;
}) {
  const chats = useShell()?.chats ?? null;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onPick();
    if (chats === null) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    chats.newChat();
  };
  return (
    <Link
      href={STUDIO_DESTINATION.href}
      onClick={onClick}
      data-studio-new=""
      aria-current={current ? "page" : undefined}
      aria-label={label}
      title={label}
      className={className}
    >
      {children}
    </Link>
  );
}

/**
 * The fold: to the rail and back. The rail's top is the mark, which unfolds
 * on a press; slid out over the page, the press keeps the sidebar open.
 */
function FoldButton({ rail, peeking, onPress }: { rail: boolean; peeking: boolean; onPress: () => void }) {
  const shell = useShell();
  if (shell === null) return null;
  const label = rail ? "Expand the sidebar" : peeking ? "Keep the sidebar open" : "Collapse the sidebar";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        onPress();
        shell.setCollapsed(!rail && !peeking);
      }}
      className={cx(
        "group/fold relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-text2 transition-colors hover:bg-surface2 hover:text-text",
        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
      )}
    >
      {rail && (
        <Image
          src={mark}
          alt=""
          draggable={false}
          className="size-7 group-hover/fold:hidden group-focus-visible/fold:hidden"
        />
      )}
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className={cx("size-[18px]", rail && "hidden group-hover/fold:block group-focus-visible/fold:block")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="M8 4v12" />
      </svg>
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-text2 transition-colors hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        {children}
      </svg>
    </button>
  );
}

export function ComposeIcon({ className = "size-[18px] shrink-0 text-text2" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4" />
      <path d="M14.2 3.3a1.5 1.5 0 0 1 2.1 2.1L10 11.7l-2.8.7.7-2.8z" />
    </svg>
  );
}
