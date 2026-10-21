/**
 * The poster recipe: which frame, how big, encoded how. `catalog asset upload`
 * makes a poster once per video on the laptop with it and stores it as a blob
 * (docs/CONTENT-MIGRATION.md, Track E), and the web app serves that blob.
 *
 * Pure: no spawn, no filesystem. The web app takes `POSTER_CONTENT_TYPE`
 * through `@gnosia/catalog/state`, the package's one door.
 *
 * The reasoning for each value is beside it. They were chosen for the web
 * route's old request-time fallback, which phase 2 removed, and moved here
 * unchanged when the upload started making posters.
 */

/**
 * Where to seek, in order, until one of them yields a frame.
 *
 * **Not the first frame.** A manimkc render opens on a fade-in and then a title
 * card, so frame 0 of `inverse_kinematics.mp4` is 1.5 kB of flat #333, a
 * thumbnail that is strictly worse than the placeholder it replaces, because it
 * looks like a working image of nothing. Fifteen seconds in, the same video is
 * a tracked hand beside a two-link arm: a picture that says what the video is
 * about, which is the entire job of a card in a grid.
 *
 * **Not the title card either, at ~3 seconds.** It is legible, but the card
 * already prints the title above the image, so thirty title cards would be
 * thirty near-identical dark rectangles restating text the reader can read.
 * Content frames are what tell one card from another.
 *
 * Fifteen seconds rather than a fraction of the duration because a fraction
 * needs the duration, and asking for it means `ffprobe`: a second binary that
 * can be absent independently of the first, doubling the "the tool is missing"
 * surface for a number that only chooses between 13% and 25% of the way in. The
 * thirty indexed videos run 9s to 20 minutes, median 115s, so 15s is past the
 * title card on all but the shortest and well short of the end on every one.
 *
 * The shortest are what the fallbacks are for. Seeking past the end of a file
 * makes ffmpeg write no frame at all, which is detected and retried closer to
 * the start; three seconds catches a short clip's title card, and zero catches
 * anything at all. Worst case is three spawns for a file that is only a few
 * seconds long, and the common case is one.
 */
export const POSTER_OFFSETS_SECONDS = [15, 3, 0] as const;

/**
 * How wide the poster is, and what it is encoded as.
 *
 * The cards are a grid: roughly 320 CSS pixels across at desktop widths, less
 * on a phone. 640 is that at 2x, and nothing on the page can use more. The
 * source is 1920x1080, so this is a 9x reduction in pixels before any encoder
 * sees it, and `-2` keeps the aspect ratio while landing on an even height,
 * which every JPEG chroma subsampler needs.
 *
 * JPEG rather than PNG: a 1920x1080 PNG of a frame of animation is megabytes,
 * and thirty of them on one page would be a worse experience than the grey box
 * this replaces. A 640px q5 JPEG of the same frame measures 8 kB. PNG would win
 * on flat-colour manim frames if the size were equal, but it is not, and at
 * this scale the text in a frame is unreadable either way, so the compression
 * artefacts nobody can see cost nothing.
 *
 * WebP or AVIF would be smaller again and are deliberately not used: they
 * depend on encoders a given ffmpeg build may not carry, and this is a feature
 * whose whole point is to degrade quietly. mjpeg is built into every ffmpeg.
 */
export const POSTER_WIDTH = 640;
export const POSTER_QUALITY = 5;
export const POSTER_CONTENT_TYPE = "image/jpeg";
export const POSTER_EXTENSION = ".jpg";

/**
 * The argument array, built from constants and one absolute path.
 *
 * Nothing here is a string that was concatenated from anything a request chose:
 * the offset, the width and the quality are the constants above, and `file` is
 * the file the upload command is about to store. It is passed as its own
 * element of the array, so a filename containing a space, a quote or a
 * semicolon is one argument either way.
 *
 * `-ss` before `-i` is input seeking, which jumps by keyframe instead of
 * decoding from the start: it is the difference between 0.12s and several
 * seconds on a twenty-minute file. `thumbnail=n=60` then reads about two
 * seconds of frames and keeps the one least like the average of them, which is
 * what stops a poster landing on a cross-fade or a frame that is briefly blank.
 * `format=yuvj420p` is not decoration: without it the mjpeg encoder refuses a
 * limited-range source outright ("Non full-range YUV is non-standard") and
 * writes nothing at all.
 */
export function ffmpegArgs(file: string, offsetSeconds: number): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(offsetSeconds),
    "-i",
    file,
    "-map",
    "0:v:0",
    "-an",
    "-sn",
    "-dn",
    "-frames:v",
    "1",
    "-vf",
    `thumbnail=n=60,scale=${POSTER_WIDTH}:-2,format=yuvj420p`,
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "-q:v",
    String(POSTER_QUALITY),
    "-",
  ];
}
