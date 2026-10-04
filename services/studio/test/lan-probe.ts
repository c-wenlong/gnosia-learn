import { connect } from "node:net";
import { networkInterfaces } from "node:os";

/**
 * Whether a render's server can be reached from the network, watched while
 * the render runs.
 *
 * A port test that binds and connects on 127.0.0.1 passes for a server that
 * also takes connections from the LAN, and a Seatbelt `localhost:P` rule
 * allows a listen on `::`, which LAN connections then reach (measured on
 * macOS 26). So the real-sandbox suites watch the job's ports during a real
 * still and build: each time the server answers on loopback, which proves it
 * is up, the same port is tried on the machine's own non-loopback address.
 */

/** The machine's first non-loopback IPv4 address, or null when it has none (no network, or only link-local). */
export function lanAddress(): string | null {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4" || entry.address.startsWith("169.254.")) continue;
      return entry.address;
    }
  }
  return null;
}

function reaches(host: string, port: number, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export interface PortWatch {
  /** Stops watching, and says how often a port answered on loopback and which ports the LAN address reached. */
  stop(): Promise<{ loopbackUp: number; lanReached: number[] }>;
}

/** Watch `ports` until stopped: on each loopback answer, try the LAN address too. */
export function watchPorts(ports: readonly number[], lan: string): PortWatch {
  let stopped = false;
  let loopbackUp = 0;
  const lanReached = new Set<number>();
  const loop = (async () => {
    while (!stopped) {
      for (const port of ports) {
        // Vite's "localhost" may be either family; Remotion's server, once moved, is 127.0.0.1.
        if ((await reaches("127.0.0.1", port)) || (await reaches("::1", port))) {
          loopbackUp += 1;
          if (await reaches(lan, port)) lanReached.add(port);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  })();
  return {
    async stop() {
      stopped = true;
      await loop;
      return { loopbackUp, lanReached: [...lanReached].sort((a, b) => a - b) };
    },
  };
}
