import { createHash } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import fsPromises from "node:fs/promises";

import { contentRevision } from "@gnosia/schema";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { commitNoteText } from "../src/content/note-rows";
import { pushVault } from "../src/learn/vault";
import { note } from "./fixture-tree";
import { LOG, learnVault } from "./learn-vault-fixture";
import { probe } from "./scratch-database";

/**
 * `learn vault pull|push` (phase 2 of docs/CONTENT-MIGRATION.md, edge case
 * 4): pulling notes and logs into a vault and pushing edited notes back, one
 * revision each. learn-vault-fixture.ts describes the fixture and lists the
 * other suites.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn vault", () => {
  const v = learnVault();
  const { pull, push, newVault, read, exists, manifest, revisions, body } = v;

  it("pulls into an empty folder and pushes nothing back when nothing was edited", async () => {
    const vault = await newVault();
    const before = await revisions();
    const pulled = await pull(vault);
    expect(pulled).toMatchObject({ notes: 4, logs: 1, unchanged: [], modified: [], removed: [], problems: [] });
    expect(pulled.written.sort()).toEqual([
      "concepts/fixtures/alpha.md",
      "concepts/fixtures/beta.md",
      "concepts/fixtures/gamma.md",
      "concepts/other/delta.md",
      "sessions/2026-01-01-old.md",
    ]);
    // Each file is what its row renders, wikilinks as the note wrote them.
    expect(await read(vault, "concepts/fixtures/beta.md")).toBe(
      note({ id: "beta", title: "Beta", requires: ["alpha"], body: "# Beta\n\nSee [[alpha]]." }),
    );
    expect(await read(vault, "sessions/2026-01-01-old.md")).toBe(LOG);
    expect((await read(vault, "README.md")).split("\n").filter((line) => line !== "" && !line.startsWith("#"))).toHaveLength(6);
    expect(await exists(vault, ".obsidian")).toBe(false);
    const recorded = await manifest(vault);
    expect(recorded.files["concepts/fixtures/beta.md"]).toMatchObject({ kind: "note", id: "beta" });
    expect(recorded.files["concepts/fixtures/beta.md"]?.base).toEqual(expect.any(Number));
    expect(recorded.files["sessions/2026-01-01-old.md"]).toMatchObject({ kind: "log", base: 1 });

    const pushed = await push(vault);
    expect(pushed).toMatchObject({ pushed: [], refused: [], code: 0 });
    expect(pushed.unchanged).toHaveLength(5);
    expect(await revisions()).toBe(before);
    // A second pull finds everything as it left it.
    expect((await pull(vault)).unchanged).toHaveLength(5);
    expect(await revisions()).toBe(before);
  }, 60_000);

  it("pushes one edited note as one revision, and nothing the second time", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/alpha.md";
    const edited = (await read(vault, rel)).replace("# Alpha", "# Alpha\n\nWritten in Obsidian.");
    await writeFile(path.join(vault, rel), edited);
    const before = await revisions("alpha");

    const pushed = await push(vault, "--reason", "an edit from the vault");
    expect(pushed).toMatchObject({ refused: [], code: 0 });
    expect(pushed.pushed.map((file) => file.path)).toEqual([rel]);
    expect(await revisions("alpha")).toBe(before + 1);
    expect(await body("alpha")).toContain("Written in Obsidian.");
    const [revision] = await v.scratch.db
      .select()
      .from(contentRevision)
      .where(eq(contentRevision.id, pushed.pushed[0]?.revision ?? -1));
    expect(revision).toMatchObject({ entityType: "concept", entityId: "alpha", reason: "an edit from the vault", authorKind: "person" });
    expect((await manifest(vault)).files[rel]?.base).toBe(pushed.pushed[0]?.revision);

    expect((await push(vault)).pushed).toEqual([]);
    expect(await revisions("alpha")).toBe(before + 1);
  }, 60_000);

  it("refuses an edited session log by name, and takes it back once it matches again", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "sessions/2026-01-01-old.md";
    await writeFile(path.join(vault, rel), LOG.replace("once", "twice"));
    const before = await revisions();

    const refused = await push(vault);
    expect(refused.code).toBe(1);
    expect(refused.refused).toEqual([
      { path: rel, reason: expect.stringMatching(/^sessions\/2026-01-01-old\.md is a session log, which is a record of what happened.*a correction belongs in the note it touched/) },
    ]);
    expect(await revisions()).toBe(before);

    // Deleting the copy and pulling puts the database's back.
    await rm(path.join(vault, rel));
    expect((await pull(vault)).written).toEqual([rel]);
    expect(await read(vault, rel)).toBe(LOG);
    expect((await push(vault)).refused).toEqual([]);
  }, 60_000);

  it("records each commit as it lands, so a push stopped halfway knows what it already wrote", async () => {
    const vault = await newVault();
    await pull(vault);
    const first = "concepts/fixtures/alpha.md";
    const second = "concepts/fixtures/beta.md";
    const firstText = `${await read(vault, first)}\nfirst of two\n`;
    await writeFile(path.join(vault, first), firstText);
    await writeFile(path.join(vault, second), `${await read(vault, second)}\nsecond of two\n`);

    // The second note cannot be read, which stops the push after the first commit.
    const openOriginal = fsPromises.open;
    const spy = vi.spyOn(fsPromises, "open").mockImplementation(async (file, flags, mode) => {
      if (file === path.join(vault, second)) throw Object.assign(new Error("EIO: the disk went away"), { code: "EIO" });
      return openOriginal(file, flags, mode);
    });
    try {
      await expect(pushVault(v.scratch.db, { dir: vault })).rejects.toThrow("the disk went away");
    } finally {
      spy.mockRestore();
    }
    const [latest] = await v.scratch.db
      .select({ id: contentRevision.id })
      .from(contentRevision)
      .where(and(eq(contentRevision.entityType, "concept"), eq(contentRevision.entityId, "alpha")))
      .orderBy(sql`${contentRevision.id} desc`)
      .limit(1);
    expect((await manifest(vault)).files[first]).toMatchObject({
      base: latest?.id,
      hash: createHash("sha256").update(firstText).digest("hex"),
    });

    const again = await push(vault);
    expect(again).toMatchObject({ refused: [], code: 0 });
    expect(again.pushed.map((file) => file.path)).toEqual([second]);
    expect(again.unchanged).toContain(first);
  }, 60_000);

  it("takes a note the database already holds as this very file for its own commit, not a conflict", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/other/delta.md";
    const text = `${await read(vault, rel)}\ncommitted, then the push stopped\n`;
    await writeFile(path.join(vault, rel), text);
    // A push that committed this and stopped before writing .vault.json.
    const base = (await manifest(vault)).files[rel]?.base ?? null;
    const written = await commitNoteText(v.scratch.db, "delta", text, { base, reason: "the push that stopped" });

    const pushed = await push(vault);
    expect(pushed).toMatchObject({ pushed: [], refused: [], code: 0 });
    expect(pushed.unchanged).toContain(rel);
    expect(await exists(vault, "concepts/other/delta.conflict.md")).toBe(false);
    expect((await manifest(vault)).files[rel]?.base).toBe(written.revision);
  }, 60_000);

  it("refuses a note whose frontmatter fence is damaged, by file, and writes nothing", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/gamma.md";
    const damaged = (await read(vault, rel)).replace(/^---\n/, "--\n");
    await writeFile(path.join(vault, rel), damaged);
    const before = await revisions("gamma");

    const pushed = await push(vault);
    expect(pushed.code).toBe(1);
    expect(pushed.refused).toEqual([
      { path: rel, reason: expect.stringMatching(/gamma\.md has no frontmatter that parses/) },
    ]);
    expect(pushed.refused[0]?.reason).toContain(path.join(vault, rel));
    expect(await revisions("gamma")).toBe(before);

    // A broken closing fence runs the block on to a later --- in the body,
    // which would drop everything before it: refused by the line it met.
    const runOn = (await read(vault, rel))
      .replace(/^--\n/, "---\n")
      .replace(/\n---\n/, "\n--\n")
      .concat("\n---\n\nafter a rule\n");
    await writeFile(path.join(vault, rel), runOn);
    expect((await push(vault)).refused[0]?.reason).toMatch(/is not a key: line: its closing --- is probably damaged/);
    expect(await revisions("gamma")).toBe(before);
    // A comment line is named as one, and refused, since no column keeps it.
    await writeFile(path.join(vault, rel), `---\nid: gamma\n# a note to myself\ntitle: Gamma\n---\n\n# Gamma\n`);
    expect((await push(vault)).refused[0]?.reason).toMatch(/"# a note to myself" in its frontmatter\. A comment there has no column/);
    expect(await revisions("gamma")).toBe(before);
    await writeFile(path.join(vault, rel), damaged);

    // Frontmatter with no id: is refused the same way.
    await writeFile(path.join(vault, rel), (await read(vault, rel)).replace(/^--\n/, "---\n").replace(/^id: .*\n/m, ""));
    expect((await push(vault)).refused[0]?.reason).toMatch(/has frontmatter with no id:/);
    expect(await revisions("gamma")).toBe(before);
  }, 60_000);

  it("names a kept edit for what it is, rather than as a new note", async () => {
    const vault = await newVault();
    await pull(vault);
    const kept = "concepts/fixtures/alpha.kept-1700000000000.md";
    await writeFile(path.join(vault, kept), "an edit saved while a pull moved alpha.md\n");
    const pushed = await push(vault);
    expect(pushed.refused).toEqual([
      { path: kept, reason: expect.stringMatching(/is an edit saved to concepts\/fixtures\/alpha\.md while a vault command/) },
    ]);
  }, 60_000);
});
