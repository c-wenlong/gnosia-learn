/**
 * The value `record` holds under `key` as its own property, or `undefined`.
 *
 * `record[key]` on an object built from `{}` or `Object.fromEntries` also
 * reaches `Object.prototype`, so a key that arrives from a URL, a row or a
 * wikilink and happens to be `constructor`, `toString` or `__proto__` reads
 * back a function or an object instead of nothing. `?topic=constructor` on
 * `/library` did exactly that: `titles["constructor"] ?? topic` handed React a
 * function where it expected a label, and the page failed to render. Any
 * lookup whose key someone other than this code chose goes through here.
 */
export function ownValue<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
