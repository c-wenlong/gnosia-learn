"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  activeChapterIndex,
  formatTimecode,
  subtitleAt,
  type TranscriptCue,
  type VideoChapter,
} from "@/components/media";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { cx } from "@/components/ui/classes";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { useAssetFailure } from "@/components/use-asset-failure";
import { VideoScrubber } from "@/components/VideoScrubber";
import { WidgetFailure } from "@/components/WidgetFailure";

/** What the player reports as it plays, for a caller that records progress. */
export type PlaybackSignal = {
  type: "time" | "seeking" | "pause" | "ended";
  /** Seconds into the video. */
  time: number;
  /** The video's length, or NaN before the browser knows it. */
  duration: number;
};

/**
 * A narrated video with its chapters on the scrub bar and its transcript
 * beneath it.
 *
 * Presentational, and it stays that way: `src`, `poster` and the two sidecar
 * lists arrive already resolved. Nothing here queries the catalog or builds a
 * URL, so the component and the route that serves the bytes can be written
 * without either waiting on the other.
 *
 * **Its own controls, over a plain `<video>`.** The native controls cannot
 * draw chapters into their scrub bar, and chapters as a row of chips under
 * the picture were the part of the page that read worst. So the element plays
 * the file and this component draws the bar (`VideoScrubber`: one stretch per
 * chapter, a frame preview on hover), play, volume, the time and the current
 * chapter, speed and fullscreen, over a gradient that fades while the video
 * plays untouched. Keyboard: Space or K plays and pauses, J and L move ten
 * seconds, M mutes, C toggles subtitles, I pops the picture out (where the
 * browser has picture-in-picture), F goes fullscreen, and the bar
 * itself takes arrows and Page Up / Page Down for chapters.
 *
 * **Subtitles are the transcript.** The time-synced lines under the video are
 * the same cues a caption track would carry, so the CC button draws the line
 * being spoken over the picture rather than loading the `.vtt` as a second
 * copy. The choice is remembered in this browser, as a video site does.
 *
 * **Layout slots.** `header` (a title) and `tabs` let the library page lay
 * the details out under the picture the way a video site does: the header,
 * then one card whose tabs are the transcript followed by the caller's own
 * sections, so they do not pile up as a stack of cards. Without them the
 * component is the picture and the transcript.
 *
 * **A video that fails says why.** The player is replaced, at its own size, by
 * the shared failure panel, which asks `statusHref` for the reason. The
 * transcript stays: it is text the page already has.
 */
