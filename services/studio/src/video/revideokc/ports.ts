import { createHash } from "node:crypto";
import { createServer } from "node:net";

/**
 * The two loopback ports a revideokc job's renders listen on (D76 of
 * docs/STUDIO-VIDEO-TOOLS.md).
 *
 * Revideo starts one Vite server per worker, on `REVIDEOKC_VITE_PORT` and the
 * ports after it, with `strictPort` so a taken port fails the render rather
 * than moving to one the profile does not allow. `still` uses one worker and
 * `build` two, so a job's render profile allows exactly `base` and `base + 1`
 * for bind, inbound and outbound, and nothing else on the network.
 *
 * The scheme:
 *
 * - **Jobs take an even base in 47000 to 48998.** Below 49152, where macOS
 *   hands out ephemeral client ports, so an outgoing connection elsewhere on
 *   the machine never sits on one; and clear of everything the studio itself
 *   listens on (the runner's 7250, a mirror's port, Postgres' 5432, Next's
 *   3000). The first pair tried comes from the job's id, so two jobs start
 *   from different places, and the first pair free on both loopback
 *   addresses at setup is the job's for its life: it is written into the
 *   job's profile, which is written once.
 * - **The doctor's fixture takes a pair in 46990 to 46998**, outside the
 *   jobs' range, so a doctor refresh during a job never takes the job's port.
 * - Two jobs never run at once (`VIDEO_CONCURRENCY` is one), so the range is
 *   for a port something else on the machine holds, not for sharing.
 *
 * A pair that was free at setup can be taken later by another program; the
 * render then fails on that port by name, and the wrapper checks both before
 * a render and says which is held, so the agent hears it plainly.
 */

export const JOB_PORTS = { first: 47000, last: 48998 } as const;
export const DOCTOR_PORTS = { first: 46990, last: 46998 } as const;

/** Whether nothing listens on `port` on this loopback address. An address the machine does not have counts as free. */
function freeOn(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => resolve(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT"));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** Whether a port is free on both loopback addresses: Vite listens on `localhost`, which may be either. */
export async function portFree(port: number): Promise<boolean> {
  return (await freeOn(port, "127.0.0.1")) && (await freeOn(port, "::1"));
}

/** The first even base in `range`, starting at `start` and wrapping, whose pair is free; throws when none is. */
export async function freePair(range: { first: number; last: number }, start: number = range.first): Promise<number> {
  const count = Math.floor((range.last - range.first) / 2) + 1;
  const first = Math.max(0, Math.min(count - 1, Math.floor((start - range.first) / 2)));
  for (let i = 0; i < count; i += 1) {
    const base = range.first + ((first + i) % count) * 2;
    if ((await portFree(base)) && (await portFree(base + 1))) return base;
  }
  throw new Error(`no free pair of ports from ${range.first} to ${range.last + 1} on this machine, so no revideokc render can be sandboxed`);
}

/** Where a job's search starts: a pair picked by its id. */
export function jobPortStart(jobId: string): number {
  const count = Math.floor((JOB_PORTS.last - JOB_PORTS.first) / 2) + 1;
  const index = createHash("sha256").update(jobId).digest().readUInt32BE(0) % count;
  return JOB_PORTS.first + index * 2;
}

/** A job's pair: its base, the first free from where its id points. */
export function jobPorts(jobId: string): Promise<number> {
  return freePair(JOB_PORTS, jobPortStart(jobId));
}
