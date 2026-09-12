/**
 * A refusal to read content, rather than a crash.
 *
 * Every message names the file it came from, because the reader runs in three
 * places (a Next build, `catalog index`, a test) and only one of them is the
 * place the author is looking. "cs4263.yaml: module cs4263-m2 has no topic" is
 * actionable from any of the three; "Cannot read property of undefined" is not.
 *
 * The catalog rewraps this as an `IndexError` so its CLI keeps telling content
 * problems apart from catalog bugs.
 */
export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentError";
  }
}
