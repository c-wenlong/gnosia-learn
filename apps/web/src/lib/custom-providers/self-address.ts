import "server-only";

import { studioOrigin } from "@/lib/studio";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function portOf(url: URL): string {
  return url.port !== "" ? url.port : url.protocol === "https:" ? "443" : "80";
}

/**
 * Whether a custom provider's base URL points back at this machine's own
 * services: the app itself, or the studio runner.
 *
 * `checkBaseUrl` allows plain http to loopback on purpose, for a model server
 * on this machine (Ollama, LM Studio). But the server sends the owner's key to
 * that address and returns what it answers, and two loopback ports are not
 * model servers: the app, and the studio runner, which treats a request with
 * no `Origin` as a trusted program on this machine. So those two are refused
 * when a provider is saved. `requestUrl` is the request that is saving it,
 * whose port is the app's.
 */
export function pointsAtThisApp(baseUrl: unknown, requestUrl: string, env: Record<string, string | undefined> = process.env): boolean {
  if (typeof baseUrl !== "string") return false;
  let target: URL;
  try {
    target = new URL(baseUrl.trim());
  } catch {
    return false;
  }
  if (!LOOPBACK.has(target.hostname)) return false;
  const own = new Set([portOf(new URL(studioOrigin(env))), portOf(new URL(requestUrl))]);
  const port = env.PORT?.trim();
  if (port !== undefined && port !== "") own.add(port);
  return own.has(portOf(target));
}
