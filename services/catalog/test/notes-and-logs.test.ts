import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { fileSource } from "@self-learn/content";
import { session, sessionLogEntry } from "@self-learn/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { renderType } from "../src/content/export";
import { DB_READERS } from "../src/content/flip";
import { dbSource } from "../src/content/source";
import { compare } from "../src/content/parity";
import { readTypeFiles } from "../src/content/layout";
import { noteParityForm, readNote, renderNote } from "../src/content/notes";
import { REPO_ROOT } from "../src/env";
import { conceptsIndexer } from "../src/index/concepts";
import { runIndex } from "../src/index/run";
import { topicsIndexer } from "../src/index/topics";
import { writeSource } from "../src/index/writer";
import { applyMigrations } from "../src/migrations";
import { makeFixture, note, topicsYaml, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * Concept notes and session logs as rows (Track C of
 * docs/CONTENT-MIGRATION.md): a note read into its columns renders back with
 * its body byte for byte, and a log is the concatenation of its entries,
 * which an import only ever appends to.
 *
 * The real notes are read, never written. Fixture trees go under the OS temp
 * directory, and every database is a scratch one.
 */

const reachable = await probe();

async function realNotes(): Promise<{ file: string; text: string }[]> {
  const root = path.join(REPO_ROOT, "learn", "concepts");
  const out: { file: string; text: string }[] = [];
  for (const domain of (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory())) {
    for (const name of (await readdir(path.join(root, domain.name))).filter((n) => n.endsWith(".md")).sort()) {
      const file = `learn/concepts/${domain.name}/${name}`;
      out.push({ file, text: await readFile(path.join(REPO_ROOT, file), "utf8") });
    }
  }
  return out;
}

describe("a note's row renders the note", () => {
  it("keeps every real note's body byte for byte, and its fields through a second round", async () => {
    const notes = await realNotes();
    expect(notes.length).toBeGreaterThan(0);
    let identical = 0;
    for (const { file, text } of notes) {
      const fields = readNote(text, file, path.basename(file, ".md"));
      const rendered = renderNote(fields);
      const again = readNote(rendered, file, path.basename(file, ".md"));
      expect(again, file).toEqual(fields);
      expect(rendered.endsWith(fields.body), file).toBe(true);
      expect(noteParityForm(rendered, file), file).toEqual(noteParityForm(text, file));
      if (rendered === text) identical += 1;
    }
    // Five of the 32 notes of 2026-09-28 lay their frontmatter out otherwise
    // (four write an empty `assumes: []`, one writes `assumes` last); the
    // rest are their own rendering. The body is exact for every one.
    expect(notes.length - identical).toBeLessThanOrEqual(5);
  });

  it("writes the keys in one order, and an empty assumes not at all", () => {
    const fields = readNote(
      "---\ncreated: 2026-08-18T01:45:41.367Z\nassumes: []\ntitle: T\nid: t\nrequires: [a]\ntags: [x, y]\nsources: []\n---\n\n# T\n",
      "t.md",
      "t",
    );
    expect(renderNote(fields)).toBe(
      "---\nid: t\ntitle: T\nrequires: [a]\ntags: [x, y]\nsources: []\ncreated: 2026-08-18T01:45:41.367Z\n---\n\n# T\n",
    );
  });

  it("compares a note in parity by what a row holds, so layout alone is not a mismatch", () => {
    const written = "---\nid: t\ntitle: T\nrequires: []\nassumes: []\ntags: []\nsources: []\n---\n\n# T\n";
    const rendered = renderNote(readNote(written, "t.md", "t"));
    expect(rendered).not.toBe(written);
    const result = compare(
      "concepts",
      [{ path: "learn/concepts/x/t.md", bytes: Buffer.from(rendered) }],
      [{ path: "learn/concepts/x/t.md", bytes: Buffer.from(written) }],
    );
    expect(result.mismatches).toEqual([]);

    // A changed body, or a key no row holds, still is.
    const edited = compare(
      "concepts",
      [{ path: "learn/concepts/x/t.md", bytes: Buffer.from(rendered) }],
      [{ path: "learn/concepts/x/t.md", bytes: Buffer.from(`${written}more\n`) }],
    );
    expect(edited.mismatches).toMatchObject([{ kind: "changed", detail: expect.stringMatching(/^body/) }]);
    const extra = compare(
      "concepts",
      [{ path: "learn/concepts/x/t.md", bytes: Buffer.from(rendered) }],
      [{ path: "learn/concepts/x/t.md", bytes: Buffer.from(written.replace("sources: []", "sources: []\ncolour: red")) }],
    );
    expect(extra.mismatches).toMatchObject([{ kind: "changed", detail: expect.stringMatching(/^unheld/) }]);
  });
});

describe.skipIf(!reachable.ok)("the real notes and logs, imported into a scratch database", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await runIndex(scratch.db, {
      only: ["topics", "tags", "concepts", "courses", "sessions"],
      manimkcRoot: path.join(REPO_ROOT, "no-manimkc-here"),
    });
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("renders every log byte for byte and every note's body exactly, with the prerequisites as rows", async () => {
    for (const type of ["concepts", "sessions"] as const) {
      const result = compare(type, await renderType(scratch.db, type), await readTypeFiles(REPO_ROOT, type));
      expect(result.mismatches, type).toEqual([]);
      if (type === "sessions") expect(result.identicalFiles).toBe(result.files);
      expect(result.counts.expected).toEqual(result.counts.actual);
    }
    const { rows } = await scratch.db.execute<{ n: number }>("select count(*)::int as n from concept_prerequisite");
    const files = compare("concepts", [], await readTypeFiles(REPO_ROOT, "concepts"));
    expect(rows[0]?.n).toBe(files.counts.actual["prerequisites"]);
  });

  it("reads every note and log back through the database reader as the file reader does", async () => {
    const rows = dbSource(scratch.db);
    const files = fileSource(REPO_ROOT);
    let identical = 0;
    const notes = await realNotes();
    for (const { file } of notes) {
      const slug = path.basename(file, ".md");
      const [fromRows, fromFiles] = await Promise.all([rows.concept(slug), files.concept(slug)]);
      expect(fromRows, slug).toMatchObject({ slug, path: fromFiles?.path, domain: fromFiles?.domain });
      expect(noteParityForm(fromRows?.markdown ?? "", file), slug).toEqual(noteParityForm(fromFiles?.markdown ?? "", file));
      if (fromRows?.markdown === fromFiles?.markdown) identical += 1;
    }
    expect(notes.length - identical).toBeLessThanOrEqual(5);
    for (const log of await readTypeFiles(REPO_ROOT, "sessions")) {
      const id = path.basename(log.path, ".md");
      expect(await rows.sessionLog(id)).toEqual(await files.sessionLog(id));
    }
    expect(await rows.concept("no-such-note")).toBeNull();
    expect(await rows.sessionLog("no-such-log")).toBeNull();
    // Both readers say so, which is what lets `catalog flip` take the types.
    expect(DB_READERS.has("concepts") && DB_READERS.has("sessions")).toBe(true);
  });

  it("imports each existing log as one entry, and a second import appends nothing", async () => {
    const before = await scratch.db.select().from(sessionLogEntry);
    const logs = await readTypeFiles(REPO_ROOT, "sessions");
    expect(before).toHaveLength(logs.length);
    await runIndex(scratch.db, { only: ["sessions"], manimkcRoot: path.join(REPO_ROOT, "no-manimkc-here") });
    expect(await scratch.db.select().from(sessionLogEntry)).toHaveLength(logs.length);
  }, 60_000);
});

