/**
 * Browser storage as a convenience: a read or write that throws (a private
 * window, blocked site data) is a convenience lost, never an error.
 */
export function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}
