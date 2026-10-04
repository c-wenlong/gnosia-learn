import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

import type { VideoPaths } from "./paths";
import { ProfileError } from "./sandbox";

/**
 * The two loopback ports a Chrome tool's job renders on (D76 of
 * docs/STUDIO-VIDEO-TOOLS.md): revideokc's two Vite servers, remotionkc's
 * HTTP server and Chrome's DevTools. Each tool starts its servers on a base
 * port it is given and the one after it, and fails rather than moving when
 * one is taken, so a job's render profile allows exactly `base` and
 * `base + 1` for bind, inbound and outbound, and nothing else on the network.
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
 * - **Each tool's doctor takes a pair in a small range of its own**, outside
 *   the jobs' range and away from every other doctor's, since the doctors
 *   refresh on their own clocks and may render at the same moment.
 * - Jobs of different tools run at once (`videoConcurrency`), so a pair is
 *   held from the job's setup until it ends, and another job's setup passes
 *   over it: a pair is free to the system between renders, and the first
 *   render may start minutes after setup. The searches run one at a time, so
 *   two setups at the same moment cannot both find one pair free.
 *
 * A pair that was free at setup can be taken later by another program; the
 * render then fails on that port by name, and each tool's wrapper checks both
 * before a render and says which is held, so the agent hears it plainly.
 */

export const JOB_PORTS = { first: 47000, last: 48998 } as const;

/** Whether nothing listens on `port` on this loopback address. An address the machine does not have counts as free. */
function freeOn(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => resolve(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT"));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** Whether a port is free on both loopback addresses: a server on `localhost` may take either. */
export async function portFree(port: number): Promise<boolean> {
  return (await freeOn(port, "127.0.0.1")) && (await freeOn(port, "::1"));
}

/** The first even base in `range`, starting at `start` and wrapping, whose pair is free and not in `held`; throws when none is. */
export async function freePair(range: { first: number; last: number }, start: number = range.first, held: ReadonlySet<number> = new Set()): Promise<number> {
  const count = Math.floor((range.last - range.first) / 2) + 1;
  const first = Math.max(0, Math.min(count - 1, Math.floor((start - range.first) / 2)));
  for (let i = 0; i < count; i += 1) {
    const base = range.first + ((first + i) % count) * 2;
    if (held.has(base)) continue;
    if ((await portFree(base)) && (await portFree(base + 1))) return base;
  }
  throw new Error(`no free pair of ports from ${range.first} to ${range.last + 1} on this machine, so no Chrome render can be sandboxed`);
}

/** Where a job's search starts: a pair picked by its id. */
export function jobPortStart(jobId: string): number {
  const count = Math.floor((JOB_PORTS.last - JOB_PORTS.first) / 2) + 1;
  const index = createHash("sha256").update(jobId).digest().readUInt32BE(0) % count;
  return JOB_PORTS.first + index * 2;
}

/** The pairs this process has handed to jobs that have not ended, by job id. */
const held = new Map<string, number>();
/** The search before this one: each waits for it, so a pair is recorded as held before the next search reads `held`. */
let searching: Promise<unknown> = Promise.resolve();

/** A job's pair: its base, the first free from where its id points that no other running job holds. Held until `releaseJobPorts`. */
export function jobPorts(jobId: string): Promise<number> {
  const search = searching.then(async () => {
    const others = new Set([...held].filter(([id]) => id !== jobId).map(([, base]) => base));
    const base = await freePair(JOB_PORTS, jobPortStart(jobId), others);
    held.set(jobId, base);
    return base;
  });
  searching = search.catch(() => undefined);
  return search;
}

/** The job has ended: its pair is another job's to take. */
export function releaseJobPorts(jobId: string): void {
  held.delete(jobId);
}

/** The ports file a job's setup writes: `{ "base": 47012 }`. Outside every profile's writes, and outside the agent's reach. */
export function portsFile(paths: VideoPaths): string {
  return path.join(paths.job, "ports.json");
}

export async function writePorts(paths: VideoPaths, base: number): Promise<void> {
  await writeFile(portsFile(paths), `${JSON.stringify({ base })}\n`, "utf8");
}

/** The job's base port, from its setup. Throws when setup has not chosen one. */
export function readPorts(paths: VideoPaths): number {
  const parsed = JSON.parse(readFileSync(portsFile(paths), "utf8")) as { base?: unknown };
  if (typeof parsed.base !== "number" || !Number.isInteger(parsed.base) || parsed.base < 1024 || parsed.base > 65534) {
    throw new ProfileError(`${portsFile(paths)} names no port pair`);
  }
  return parsed.base;
}

/** The ports a profile allows, read back from its text: what a test holds to the job's pair. */
export function profilePorts(text: string): number[] {
  return [...text.matchAll(/\(local ip "localhost:(\d+)"\)/g)].map((match) => Number(match[1]));
}
