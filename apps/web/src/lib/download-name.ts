/**
 * The `Content-Disposition` the asset file route answers with.
 *
 * Inline by default, for the `<video>`, the `<img>` and a tab opened on the
 * URL, under the stored file's own sanitised name (`safeFilename` in
 * `@/lib/asset-files`). With `?download=1` (the Library row menu's Download,
 * L5 of docs/proposals/library-by-type-and-day.md) it is `attachment`, and
 * the saved file is named after what the Library calls the asset: its title,
 * the learner's own name for it when they gave one, with the file's
 * extension, so "Master theorem, cases 1 to 3.mp4" rather than
 * "cs3230_w3_master.mp4". An asset with no title keeps the file's name.
 *
 * A title is any text, so it goes out twice, as RFC 6266 asks: `filename`
 * with only characters that cannot end the quoted string or start a header
 * line (anything else becomes `_`), for an old client, and `filename*` with
 * the whole name percent-encoded as UTF-8 (RFC 8187), which every current
 * browser prefers. Control characters, path separators and the characters
 * Windows refuses in a name are dropped from the title first, so the saved
 * file cannot land outside the downloads folder or fail to save.
 *
 * Pure and React-free.
 */

const MAX_NAME = 120;

/** The extension of a sanitised filename: ".mp4", or "" when it has none. */
function extensionOf(filename: string): string {
  const at = filename.lastIndexOf(".");
  return at > 0 ? filename.slice(at) : "";
}

/**
 * The title as a filename stem: no control characters, separators or
 * characters a file system refuses, runs of space collapsed, no leading or
 * trailing dots or spaces, at most `MAX_NAME` characters. Empty when nothing
 * is left.
 *
 * Well formed, so `filename*` can always be encoded: a lone surrogate (a
 * learner's own name can hold one, since `JSON.parse` accepts `"\ud83c"`)
 * becomes U+FFFD, and the cap counts code points, so it never splits an
 * emoji in two. `encodeURIComponent` throws on either.
 */
export function titleStem(title: string): string {
  const cleaned = title
    .toWellFormed()
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return Array.from(cleaned).slice(0, MAX_NAME).join("").trim();
}

/**
 * What a saved download is called: the title with the file's extension, else
 * the file's own name. A companion's title names its format in brackets
 * ("Big-O, from one running time (vtt)"), which the extension then says
 * again, so a trailing "(vtt)" that is the extension is dropped: the file is
 * "Big-O, from one running time.vtt", not "... (vtt).vtt".
 */
export function downloadName(filename: string, title: string | null | undefined): string {
  const ext = extensionOf(filename);
  const named = title === null || title === undefined ? "" : titleStem(title);
  const bracketed = ext === "" ? "" : `(${ext.slice(1).toLowerCase()})`;
  const stem =
    bracketed !== "" && named.toLowerCase().endsWith(bracketed) && named.length > bracketed.length
      ? titleStem(named.slice(0, -bracketed.length))
      : named;
  if (stem === "") return filename;
  // A title that already ends in its extension ("notes.md") is not given a second one.
  return ext !== "" && stem.toLowerCase().endsWith(ext.toLowerCase()) ? stem : `${stem}${ext}`;
}

/** RFC 8187's `attr-char` set: everything else is percent-encoded. */
function encodeExtValue(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** The ASCII fallback for `filename=`: the characters a quoted string and a header line take safely. */
function asciiFallback(name: string): string {
  const ascii = name.replace(/[^A-Za-z0-9 ._()-]/g, "_");
  return ascii === "" ? "asset" : ascii;
}

/**
 * The header value. `inline` keeps the stored file's name exactly as the
 * route always sent it; `attachment` names the file after the title.
 */
export function contentDisposition(
  mode: "inline" | "attachment",
  filename: string,
  title?: string | null,
): string {
  if (mode === "inline") return `inline; filename="${filename}"`;
  const name = downloadName(filename, title);
  const fallback = asciiFallback(name);
  return fallback === name
    ? `attachment; filename="${name}"`
    : `attachment; filename="${fallback}"; filename*=UTF-8''${encodeExtValue(name)}`;
}
