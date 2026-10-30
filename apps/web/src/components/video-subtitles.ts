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

export function readSubtitles(): boolean {
  try {
    const stored = window.localStorage.getItem(SUBTITLES_KEY);
    return stored === null ? fallback : stored === "on";
  } catch {
    return fallback;
  }
}

export function subscribeSubtitles(onChange: () => void): () => void {
  window.addEventListener(SUBTITLES_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SUBTITLES_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function toggleSubtitles() {
  fallback = !readSubtitles();
  try {
    window.localStorage.setItem(SUBTITLES_KEY, fallback ? "on" : "off");
  } catch {
    // Not remembered, still toggled.
  }
  window.dispatchEvent(new Event(SUBTITLES_EVENT));
}
