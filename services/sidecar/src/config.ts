/**
 * The sidecar's deployment shape, fixed on purpose.
 *
 * It binds `127.0.0.1` and nothing else. Like the studio service (D10 of
 * docs/TLDRAWKC-INTEGRATION.md), loopback is the boundary: a name that merely
 * resolves here is not this server, and a `GNOSIA_SIDECAR_HOST` knob would be
 * the way to turn a local service into a network one by accident.
 */
export const HOST = "127.0.0.1";

/**
 * The port `GNOSIA_SIDECAR_PORT` names, or 0 — the kernel's choice. The
 * native app reads the `listening <port>` line the process prints, so an
 * ephemeral port is the correct default: a fixed one can collide, and the
 * app never needs to know it ahead of time.
 */
export function port(env: Record<string, string | undefined> = process.env): number {
  const raw = env.GNOSIA_SIDECAR_PORT?.trim();
  if (raw === undefined || raw === "") return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`GNOSIA_SIDECAR_PORT must be an integer between 0 and 65535, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

/**
 * The catalog owner every request resolves. Single-owner by design, like the
 * rest of the system: `local` is the default, and `GNOSIA_SIDECAR_OWNER`
 * exists for a checkout that keeps a second owner's rows.
 */
export function owner(env: Record<string, string | undefined> = process.env): string {
  return env.GNOSIA_SIDECAR_OWNER?.trim() || "local";
}