export function VideoPlayer({
  src,
  statusHref,
  poster,
  title,
  chapters,
  transcript,
  startAt,
  onPlayback,
  header,
  tabs,
  seekTo,
  sourceRepo,
}: {
  src: string;
  /** Where to ask why `src` failed. Without one a failure says it has no reason. */
  statusHref?: string;
  /** Already resolved. Without one the browser shows the first frame instead. */
  poster?: string;
  /** Names the player for assistive technology. */
  title?: string;
  /** Drawn into the scrub bar. Provided and empty is a video with no chapters. */
  chapters?: VideoChapter[];
  /** Provided and empty is a video with no narration, and says so. */
  transcript?: TranscriptCue[];
  /** Where playback starts, in seconds: a resume point. */
  startAt?: number;
  /** Told about playback as it happens, to record progress. */
  onPlayback?: (signal: PlaybackSignal) => void;
  header?: ReactNode;
  /** Sections after the transcript in the tabbed card under the header. */
  tabs?: TabItem[];
  /**
   * A jump asked for from outside the player, such as a chapter list beside
   * it: each new `key` moves the playhead to `seconds` and plays. The key is
   * what makes a second press on the same chapter a second jump.
   */
  seekTo?: { seconds: number; key: number };
  /** The tool that made the video, so a failure names that tool's upload command. */
  sourceRepo?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const start = startAt !== undefined && startAt > 0 ? startAt : 0;
  const [time, setTime] = useState(start);
  const [duration, setDuration] = useState(Number.NaN);
  const [buffered, setBuffered] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [awake, setAwake] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const subtitles = useSyncExternalStore(subscribeSubtitles, readSubtitles, () => false);
  // Off on the server, so the first client render matches it.
  const canPip = useSyncExternalStore(noSubscription, pipSupported, () => false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { failure, fail, retry, attempt, observe } = useAssetFailure(src, statusHref);
  // A seek the element refused, held until it can be honoured. See `seek`.
  // It carries the load it was asked for rather than the URL: with the URL, a
  // reader who goes A to B and back to A before the first load reports itself
  // would have the seek they asked for on the first A applied to the second,
  // because the two As are the same string. A load number cannot repeat.
  const pendingSeek = useRef<{ load: number; seconds: number } | null>(null);

  // Playback position belongs to the file being played, so a new `src` starts
  // over (at its own resume point, when the caller gives one). Without this
  // the component keeps whatever the last video was at: a soft navigation
  // from one asset to the next reuses the mounted instance.
  //
  // Done during render rather than in an effect on purpose, so the swapped-in
  // video is never painted with the old position. This is the documented way
  // to adjust state when a prop changes.
  //
  // `resume` is the resume point still to apply to this load: there is no
  // metadata at mount, so it waits for `loadedmetadata` like a refused seek.
  const [source, setSource] = useState({ src, load: 0, resume: start > 0 ? start : null });
  if (source.src !== src) {
    setSource({ src, load: source.load + 1, resume: start > 0 ? start : null });
    setTime(start);
    setDuration(Number.NaN);
    setBuffered(0);
    setPaused(true);
  }

  // A jump from outside goes through `seek`, the same path as a click on the
  // bar, so a jump pressed before the metadata has loaded is held and applied
  // at `loadedmetadata` rather than lost. Then it plays.
  const jumpTo = useEffectEvent((seconds: number) => {
    seek(seconds);
    void videoRef.current?.play()?.catch(() => undefined);
  });
  const seekKey = seekTo?.key;
  const seekSeconds = seekTo?.seconds;
  useEffect(() => {
    if (seekKey === undefined || seekSeconds === undefined) return;
    jumpTo(seekSeconds);
  }, [seekKey, seekSeconds]);

  // What the element already knows when it is attached. The server renders
  // the `<video>` with `preload="metadata"`, so the browser can load the
  // metadata before hydration attaches a single listener: `loadedmetadata`
  // and `durationchange` have then fired into nothing and do not fire again,
  // and the bar showed "–:––" and no chapters until the page was reloaded.
  // So the element is read once it is ours, on every new element (a retry
  // remounts it) and every new source, and the events carry it from there.
  const readElement = useEffectEvent((video: HTMLVideoElement) => {
    if (video.readyState < HAVE_METADATA) return;
    setDuration(video.duration);
    setBuffered(bufferedEnd(video));
    setPaused(video.paused);
    setMuted(video.muted);
    setVolume(video.volume);
    setRate(video.playbackRate);
    applyPendingSeek(video);
  });
  const load = source.load;
  useEffect(() => {
    const video = videoRef.current;
    if (video !== null) readElement(video);
  }, [attempt, load]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

  function wake() {
    setAwake(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setAwake(false), 2500);
  }

  function seek(seconds: number) {
    const target = Math.max(0, seconds);
    // The reader chose a place, so the resume point no longer applies.
    if (source.resume !== null) setSource((s) => ({ ...s, resume: null }));
    // Optimistic, and not only for tests: a browser reports the new time on
    // the next `timeupdate`, and the highlight should move on the click.
    setTime(target);
    const video = videoRef.current;
    if (!video) {
      pendingSeek.current = { load: source.load, seconds: target };
      return;
    }
    try {
      video.currentTime = target;
      pendingSeek.current = null;
    } catch {
      // A seek before metadata has loaded throws, and `preload="metadata"`
      // means the first clicks land in exactly that window. Hold it and apply
      // it at `loadedmetadata`.
      pendingSeek.current = { load: source.load, seconds: target };
    }
  }

  function applyPendingSeek(video: HTMLVideoElement) {
    const pending = pendingSeek.current;
    if (!pending) {
      if (source.resume === null) return;
      try {
        video.currentTime = source.resume;
        const load = source.load;
        setSource((s) => (s.load === load ? { ...s, resume: null } : s));
      } catch {
        // Still too early. The next readiness event tries again.
      }
      return;
    }
    if (pending.load !== source.load) {
      // Asked for on a load this element has already moved past.
      pendingSeek.current = null;
      return;
    }
    try {
      video.currentTime = pending.seconds;
      pendingSeek.current = null;
    } catch {
      // Still too early. The next readiness event tries again.
    }
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      void video.play()?.catch(() => {
        // Refused (autoplay policy, a source that failed). The element's own
        // events keep `paused` honest, and a failure has its own panel.
      });
    } else {
      video.pause();
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 0.5;
  }

  function cycleRate() {
    const video = videoRef.current;
    if (!video) return;
    const next = RATES[(RATES.indexOf(video.playbackRate) + 1) % RATES.length] ?? 1;
    video.playbackRate = next;
  }

  function togglePip() {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture?.().catch(() => undefined);
    else void video.requestPictureInPicture?.().catch(() => undefined);
  }

  function toggleFullscreen() {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void frame.requestFullscreen?.();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // A focused button handles its own Space and Enter.
    if (
      (event.target as HTMLElement).closest("button, input") &&
      (event.key === " " || event.key === "Enter")
    ) {
      return;
    }
    const video = videoRef.current;
    switch (event.key.toLowerCase()) {
      case " ":
      case "k":
        togglePlay();
        break;
      case "j":
        seek((video?.currentTime ?? time) - 10);
        break;
      case "l":
        seek(
          Math.min(
            (video?.currentTime ?? time) + 10,
            Number.isFinite(duration) ? duration : Number.POSITIVE_INFINITY,
          ),
        );
        break;
      case "m":
        toggleMute();
        break;
      case "c":
        if (!hasSubtitles) return;
        toggleSubtitles();
        break;
      case "f":
        toggleFullscreen();
        break;
      case "i":
        if (!canPip) return;
        togglePip();
        break;
      default:
        return;
    }
    event.preventDefault();
    wake();
  }

  function report(type: PlaybackSignal["type"], video: HTMLVideoElement) {
    onPlayback?.({ type, time: video.currentTime, duration: video.duration });
  }

  const activeChapter = chapters ? activeChapterIndex(chapters, time) : -1;
  const chapterTitle = activeChapter >= 0 ? chapters?.[activeChapter]?.title : undefined;
  const controlsUp = paused || awake || scrubbing;
  const hasSubtitles = transcript !== undefined && transcript.length > 0;
  const subtitle = subtitles && transcript !== undefined ? subtitleAt(transcript, time) : null;

  const player =
    failure !== null ? (
      <WidgetFailure
        headline="This video did not load."
        code={failure.code}
        sourceRepo={sourceRepo}
        onRetry={retry}
        className="min-h-64 w-full sm:min-h-80"
      />
    ) : (
      <div
        ref={frameRef}
        onKeyDown={onKeyDown}
        onPointerMove={wake}
        onPointerLeave={() => setAwake(false)}
        className={cx(
          "group/player relative overflow-hidden bg-black",
          fullscreen ? "flex items-center" : "rounded-xl",
          !controlsUp && "cursor-none focus-within:cursor-auto",
        )}
      >
        <video
          key={attempt}
          ref={(element) => {
            videoRef.current = element;
            observe(element);
          }}
          src={src}
          poster={poster}
          preload="metadata"
          playsInline
          aria-label={title}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          onTimeUpdate={(e) => {
            setTime(e.currentTarget.currentTime);
            report("time", e.currentTarget);
          }}
          onSeeking={(e) => report("seeking", e.currentTarget)}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onProgress={(e) => setBuffered(bufferedEnd(e.currentTarget))}
          onPlay={() => {
            setPaused(false);
            wake();
          }}
          onPause={(e) => {
            setPaused(true);
            report("pause", e.currentTarget);
          }}
          onEnded={(e) => {
            setPaused(true);
            report("ended", e.currentTarget);
          }}
          onVolumeChange={(e) => {
            setMuted(e.currentTarget.muted);
            setVolume(e.currentTarget.volume);
          }}
          onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            applyPendingSeek(e.currentTarget);
          }}
          onCanPlay={(e) => applyPendingSeek(e.currentTarget)}
          onError={fail}
          className={cx(
            "block w-full bg-black outline-none",
            fullscreen ? "h-full object-contain" : "aspect-video max-h-[calc(100dvh-11rem)]",
          )}
        />

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
                : "bottom-4 group-focus-within/player:bottom-[4.25rem] sm:bottom-6 sm:group-focus-within/player:bottom-24",
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

        {/* Kept mounted, so it fades and shrinks away as play starts and comes back
            the same way on pause, rather than blinking. Gone, it is invisible and
            inert: no focus, no click through to the video under it. */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          inert={!(paused && !scrubbing)}
          data-big-play={paused && !scrubbing ? "shown" : "away"}
          className={cx(
            "absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm sm:size-16 focus-visible:outline-2 focus-visible:outline-white",
            "duration-150 ease-soft motion-reduce:transition-none",
            // Visibility waits for the fade out, not in, so the button is reachable the moment it shows.
            paused && !scrubbing
              ? "scale-100 opacity-100 transition-[opacity,scale] hover:scale-105"
              : "invisible scale-90 opacity-0 transition-[opacity,scale,visibility]",
          )}
        >
          <Icon name="play" className="size-6 translate-x-0.5 sm:size-7" />
        </button>

        <div
          className={cx(
            "absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/35 to-transparent px-2 pt-8 pb-1 sm:px-4 sm:pt-12 sm:pb-1.5 text-white transition-opacity duration-200 motion-reduce:transition-none",
            controlsUp ? "opacity-100" : "opacity-0 group-focus-within/player:opacity-100",
          )}
        >
          <VideoScrubber
            src={src}
            time={time}
            duration={duration}
            buffered={buffered}
            chapters={chapters}
            label={title ? `Seek in ${title}` : "Seek"}
            onSeek={seek}
            onScrub={setScrubbing}
          />
          <div className="flex items-center gap-1 text-[13px]">
            <ControlButton label={paused ? "Play (k)" : "Pause (k)"} onClick={togglePlay}>
              <Icon name={paused ? "play" : "pause"} className="size-5" />
            </ControlButton>
            <div className="group/volume flex items-center">
              <ControlButton label={muted || volume === 0 ? "Unmute (m)" : "Mute (m)"} onClick={toggleMute}>
                <Icon name={muted || volume === 0 ? "muted" : "volume"} className="size-5" />
              </ControlButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => {
                  const video = videoRef.current;
                  if (!video) return;
                  video.volume = Number(e.currentTarget.value);
                  video.muted = video.volume === 0;
                }}
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
            <ControlButton label="Playback speed" onClick={cycleRate}>
              <span className="w-9 text-center text-[12px] font-semibold tabular-nums">{rate}×</span>
            </ControlButton>
            {canPip && (
              <ControlButton label="Picture in picture (i)" onClick={togglePip}>
                <Icon name="pip" className="size-5" />
              </ControlButton>
            )}
            <ControlButton
              label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"}
              onClick={toggleFullscreen}
            >
              <Icon name={fullscreen ? "shrink" : "expand"} className="size-5" />
            </ControlButton>
          </div>
        </div>
      </div>
    );

  const transcriptPanel = (bare: boolean) =>
    transcript !== undefined && (
      <TranscriptPanel
        // The panel's follow-along state is playback state too: a reader who
        // scrolled away from one video should not land on the next one with
        // its transcript already given up on.
        key={src}
        cues={transcript}
        currentTime={time}
        onSeek={seek}
        bare={bare}
        scrollerClassName="max-h-[26rem]"
      />
    );

  if (header === undefined && tabs === undefined) {
    return (
      <section className="flex flex-col gap-3.5">
        {player}
        {transcriptPanel(false)}
      </section>
    );
  }

  const items: TabItem[] = [
    ...(transcript !== undefined
      ? [{ id: "transcript", label: "Transcript", content: transcriptPanel(true) }]
      : []),
    ...(tabs ?? []),
  ];

  return (
    <section className="flex flex-col gap-4">
      {player}
      {header}
      {items.length > 0 && <Tabs items={items} label={title ? `About ${title}` : "About this video"} />}
    </section>
  );
}

/*
 * Whether subtitles are on, remembered in this browser. An external store
 * rather than state read in an effect: the server renders them off, the
 * client reads the stored choice after hydration, and every player on the
 * page follows one switch. When storage is refused the switch still works for
 * the life of the page, held in `fallback`.
 */
const SUBTITLES_KEY = "video:subtitles";
const SUBTITLES_EVENT = "video:subtitles";
let fallback = false;

function readSubtitles(): boolean {
  try {
    const stored = window.localStorage.getItem(SUBTITLES_KEY);
    return stored === null ? fallback : stored === "on";
  } catch {
    return fallback;
  }
}

function subscribeSubtitles(onChange: () => void): () => void {
  window.addEventListener(SUBTITLES_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SUBTITLES_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function toggleSubtitles() {
  fallback = !readSubtitles();
  try {
    window.localStorage.setItem(SUBTITLES_KEY, fallback ? "on" : "off");
  } catch {
    // Not remembered, still toggled.
  }
  window.dispatchEvent(new Event(SUBTITLES_EVENT));
}

function noSubscription(): () => void {
  return () => undefined;
}

function pipSupported(): boolean {
  return typeof document !== "undefined" && document.pictureInPictureEnabled === true;
}

/** `HTMLMediaElement.HAVE_METADATA`: the length and the size are known. */
const HAVE_METADATA = 1;

/** The speeds the speed button steps through, in order. */
const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];

/** The end of the buffered range that holds the playhead, or of the last one. */
function bufferedEnd(video: HTMLVideoElement): number {
  const ranges = video.buffered;
  if (!ranges || ranges.length === 0) return 0;
  for (let i = 0; i < ranges.length; i += 1) {
    if (ranges.start(i) <= video.currentTime && video.currentTime <= ranges.end(i)) return ranges.end(i);
  }
  return ranges.end(ranges.length - 1);
}

function ControlButton({
  label,
  onClick,
  pressed,
  children,
}: {
  /**
   * What the button does. A toggle (`pressed` set) keeps one name whatever
   * its state, and `aria-pressed` says whether it is on, as ARIA asks of a
   * toggle button; a button without `pressed` names the action it would take
   * now ("Mute", "Unmute"), since nothing else says its state.
   */
  label: string;
  onClick: () => void;
  /** Set for a toggle, so it is announced as one. */
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className="flex h-9 min-w-9 items-center justify-center rounded-full text-white/90 transition-colors duration-100 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

const PATHS = {
  play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor" stroke="none" />,
  volume: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  muted: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </>
  ),
  cc: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6" />
    </>
  ),
  pip: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="12" y="11.5" width="6.5" height="5" rx="1" fill="currentColor" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
} satisfies Record<string, ReactNode>;

function Icon({ name, className }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
