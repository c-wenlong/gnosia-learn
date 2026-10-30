import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { session, sessionLogEntry } from "@gnosia/schema";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { databaseIdentity } from "../src/content/import-root";
import { inTransaction, setRevisionId } from "../src/db";
import { makeFixture } from "./fixture-tree";
import { ENTRY, execFileAsync, learnVault, type PullReport } from "./learn-vault-fixture";
import { migratedScratchDatabase, probe } from "./scratch-database";

/**
 * Where `learn vault` may run and what it reads: never inside a checkout,
 * never into another database, never a log named like a side copy or another
 * owner's rows, and not at all before the database owns the notes and logs.
 * learn-vault-fixture.ts describes the fixture.
 */

const reachable = await probe();

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe.skipIf(!reachable.ok)("learn vault", () => {
  const v = learnVault();
  const { learn, pull, newVault, read, exists, manifest, revisions } = v;

  it("refuses a vault inside the repository", async () => {
    const result = await learn("vault", "pull", "--out", path.join(HERE, "..", "..", "..", "learn", "vault"));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/A vault lives outside every checkout/);
  }, 60_000);

  it("refuses a push into another database, before writing anything", async () => {
    const vault = await newVault();
    await pull(vault);
    const recorded = await manifest(vault);
    await writeFile(
      path.join(vault, ".vault.json"),
      JSON.stringify({ ...recorded, database: "gnosia:1" }, null, 2),
    );
    const rel = "concepts/fixtures/alpha.md";
    await writeFile(path.join(vault, rel), `${await read(vault, rel)}\nfrom elsewhere\n`);
    const before = await revisions();
    const result = await learn("vault", "push", "--out", vault);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/was pulled from the database gnosia:1/);
    expect(await revisions()).toBe(before);
    // A pull adopts this database, keeps the edit, and puts this database's version beside it.
    const pulled = await pull(vault);
    expect(pulled.modified).toEqual([{ path: rel, incoming: "concepts/fixtures/alpha.incoming.md" }]);
    expect((await manifest(vault)).database).toBe(await databaseIdentity(v.scratch.db));
    const entries = await readdir(path.join(vault, "concepts/fixtures"));
    expect(entries).toContain("alpha.incoming.md");
  }, 60_000);

  it("refuses a vault inside another checkout of this repository", async () => {
    const other = await newVault();
    await writeFile(path.join(other, "package.json"), JSON.stringify({ name: "gnosia", private: true }));
    const result = await learn("vault", "pull", "--out", path.join(other, "learn", "vault"));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/is inside .*, a checkout of this repository/);
    expect(await readdir(other)).toEqual(["package.json"]);
  }, 60_000);

  // Last: a session log cannot be deleted, so this one stays in the database.
  it("leaves out a log whose id would read as a side copy, and the manifest stays readable", async () => {
    await v.scratch.db.insert(session).values({ id: "z.incoming", kind: "tutor", learnerId: "local" });
    await v.scratch.db.insert(sessionLogEntry).values({ sessionId: "z.incoming", seq: 1, markdown: "# z\n" });
    const vault = await newVault();
    for (let run = 0; run < 2; run += 1) {
      const result = await learn("vault", "pull", "--out", vault, "--json");
      expect(result.stderr).toBe("");
      const report = JSON.parse(result.stdout) as PullReport;
      expect(report.problems).toEqual([expect.stringMatching(/"z\.incoming" would be named like a copy the vault writes/)]);
    }
    expect(await exists(vault, "sessions/z.incoming.md")).toBe(false);
    expect((await manifest(vault)).files["sessions/z.incoming.md"]).toBeUndefined();
  }, 60_000);

  it("pulls none of another owner's notes, logs or diagrams (phase 4)", async () => {
    const other = "other";
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><title>theirs</title></svg>';
    const sha = createHash("sha256").update(svg).digest("hex");
    const key = `${other}/${sha}.svg`;
    await mkdir(path.join(process.env["GNOSIA_HOME"] as string, "blobs", other), { recursive: true });
    await writeFile(path.join(process.env["GNOSIA_HOME"] as string, "blobs", key), svg);
    // Another owner's rows, written around the seam as the review's seed was:
    // the write guards of the flipped types let a named repair through.
    const guarded = (write: (tx: typeof v.scratch.db) => Promise<void>) =>
      inTransaction(v.scratch.db, async (tx) => {
        setRevisionId(tx, 'test-seed');
        await write(tx);
      });
    await guarded(async (tx) => {
      await tx.execute(sql`insert into learner (id) values (${other}) on conflict do nothing`);
      await tx.execute(sql`
        insert into concept (slug, title, topic_slug, path, body, owner_id)
        values ('theirs', 'Theirs', 'alpha', 'learn/concepts/fixtures/theirs.md', ${"# Theirs\n"}, ${other})`);
      await tx.insert(session).values({ id: "their-log", kind: "tutor", learnerId: other, state: "closed" });
      await tx.insert(sessionLogEntry).values({ sessionId: "their-log", seq: 1, markdown: "# theirs\n" });
      await tx.execute(sql`
        insert into blob_object (key, owner_id, sha256, bytes, mime, provider, state, confirmed_at)
        values (${key}, ${other}, ${sha}, ${Buffer.byteLength(svg)}, 'image/svg+xml', 'fs', 'present', cast(unixepoch('subsec') * 1000 as integer))`);
      await tx.execute(sql`
        insert into diagram (slug, owner_id, topic_slug, document, document_hash, svg_blob_key, svg_document_hash)
        values ('their-diagram', ${other}, 'alpha', '{"records":[]}', ${"d".repeat(64)}, ${key}, ${"d".repeat(64)})`);
    });
    // Left in place: a session log is append-only, and this is the suite's last case.
    const vault = await newVault();
    const pulled = await pull(vault);
    // An earlier case left a log the vault declines; nothing of theirs is named.
    expect(pulled.problems.filter((problem) => /theirs|their-/.test(problem))).toEqual([]);
    expect(pulled.written.filter((rel) => /theirs|their-log|their-diagram/.test(rel))).toEqual([]);
    expect(await exists(vault, "concepts/fixtures/theirs.md")).toBe(false);
    expect(await exists(vault, "sessions/their-log.md")).toBe(false);
    expect(await exists(vault, "assets/their-diagram.svg")).toBe(false);
  }, 60_000);
});

describe.skipIf(!reachable.ok)("learn vault before the flip", () => {
  it("refuses while the database does not own the notes and logs", async () => {
    const scratch = await migratedScratchDatabase();
    const fixture = await makeFixture();
    const vault = await mkdtemp(path.join(tmpdir(), "gnosia-vault-"));
    try {
      const result = await execFileAsync(process.execPath, ["--import", "tsx", ENTRY, "vault", "pull", "--out", vault], {
        env: { ...process.env, LEARN_ROOT: fixture.root, DATABASE_URL: scratch.url },
      }).then(
        () => ({ code: 0, stderr: "" }),
        (error: { code: number; stderr: string }) => error,
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/does not own concepts or sessions yet/);
      expect(await readdir(vault)).toEqual([]);
    } finally {
      await scratch.drop();
      await fixture.cleanup();
      await rm(vault, { recursive: true, force: true });
    }
  }, 60_000);
});
