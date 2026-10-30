import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { learnVault, type PullReport } from "./learn-vault-fixture";
import { probe } from "./scratch-database";

/**
 * `learn vault pull|push` against a vault that points out of itself: a
 * manifest naming paths outside it, links and linked folders, and files it
 * cannot read, refused before anything is written or removed.
 * learn-vault-fixture.ts describes the fixture.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn vault", () => {
  const v = learnVault();
  const { learn, pull, push, newVault, read, manifest, revisions, body } = v;

  it("refuses a manifest naming a path outside the vault, and touches nothing", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    await writeFile(path.join(outside, "victim.md"), "not the vault's\n");
    const recorded = await manifest(vault);
    const hash = recorded.files["concepts/fixtures/alpha.md"]?.hash ?? null;
    recorded.files[`../${path.basename(outside)}/victim.md`] = { kind: "note", id: "gone", base: 1, hash };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));
    for (const verb of ["pull", "push"]) {
      const result = await learn("vault", verb, "--out", vault);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/names paths pull never writes/);
    }
    expect(await read(outside, "victim.md")).toBe("not the vault's\n");
  }, 60_000);

  it("refuses to write through a folder linked out of the vault", async () => {
    const vault = await newVault();
    const elsewhere = await newVault();
    await symlink(elsewhere, path.join(vault, "concepts"));
    const result = await learn("vault", "pull", "--out", vault, "--json");
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as PullReport;
    expect(report.problems).toHaveLength(4);
    for (const problem of report.problems) expect(problem).toMatch(/resolves outside the vault/);
    expect(await readdir(elsewhere)).toEqual([]);
  }, 60_000);

  it("never reads a note through a link, so nothing outside the vault is pushed", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    const rel = "concepts/fixtures/beta.md";
    const target = path.join(outside, "beta.md");
    await writeFile(target, (await read(vault, rel)).replace("See [[alpha]].", "Bytes from outside the vault."));
    await rm(path.join(vault, rel));
    await symlink(target, path.join(vault, rel));
    const before = await revisions();

    const pushed = await push(vault);
    expect(pushed.code).toBe(1);
    expect(pushed.refused).toEqual([{ path: rel, reason: expect.stringMatching(/is not a plain file/) }]);
    expect(await revisions()).toBe(before);
    expect(await body("beta")).not.toContain("Bytes from outside");

    const pulled = await learn("vault", "pull", "--out", vault, "--json");
    expect(pulled.code).toBe(1);
    expect((JSON.parse(pulled.stdout) as PullReport).problems).toEqual([expect.stringMatching(/beta\.md is not a plain file/)]);
    expect((await lstat(path.join(vault, rel))).isSymbolicLink()).toBe(true);
    expect(await readFile(target, "utf8")).toContain("Bytes from outside the vault.");
  }, 60_000);

  it("never reads a note through a linked folder, and refuses anything named like a note", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    const folder = path.join(vault, "concepts/other");
    await writeFile(
      path.join(outside, "delta.md"),
      (await read(vault, "concepts/other/delta.md")).replace("# Delta", "# Delta\n\nBytes from outside."),
    );
    await rm(folder, { recursive: true });
    await symlink(outside, folder);
    await mkdir(path.join(vault, "concepts/fixtures/folder.md"));
    const before = await revisions();

    const pushed = await push(vault);
    expect(pushed.refused).toEqual([
      { path: "concepts/other/delta.md", reason: expect.stringMatching(/resolves outside the vault/) },
      { path: "concepts/fixtures/folder.md", reason: expect.stringMatching(/is not a note in the database/) },
    ]);
    expect(await revisions()).toBe(before);
    const pulled = await learn("vault", "pull", "--out", vault, "--json");
    expect(pulled.code).toBe(1);
    expect((JSON.parse(pulled.stdout) as PullReport).problems).toEqual([expect.stringMatching(/delta\.md is in a folder that resolves outside the vault/)]);
    expect(await readdir(outside)).toEqual(["delta.md"]);
  }, 60_000);

  it("removes nothing on a pull that meets a stale file it cannot read", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    const recorded = await manifest(vault);
    // Two files the database does not have, as a pull that recorded them would leave them.
    const plain = "concepts/fixtures/zzz-gone.md";
    const linked = "concepts/fixtures/aaa-gone.md";
    await writeFile(path.join(vault, plain), "gone\n");
    await writeFile(path.join(outside, "target.md"), "gone\n");
    await symlink(path.join(outside, "target.md"), path.join(vault, linked));
    const hash = createHash("sha256").update("gone\n").digest("hex");
    recorded.files[plain] = { kind: "note", id: "zzz-gone", base: 1, hash };
    recorded.files[linked] = { kind: "note", id: "aaa-gone", base: 1, hash };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));

    const pulled = await learn("vault", "pull", "--out", vault, "--json");
    expect(pulled.code).toBe(1);
    const report = JSON.parse(pulled.stdout) as PullReport;
    expect(report.removed).toEqual([]);
    expect(report.problems).toEqual([expect.stringMatching(/aaa-gone\.md is not a plain file/)]);
    expect(await read(vault, plain)).toBe("gone\n");
  }, 60_000);

  it("reports a README that is not a plain file, before removing anything", async () => {
    const vault = await newVault();
    await pull(vault);
    await rm(path.join(vault, "README.md"));
    await mkdir(path.join(vault, "README.md"));
    const stale = "concepts/fixtures/gone.md";
    await writeFile(path.join(vault, stale), "gone\n");
    const recorded = await manifest(vault);
    recorded.files[stale] = { kind: "note", id: "gone", base: 1, hash: createHash("sha256").update("gone\n").digest("hex") };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));
    const pulled = await learn("vault", "pull", "--out", vault, "--json");
    expect(pulled.code).toBe(1);
    const report = JSON.parse(pulled.stdout) as PullReport;
    expect(report.problems).toEqual([expect.stringMatching(/README\.md is not a plain file/)]);
    expect(report.removed).toEqual([]);
    expect(await read(vault, stale)).toBe("gone\n");
  }, 60_000);

  it("reports a stale file's side copy that is a link before removing anything, and keeps the manifest", async () => {
    const vault = await newVault();
    const outside = await newVault();
    await pull(vault);
    const recorded = await manifest(vault);
    const hash = createHash("sha256").update("gone\n").digest("hex");
    // One stale file removed cleanly, and one whose side copy is a link.
    const clean = "concepts/fixtures/aaa-gone.md";
    const linked = "concepts/fixtures/zzz-gone.md";
    await writeFile(path.join(vault, clean), "gone\n");
    await writeFile(path.join(vault, linked), "gone\n");
    await writeFile(path.join(outside, "target.md"), "not the vault's\n");
    await symlink(path.join(outside, "target.md"), path.join(vault, "concepts/fixtures/zzz-gone.incoming.md"));
    recorded.files[clean] = { kind: "note", id: "aaa-gone", base: 1, hash };
    recorded.files[linked] = {
      kind: "note",
      id: "zzz-gone",
      base: 1,
      hash,
      pending: { path: "concepts/fixtures/zzz-gone.incoming.md", base: 1, hash },
    };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));

    const result = await learn("vault", "pull", "--out", vault, "--json");
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as PullReport;
    expect(report.problems).toEqual([expect.stringMatching(/zzz-gone\.incoming\.md is not a plain file/)]);
    expect(report.removed).toEqual([]);
    expect(await read(vault, clean)).toBe("gone\n");
    expect(await read(outside, "target.md")).toBe("not the vault's\n");
    const after = await manifest(vault);
    expect(Object.keys(after.files)).toEqual(expect.arrayContaining([clean, linked]));
  }, 60_000);
});
