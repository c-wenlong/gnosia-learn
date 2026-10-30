import { SKELETON } from "@/components/ui/Skeleton";
import { cx, iconButtonClasses } from "@/components/ui/classes";
import { DialogHeader } from "@/components/ui/DialogHeader";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";
import { assetHref } from "@/lib/library";
import type { PreviewHeader } from "@/lib/library-preview";

/**
 * Manus's `previewer-header`, drawn by the kit's `DialogHeader`: 48px, the
 * kind's glyph, the title, and at the right the date in grey, then the tools,
 * 28px each: the concept it explains (when it explains one), Conversation
 * (the studio conversation that made it, when one did: the row menu's Locate
 * in conversation), Download (when there is a stored file), Open page, and
 * Close, which is `closeSize="sm"` so it is in line with them. Until the body
 * arrives, the glyph, the title and the date are grey bars and only Open page
 * and Close are there, since they need nothing from the server.
 *
 * A plain file name keeps its mono 14 and `text2` inside the title; any other
 * title is the kit's `PANEL_TITLE`.
 */
export function PreviewerHeader({
  header,
  loading,
  id,
  onClose,
}: {
  header: PreviewHeader | null;
  /** The body is still on its way; false with no `header` means it failed. */
  loading: boolean;
  id: string;
  onClose: () => void;
}) {
  const tool = iconButtonClasses({ size: "sm", shape: "square", tone: "neutral" });
  return (
    <DialogHeader
      onClose={onClose}
      closeSize="sm"
      leading={
        header === null ? (
          <span aria-hidden className={cx(SKELETON, "size-[18px] shrink-0")} />
        ) : (
          <span className="shrink-0 animate-fade-in text-text2 motion-reduce:animate-none" aria-hidden>
            <Glyph name={header.family} size={18} />
          </span>
        )
      }
      title={
        header === null ? (
          <>
            {/* The heading is never empty, for a screen reader; the bar is only to look at. It says
                loading only while it is, not after the body failed to come. */}
            <span className="sr-only">{loading ? "Loading preview" : "Preview"}</span>
            <span aria-hidden className={cx(SKELETON, "block h-4 w-56 max-w-[50%]")} />
          </>
        ) : (
          <span
            className={cx(
              "animate-fade-in motion-reduce:animate-none",
              header.plainName && "font-mono font-medium text-text2",
            )}
          >
            <span className="sr-only">{header.kindLabel}: </span>
            {header.title}
          </span>
        )
      }
      actions={
        <>
          {header === null ? (
            <span aria-hidden className={cx(SKELETON, "hidden h-3 w-16 sm:block")} />
          ) : (
            header.date !== null && (
              <time
                dateTime={header.dateTime}
                className="hidden shrink-0 animate-fade-in text-[12px] leading-4 text-text3 motion-reduce:animate-none sm:inline"
              >
                {header.date}
              </time>
            )
          )}
          <div className="flex shrink-0 items-center gap-1">
            {header?.concept && (
              <IconButton label={`Open ${header.concept.title}`} size="sm" shape="square" href={header.concept.href}>
                <Glyph name="concepts" size={18} />
              </IconButton>
            )}
            {header?.conversation && (
              <IconButton
                label={`Conversation: ${header.conversation.title}`}
                size="sm"
                shape="square"
                href={header.conversation.href}
              >
                <Glyph name="compose" size={18} />
              </IconButton>
            )}
            {header?.download && (
              // A plain anchor with `download`: there is no page to go to. The
              // route's `Content-Disposition` names the file, after its title.
              <a
                href={header.download.href}
                download
                aria-label="Download"
                title="Download"
                className={tool}
              >
                <Glyph name="download" size={18} />
              </a>
            )}
            <IconButton label="Open page" size="sm" shape="square" href={header?.page ?? assetHref(id)}>
              {/* Four corners pulled outward: the full page. */}
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                width={18}
                height={18}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.5 3.5h4v4M7.5 16.5h-4v-4M16.5 3.5 11 9M3.5 16.5 9 11" />
              </svg>
            </IconButton>
            {/* 8px clear on each side of the rule, as the hand-built row had: 4 of margin
                and the group's 4px gap before it, and 4 less than the row's 12px gap to Close. */}
            <span aria-hidden className="ml-1 -mr-1 h-4 w-px bg-hair" />
          </div>
        </>
      }
    />
  );
}
