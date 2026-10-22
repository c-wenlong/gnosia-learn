import { mkdir } from "node:fs/promises";
import path from "node:path";

import { agentSettingsView, createApi } from "./api";
import type { SpendEntry } from "./cost";
import { Drafts } from "./drafts/drafts";
import { agentAuthReport, CONCURRENCY, HOST, PORT } from "./config";
import { ManualSource } from "./manual/source";
import { Mirrors } from "./canvas/mirrors";
import { HealthProbes } from "./probes/health-probes";
import { Listings } from "./probes/listings";
import { DraftPruner } from "./drafts/prune";
import { REPO_ROOT, studioHome } from "./paths";
import { Runner } from "./diagram/runner";
import { JobStore, RecordStore } from "./data/store";
import { backendFor, backendTools } from "./video/backend";
import { VideoDoctor } from "./video/doctor";
import { DEFAULT_VIDEO_TOOL, type VideoToolName } from "./video/tools";
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

/** How long shutdown waits for the drafts' in-flight writes before it moves on. */
const DRAFTS_DRAIN_MS = 10_000;

/**
 * How long shutdown waits for a video doctor check already in flight. Its
 * sandboxed steps carry timeouts of their own, so a run past this is left to
 * the process exit rather than held: the check spawns real renders, and the
 * orphan risk it bounds is the same one a plain stop always carried.
 */
const DOCTOR_DRAIN_MS = 30_000;

/**
 * `work`, or a note on stderr once `ms` has passed without it. The timer is
 * unref'd and cleared, so it neither holds the process open nor fires late.
 */
