import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createApi } from "./api";
import { Drafts } from "./drafts";
import { agentAuthReport, CONCURRENCY, HOST, PORT } from "./config";
import { ManualSource } from "./manual/source";
import { Mirrors } from "./mirrors";
import { DraftPruner } from "./prune";
import { REPO_ROOT, studioHome } from "./paths";
import { Runner } from "./runner";
import { JobStore, RecordStore } from "./store";
import { VideoDoctor } from "./video/doctor";
import { VideoRunner } from "./video/runner";
import type { VideoJobRecord } from "./video/types";

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

  // The tldraw manual, built from the installed tool before anything can
  // start a job, and checked: its three worked snippets run after each new
  // build, whenever no job is running or queued (M3). A refresh never throws:
  // a tool that cannot answer, or a manual that cannot be written, leaves the
  // studio running without one and says so in /api/health.
  const manual = new ManualSource({
    checkSnippets: true,
    isIdle: () => runner.busy === 0 && store.list({ state: "queued" }).length === 0,
  });
  runner.manual = manual;
  const built = await manual.refresh().catch(() => null);
  manual.start();
  process.stdout.write(
    built === null
      ? `no tldraw manual: ${manual.status().error ?? "canvas api did not answer"}\n`
      : `tldraw manual ${built.hash.slice(0, 12)}: ${built.chars} characters, ${built.helpers} helpers, ` +
          `options ${built.optionsSource}\n`,
  );

  const { interrupted, swept } = await runner.reconcile();
  if (interrupted.length > 0) {
    process.stdout.write(
      `marked ${interrupted.length} job${interrupted.length === 1 ? "" : "s"} interrupted: ` +
        `${interrupted.join(", ")}\n` +
        (swept.length > 0 ? `swept ${swept.length} orphaned process(es)\n` : "") +
        `They are listed, not resumed: a Resume button is a person's decision.\n`,
    );
  }

  // Drafts after jobs: a draft follows its newest job, so the job records are
  // in memory first. An interrupted turn is written down as cut off (C1) and
  // nothing is resent by itself.
  const drafts = new Drafts(store, runner);
  await drafts.load();
  const cut = await drafts.reconcile();
  if (cut.length > 0) {
    process.stdout.write(`marked ${cut.length} planner turn${cut.length === 1 ? "" : "s"} cut off: ${cut.join(", ")}\n`);
  }
  // The runner's reconcile ran before any draft was listening, so each draft
  // is brought up to its newest job here, an interrupted one included.
  await drafts.syncFromJobs();
  runner.extraSpend = () => drafts.spendEntries();

  // The video runner (D43 of docs/STUDIO-VIDEOS.md): its own store over the
  // same jobs/ directory (each loads only its own kind), its own queue, and
  // the one daily cap both runners and the planner count against. Its doctor
  // runs now and every ten minutes, not awaited: until the first answer, a
  // video brief is refused with 503, and nothing renders unsandboxed ever.
  const videoStore = new RecordStore<VideoJobRecord>("video");
  await videoStore.load();
  const videoDoctor = new VideoDoctor();
  const videoRunner = new VideoRunner(videoStore, {
    doctor: videoDoctor,
    otherSpend: () => [...store.list(), ...drafts.spendEntries()],
  });
  runner.otherJobSpend = () => videoStore.list();
  const videoReconciled = await videoRunner.reconcile();
  if (videoReconciled.interrupted.length > 0) {
    process.stdout.write(`marked ${videoReconciled.interrupted.length} video job(s) interrupted: ${videoReconciled.interrupted.join(", ")}\n`);
  }
  void videoDoctor.report(true).then((report) => {
    process.stdout.write(report.ok ? "video doctor: every check passed\n" : `video doctor: ${report.checks.filter((check) => !check.ok).map((check) => `${check.name}: ${check.detail}`).join("; ")}\n`);
    void videoRunner.kick();
  });
  videoDoctor.start();

  // D40: a draft untouched for seven days goes, row and workspace, unless a
  // job names it. After the job records are loaded and every draft follows
  // its jobs, and not awaited: a pass asks the catalog, and the first request
  // should not wait on it. With Postgres down the pass prunes nothing.
  const pruner = new DraftPruner(drafts, store);

  const mirrors = new Mirrors();
  runner.canvasOpen = (target) => mirrors.isOpen(target);
  const server = createApi({ store, runner, mirrors, drafts, video: { store: videoStore, runner: videoRunner, doctor: videoDoctor } });
  server.listen(PORT, HOST, () => {
    process.stdout.write(
      `studio on http://${HOST}:${PORT}\n` +
        `  repo      ${REPO_ROOT}\n` +
        `  state     ${studioHome()}\n` +
        `  running   ${CONCURRENCY} job at a time\n` +
        `  agent     ${agentAuthReport().note}\n`,
    );
  });

  // Pick up anything that was queued when the previous process stopped. A
  // queued job survives a restart by design; it is only in-flight work that
  // does not.
  void runner.kick();
  pruner.start();

  const shutdown = (signal: string): void => {
    process.stdout.write(`\n${signal}: stopping the running job and closing the browser\n`);
    // Mirrors first and unconditionally: each one is a `serve` holding a port,
    // and a studio that exits leaving them behind makes the next start pick a
    // fallback port for a document that is not open anywhere.
    void mirrors
      .stopAll()
      .then(() => manual.drain())
      .then(() => pruner.drain())
      .then(() => drafts.drain())
      .then(() => runner.drain())
      .then(() => {
        videoDoctor.stop();
        return videoRunner.drain();
      })
      .finally(() => {
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
