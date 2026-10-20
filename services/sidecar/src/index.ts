import { createApi } from "./api";
import { HOST, port } from "./config";
import { tutorDeps } from "./deps";

/**
 * `npm run sidecar`: the process.
 *
 * Started on its own — by the native app when it spawns it later, or by a
 * developer now — and never inside Next. The stdout contract is one line the
 * launcher parses: `listening <port>`, printed only after the socket is
 * bound, so a reader that sees the number can already connect. Everything
 * else about startup goes to stderr.
 */
async function main(): Promise<void> {
  const runtime = tutorDeps();
  const server = createApi(runtime.deps);
  const listenPort = port();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, HOST, () => resolve());
  });

  const bound = server.address();
  const actual = typeof bound === "object" && bound !== null ? bound.port : listenPort;
  // The one line the Swift side parses. Keep it exactly this shape.
  process.stdout.write(`listening ${actual}\n`);

  const shutdown = (signal: string): void => {
    process.stderr.write(`sidecar: ${signal}, closing\n`);
    server.close(() => {
      void runtime.close().finally(() => process.exit(0));
    });
    // A connection that outlives the close call is dropped rather than served forever.
    server.closeAllConnections?.();
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("sidecar: failed to start", error);
  process.exit(1);
});
