/**
 * Why an asset did not load, as a code a component can switch on.
 *
 * **The problem this solves.** A browser's `onError` on an `<img>` or a
 * `<video>` carries no status and no body. The asset routes always knew the
 * reason (a deleted file, a manimkc index older than the asset route, the
 * route switched off), but the component that failed could only say "did not
 * load". Those need three different things done about them, so this module is
 * the shared vocabulary: the routes emit a code, the status route reports one
 * without sending any bytes, and every surface maps the code to the same
 * sentence and the same next step.
 *
 * **React-free, with no `server-only`.** The route handlers, the server pages
 * and the client islands all import it. It holds a table and two small
 * functions, and nothing in it can reach a filesystem or a database.
 *
 * **A reason is a category and a fix, never a leak.** Nothing here carries a
 * path, an id or an error message. The routes still put a human `detail` in
 * their JSON for someone reading the raw response; the page never shows it.
 */

/**
 * Every reason an asset can fail, in two groups.
 *
 * The first group is what the routes emit, and each one is pinned by a route
 * test. The second exists only in the browser: `undecodable` when the server
 * says the file is fine and the element failed anyway, `server-unreachable`
 * when the question could not be asked, `unknown` for an answer this build
 * does not recognise.
 */
export const ROUTE_PROBLEM_CODES = [
  "files-off",
  "catalog-unreachable",
  "not-in-catalog",
  "no-file",
  "manimkc-unindexed",
  "manimkc-stale",
  "file-missing",
  "refused",
  "unsupported-type",
  "not-a-video",
  "no-ffmpeg",
  "poster-failed",
  "poster-not-made",
  "not-uploaded",
  "blob-store-unavailable",
] as const;

export const CLIENT_PROBLEM_CODES = ["undecodable", "server-unreachable", "unknown"] as const;

export type RouteProblemCode = (typeof ROUTE_PROBLEM_CODES)[number];
export type AssetProblemCode = RouteProblemCode | (typeof CLIENT_PROBLEM_CODES)[number];

/** What a surface says about one code. */
export interface AssetProblem {
  /** Why, in three or four words, for a card's thumbnail where a sentence will not fit. */
  label: string;
  /** Why, in plain words, as one or two sentences. */
  reason: string;
  /**
   * The one next step, when there is one. `command` is shown as something to
   * type, `env` as a variable to start the server with, `note` as a sentence. Absent when nothing the reader can do
   * would change the answer.
   */
  fix?: { kind: "command" | "env" | "note"; text: string };
  /**
   * True when asking again could plausibly work, so a surface that can offer a
   * Try again button should. Every other code is a state that stays put until
   * someone runs the fix.
   */
  retry: boolean;
}

const INDEX = { kind: "command", text: "npm run catalog -- index" } as const;
const INDEX_MANIMKC = { kind: "command", text: "npm run catalog -- index --only manimkc" } as const;

/**
 * The words, once. A `Record` over the union, so a code added above without a
 * sentence here is a type error rather than a blank panel.
 */
