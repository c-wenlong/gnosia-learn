import { createServer, type Server } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { runnerListening } from "./studio-runner";

/**
 * The layout's look at the runner's port: true when something takes the
 * connection, false when nothing listens, and false rather than a wait when
 * the connection hangs.
 */

let server: Server | null = null;
afterEach(async () => {
  await new Promise<void>((resolve) => (server === null ? resolve() : server.close(() => resolve())));
  server = null;
});

function listen(): Promise<number> {
  server = createServer((socket) => socket.end());
  return new Promise((resolve) => server!.listen(0, "127.0.0.1", () => resolve((server!.address() as { port: number }).port)));
}

describe("runnerListening", () => {
  it("is true when something listens on the runner's port", async () => {
    const port = await listen();
    expect(await runnerListening(`http://127.0.0.1:${port}`)).toBe(true);
  });

  it("is false when nothing does", async () => {
    const port = await listen();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    expect(await runnerListening(`http://127.0.0.1:${port}`)).toBe(false);
  });

  it("gives up within its limit on an address that never answers", async () => {
    const started = Date.now();
    // A non-routable address: the connection neither opens nor is refused.
    expect(await runnerListening("http://10.255.255.1:7250", 50)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
