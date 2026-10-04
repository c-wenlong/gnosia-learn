"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { buttonClasses, cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";

/**
 * The pill buttons beside a library asset's title, the way a video site puts
 * Save and Download under the player: an icon and a word each, in the kit's
 * secondary pill.
 */

/**
 * The star. Pressing it flips at once and writes through
 * `/api/learner/favorite`; a write the route did not take flips it back and
 * says so beside the row, so the star never shows what was not stored.
 */
export function FavoriteButton({ assetId, initial }: { assetId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/learner/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, favorite: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      setOn(!next);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={on}
        onClick={() => void toggle()}
        title={on ? "Remove from favorites" : "Add to favorites"}
      >
        <Glyph
          name="star"
          size={18}
          className={cx(
            "transition-[fill,color] duration-150 motion-reduce:transition-none",
            on ? "fill-current text-warn" : "text-text2",
          )}
        />
        Favorite
      </Button>
      {failed && (
        <span role="status" className="animate-fade-in text-[12px] text-text2 motion-reduce:animate-none">
          Not saved. Try again.
        </span>
      )}
    </span>
  );
}

/**
 * Download: the asset's own file route with `download`, so the browser saves
 * it under its name rather than opening it. A plain anchor, not `next/link`,
 * because there is no page to navigate to.
 */
export function DownloadButton({ href, filename }: { href: string; filename?: string }) {
  return (
    <a href={href} download={filename ?? true} className={buttonClasses({ variant: "secondary", size: "sm" })}>
      <Glyph name="download" size={18} className="text-text2" />
      Download
    </a>
  );
}

/** Ask: opens the unsaved chat about this asset (`AskPanel`). */
export function AskButton({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      title="Ask the tutor a quick question about this video. Not saved."
    >
      <Glyph name="sparkle" size={18} className={open ? "text-accent-text" : "text-text2"} />
      Ask
    </Button>
  );
}
