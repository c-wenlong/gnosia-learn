"use client";

import { formatTimecode, type VideoChapter } from "@/components/media";
import { cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { ControlButton, Icon } from "@/components/VideoIcons";
import { toggleSubtitles } from "@/components/video-subtitles";
import { VideoScrubber } from "@/components/VideoScrubber";

/**
 * The bar over the bottom of the picture: the scrub bar (`VideoScrubber`),
 * play, mute and volume, the time and the current chapter, subtitles, speed,
 * picture-in-picture and fullscreen. Presentational: `VideoPlayer` owns the
 * `<video>` element and its state and hands each press back.
 */
export function VideoControls({
  src,
  time,
  duration,
  buffered,
  chapters,
  title,
  controlsUp,
  paused,
  muted,
  volume,
  rate,
  fullscreen,
  canPip,
  hasSubtitles,
  subtitles,
  chapterTitle,
  onSeek,
  onScrub,
  onStep,
  onTogglePlay,
  onToggleMute,
  onVolume,
  onCycleRate,
  onTogglePip,
  onToggleFullscreen,
}: {
  src: string;
  time: number;
  duration: number;
  buffered: number;
  chapters?: VideoChapter[];
  title?: string;
  /** Shown: paused, the pointer moved lately, or a scrub under way. */
  controlsUp: boolean;
  paused: boolean;
  muted: boolean;
  volume: number;
  rate: number;
  fullscreen: boolean;
  canPip: boolean;
  hasSubtitles: boolean;
  /** Whether subtitles are on. */
  subtitles: boolean;
  chapterTitle?: string;
  onSeek: (seconds: number) => void;
  onScrub: (scrubbing: boolean) => void;
  onStep: (direction: 1 | -1) => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  /** The slider's new volume, 0 to 1; 0 also mutes. */
  onVolume: (volume: number) => void;
  onCycleRate: () => void;
  onTogglePip: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
        <div
          className={cx(
            "absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/35 to-transparent px-2 pt-8 pb-1 sm:px-4 sm:pt-12 sm:pb-1.5 text-white transition-opacity duration-200 motion-reduce:transition-none",
            controlsUp ? "opacity-100" : "opacity-0 group-has-[:focus-visible]/player:opacity-100",
          )}
        >
          <VideoScrubber
            src={src}
            time={time}
            duration={duration}
            buffered={buffered}
            chapters={chapters}
            label={title ? `Seek in ${title}` : "Seek"}
            onSeek={onSeek}
            onScrub={onScrub}
            onStep={onStep}
          />
          <div className="flex items-center gap-1 text-[13px]">
            <ControlButton label={paused ? "Play (k)" : "Pause (k)"} onClick={onTogglePlay}>
              {paused ? <Glyph name="play" className="size-5 fill-current" /> : <Icon name="pause" className="size-5" />}
            </ControlButton>
            <div className="group/volume flex items-center">
              <ControlButton label={muted || volume === 0 ? "Unmute (m)" : "Mute (m)"} onClick={onToggleMute}>
                <Icon name={muted || volume === 0 ? "muted" : "volume"} className="size-5" />
              </ControlButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => onVolume(Number(e.currentTarget.value))}
                className="w-0 cursor-pointer accent-white opacity-0 transition-all duration-150 group-focus-within/volume:ml-1 group-focus-within/volume:w-16 group-focus-within/volume:opacity-100 group-hover/volume:ml-1 group-hover/volume:w-16 group-hover/volume:opacity-100 motion-reduce:transition-none"
              />
            </div>
            <span className="ml-1.5 shrink-0 tabular-nums">
              {formatTimecode(time)}
              <span className="text-white/60">
                {" / "}
                {Number.isFinite(duration) ? formatTimecode(duration) : "–:––"}
              </span>
            </span>
            {chapterTitle !== undefined && (
              <span data-chapter-label className="ml-2 min-w-0 truncate text-white/85">
                <span aria-hidden className="mr-2 text-white/50">
                  ·
                </span>
                {chapterTitle}
              </span>
            )}
            <span className="flex-1" />
            {hasSubtitles && (
              <ControlButton label="Subtitles (c)" onClick={toggleSubtitles} pressed={subtitles}>
                <span className="relative flex">
                  <Icon name="cc" className="size-6" />
                  <span
                    aria-hidden
                    className={cx(
                      "absolute inset-x-1 -bottom-1 h-0.5 rounded-full bg-accent transition-transform motion-reduce:transition-none",
                      subtitles ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </span>
              </ControlButton>
            )}
            <ControlButton label="Playback speed" onClick={onCycleRate}>
              <span className="w-9 text-center text-[12px] font-semibold tabular-nums">{rate}×</span>
            </ControlButton>
            {canPip && (
              <ControlButton label="Picture in picture (i)" onClick={onTogglePip}>
                <Icon name="pip" className="size-5" />
              </ControlButton>
            )}
            <ControlButton
              label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"}
              onClick={onToggleFullscreen}
            >
              <Icon name={fullscreen ? "shrink" : "expand"} className="size-5" />
            </ControlButton>
          </div>
        </div>
  );
}
