import "server-only";

import { connect } from "node:net";

import { studioOrigin } from "@/lib/studio";

/** How long the look waits for the runner's port to take the connection. */
export const RUNNER_LOOK_MS = 300;

/**
 * Whether something is listening where the studio's runner should be
 * (`studioOrigin`), for the `(app)` layout to tell the shell before the
 * sidebar asks. Without it the sidebar's first read of the conversations,
 * on every page load with the runner stopped, was a request through
 * `/studio/api/drafts` answered 502, which the browser logs as an error.
 *
 * A TCP connection and nothing more: refused at once when nothing listens,
 * accepted by the kernel at once when something does, however busy the
 * runner is, so it costs the page next to nothing beside the learner read
 * it runs with. A runner that listens and then refuses still answers the
 * reads with its own error, which the shell already says.
 */
export function runnerListening(origin: string = studioOrigin(), timeoutMs: number = RUNNER_LOOK_MS): Promise<boolean> {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: Number(port) });
    const done = (listening: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(listening);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}