export const ASSET_PROBLEMS: Readonly<Record<AssetProblemCode, AssetProblem>> = {
  "files-off": {
    label: "Asset files are switched off",
    reason:
      "This server does not serve asset files. That is the default, since production has none of them.",
    fix: { kind: "env", text: "ASSET_FILES_ENABLED=1" },
    retry: false,
  },
  "catalog-unreachable": {
    label: "The catalog did not answer",
    reason:
      "The catalog database did not answer, so nothing could say where the file lives. The file itself is probably fine.",
    fix: { kind: "command", text: "npm run catalog -- status" },
    retry: true,
  },
  "not-in-catalog": {
    label: "Not in the catalog",
    reason:
      "The catalog has no entry by this name. Either the file is new since the last index, or it does not exist.",
    fix: INDEX,
    retry: false,
  },
  "no-file": {
    label: "A web link, not a file",
    reason: "This entry is a link to a page on the web, so there is no file to show here.",
    retry: false,
  },
  "manimkc-unindexed": {
    label: "manimkc not indexed here",
    reason:
      "manimkc has never been indexed on this machine, so nothing records the folder its videos are rendered into.",
    fix: INDEX_MANIMKC,
    retry: false,
  },
  "manimkc-stale": {
    label: "manimkc index out of date",
    reason:
      "The manimkc index is older than the asset route and does not record where the videos live. The video is probably still there.",
    fix: INDEX_MANIMKC,
    retry: false,
  },
  "file-missing": {
    label: "File deleted or moved",
    reason:
      "The catalog lists this file, but it is no longer on disk. It was deleted or moved after the last index.",
    fix: INDEX,
    retry: false,
  },
  refused: {
    label: "Location refused",
    reason:
      "The server refused to read it, because its recorded location points outside the folders assets may come from.",
    fix: INDEX,
    retry: false,
  },
  "unsupported-type": {
    label: "File type not served",
    reason: "It is a kind of file the server does not serve.",
    retry: false,
  },
  "not-a-video": {
    label: "Not a video",
    reason: "Only a video has a preview frame, and this is not one.",
    retry: false,
  },
  "no-ffmpeg": {
    label: "ffmpeg not installed",
    reason: "ffmpeg is not installed on the server, so no preview frame can be cut from the video.",
    fix: { kind: "note", text: "Install ffmpeg, or set FFMPEG_PATH to where it is." },
    retry: false,
  },
  "poster-failed": {
    label: "No frame could be cut",
    reason:
      "ffmpeg ran at every point it tries and found no frame in this video. The file may be damaged.",
    fix: { kind: "note", text: "Open the video to see whether it plays." },
    retry: false,
  },
  // Not a verdict: nothing has recorded a failure for this video, so either no
  // preview has been attempted yet or the last attempt was cut short.
  "poster-not-made": {
    label: "Preview not made yet",
    reason:
      "No preview frame has been made for this video yet, or the last attempt was cut short. Asking again will try once more.",
    fix: { kind: "note", text: "Reload the page to try again." },
    retry: true,
  },
  // The row points at the blob store and the store cannot hand the bytes over:
  // an upload that never confirmed, or an object `catalog blob audit` found
  // gone. The legacy file is not tried, so the answer names the store.
  "not-uploaded": {
    label: "Not in the blob store",
    reason:
      "The catalog says this file is kept in the blob store, but its upload never finished or the store no longer has it.",
    fix: { kind: "command", text: "npm run catalog -- blob audit" },
    retry: false,
  },
  "blob-store-unavailable": {
    label: "The blob store did not open",
    reason:
      "The server could not open the blob store this file is kept in, so it could not be read. The file itself is probably fine.",
    fix: { kind: "note", text: "Check that SELF_LEARN_HOME is an absolute path outside the repository." },
    retry: true,
  },
  undecodable: {
    label: "The browser could not show it",
    reason:
      "The server has the file and serves it, but this browser could not show it. It may be damaged, or in a format this browser cannot display.",
    retry: true,
  },
  "server-unreachable": {
    label: "The server did not answer",
    reason: "The app's server did not answer, so the reason could not be asked for.",
    fix: { kind: "note", text: "Try again once the server is back." },
    retry: true,
  },
  unknown: {
    label: "Reason unknown",
    reason: "It did not load, and no reason this page recognises could be found out.",
    retry: true,
  },
};

const KNOWN = new Set<string>([...ROUTE_PROBLEM_CODES, ...CLIENT_PROBLEM_CODES]);

export function isAssetProblemCode(value: unknown): value is AssetProblemCode {
  return typeof value === "string" && KNOWN.has(value);
}

/**
 * The four `FileAccess` reasons the server decides before render, as codes.
 *
 * `unknown` there means "could not check the manimkc index", which is the
 * catalog failing to answer, not a reason this page does not recognise.
 */
export function problemForAccess(
  reason: "off" | "unindexed" | "stale" | "unknown",
): RouteProblemCode {
  switch (reason) {
    case "off":
      return "files-off";
    case "unindexed":
      return "manimkc-unindexed";
    case "stale":
      return "manimkc-stale";
    case "unknown":
      return "catalog-unreachable";
  }
}

/**
 * What the status route answered, as a code.
 *
 * `ok: true` after an element already failed is its own answer: the server
 * can serve the file right now, so either the first attempt was transient or
 * the browser could not decode what it got. `undecodable` says both, and the
 * surface offers Try again.
 */
export function problemFromStatus(body: unknown): AssetProblemCode {
  if (typeof body !== "object" || body === null) return "unknown";
  const { ok, code } = body as { ok?: unknown; code?: unknown };
  if (ok === true) return "undecodable";
  return isAssetProblemCode(code) ? code : "unknown";
}

/**
 * Ask the status route why an element failed.
 *
 * **Why a status route and not the file itself.** A `HEAD` on the file route
 * gets a status and no body, so it loses the code; a `GET` risks downloading a
 * whole 10 MB video when the first failure was transient and the second
 * attempt succeeds; and either one, pointed at the poster route, can start an
 * ffmpeg. The status route runs the same resolver and sends a few bytes of
 * JSON, so the probe costs one small round trip and never any file.
 *
 * Without a status URL (a plain markdown image pointing somewhere else) there
 * is nobody to ask, and the answer is `unknown`. A rejected fetch is
 * `server-unreachable`, unless the caller aborted it, which rethrows so the
 * caller can drop a result nobody wants any more.
 */
export async function probeAssetProblem(
  statusHref: string | undefined,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AssetProblemCode> {
  if (statusHref === undefined) return "unknown";
  let response: Response;
  try {
    response = await fetchImpl(statusHref, { cache: "no-store", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    return "server-unreachable";
  }
  try {
    return problemFromStatus(await response.json());
  } catch (error) {
    if (signal?.aborted) throw error;
    // Not JSON: a proxy's error page, or a server mid-restart. Nothing in it
    // is a reason this page can act on.
    return "unknown";
  }
}
