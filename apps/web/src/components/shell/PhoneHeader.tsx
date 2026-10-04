"use client";

import Link from "next/link";

import { GnosiaWordmark } from "@/components/brand";
import { cx } from "@/components/ui/classes";

import { ComposeIcon, NewChatLink } from "./AppSidebar";
import { useShell } from "./shell-context";

/**
 * The phone's header, below 768px only: the sidebar's button, the wordmark,
 * and New chat at the right when this deployment has a studio, as a chat
 * app's phone header has. 56px plus the notch inset, sticky over the page.
 * From 768px up the sidebar is a column and there is no header at all.
 */
export function PhoneHeader() {
  const shell = useShell();
  const studio = shell?.studio ?? false;
  const button = cx(
    "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-text2 transition-colors hover:bg-surface2 hover:text-text",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  );
  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-surface pt-[env(safe-area-inset-top)] md:hidden">
      <div className="flex h-14 items-center gap-2 px-2">
        <button
          type="button"
          onClick={shell?.openDrawer}
          aria-label="Open the sidebar"
          aria-expanded={shell?.drawer ?? false}
          className={button}
        >
          <svg aria-hidden viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" />
          </svg>
        </button>
        <Link
          href={studio ? "/studio" : "/home"}
          aria-label={studio ? "Gnosia, Studio" : "Gnosia, Home"}
          className="rounded-sm text-[14px] text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <GnosiaWordmark />
        </Link>
        {studio && (
          <NewChatLink onPick={() => undefined} className={cx(button, "ml-auto")} label="New chat">
            <ComposeIcon className="size-5" />
          </NewChatLink>
        )}
      </div>
    </header>
  );
}