describe.skipIf(!reachable.ok)("importing a log", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  const log = "learn/sessions/2026-01-01-test.md";
  const header = "---\ntitle: Test\ndate: 2026-01-01T00:00:00.000Z\ngoal: base\ntype: learning-session\n---\n\n# Test\n\n> Live log.\n";

  const index = () => runIndex(scratch.db, { only: ["sessions"], repoRoot: fixture.root, manimkcRoot: path.join(fixture.root, "none") });
  const entries = () =>
    scratch.db
      .select({ seq: sessionLogEntry.seq, markdown: sessionLogEntry.markdown })
      .from(sessionLogEntry)
      .where(eq(sessionLogEntry.sessionId, "2026-01-01-test"))
      .orderBy(asc(sessionLogEntry.seq));

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await makeFixture();
    await fixture.write("content/topics.yaml", topicsYaml([{ slug: "alpha", concepts: ["base"] }]));
    await fixture.write("learn/concepts/testing/base.md", note({ id: "base" }));
    // The two sources the log's links resolve against, written directly: a
    // run of either through `runIndex` would pull in the courses source,
    // which this tree has no files for.
    for (const indexer of [topicsIndexer, conceptsIndexer]) {
      const { rows } = await indexer.read(await fixture.context());
      await writeSource(scratch.db, indexer, rows, [], indexer.root(await fixture.context()));
    }
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
  });

  afterEach(async () => {
    // Put the file back to what the entries hold, so each case starts consistent.
    const current = (await entries()).map((e) => e.markdown).join("");
    if (current !== "") await writeFile(path.join(fixture.root, log), current, "utf8");
  });

  it("takes a new log whole as its first entry, and starts the session it names", async () => {
    await fixture.write(log, `${header}- [[base]] asked\n\n`);
    await index();
    expect(await entries()).toEqual([{ seq: 1, markdown: `${header}- [[base]] asked\n\n` }]);
    const [row] = await scratch.db.select().from(session).where(eq(session.id, "2026-01-01-test"));
    expect(row).toMatchObject({ kind: "tutor", state: "interrupted", title: "Test", goal: "base" });
    expect(row?.startedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  }, 60_000);

  it("appends what the file grew by as one entry, and renders the log back byte for byte", async () => {
    const file = path.join(fixture.root, log);
    const grown = `${await readFile(file, "utf8")}## Close\n\nDone.\n\n`;
    await writeFile(file, grown, "utf8");
    await index();
    expect((await entries()).map((e) => e.seq)).toEqual([1, 2]);
    expect((await entries())[1]?.markdown).toBe("## Close\n\nDone.\n\n");
    const [rendered] = await renderType(scratch.db, "sessions");
    expect(rendered?.bytes.toString("utf8")).toBe(grown);
  }, 60_000);

  it("refuses a log edited above its end, and writes nothing", async () => {
    const file = path.join(fixture.root, log);
    const original = await readFile(file, "utf8");
    await writeFile(file, original.replace("asked", "answered"), "utf8");
    await expect(index()).rejects.toThrow(/2026-01-01-test\.md: was edited above the end of what was imported/);
    expect((await entries()).map((e) => e.seq)).toEqual([1, 2]);
  }, 60_000);

  it("refuses a log whose file is gone while its entries are not", async () => {
    await rm(path.join(fixture.root, log));
    await expect(index()).rejects.toThrow(/2026-01-01-test\.md: is gone, but its log is in the database/);
  }, 60_000);
});
