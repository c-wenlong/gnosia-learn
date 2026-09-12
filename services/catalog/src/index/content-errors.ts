import { ContentError } from "@self-learn/content";

import { IndexError } from "./errors";

/**
 * Runs a `@self-learn/content` reader and re-labels its refusals as
 * `IndexError`.
 *
 * The reader is shared with the web app, so it throws `ContentError`: "the
 * files are wrong" said in a way that means the same thing during a Next build.
 * The catalog CLI sorts errors into "content is wrong, here is the file to fix"
 * and "the catalog is wrong, here is a stack trace", and that sorting is by
 * type. Without this, every content problem would arrive looking like a bug.
 * The message is passed through unchanged: it already names the file.
 */
export function asIndexError<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ContentError) throw new IndexError(error.message);
    throw error;
  }
}
