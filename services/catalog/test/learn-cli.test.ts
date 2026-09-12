import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrations";
import { readReviews, upsertReview } from "../src/state";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";
import { seedContent } from "./state-fixture";

/**
 * The `learn` CLI, end to end, against a scratch database and a temporary
 * knowledge base.
 *
 * This replaces `scripts/learn/cli.test.mjs`, which copied the pipeline into a
 * temp directory to get a temp `learn/` for free — a trick that stops working
 * when the state is a database rather than files beside the code. The CLI takes
 * `LEARN_ROOT` for the files and `DATABASE_URL` for the rest, so a run here can
 * touch neither the real `learn/` nor the real `self_learn`.
 *
 * **The `--json` shapes are a contract.** The `/learn` and `/review` skills
 * live in a plugin outside this repo and parse them, and `learn/README.md`
 * documents them. The five pinned below are the five those skills actually
 * read. Everything that varies with the clock is replaced by a marker rather
 * than loosened to `expect.any`, so a field that stops being a timestamp is
 * still a failure.
 */

const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, "..", "src", "learn", "cli.ts");

const reachable = await probe();

/** ISO instants, so a golden can be written down. */
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
function stamp(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).replace(ISO, "<instant>"));
}

describe.skipIf(!reachable.ok)("learn CLI", () => {
  let scratch: Scratch;
  let root: string;

  async function learn(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: {
        ...process.env,
        LEARN_ROOT: root,
        DATABASE_URL: scratch.url,
      },
    });
  }

  async function json<T = unknown>(...args: string[]): Promise<T> {
    const { stdout } = await learn(...args, "--json");
    return JSON.parse(stdout) as T;
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await seedContent(scratch.db);

    root = await mkdtemp(path.join(tmpdir(), "learn-cli-"));
    await mkdir(path.join(root, "learn", "concepts", "fixtures"), { recursive: true });
    // The notes have to agree with the seeded rows: the graph comes from the
    // files and the mastery from the tables, and the CLI joins them by id.
    const notes: Record<string, string> = {
      alpha: "---\nid: alpha\ntitle: Alpha\nsummary: The first one.\n---\n\n# Alpha\n",
      beta: "---\nid: beta\ntitle: Beta\nrequires: [alpha]\n---\n\n# Beta\n",
      gamma: "---\nid: gamma\ntitle: Gamma\nrequires: [beta]\n---\n\n# Gamma\n",
    };
    for (const [slug, body] of Object.entries(notes)) {
      await writeFile(path.join(root, "learn", "concepts", "fixtures", `${slug}.md`), body, "utf8");
    }
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await scratch.db.execute(
      "alter table event disable trigger event_no_update; " +
        "alter table event disable trigger event_no_delete; " +
        "truncate event, mastery, review, progress, recap, preference; " +
        "alter table event enable trigger event_no_update; " +
        "alter table event enable trigger event_no_delete;",
    );
  });

  describe("the pinned --json shapes", () => {
    it("status", async () => {
      expect(await json("status")).toEqual({
        stats: { total: 3, mastered: 0, learning: 0, untouched: 3 },
        due: 0,
        frontier: [{ id: "alpha", title: "Alpha", pL: 0.25, requires: [] }],
        sessions: 0,
      });
    });

    it("frontier", async () => {
      expect(await json("frontier")).toEqual([
        { id: "alpha", title: "Alpha", pL: 0.25, requires: [] },
      ]);
    });

    it("plan", async () => {
      expect(await json("plan", "--goal", "gamma")).toEqual({
        goal: "gamma",
        steps: [
          { id: "alpha", title: "Alpha", pL: 0.25, mastered: false, gap: true, requires: [] },
          { id: "beta", title: "Beta", pL: 0.25, mastered: false, gap: true, requires: ["alpha"] },
          { id: "gamma", title: "Gamma", pL: 0.25, mastered: false, gap: true, requires: ["beta"] },
        ],
        incomplete: false,
        skipped: 0,
      });
    });

    it("observe", async () => {
      const result = await json("observe", "--concept", "gamma", "--correct", "true");
      expect(stamp(result)).toEqual({
        concept: "gamma",
        correct: true,
        pLBefore: 0.25,
        pLAfter: 0.6,
        delta: 0.35,
        mastery: "shaky",
        mastered: false,
        due: "<instant>",
        logged: false,
        propagated: [
          { concept: "beta", hops: 1, pLBefore: 0.25, pLAfter: 0.39 },
          { concept: "alpha", hops: 2, pLBefore: 0.25, pLAfter: 0.306 },
        ],
      });
    });

    it("review due", async () => {
      // Seeded rather than observed: `observe` schedules the first sighting a
      // day out, so nothing the CLI can do in one run is due yet.
      await upsertReview(scratch.db, {
        conceptId: "alpha",
        repetitions: 1,
        ease: 2.5,
        intervalDays: 1,
        lapses: 0,
        due: "2026-01-01T00:00:00.000Z",
        lastReviewed: "2025-12-31T00:00:00.000Z",
        leech: false,
        history: [],
      });
      expect(stamp(await json("review", "due"))).toEqual([
        {
          id: "alpha",
          title: "Alpha",
          due: "<instant>",
          intervalDays: 1,
          lapses: 0,
          leech: false,
          checks: [],
        },
      ]);
    });
  });

  describe("the loop", () => {
    it("records an observation as an event, a mastery row and a card", async () => {
      await learn("observe", "--concept", "alpha", "--correct", "true", "--source", "teach");

      const model = await json<{ concepts: { id: string; observations?: number }[] }>("model");
      expect(model.concepts.find((c) => c.id === "alpha")?.observations).toBe(1);

      const { rows } = await scratch.db.execute<{ type: string; concept_slug: string }>(
        "select type, concept_slug from event",
      );
      expect(rows).toEqual([{ type: "observation", concept_slug: "alpha" }]);
      // Scheduled a day out, which is why this reads the table rather than
      // asking `review due`.
      expect(Object.keys((await readReviews(scratch.db)).cards)).toEqual(["alpha"]);
    });

    it("void plus model --rebuild drops the evidence and keeps the log", async () => {
      for (let i = 0; i < 3; i += 1) {
        await learn(
          "observe", "--concept", "alpha", "--correct", "true",
          "--source", "probe", "--session", "s1",
        );
      }
      const before = await json<{ concepts: { id: string; pL: number }[] }>("model");
      expect(before.concepts.find((c) => c.id === "alpha")?.pL).toBeGreaterThan(0.9);

      await learn("void", "--session", "s1", "--reason", "answer was always first");
      await learn("model", "--rebuild");

      const after = await json<{ concepts: { id: string; observations?: number }[] }>("model");
      expect(after.concepts.find((c) => c.id === "alpha")?.observations).toBeUndefined();

      // The observations are retained for audit, alongside the void marker.
      const { rows } = await scratch.db.execute<{ type: string; n: number }>(
        "select type, count(*)::int as n from event group by type order by type",
      );
      expect(rows).toEqual([
        { type: "observation", n: 3 },
        { type: "void", n: 1 },
      ]);
    });

    it("review rebuild reproduces the schedule the writes produced", async () => {
      await learn("observe", "--concept", "alpha", "--correct", "true");
      await learn("observe", "--concept", "beta", "--correct", "false");
      await learn("review", "grade", "--concept", "alpha", "--grade", "5");

      const before = (await readReviews(scratch.db)).cards;
      await learn("review", "rebuild");
      const after = (await readReviews(scratch.db)).cards;

      // Exact, not approximate: one clock per write is what makes the replay
      // land on the same due dates rather than a few milliseconds off.
      expect(after).toEqual(before);
    });

    it("--schedule false is remembered, so a rebuild does not invent a card", async () => {
      await learn("observe", "--concept", "alpha", "--correct", "true", "--schedule", "false");
      expect((await readReviews(scratch.db)).cards).toEqual({});
      await learn("review", "rebuild");
      expect((await readReviews(scratch.db)).cards).toEqual({});
    });

    it("writes the exchange into the session log as Obsidian callouts", async () => {
      await learn("session", "start", "--id", "s1", "--topic", "vector calculus");
      await learn(
        "observe", "--concept", "alpha", "--correct", "true",
        "--source", "probe", "--session", "s1",
        "--question", "What does $\\nabla \\cdot \\mathbf{F}$ measure?",
        "--options", "Circulation per unit area|Net outward flux per unit volume",
        "--chosen", "2. Net outward flux per unit volume",
        "--answer", "2",
        "--note", "it is a density, so per unit volume",
      );

      const log = await readFile(path.join(root, "learn", "sessions", "s1.md"), "utf8");
      expect(log).toContain("> [!question] Quiz");
      expect(log).toContain("> [!success] Correct");
      expect(log).toContain("**In your words:** it is a density");
      // LaTeX must survive untouched for Obsidian to render it.
      expect(log).toContain("$\\nabla \\cdot \\mathbf{F}$");
    });

    it("session close links every concept back and reports the frontier", async () => {
      await learn("session", "start", "--id", "s2", "--topic", "alpha");
      await learn("observe", "--concept", "alpha", "--correct", "true", "--session", "s2");

      const result = await json<{ concepts: string[]; linked: string[]; unchecked: string[] }>(
        "session", "close", "--id", "s2",
      );
      expect(result.concepts).toEqual(["alpha"]);
      expect(result.linked).toEqual(["alpha"]);
      // Scheduled with no stored check: the warning /review depends on.
      expect(result.unchecked).toEqual(["alpha"]);

      const note = await readFile(
        path.join(root, "learn", "concepts", "fixtures", "alpha.md"),
        "utf8",
      );
      expect(note).toContain("s2");
    });
  });

  describe("refusals", () => {
    it("will not record evidence about a concept the catalog has never seen", async () => {
      await writeFile(
        path.join(root, "learn", "concepts", "fixtures", "delta.md"),
        "---\nid: delta\ntitle: Delta\n---\n\n# Delta\n",
        "utf8",
      );
      try {
        await expect(learn("observe", "--concept", "delta", "--correct", "true")).rejects.toThrow(
          /no concept in the catalog for "delta"/,
        );
      } finally {
        await rm(path.join(root, "learn", "concepts", "fixtures", "delta.md"), { force: true });
      }
    });

    it("doctor reports an unmigrated database as an error", async () => {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--import", "tsx", ENTRY, "doctor", "--json"],
        {
          env: { ...process.env, LEARN_ROOT: root, DATABASE_URL: unreachableUrl() },
        },
      ).catch((error: { stdout: string }) => error);

      const report = JSON.parse(stdout) as {
        ok: boolean;
        problems: { kind: string }[];
      };
      expect(report.ok).toBe(false);
      expect(report.problems.map((p) => p.kind)).toContain("database-unreachable");
    });
  });

  describe("files the CLI still owns", () => {
    it("concept add writes a note and warns it is not in the catalog", async () => {
      const { stdout } = await learn("concept", "add", "--title", "Widgets", "--domain", "fixtures");
      expect(stdout).toContain("learn/concepts/fixtures/widgets.md");
      expect(stdout).toContain("maps.concepts");
      await rm(path.join(root, "learn", "concepts", "fixtures", "widgets.md"), { force: true });
    });

    it("map writes learn/map.md", async () => {
      await learn("map");
      const map = await readFile(path.join(root, "learn", "map.md"), "utf8");
      expect(map).toContain("# Knowledge Map");
      expect(map).toContain("Alpha");
    });

    it("check add stores the question in the note", async () => {
      await learn(
        "check", "add", "--concept", "alpha",
        "--question", "What is alpha?", "--answer", "The first one.",
      );
      const checks = await json<{ concept: string }[]>("check", "list", "--concept", "alpha");
      expect(checks).toHaveLength(1);
      // Left in place: the file is the fixture, and the next test wants it gone.
      await writeFile(
        path.join(root, "learn", "concepts", "fixtures", "alpha.md"),
        "---\nid: alpha\ntitle: Alpha\nsummary: The first one.\n---\n\n# Alpha\n",
        "utf8",
      );
    });
  });

  /** A port nothing is listening on, for the "database is down" paths. */
  function unreachableUrl(): string {
    const url = new URL(scratch.url);
    url.port = "59999";
    return url.toString();
  }
});
