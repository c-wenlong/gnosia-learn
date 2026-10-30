import type { Env } from "./deps";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The message a refused base URL gets, on the web and in the sidecar alike. */
export const SELF_ADDRESS_REASON = "That address is this app or its studio runner, not a model provider.";

function portOf(url: URL): string {
  return url.port !== "" ? url.port : url.protocol === "https:" ? "443" : "80";
}

/** The studio runner's port, read as `apps/web/src/lib/studio.ts` reads it. */
function studioPort(env: Env): string {
  const raw = Number.parseInt((env.STUDIO_PORT ?? "").trim(), 10);
  return String(Number.isFinite(raw) && raw >= 1024 && raw <= 65535 ? raw : 7250);
}

/**
 * Whether a custom provider's base URL points back at this machine's own
 * services: the app itself, or the studio runner.
 *
 * `checkBaseUrl` allows plain http to loopback on purpose, for a model server
 * on this machine (Ollama, LM Studio). But the server sends the owner's key to
 * that address and returns what it answers, and two loopback ports are not
 * model servers: the app, and the studio runner, which treats a request with
 * no `Origin` as a trusted program on this machine. So those ports are refused
 * when a provider is saved, and a provider saved before the rule (or by hand)
 * is left out when the tutor builds its calls (`customConfigs` in
 * `credentials.ts`). `requestUrl`, when there is one, is the request saving
 * the provider, whose port is the app's; `PORT` names it too where it is set.
 */
export function pointsAtThisApp(baseUrl: unknown, env: Env, requestUrl?: string): boolean {
  if (typeof baseUrl !== "string") return false;
  let target: URL;
  try {
    target = new URL(baseUrl.trim());
  } catch {
    return false;
  }
  if (!LOOPBACK.has(target.hostname)) return false;
  const own = new Set([studioPort(env)]);
  if (requestUrl !== undefined) own.add(portOf(new URL(requestUrl)));
  const port = env.PORT?.trim();
  if (port !== undefined && port !== "") own.add(port);
  return own.has(portOf(target));
}
