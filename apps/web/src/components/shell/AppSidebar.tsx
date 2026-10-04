"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { GnosiaWordmark } from "@/components/brand";
import { useHistorySearch } from "@/components/studio/history-search";
import { cx } from "@/components/ui/classes";
import { activeDestination, DESTINATIONS, STUDIO_DESTINATION } from "@/lib/nav";

import mark from "../../../public/brand/mark.png";
import { AccountMenu } from "./AccountMenu";
import { ChatHistory } from "./ChatHistory";
import { SearchField } from "./ChatSearch";
import { FADE, FADE_IN } from "./motion";
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
 * Under New chat is a search field over the studio's conversations (D87).
 * On the rail it is a search button, which slides the sidebar out with the
 * field focused; the slid-out sidebar then stays while focus is in the field
 * or a match (`data-peek-hold`), and slides back once focus and the pointer
 * have both left.
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
  const search = useHistorySearch();
  const searchField = useRef<HTMLInputElement | null>(null);
  const room = useRef<HTMLDivElement | null>(null);
  /** The rail's search button was pressed: the field takes focus once the sidebar is out. */
  const focusSearch = useRef(false);
  useEffect(() => {
    if (!peeking || !focusSearch.current) return;
    focusSearch.current = false;
    searchField.current?.focus();
  }, [peeking]);
  const openSearch = () => {
    if (peekTimer.current !== null) clearTimeout(peekTimer.current);
    focusSearch.current = true;
    setPeek(true);
  };
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
      {/* Mounted on a phone so it can fade; closed, it takes no clicks and no focus. */}
      <button
        type="button"
        aria-label="Close the sidebar"
        aria-hidden={drawer ? undefined : true}
        tabIndex={drawer ? undefined : -1}
        onClick={pick}
        className={cx(
          "fixed inset-0 z-40 bg-page/60 backdrop-blur-[2px] transition-opacity duration-300 ease-soft motion-reduce:transition-none md:hidden",
          drawer ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      {/* The sidebar's room beside the page, from 768px up: 260px open, 60px
          folded, whether or not the folded one is slid out over the page. The
          drawer takes no room; it is fixed over the page. */}
      <div
        ref={room}
        className={cx(
          // A phone gives it no room: the drawer is fixed over the page.
          "max-md:contents",
          // z-30: a sticky box is a layer of its own, so the slid-out sidebar
          // inside it only sits over the page if the box does. The room's width
          // animates with the fold, so the page beside it eases over too.
          "sticky top-0 z-30 h-dvh shrink-0 self-start md:group-has-[[data-layout=focus]]/shell:hidden",
          "transition-[width] duration-200 ease-soft motion-reduce:transition-none",
          collapsed ? "w-[60px]" : "w-[260px]",
        )}
        onPointerEnter={(event) => {
          if (collapsed && event.pointerType === "mouse") peekAfter(true, 120);
        }}
        onPointerLeave={() => {
          // Not while focus is in the search field or a match: the slide back
          // waits for focus to leave too, below.
          if (collapsed && document.activeElement?.closest("[data-peek-hold]") == null) peekAfter(false, 200);
        }}
        onFocus={(event) => {
          // Back in the search before a close that leaving it scheduled has fired.
          if (event.target instanceof Element && event.target.closest("[data-peek-hold]") !== null && peekTimer.current !== null) {
            clearTimeout(peekTimer.current);
          }
        }}
        onBlur={(event) => {
          if (!collapsed || !(event.target instanceof Element) || event.target.closest("[data-peek-hold]") === null) return;
          // Focus moving between things in the sidebar is not leaving it.
          if (event.relatedTarget instanceof Node && room.current?.contains(event.relatedTarget) === true) return;
          // Focus left it. With the pointer gone too, nothing else will say it may slide back.
          if (room.current?.matches(":hover") !== true) peekAfter(false, 200);
        }}
      >
        <nav
          ref={panel}
          aria-label="Primary"
          aria-modal={drawer ? true : undefined}
          role={drawer ? "dialog" : undefined}
          // Which of its four shapes it is in, for tests and styles that would
          // otherwise have to read it back out of the classes.
          data-state={drawer ? "drawer" : peeking ? "peek" : rail ? "rail" : "open"}
          className={cx(
            "flex flex-col overflow-hidden border-r border-hair bg-surface motion-reduce:transition-none",
            // A phone: off the left edge until the drawer opens, then slid in.
            // `invisible` once out, so nothing in it takes focus, and only
            // once out: visibility waits for the slide to finish.
            "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[min(85vw,300px)]",
            "max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)]",
            // `translate`, not `transform`: Tailwind 4 moves things with the translate property.
            "max-md:transition-[translate,visibility,box-shadow] max-md:duration-300 max-md:ease-soft",
            drawer ? "max-md:translate-x-0 max-md:shadow-xl" : "max-md:invisible max-md:-translate-x-full",
            // From 768px up: over its room, as wide as the room, or slid out to
            // 260px over the page while folded. The width is what animates.
            "md:absolute md:inset-y-0 md:left-0 md:transition-[width,box-shadow] md:duration-200 md:ease-soft",
            rail ? "md:w-[60px]" : "md:w-[260px]",
            peeking ? "md:shadow-xl" : "md:shadow-none",
          )}
        >
          {/* The wordmark at the left and the fold at the right, both placed
              absolutely so neither moves while the width changes: the fold sits
              12px in from the right edge, which on the 60px rail is its centre. */}
          <div className="relative h-14 shrink-0">
            <Link
              href={studio ? STUDIO_DESTINATION.href : "/home"}
              onClick={pick}
              inert={rail}
              aria-label={studio ? "Gnosia, Studio" : "Gnosia, Home"}
              className={cx(
                "absolute top-1/2 left-3.5 -translate-y-1/2 rounded-sm text-[15px] whitespace-nowrap text-text",
                "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
                FADE,
                rail ? "opacity-0" : FADE_IN,
              )}
            >
              <GnosiaWordmark />
            </Link>
            <div className="absolute top-1/2 right-3 -translate-y-1/2">
              {drawer ? (
                <IconButton label="Close the sidebar" onClick={pick}>
                  <path d="M5 5l10 10M15 5 5 15" />
                </IconButton>
              ) : (
                <FoldButton rail={rail} peeking={peeking} onPress={stopPeek} />
              )}
            </div>
          </div>

          {/* 11px in from each side: on the 60px rail that centres a 38px item,
              and each item's 10px left padding puts its icon in the same place
              open or folded, so only the labels appear and go. */}
          <div className={cx("min-h-0 flex-1 overflow-x-hidden px-[11px] pb-3", rail ? "overflow-y-hidden" : "overflow-y-auto")}>
            <ul className="flex flex-col gap-0.5">
              {studio && (
                <li>
                  <NewChatLink onPick={pick} className={item(newChatOn)} current={newChatOn} label={rail ? "New chat" : undefined}>
                    <ComposeIcon />
                    <Label rail={rail}>New chat</Label>
                  </NewChatLink>
                </li>
              )}
              {studio && (
                <li className="relative">
                  {/* The field stays, narrowed to its icon on the rail, so it
                      widens with the sidebar rather than swapping in. On the
                      rail a button over it opens the sidebar and focuses it. */}
                  <div inert={rail}>
                    <SearchField search={search} inputRef={searchField} compact={rail} />
                  </div>
                  {rail && (
                    <button
                      type="button"
                      onClick={openSearch}
                      aria-label="Search conversations"
                      title="Search conversations"
                      className="absolute inset-0 rounded-lg transition-colors hover:bg-surface2/60 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                    />
                  )}
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
                      className={item(on)}
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
              <div inert={rail} className={cx("mt-5 min-w-[238px]", FADE, rail ? "opacity-0" : FADE_IN)}>
                <ChatHistory onPick={pick} search={search} />
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-hair px-[11px] py-2">
            <AccountMenu collapsed={rail} onPick={pick} />
          </div>
        </nav>
      </div>
    </>
  );
}

function item(on: boolean): string {
  return cx(
    "flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 text-[14px] text-text transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
    on ? "bg-surface2 font-medium" : "hover:bg-surface2",
  );
}

/** A destination's name: always there, faded out on the rail, where the link's own label names it. */
function Label({ rail, children }: { rail: boolean; children: ReactNode }) {
  return <span className={cx("min-w-0 flex-1 whitespace-nowrap", FADE, rail ? "opacity-0" : FADE_IN)}>{children}</span>;
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
      {/* The rail's top is the mark, which gives way to the fold's icon on a
          hover or focus. Both stay mounted and cross-fade. */}
      <Image
        src={mark}
        alt=""
        draggable={false}
        className={cx(
          "absolute size-7",
          FADE,
          rail ? "opacity-100 group-hover/fold:opacity-0 group-focus-visible/fold:opacity-0" : "opacity-0",
        )}
      />
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className={cx("size-[18px]", FADE, rail ? "opacity-0 group-hover/fold:opacity-100 group-focus-visible/fold:opacity-100" : "opacity-100")}
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
