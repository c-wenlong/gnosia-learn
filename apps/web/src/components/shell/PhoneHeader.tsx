"use client";

import Link from "next/link";

import { GnosiaWordmark } from "@/components/brand";
import { iconButtonClasses } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";

import { ComposeIcon, NewChatLink, SIDEBAR_NAV_ID } from "./AppSidebar";
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

  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-surface pt-[env(safe-area-inset-top)] md:hidden">
      <div className="flex h-14 items-center gap-2 px-2">
        <IconButton label="Open the sidebar" size="xl" onClick={shell?.openDrawer} aria-expanded={shell?.drawer ?? false} aria-controls={SIDEBAR_NAV_ID}>
          <Glyph name="menu" />
        </IconButton>
        <Link
          href={studio ? "/studio" : "/home"}
          aria-label={studio ? "Gnosia, Studio" : "Gnosia, Home"}
          className="rounded-sm text-[14px] text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <GnosiaWordmark />
        </Link>
        {studio && (
          <NewChatLink onPick={() => undefined} className={iconButtonClasses({ size: "xl", className: "ml-auto" })} label="New chat">
            <ComposeIcon className="size-5" />
          </NewChatLink>
        )}
      </div>
    </header>
  );
}
