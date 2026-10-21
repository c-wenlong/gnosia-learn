"use client";

import { useState, type Ref } from "react";

import { Button } from "@/components/ui/Button";
import { buttonClasses, cx, STATUS_TEXT } from "@/components/ui/classes";
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
        <span role="status" className={cx(STATUS_TEXT, "animate-fade-in text-text2 motion-reduce:animate-none")}>
          Not saved. Try again.
        </span>
      )}
    </span>
  );
}

/**
 * Download: the file route's `?download=1` (`assetDownloadHref`), the one
 * every Download in the app takes, so the saved file has one name wherever
 * it was pressed: the route's `Content-Disposition`, after the asset's title.
 * A plain anchor, not `next/link`, because there is no page to navigate to.
 */
export function DownloadButton({ href }: { href: string }) {
  return (
    <a href={href} download className={buttonClasses({ variant: "secondary", size: "sm" })}>
      <Glyph name="download" size={18} className="text-text2" />
      Download
    </a>
  );
}

/**
 * PDF: the video's pages as a document (`assetPdfHref`), served inline so
 * the browser's own viewer opens it. A new tab — reading the document
 * should not leave the watch page behind. Rendered only when the upload or
 * put stored one (`storedPdfs`), since a video without a PDF 404s.
 */
export function PdfButton({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
      <Glyph name="open" size={18} className="text-text2" />
      PDF
    </a>
  );
}

/** Ask: opens the unsaved chat about this asset (`AskPanel`). */
export function AskButton({
  open,
  onToggle,
  controls,
  subject = "video",
  buttonRef,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  /** The button, for the fold to hand focus back to when Escape closes it. */
  buttonRef?: Ref<HTMLButtonElement>;
  /** What the tooltip names: "video", "note", "diagram". */
  subject?: string;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      ref={buttonRef}
      title={`Ask the tutor a quick question about this ${subject}. Not saved.`}
    >
      <Glyph name="sparkle" size={18} className={open ? "text-accent-text" : "text-text2"} />
      Ask
    </Button>
  );
}
