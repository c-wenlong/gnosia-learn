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
  nextSkip,
  SKIP_FLASH_MS,
  SKIP_STEP,
  subtitleAt,
  type SkipFlash,
  type TranscriptCue,
  type VideoChapter,
} from "@gnosia/tutor/media";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { cx } from "@/components/ui/classes";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { useAssetFailure } from "@/components/use-asset-failure";
import { VideoControls } from "@/components/VideoControls";
import { VideoOverlays, type ToggleFlash } from "@/components/VideoOverlays";
import { readSubtitles, subscribeSubtitles, toggleSubtitles } from "@/components/video-subtitles";
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
 * plays untouched. Keyboard: Space or K plays and pauses, the left and right
 * arrows move five seconds (on the bar too), J and L move ten, M mutes, C toggles subtitles, I pops the picture out (where the
 * browser has picture-in-picture), F goes fullscreen, and the bar
 * itself takes Page Up / Page Down for chapters. A click anywhere in the
 * player gives it focus, so the keys work after a click on the picture.
 *
 * **An arrow press flashes what it did.** "+ 5 ›" on the right or "‹ − 5" on
 * the left, for a second. Presses in the same direction while it is up add
 * to it, so holding the key reads "+ 170" rather than "+ 5" over and over.
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
 * **The pieces.** This file is the element, its state and the layout. The
 * bar is `VideoControls`, what draws over the picture is `VideoOverlays`,
 * the icons are `VideoIcons`, and the remembered subtitle switch is
 * `video-subtitles`.
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
  const [skip, setSkip] = useState<SkipFlash | null>(null);
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The icon a press on play or pause flashes in the middle. `n` counts
  // presses, so each one is a new element that fades in afresh, and `attempt`
  // is the element it was for, so a retry does not show the old one's flash.
  const [toggleFlash, setToggleFlash] = useState<(ToggleFlash & { attempt: number }) | null>(null);
  const toggleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // the component keeps whatever the last video was at whenever it is handed
  // a new `src` in place: a navigation that changes only the query string,
  // or the studio swapping the video it shows.
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
    setSkip(null);
    setToggleFlash(null);
  }

  // Which load, and which attempt at it, has played. The big play button is
  // for starting a video, so it shows until then and not on every pause.
  const [playedOn, setPlayedOn] = useState<string | null>(null);

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
      if (skipTimer.current) clearTimeout(skipTimer.current);
      if (toggleTimer.current) clearTimeout(toggleTimer.current);
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

  /** One arrow press: five seconds either way, and the flash that says so. */
  function step(direction: 1 | -1) {
    // A seek still held for this load is where the playhead is going, so
    // presses before the metadata add up rather than each restarting from 0.
    const pending = pendingSeek.current;
    const from =
      pending !== null && pending.load === source.load
        ? pending.seconds
        : (videoRef.current?.currentTime ?? time);
    const end = Number.isFinite(duration) ? duration : Number.POSITIVE_INFINITY;
    const target = Math.min(Math.max(from + direction * SKIP_STEP, 0), end);
    seek(target);
    wake();
    // At either end nothing moved, so the flash neither appears nor grows.
    if (target === from) return;
    setSkip((prev) => nextSkip(prev, direction));
    if (skipTimer.current) clearTimeout(skipTimer.current);
    skipTimer.current = setTimeout(
      () => setSkip((prev) => (prev === null ? null : { ...prev, shown: false })),
      SKIP_FLASH_MS,
    );
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

  function flashToggle(icon: "play" | "pause") {
    setToggleFlash((prev) => ({ icon, n: (prev?.n ?? 0) + 1, attempt, shown: true }));
    if (toggleTimer.current) clearTimeout(toggleTimer.current);
    toggleTimer.current = setTimeout(
      () => setToggleFlash((prev) => (prev === null ? null : { ...prev, shown: false })),
      SKIP_FLASH_MS,
    );
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      // The first play has the big button fading away as its answer. A resume
      // flashes once it has started, so a refused one does not claim it did.
      const resuming = started;
      void video.play()?.then(() => {
        if (resuming) flashToggle("play");
      }, () => {
        // Refused (autoplay policy, a source that failed). The element's own
        // events keep `paused` honest, and a failure has its own panel.
      });
    } else {
      flashToggle("pause");
      video.pause();
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 0.5;
  }

  function setVolumeTo(value: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = video.volume === 0;
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
    const target = event.target as HTMLElement;
    // A focused button handles its own Space and Enter.
    if (target.closest("button, input") && (event.key === " " || event.key === "Enter")) {
      return;
    }
    // And the volume slider its own arrows.
    if (target.closest("input") && event.key.startsWith("Arrow")) return;
    const video = videoRef.current;
    switch (event.key.toLowerCase()) {
      case " ":
      case "k":
        togglePlay();
        break;
      case "arrowleft":
        step(-1);
        break;
      case "arrowright":
        step(1);
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
  const started = playedOn === `${source.load}:${attempt}`;
  const bigPlay = paused && !scrubbing && !started;
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
        // Out of the tab order, but a click on the picture lands focus here
        // rather than on the page, so the keys below answer straight away.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerMove={wake}
        onPointerLeave={() => setAwake(false)}
        className={cx(
          "group/player relative overflow-hidden bg-black outline-none",
          fullscreen ? "flex items-center" : "rounded-xl",
          // Keyboard focus on a control holds the controls up. Focus a click
          // left on the frame does not, or a clicked video never hid them.
          !controlsUp && "cursor-none has-[:focus-visible]:cursor-auto",
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
          // A double-click is click, click, dblclick: the second click
          // (`detail` 2) is the double-click's, so only the first toggles,
          // and the picture goes fullscreen in the state it was in.
          onClick={(event) => {
            if (event.detail > 1) return;
            togglePlay();
          }}
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
            setPlayedOn(`${source.load}:${attempt}`);
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

        <VideoOverlays
          subtitle={subtitle}
          paused={paused}
          controlsUp={controlsUp}
          bigPlay={bigPlay}
          onBigPlay={() => {
            togglePlay();
            // This button goes inert as play starts, which would drop focus
            // on the page; the frame keeps it, so the keys still answer.
            frameRef.current?.focus({ preventScroll: true });
          }}
          skip={skip}
          toggleFlash={toggleFlash !== null && toggleFlash.attempt === attempt ? toggleFlash : null}
        />

        <VideoControls
          src={src}
          time={time}
          duration={duration}
          buffered={buffered}
          chapters={chapters}
          title={title}
          controlsUp={controlsUp}
          paused={paused}
          muted={muted}
          volume={volume}
          rate={rate}
          fullscreen={fullscreen}
          canPip={canPip}
          hasSubtitles={hasSubtitles}
          subtitles={subtitles}
          chapterTitle={chapterTitle}
          onSeek={seek}
          onScrub={setScrubbing}
          onStep={step}
          onTogglePlay={togglePlay}
          onToggleMute={toggleMute}
          onVolume={setVolumeTo}
          onCycleRate={cycleRate}
          onTogglePip={togglePip}
          onToggleFullscreen={toggleFullscreen}
        />
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
