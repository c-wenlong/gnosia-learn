import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrations";
import { readReviews, upsertReview } from "../src/state";
import { createScratchDatabase, markImported, probe, type Scratch } from "./scratch-database";
import { seedContent, TOPIC_SLUG } from "./state-fixture";

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

    it("review grade", async () => {
      // Pinned because the grade moved into `state/review.ts` so the web app's
      // `POST /api/review/grade` runs the same code: the shape must not move
      // with it. A first review at grade 4 is SM-2's one-day step, the ease
      // untouched, and a correct answer at the 0.25 prior. `pL` is printed
      // unrounded, float noise and all, which is part of the shape too.
      expect(stamp(await json("review", "grade", "--concept", "alpha", "--grade", "4"))).toEqual({
        concept: "alpha",
        grade: 4,
        due: "<instant>",
        intervalDays: 1,
        ease: 2.5,
        lapses: 0,
        leech: false,
        pL: 0.6599999999999999,
      });
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

  describe("diagram", () => {
    // `learn diagram` is `catalog diagram` under the plugin's name, attributed
    // to the agent that runs it. The checkouts go under a temp STUDIO_HOME and
    // the blobs under the temp SELF_LEARN_HOME vitest.setup.ts points at, so
    // neither the real studio's work directory nor ~/.self-learn is touched.
    let studioHome: string;

    beforeAll(async () => {
      studioHome = await mkdtemp(path.join(tmpdir(), "learn-cli-studio-"));
      // The files still own diagrams here, so a put writes them through
      // (D17) under the tree this database imported diagrams from.
      await markImported(scratch.db, "diagrams", root);
    });

    afterAll(async () => {
      if (studioHome !== undefined) await rm(studioHome, { recursive: true, force: true });
    });

    async function diagram(...args: string[]) {
      const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", ENTRY, "diagram", ...args, "--json"], {
        env: { ...process.env, LEARN_ROOT: root, DATABASE_URL: scratch.url, STUDIO_HOME: studioHome },
      });
      return JSON.parse(stdout) as Record<string, unknown>;
    }

    const document = JSON.stringify({
      tldrawFileFormatVersion: 1,
      schema: { schemaVersion: 2 },
      records: [
        { typeName: "shape", id: "shape:a", type: "geo", x: 0, y: 0, props: { w: 100, h: 50 } },
        {
          typeName: "document",
          id: "document:document",
          gridSize: 10,
          name: "",
          meta: { tldrawkc: { kc: 1, topic: TOPIC_SLUG, title: "Alpha, drawn", concepts: ["alpha"] } },
        },
        { typeName: "page", id: "page:page", name: "Page 1", index: "a1", meta: {} },
      ],
    });

    it("draws in the checkout it prints and commits it as the diagram-maker agent", async () => {
      const checkout = await diagram("checkout", "alpha");
      expect(checkout).toMatchObject({ ok: true, exists: false, path: path.join(studioHome, "work", "alpha.tldr") });
      await writeFile(checkout.path as string, document);
      const committed = await diagram("commit", "alpha", "--reason", "Draw alpha");
      expect(committed).toMatchObject({ ok: true, changed: true, topic: TOPIC_SLUG, concepts: ["alpha"] });
      const rows = await scratch.db.execute<{ author: string; author_kind: string }>(
        "select author, author_kind from content_revision where entity_type = 'diagram' and entity_id = 'alpha'",
      );
      expect(rows.rows).toEqual([{ author: "diagram-maker", author_kind: "agent" }]);
    });

    it("stores an SVG drawn without the canvas, and refuses one for a slug that has a document", async () => {
      const svg = path.join(studioHome, "beta.svg");
      await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
      const put = await diagram("put", "--slug", "beta", "--svg", svg, "--topic", TOPIC_SLUG, "--concept", "beta", "--reason", "By hand");
      expect(put).toMatchObject({ ok: true, changed: true, concepts: ["beta"] });
      const refused = await diagram("put", "--slug", "alpha", "--svg", svg, "--topic", TOPIC_SLUG, "--reason", "By hand").catch(
        (error: { stdout: string; code: number }) => ({ ...(JSON.parse(error.stdout) as object), exit: error.code }),
      );
      expect(refused).toMatchObject({ ok: false, exit: 1 });
    });

    it("exits 3 when the database is down, as catalog diagram does", async () => {
      const failed = await execFileAsync(process.execPath, ["--import", "tsx", ENTRY, "diagram", "list", "--json"], {
        env: { ...process.env, LEARN_ROOT: root, DATABASE_URL: unreachableUrl(), STUDIO_HOME: studioHome },
      }).catch((error: { code: number; stdout: string }) => error);
      expect((failed as { code: number }).code).toBe(3);
      expect(JSON.parse((failed as { stdout: string }).stdout)).toMatchObject({ ok: false });
    });
  });

  describe("files the CLI still owns", () => {
    it("concept add writes a note and warns it is not in the catalog", async () => {
      const { stdout } = await learn("concept", "add", "--title", "Widgets", "--domain", "fixtures");
      expect(stdout).toContain("learn/concepts/fixtures/widgets.md");
      expect(stdout).toContain("maps.concepts");
      await rm(path.join(root, "learn", "concepts", "fixtures", "widgets.md"), { force: true });
    });

    it("doctor calls a note an orphan only when it has no edge of either kind", async () => {
      // `background` has an outgoing `assumes` edge and nothing else, and
      // `basis` only an incoming one (nothing requires it); the doc tells
      // authors to prefer that kind when in doubt, so neither direction may
      // be the thing the orphan warning fires on. `solo` has no edge at all.
      const dir = path.join(root, "learn", "concepts", "fixtures");
      const fixtures = {
        basis: "---\nid: basis\ntitle: Basis\n---\n\n# Basis\n",
        background: "---\nid: background\ntitle: Background\nassumes: [basis]\n---\n\n# Background\n",
        solo: "---\nid: solo\ntitle: Solo\n---\n\n# Solo\n",
      };
      for (const [id, body] of Object.entries(fixtures)) await writeFile(path.join(dir, `${id}.md`), body, "utf8");
      try {
        const { stdout } = await learn("doctor", "--json").catch((error: { stdout: string }) => error);
        const report = JSON.parse(stdout) as { problems: { kind: string; message: string }[] };
        const orphans = report.problems.filter((p) => p.kind === "orphan").map((p) => p.message);
        expect(orphans).toEqual(["solo is connected to nothing — is a prerequisite missing?"]);
      } finally {
        for (const id of Object.keys(fixtures)) await rm(path.join(dir, `${id}.md`), { force: true });
      }
    });

    it("map prints the map, and writes a file only when --out names one", async () => {
      const { stdout } = await learn("map");
      expect(stdout).toContain("# Knowledge Map");
      await expect(readFile(path.join(root, "learn", "map.md"), "utf8")).rejects.toThrow(/ENOENT/);
      await learn("map", "--out", path.join(root, "out", "map.md"));
      const map = await readFile(path.join(root, "out", "map.md"), "utf8");
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

    it("checks a note out to a work copy and commits it back to its file, refusing a moved one", async () => {
      const note = path.join(root, "learn", "concepts", "fixtures", "beta.md");
      const original = await readFile(note, "utf8");
      try {
        const checkout = await json<{ id: string; path: string; revision: number | null }>(
          "concept", "checkout", "beta",
        );
        expect(checkout).toEqual({ id: "beta", path: path.join(root, "work", "concepts", "beta.md"), revision: null });
        expect(await readFile(checkout.path, "utf8")).toBe(original);

        await writeFile(checkout.path, `${original}\nA line the session added.\n`, "utf8");
        // This fixture has no vocabulary, so the index after the write refuses,
        // and says the file was written anyway.
        const committed = await learn("concept", "commit", "beta", "--reason", "add a line").catch(
          (error: { stderr: string }) => error,
        );
        expect(committed.stderr).toContain("was written, but it is not in the catalog");
        expect(await readFile(note, "utf8")).toContain("A line the session added.");

        // A second checkout of an uncommitted copy is refused rather than lost,
        // and so is one whose sidecar is gone, since nothing vouches for it.
        await writeFile(checkout.path, "---\nid: beta\n---\n\nedited again\n", "utf8");
        const again = await learn("concept", "checkout", "beta").catch((error: { stderr: string }) => error);
        expect(again.stderr).toMatch(/has edits no commit has taken/);
        const sidecar = path.join(root, "work", "concepts", "beta.checkout.json");
        const kept = await readFile(sidecar, "utf8");
        await rm(sidecar);
        const orphan = await learn("concept", "checkout", "beta").catch((error: { stderr: string }) => error);
        expect(orphan.stderr).toMatch(/has edits no commit has taken/);
        await writeFile(sidecar, kept, "utf8");

        // A copy checked out from another knowledge base is not committed here.
        await writeFile(sidecar, kept.replace(/"from": "[^"]*"/, '"from": "/elsewhere postgres://elsewhere/db"'), "utf8");
        const foreign = await learn("concept", "commit", "beta", "--reason", "wrong place").catch(
          (error: { stderr: string }) => error,
        );
        expect(foreign.stderr).toMatch(/was checked out from \/elsewhere/);
        await writeFile(sidecar, kept, "utf8");

        // A damaged opening fence is refused on the file branch too, not
        // written with the id filled back in and the frontmatter gone.
        const before = await readFile(note, "utf8");
        await writeFile(checkout.path, "--\nid: beta\ntitle: Beta\n---\n\nfence damaged\n", "utf8");
        const damaged = await learn("concept", "commit", "beta", "--reason", "damaged").catch(
          (error: { stderr: string }) => error,
        );
        expect(damaged.stderr).toMatch(/work\/concepts\/beta\.md has no frontmatter that parses/);
        expect(await readFile(note, "utf8")).toBe(before);
        await writeFile(checkout.path, "---\nid: beta\n---\n\nedited again\n", "utf8");

        // The note moved under the copy: the commit is refused and the file kept.
        await writeFile(note, `${original}\nSomeone else's edit.\n`, "utf8");
        const moved = await learn("concept", "commit", "beta", "--reason", "late").catch(
          (error: { stderr: string }) => error,
        );
        expect(moved.stderr).toMatch(/has changed since it was checked out/);
        expect(await readFile(note, "utf8")).toContain("Someone else's edit.");
      } finally {
        await writeFile(note, original, "utf8");
        await rm(path.join(root, "work"), { recursive: true, force: true });
      }
    });
  });

  /** A port nothing is listening on, for the "database is down" paths. */
  function unreachableUrl(): string {
    const url = new URL(scratch.url);
    url.port = "59999";
    return url.toString();
  }
});
