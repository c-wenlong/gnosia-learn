/**
 * Take every trace of an API key out of text a provider sent back
 * (docs/BYOK.md, decision 3).
 *
 * Provider errors reach the browser: the tutor's `attempts` list and the
 * Settings page's Test result both carry the provider's own words, and some
 * providers quote the key they were given, whole or masked ("Incorrect API
 * key provided: sk-or-v1-ab***yz"). So a key is removed whole, and so is any
 * word that shares six characters in a row with it, which catches a masked
 * echo, a prefix and a suffix alike. Over-redaction costs a word of an error
 * message; under-redaction costs the key.
 *
 * React-free and dependency-free, so the route and its tests share it.
 */

/** The shortest run of a key's characters treated as an echo of it. */
export const ECHO_CHARS = 6;

export const REDACTED = "[redacted]";

/** A word, for this purpose: a run of characters a key could be made of. */
const WORD = /[^\s"'`<>,;()[\]{}]+/g;

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < ECHO_CHARS) continue;
    out = out.split(secret).join(REDACTED);
    const grams = new Set<string>();
    for (let i = 0; i + ECHO_CHARS <= secret.length; i += 1) grams.add(secret.slice(i, i + ECHO_CHARS));
    out = out.replace(WORD, (word) => {
      if (word.length < ECHO_CHARS) return word;
      for (let i = 0; i + ECHO_CHARS <= word.length; i += 1) {
        if (grams.has(word.slice(i, i + ECHO_CHARS))) return REDACTED;
      }
      return word;
    });
  }
  return out;
}
