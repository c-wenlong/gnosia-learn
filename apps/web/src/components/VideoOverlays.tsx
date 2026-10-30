"use client";

import { skipLabel, type SkipFlash } from "@gnosia/tutor/media";
import { cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { Icon } from "@/components/VideoIcons";

/** The icon a press on play or pause flashes in the middle. */
export interface ToggleFlash {
  icon: "play" | "pause";
  /** Counts presses, so each one is a new element that fades in afresh. */
  n: number;
  shown: boolean;
}

/**
 * What draws over the picture besides the control bar: the subtitle line,
 * the big play button, the "+ 5" skip flash and the play or pause flash.
 * Presentational, like `VideoControls`.
 */
export function VideoOverlays({
  subtitle,
  paused,
  controlsUp,
  bigPlay,
  onBigPlay,
  skip,
  toggleFlash,
}: {
  /** The line being spoken, when subtitles are on. */
  subtitle: string | null;
  paused: boolean;
  controlsUp: boolean;
  /** The big play button shows until the video has started. */
  bigPlay: boolean;
  onBigPlay: () => void;
  skip: SkipFlash | null;
  /** Null, or a flash from another attempt at the file, draws nothing. */
  toggleFlash: ToggleFlash | null;
}) {
  return (
    <>
      {subtitle !== null && (
        <div
          className={cx(
            "pointer-events-none absolute inset-x-0 flex justify-center px-6 transition-[bottom] duration-200 motion-reduce:transition-none",
            // A phone's picture is too short for a caption and the play
            // button at once, and a paused video is not saying anything.
            paused && "max-sm:hidden",
            // Above the controls whenever they show, focus included.
            controlsUp
              ? "bottom-[4.25rem] sm:bottom-24"
              : "bottom-4 group-has-[:focus-visible]/player:bottom-[4.25rem] sm:bottom-6 sm:group-has-[:focus-visible]/player:bottom-24",
          )}
        >
          <p
            data-subtitle
            className="max-w-[min(90%,52rem)] rounded-md bg-black/75 px-2.5 py-1 text-center text-[clamp(12px,2.1vw,22px)] leading-snug text-white [box-decoration-break:clone]"
          >
            {subtitle}
          </p>
        </div>
      )}

      {skip !== null && (
        <div
          // A turn of direction is a new flash, which fades in on its own side.
          key={skip.direction}
          aria-hidden
          data-skip={skip.shown ? "shown" : "away"}
          className={cx(
            "pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-xl font-semibold text-white tabular-nums [text-shadow:0_1px_4px_rgb(0_0_0/0.6)] sm:text-2xl",
            "transition-[opacity,translate] duration-200 ease-soft starting:opacity-0 motion-reduce:transition-none",
            skip.direction > 0 ? "right-[12%]" : "left-[12%] flex-row-reverse",
            skip.shown
              ? "translate-x-0 opacity-100"
              : cx("opacity-0", skip.direction > 0 ? "translate-x-2" : "-translate-x-2"),
          )}
        >
          <span>{skipLabel(skip)}</span>
          <Icon
            name={skip.direction > 0 ? "forward" : "back"}
            className="size-6 drop-shadow-[0_1px_3px_rgb(0_0_0/0.6)] sm:size-7"
          />
        </div>
      )}

      {toggleFlash !== null && (
        <div
          key={toggleFlash.n}
          aria-hidden
          data-toggle-flash={toggleFlash.shown ? toggleFlash.icon : "away"}
          className={cx(
            "pointer-events-none absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm sm:size-16",
            "transition-[opacity,scale] duration-200 ease-soft starting:scale-90 starting:opacity-0 motion-reduce:transition-none",
            toggleFlash.shown ? "scale-100 opacity-100" : "scale-110 opacity-0",
          )}
        >
          {toggleFlash.icon === "play" ? (
            <Glyph name="play" className="size-6 translate-x-0.5 fill-current sm:size-7" />
          ) : (
            <Icon name="pause" className="size-6 sm:size-7" />
          )}
        </div>
      )}

      {/* Kept mounted, so it fades and shrinks away as play starts and comes back
          the same way on pause, rather than blinking. Gone, it is invisible and
          inert: no focus, no click through to the video under it. */}
      <button
        type="button"
        onClick={onBigPlay}
        aria-label="Play"
        inert={!bigPlay}
        data-big-play={bigPlay ? "shown" : "away"}
        className={cx(
          "absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm sm:size-16 focus-visible:outline-2 focus-visible:outline-white",
          "duration-150 ease-soft motion-reduce:transition-none",
          // Visibility waits for the fade out, not in, so the button is reachable the moment it shows.
          bigPlay
            ? "scale-100 opacity-100 transition-[opacity,scale] hover:scale-105"
            : "invisible scale-90 opacity-0 transition-[opacity,scale,visibility]",
        )}
      >
        <Glyph name="play" className="size-6 translate-x-0.5 fill-current sm:size-7" />
      </button>
    </>
  );
}