async function within(work: Promise<void>, ms: number, what: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      process.stderr.write(`shutdown: stopped waiting for ${what} after ${ms / 1_000}s\n`);
      resolve();
    }, ms);
    timer.unref();
  });
  try {
    await Promise.race([work.catch(() => undefined), late]);
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  // A SIGINT or SIGTERM can land before the components `shutdown` drains
  // exist: the handler is registered at the end of startup today, and a
  // signal arriving earlier kills the process mid-refresh — no drain, and
  // a doctor or manual-check Chromium orphaned on the machine. Until `stop`
  // points at the real drain the handler only records the signal, so the
  // phase in flight finishes its bounded work first; a second signal is
  // the impatient quit and exits outright. The replay runs below where
  // every component exists.
  let asked: string | null = null;
  let stop: ((signal: string) => void) | null = null;
  const onSignal = (signal: string): void => {
    if (stop !== null) {
      stop(signal);
      return;
    }
    if (asked !== null) process.exit(1);
    asked = signal;
    process.stdout.write(`\n${signal}: finishing the startup phase in flight, then draining\n`);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

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

  // The video runner (D43 of docs/STUDIO-VIDEOS.md): its own store over the
  // same jobs/ directory (each loads only its own kind), its own queue, and
  // the one daily cap both runners and the planner count against. Its doctor
  // runs now and every ten minutes, not awaited: until the first answer, a
  // video brief is refused with 503, and nothing renders unsandboxed ever.
  const videoStore = new RecordStore<VideoJobRecord>("video");
  await videoStore.load();
  // One doctor per backend (D75 of docs/STUDIO-VIDEO-TOOLS.md): a tool is
  // offered and pressed only on its own doctor's verdict.
  const videoDoctor = new VideoDoctor(() => backendFor(DEFAULT_VIDEO_TOOL).doctor());
  const otherDoctors = Object.fromEntries(
    backendTools()
      .filter((tool) => tool !== DEFAULT_VIDEO_TOOL)
      .map((tool) => [tool, new VideoDoctor(() => backendFor(tool).doctor())]),
  ) as Partial<Record<VideoToolName, VideoDoctor>>;
  const videoRunner: VideoRunner = new VideoRunner(videoStore, {
    doctor: videoDoctor,
    doctors: otherDoctors,
    // Read at each cap check, by which time `drafts` below exists.
    otherSpend: (): SpendEntry[] => [...store.list(), ...drafts.spendEntries()],
  });
  runner.otherJobSpend = () => videoStore.list();
  const videoReconciled = await videoRunner.reconcile();
  if (videoReconciled.interrupted.length > 0) {
    process.stdout.write(`marked ${videoReconciled.interrupted.length} video job(s) interrupted: ${videoReconciled.interrupted.join(", ")}\n`);
  }

  // Drafts after both runners' jobs: a draft follows each kind's newest job,
  // so the job records are in memory first. An interrupted turn is written
  // down as cut off (C1) and nothing is resent by itself.
  const drafts: Drafts = new Drafts(store, runner, { store: videoStore, runner: videoRunner });
  await drafts.load();
  const cut = await drafts.reconcile();
  if (cut.length > 0) {
    process.stdout.write(`marked ${cut.length} planner turn${cut.length === 1 ? "" : "s"} cut off: ${cut.join(", ")}\n`);
  }
  // The runners' reconciles ran before any draft was listening, so each
  // draft is brought up to its newest jobs here, an interrupted one included.
  await drafts.syncFromJobs();
  runner.extraSpend = () => drafts.spendEntries();
  // One after the other, so two fixture renders never compete for the cores.
  // Skipped when a stop was already asked for: a doctor check spawns real
  // renders, and one launched now would only race the drain it never sees.
  if (asked === null) {
    void (async () => {
      for (const [tool, doctor] of [[DEFAULT_VIDEO_TOOL, videoDoctor] as const, ...(Object.entries(otherDoctors) as [VideoToolName, VideoDoctor][])]) {
        // Rechecked per doctor: a stop that lands while one check runs must
        // not let the loop open the next tool's check past the drain.
        if (asked !== null) break;
        const report = await doctor.report(true);
        const name = tool === DEFAULT_VIDEO_TOOL ? "video doctor" : `${tool} video doctor`;
        process.stdout.write(report.ok ? `${name}: every check passed\n` : `${name}: ${report.checks.filter((check) => !check.ok).map((check) => `${check.name}: ${check.detail}`).join("; ")}\n`);
        void videoRunner.kick();
      }
    })();
    videoDoctor.start();
    for (const doctor of Object.values(otherDoctors)) doctor?.start();
  }

  // D40: a draft untouched for seven days goes, row and workspace, unless a
  // job names it. After the job records are loaded and every draft follows
  // its jobs, and not awaited: a pass asks the catalog, and the first request
  // should not wait on it. With Postgres down the pass prunes nothing.
  const pruner = new DraftPruner(drafts, store);

  const mirrors = new Mirrors();
  runner.canvasOpen = (target) => mirrors.isOpen(target);
  // What /api/health reports on, checked now and not awaited, so the first
  // health call finds answers and no call after it waits on a subprocess.
  const probes = new HealthProbes();
  probes.warm();
  probes.settingsView(agentSettingsView).warm();
  const listings = new Listings();
  listings.warm();
  const server = createApi({ store, runner, mirrors, drafts, video: { store: videoStore, runner: videoRunner, doctor: videoDoctor }, probes, listings });
  server.listen(PORT, HOST, () => {
    // The bind callback can fire after a replayed stop has already begun
    // closing things: a "studio on" line inside the shutdown is a lie.
    if (asked !== null) return;
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
  // does not. Skipped when a stop was already asked for: a runner told to
  // die during startup does not kick work it would only drain again.
  if (asked === null) {
    void runner.kick();
    pruner.start();
  }

  const shutdown = (signal: string): void => {
    process.stdout.write(`\n${signal}: stopping the running job and closing the browser\n`);
    // Mirrors first and unconditionally: each one is a `serve` holding a port,
    // and a studio that exits leaving them behind makes the next start pick a
    // fallback port for a document that is not open anywhere.
    void mirrors
      .stopAll()
      .then(() => manual.drain())
      .then(() => pruner.drain())
      // Bounded: it waits for any catalog read a create started, which has a
      // two-minute timeout of its own, and the exit timer below is only set
      // once every drain has returned.
      .then(() => within(drafts.drain(), DRAFTS_DRAIN_MS, "the drafts' last writes"))
      .then(() => runner.drain())
      // The doctors' drains, not just their timers: `stop()` alone leaves a
      // check already in flight spawning renders past the process's exit.
      .then(() =>
        within(
          Promise.all([videoDoctor, ...Object.values(otherDoctors)].map((doctor) => doctor?.drain() ?? Promise.resolve())).then(() => undefined),
          DOCTOR_DRAIN_MS,
          "the video doctors' checks",
        ),
      )
      .then(() => videoRunner.drain())
      .finally(() => {
        server.close(() => process.exit(0));
        // A stream that is still open would hold the process forever, and the
        // job has already been told to stop by the time this fires.
        setTimeout(() => process.exit(0), 10_000).unref();
      });
  };
  // Every drainable component exists now: the handler installed at the top
  // hands signals here, and a signal it recorded during startup is replayed
  // through the real drain rather than having killed the process outright.
  stop = shutdown;
  if (asked !== null) shutdown(asked);
}

void main().catch((error: unknown) => {
  process.stderr.write(`the studio could not start: ${(error as Error).message}\n`);
  process.exit(1);
});
