/** How long `sendJson` waits for an answer before giving up on it. */
export const SEND_TIMEOUT_MS = 60_000;

/**
 * A signal that aborts after `ms`, or when `outer` does, and the call that
 * stops its timer. A request with no deadline whose server never answers
 * leaves whatever waits on it waiting for good: a busy state that never
 * clears, or a learner write queue that never drains.
 *
 * A timer of its own rather than `AbortSignal.timeout`, so a test's fake
 * clock moves it, and `outer` forwarded by hand rather than with
 * `AbortSignal.any`, which older Safari lacks.
 */
export function withDeadline(ms: number, outer?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException(`No answer in ${ms} ms.`, "TimeoutError")), ms);
  const forward = () => controller.abort(outer?.reason);
  if (outer?.aborted) forward();
  else outer?.addEventListener("abort", forward, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", forward);
    },
  };
}

/**
 * A JSON request from the browser to one of the app's own routes, and its
 * answer: the status, whether it was a 2xx, and the reply's body read as JSON
 * (an empty object when the body is not JSON, so a caller reads fields off it
 * without checking). `null` when the request never got an answer: the server
 * is down, or the network is, or nothing came back within `timeoutMs`
 * (`SEND_TIMEOUT_MS` unless given), or `signal` aborted it.
 *
 * `body`, when given, is sent as JSON with its content type; a request with
 * none sends nothing. Never cached.
 *
 * Nothing here logs, on any path: the Provider keys card sends a key through
 * it, and a body or an error carrying one must not reach the console.
 */
export async function sendJson<R>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ status: number; ok: boolean; data: R } | null> {
  const deadline = withDeadline(options.timeoutMs ?? SEND_TIMEOUT_MS, options.signal);
  try {
    const response = await fetch(path, {
      method,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      cache: "no-store",
      signal: deadline.signal,
    });
    const data = ((await response.json().catch(() => ({}))) ?? {}) as R;
    return { status: response.status, ok: response.ok, data };
  } catch {
    return null;
  } finally {
    deadline.done();
  }
}
