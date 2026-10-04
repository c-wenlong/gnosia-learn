"use client";

import { DialogHeader } from "@/components/studio/StudioDialog";
import { VideoChangeButton } from "@/components/studio/video/VideoGridJob";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/classes";
import { VideoPlayer } from "@/components/VideoPlayer";
import { libraryHref, posterHref, videoFileHref, videoStatusHref, type StudioVideo } from "@/lib/studio-video";
import { gridHref } from "@/lib/studio-view";

/**
 * A studio video playing over the grid (`?play=<slug>`, D85 of
 * docs/STUDIO-CHAT-FIRST.md), the way Gauth's Atlas opens a story card: the
 * picture large, its title, and what to do next. Open is the library page
 * the tile used to link to, with its chapters and transcript and the `from`
 * back link to this view; Change is the tile's own Change, a conversation
 * on the video.
 *
 * `PanelHost` draws it inside a `StudioDialog`, so Escape, Close and the
 * backdrop close it, and Back and Forward move it as they move any panel.
 * The player is the library's, playing from the library's routes, from the
 * start, as soon as it opens: the press that opened it is the person's
 * gesture, so the browser lets it play with sound.
 */

/** One jump to the start, which plays: stable, so it fires once per mount. */
const PLAY_FROM_START = { seconds: 0, key: 1 };

export function VideoPreview({ video, slug, path }: { video: StudioVideo | null; slug: string; path: string }) {
  const title = video?.title ?? slug;
  if (video === null) {
    return (
      <>
        <DialogHeader title={title} />
        <p className="p-5 text-[14px] text-text2">
          There is no studio video named <span className="font-mono">{slug}</span>.
        </p>
      </>
    );
  }
  return (
    <>
      <DialogHeader title={title} />
      {/* A phone's sheet is the whole screen: the picture sits in the middle
          of it on black, as a video viewer's does. */}
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto bg-black md:block md:bg-transparent md:p-4">
        <VideoPlayer
          // A new video is a new player, which starts over and plays.
          key={slug}
          src={videoFileHref(slug)}
          statusHref={videoStatusHref(slug)}
          poster={video.posterAssetId === null ? undefined : posterHref(video.posterAssetId)}
          title={title}
          seekTo={PLAY_FROM_START}
        />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hair px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
        <VideoChangeButton slug={slug} title={title} path={path} className={buttonClasses({ variant: "secondary", size: "sm" })} />
        <Button href={libraryHref(slug, gridHref(path))} variant="primary" size="sm" aria-label={`Open ${title}`}>
          Open
        </Button>
      </div>
    </>
  );
}
