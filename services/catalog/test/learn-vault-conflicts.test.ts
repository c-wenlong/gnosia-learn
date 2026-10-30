import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import fsPromises from "node:fs/promises";

import { concept } from "@gnosia/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { pullVault } from "../src/learn/vault";
import { learnVault } from "./learn-vault-fixture";
import { probe } from "./scratch-database";

/**
 * `learn vault pull|push` when an edit in the vault meets a newer version in
 * the database: the side copies it leaves, and the edits it never overwrites.
 * learn-vault-fixture.ts describes the fixture.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn vault", () => {
  const v = learnVault();
  const { learn, pull, push, newVault, read, exists, manifest, revisions } = v;

  it("refuses a note edited on both sides, leaves a .conflict copy, and pushes once it is settled", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/gamma.md";
    const mine = (await read(vault, rel)).replace("# Gamma", "# Gamma\n\nMy side.");
    await writeFile(path.join(vault, rel), mine);
    expect((await learn("concept", "edit", "gamma", "--summary", "Their side.")).code).toBe(0);
    const before = await revisions("gamma");

    const refused = await push(vault);
    expect(refused.code).toBe(1);
    expect(refused.pushed).toEqual([]);
    expect(refused.refused).toEqual([
      expect.objectContaining({ path: rel, conflict: "concepts/fixtures/gamma.conflict.md", reason: expect.stringMatching(/changed in the database/) }),
    ]);
    expect(await read(vault, rel)).toBe(mine);
    expect(await read(vault, "concepts/fixtures/gamma.conflict.md")).toContain("summary: Their side.");
    expect(await revisions("gamma")).toBe(before);
    // A pull finds the same version beside it and leaves the copy under the name push gave it.
    expect((await pull(vault)).modified).toEqual([{ path: rel, incoming: "concepts/fixtures/gamma.conflict.md" }]);
    expect(await exists(vault, "concepts/fixtures/gamma.incoming.md")).toBe(false);
    // Pushing again while the copy is there is refused the same way, and writes nothing.
    expect((await push(vault)).refused[0]?.reason).toMatch(/gamma\.conflict\.md is the database's newer version/);

    // Merged by hand, the copy deleted: the note is based on the copy's version now.
    await writeFile(path.join(vault, rel), mine.replace("title: Gamma", "title: Gamma\nsummary: Their side."));
    await rm(path.join(vault, "concepts/fixtures/gamma.conflict.md"));
    const settled = await push(vault);
    expect(settled).toMatchObject({ refused: [], code: 0 });
    expect(settled.pushed.map((file) => file.path)).toEqual([rel]);
    expect(await revisions("gamma")).toBe(before + 1);
    const [row] = await v.scratch.db.select().from(concept).where(eq(concept.slug, "gamma"));
    expect(row).toMatchObject({ summary: "Their side." });
    expect(row?.body).toContain("My side.");
  }, 60_000);

  it("never overwrites an edit on pull: the database's newer version lands beside it as .incoming", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/other/delta.md";
    const mine = (await read(vault, rel)).replace("# Delta", "# Delta\n\nNot pushed yet.");
    await writeFile(path.join(vault, rel), mine);

    // The database has not moved: the edit is listed, and no copy is written.
    const quiet = await pull(vault);
    expect(quiet.modified).toEqual([{ path: rel, incoming: null }]);
    expect(await exists(vault, "concepts/other/delta.incoming.md")).toBe(false);

    expect((await learn("concept", "edit", "delta", "--title", "Delta, renamed")).code).toBe(0);
    const moved = await pull(vault);
    expect(moved.modified).toEqual([{ path: rel, incoming: "concepts/other/delta.incoming.md" }]);
    expect(await read(vault, rel)).toBe(mine);
    expect(await read(vault, "concepts/other/delta.incoming.md")).toContain("title: Delta, renamed");

    // A person who merges into the copy instead of the note keeps that too.
    const merging = `${await read(vault, "concepts/other/delta.incoming.md")}\nhalf merged\n`;
    await writeFile(path.join(vault, "concepts/other/delta.incoming.md"), merging);
    expect((await learn("concept", "edit", "delta", "--title", "Delta, again")).code).toBe(0);
    const held = await pull(vault);
    expect(held.modified[0]).toMatchObject({ path: rel, incoming: null, note: expect.stringMatching(/holds edits of its own/) });
    expect(await read(vault, "concepts/other/delta.incoming.md")).toBe(merging);
    expect(await read(vault, rel)).toBe(mine);

    // And push refuses the note while that copy is unsettled.
    const refused = await push(vault);
    expect(refused.refused.map((file) => file.path)).toEqual([rel]);
    expect(await read(vault, rel)).toBe(mine);
  }, 60_000);

  it("keeps a file that was there before any pull, and refuses what it cannot place", async () => {
    const vault = await newVault();
    const rel = "concepts/fixtures/beta.md";
    await writeFile(path.join(vault, "stray.md"), "not ours\n");
    await mkdir(path.join(vault, "concepts/fixtures"), { recursive: true });
    await writeFile(path.join(vault, rel), "my own beta\n");
    await writeFile(path.join(vault, "concepts/fixtures/epsilon.md"), "a note the database has never seen\n");

    const pulled = await pull(vault);
    expect(pulled.modified).toEqual([{ path: rel, incoming: "concepts/fixtures/beta.incoming.md" }]);
    expect(await read(vault, rel)).toBe("my own beta\n");
    expect(await read(vault, "stray.md")).toBe("not ours\n");

    const pushed = await push(vault);
    expect(pushed.refused.map((file) => file.path)).toEqual([rel, "concepts/fixtures/epsilon.md"]);
    expect(pushed.refused[1]?.reason).toMatch(/learn concept add --topic/);
  }, 60_000);

  it("keeps a .conflict copy a person merged into, record and all, when the database moves again", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/alpha.md";
    await writeFile(path.join(vault, rel), `${await read(vault, rel)}\nmine\n`);
    expect((await learn("concept", "edit", "alpha", "--summary", "First move.")).code).toBe(0);
    expect((await push(vault)).refused[0]?.conflict).toBe("concepts/fixtures/alpha.conflict.md");
    const merging = `${await read(vault, "concepts/fixtures/alpha.conflict.md")}\nmerging here\n`;
    await writeFile(path.join(vault, "concepts/fixtures/alpha.conflict.md"), merging);
    expect((await learn("concept", "edit", "alpha", "--summary", "Second move.")).code).toBe(0);

    const pulled = await pull(vault);
    expect(pulled.modified).toEqual([expect.objectContaining({ path: rel, incoming: null, note: expect.stringMatching(/holds edits of its own/) })]);
    expect(await read(vault, "concepts/fixtures/alpha.conflict.md")).toBe(merging);
    expect(await exists(vault, "concepts/fixtures/alpha.incoming.md")).toBe(false);
    expect((await manifest(vault)).files[rel]?.pending?.path).toBe("concepts/fixtures/alpha.conflict.md");
  }, 60_000);

  it("keeps an edited file of a note the database no longer has, and removes an unedited one", async () => {
    const vault = await newVault();
    await pull(vault);
    const recorded = await manifest(vault);
    const hash = createHash("sha256").update("gone\n").digest("hex");
    const unedited = "concepts/fixtures/gone-clean.md";
    const edited = "concepts/fixtures/gone-edited.md";
    await writeFile(path.join(vault, unedited), "gone\n");
    await writeFile(path.join(vault, edited), "gone, and then edited here\n");
    recorded.files[unedited] = { kind: "note", id: "gone-clean", base: 1, hash };
    recorded.files[edited] = { kind: "note", id: "gone-edited", base: 1, hash };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));

    const pulled = await pull(vault);
    expect(pulled.removed).toEqual([unedited]);
    expect(pulled.modified).toEqual([
      { path: edited, incoming: null, note: expect.stringMatching(/no longer has this note; your copy is kept/) },
    ]);
    expect(await exists(vault, unedited)).toBe(false);
    expect(await read(vault, edited)).toBe("gone, and then edited here\n");
  }, 60_000);

  it("never overwrites a save that lands while a pull is replacing the file", async () => {
    const vault = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/beta.md";
    const target = path.join(vault, rel);
    expect((await learn("concept", "edit", "beta", "--summary", "Moved while the vault was closed.")).code).toBe(0);
    const saved = `${await read(vault, rel)}\nsaved in Obsidian mid-pull\n`;

    // The save lands the moment the pull first writes anything for this file:
    // after any check it made, before its new text is in place.
    const writeFileOriginal = fsPromises.writeFile;
    let fired = false;
    const spy = vi.spyOn(fsPromises, "writeFile").mockImplementation(async (file, data, options) => {
      const name = typeof file === "string" ? file : "";
      if (!fired && path.dirname(name) === path.dirname(target) && (name === target || path.basename(name).startsWith(".beta.md."))) {
        fired = true;
        await writeFileOriginal(target, saved);
      }
      return writeFileOriginal(file, data, options);
    });
    let report;
    try {
      report = await pullVault(v.scratch.db, { dir: vault });
    } finally {
      spy.mockRestore();
    }
    expect(fired).toBe(true);
    expect(await read(vault, rel)).toBe(saved);
    expect(report.written).not.toContain(rel);
    expect(report.modified).toEqual([{ path: rel, incoming: null, note: "changed while the pull ran; pull again" }]);
  }, 60_000);
});
