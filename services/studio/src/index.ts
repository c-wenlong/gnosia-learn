import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createApi } from "./api";
import { CONCURRENCY, HOST, PORT } from "./config";
import { REPO_ROOT, studioHome } from "./paths";
import { Runner } from "./runner";
import { JobStore } from "./store";

/**
 * `npm run studio`: the process.
 *
 * Started on its own and never inside Next (D10). A queue in a dev server dies
 * on every hot reload, and the root `package.json` reserves `services/*` for
 * exactly this: long-lived processes with a lifecycle of their own.
 *
 * The order at start is load, reconcile, listen. Reconcile before listen so the
 * first request cannot see a job that the previous process left `running` and
 * that nothing is running any more.
 */

async function main(): Promise<void> {
  await mkdir(path.join(studioHome(), "jobs"), { recursive: true });

  const store = new JobStore();
  await store.load();
  const runner = new Runner(store);

  const { interrupted, swept } = await runner.reconcile();
  if (interrupted.length > 0) {
    process.stdout.write(
      `marked ${interrupted.length} job${interrupted.length === 1 ? "" : "s"} interrupted: ` +
        `${interrupted.join(", ")}\n` +
        (swept.length > 0 ? `swept ${swept.length} orphaned process(es)\n` : "") +
        `They are listed, not resumed: a Resume button is a person's decision.\n`,
    );
  }

  const server = createApi({ store, runner });
  server.listen(PORT, HOST, () => {
    process.stdout.write(
      `studio on http://${HOST}:${PORT}\n` +
        `  repo      ${REPO_ROOT}\n` +
        `  state     ${studioHome()}\n` +
        `  running   ${CONCURRENCY} job at a time\n`,
    );
  });

  // Pick up anything that was queued when the previous process stopped. A
  // queued job survives a restart by design; it is only in-flight work that
  // does not.
  void runner.kick();

  const shutdown = (signal: string): void => {
    process.stdout.write(`\n${signal}: stopping the running job and closing the browser\n`);
    void runner.drain().finally(() => {
      server.close(() => process.exit(0));
      // A stream that is still open would hold the process forever, and the
      // job has already been told to stop by the time this fires.
      setTimeout(() => process.exit(0), 10_000).unref();
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((error: unknown) => {
  process.stderr.write(`the studio could not start: ${(error as Error).message}\n`);
  process.exit(1);
});
