/**
 * A JSON request from the browser to one of the app's own routes, and its
 * answer: the status, whether it was a 2xx, and the reply's body read as JSON
 * (an empty object when the body is not JSON, so a caller reads fields off it
 * without checking). `null` when the request never got an answer: the server
 * is down, or the network is.
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
): Promise<{ status: number; ok: boolean; data: R } | null> {
  try {
    const response = await fetch(path, {
      method,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      cache: "no-store",
    });
    const data = ((await response.json().catch(() => ({}))) ?? {}) as R;
    return { status: response.status, ok: response.ok, data };
  } catch {
    return null;
  }
}
