import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { COMMONS_OWNER, concept, LOCAL_LEARNER_ID, mastery } from "@self-learn/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { flip } from "../src/content/flip";
import { databaseIdentity } from "../src/content/import-root";
import { conceptsIndexer } from "../src/index/concepts";
import { tagsIndexer } from "../src/index/tags";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { ensureLearner } from "../src/state";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `learn concept show --owner`: the studio runner reads a brief's source note
 * as the owner it serves (`STUDIO_OWNER`), where it used to read as the CLI's
 * owner, `local`, whoever the studio was serving.
 *
 * A concept's slug is its primary key, global across owners (D23), so two
 * owners cannot each hold a note under one slug. What an owner filter can get
 * wrong is which slugs answer: the fixture has one note per owner, the studio's
 * (`studio`), another owner's (`other`), the commons' and `local`'s, and asks
 * for each of them as the studio's owner.
 */

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(HERE, "..", "src", "learn", "cli.ts");
const reachable = await probe();

const STUDIO = "studio";
const OTHER = "other";

const NOTES = {
  mine: { owner: STUDIO, body: "The studio owner's note." },
  theirs: { owner: OTHER, body: "Another owner's note." },
  shared: { owner: COMMONS_OWNER, body: "The commons' note." },
  locals: { owner: LOCAL_LEARNER_ID, body: "The local owner's note." },
} as const;

describe.skipIf(!reachable.ok)("learn concept show --owner", () => {
  let scratch: Scratch;
  let fixture: Fixture;

  function learn(args: string[], env: NodeJS.ProcessEnv = {}) {
    return execFileAsync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: { ...process.env, LEARN_ROOT: fixture.root, DATABASE_URL: scratch.url, ...env },
    });
  }
  async function show(slug: string, ...flags: string[]): Promise<Record<string, unknown>> {
    return JSON.parse((await learn(["concept", "show", slug, ...flags, "--json"])).stdout) as Record<string, unknown>;
  }
  async function refused(args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
    return learn(args, env).then(
      (result) => {
        throw new Error(`expected a refusal, got: ${result.stdout}`);
      },
      (error: { stderr: string }) => error.stderr,
    );
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    fixture = await makeFixture();
    const slugs = Object.keys(NOTES);
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "owners", concepts: slugs }]));
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    for (const [slug, { body }] of Object.entries(NOTES)) {
      await fixture.write(`learn/concepts/fixtures/${slug}.md`, note({ id: slug, title: slug, body: `\n# ${slug}\n\n${body}\n` }));
    }
    const context = await fixture.context({ knownConcepts: async () => new Set(slugs) });
    const database = await databaseIdentity(scratch.db);
    for (const indexer of [topicsIndexer, tagsIndexer, conceptsIndexer]) {
      const { rows, logs } = await indexer.read(context);
      await writeSource(scratch.db, indexer, rows, [], indexer.root(context), { logs, metadata: { root: fixture.root, database } });
    }
    // Each note to its owner, before the flip arms the write guards.
    for (const [slug, { owner }] of Object.entries(NOTES)) {
      await ensureLearner(scratch.db, owner);
      await scratch.db.update(concept).set({ ownerId: owner }).where(eq(concept.slug, slug));
    }
    // Mastery on the commons' note for two learners, so the owner's own is the one shown.
    await scratch.db.insert(mastery).values([
      { learnerId: STUDIO, conceptSlug: "shared", pL: 0.9 },
      { learnerId: LOCAL_LEARNER_ID, conceptSlug: "shared", pL: 0.1 },
    ]);
    await flip(scratch.db, { type: "concepts", readers: new Set(["concepts"] as const) });
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
  });

  it("gives the studio's owner their own note", async () => {
    const shown = await show("mine", "--owner", STUDIO);
    expect(shown["id"]).toBe("mine");
    expect(shown["body"]).toContain(NOTES.mine.body);
  });

  it("gives them the commons' note, with their own mastery on it", async () => {
    const shown = await show("shared", "--owner", STUDIO);
    expect(shown["body"]).toContain(NOTES.shared.body);
    expect(shown["pL"]).toBe(0.9);
  });

  it("never gives them another owner's note, local's included", async () => {
    for (const slug of ["theirs", "locals"]) {
      expect(await refused(["concept", "show", slug, "--owner", STUDIO, "--json"])).toContain(`no such concept: ${slug}`);
    }
  });

  it("reads as local without --owner, as the learning plugin always has", async () => {
    const shown = await show("locals");
    expect(shown["body"]).toContain(NOTES.locals.body);
    expect((await show("shared"))["pL"]).toBe(0.1);
    expect(await refused(["concept", "show", "mine", "--json"])).toContain("no such concept: mine");
    // The --json shape is the plugin's contract: the flag changes whose note, not its fields.
    expect(Object.keys(await show("shared", "--owner", STUDIO)).sort()).toEqual(Object.keys(await show("shared")).sort());
  });

  it("refuses an empty owner, and --owner on a command that would ignore it", async () => {
    expect(await refused(["concept", "show", "mine", "--owner", " "])).toContain("--owner cannot be empty");
    expect(await refused(["concept", "list", "--owner", STUDIO])).toContain("--owner is taken by concept show only");
    expect(await refused(["status", "--owner", STUDIO])).toContain("--owner is taken by concept show only");
  });

  it("refuses another owner's read from a tree of files, which has no owners", async () => {
    // Nothing listens on port 1, so the notes are read from LEARN_ROOT's files.
    const stderr = await refused(["concept", "show", "mine", "--owner", STUDIO, "--json"], {
      DATABASE_URL: "postgres://localhost:1/nothing",
    });
    expect(stderr).toMatch(/has no owners/);
  });
});
