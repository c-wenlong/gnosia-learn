import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runExport } from "../src/commands/export";
import { runImportCommand } from "../src/commands/index-command";
import type { ExportSubset } from "../src/content/subset";
import { REPO_ROOT } from "../src/env";
import { applyMigrations } from "../src/migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `catalog export --subset`, which is how `seed/` is cut (seed/README.md).
 * The seed itself proves the happy path (`catalog.test.ts` imports it and
 * exports it back byte for byte); these are the refusals, each a subset that
 * would not import on its own, and the two directories it must never write.
 */

const reachable = await probe();
const SEED = path.join(REPO_ROOT, "seed");

/** The seed's own recipe, from seed/README.md. */
const RECIPE: ExportSubset = {
  topics: [
    "vector-and-linear-algebra-basics",
    "transformer-architecture-and-training",
    "agent-tool-use-and-reasoning-loops",
    "agent-memory-and-state",
    "tomasulo-algorithm",
  ],
  course: "cp4284",
  session: "2026-08-19-react-agents",
  diagram: "vector-as-a-list-of-numbers",
};

describe.skipIf(!reachable.ok)("catalog export --subset", () => {
  let scratch: Scratch;
  let out: string;
  const saved = { url: process.env["DATABASE_URL"], manimkc: process.env["MANIMKC_ROOT"] };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    process.env["DATABASE_URL"] = scratch.url;
    out = await mkdtemp(path.join(tmpdir(), "catalog-subset-"));
    // No manimkc CLI: the seed maps no topic folder.
    process.env["MANIMKC_ROOT"] = out;
    await runImportCommand({ dir: SEED });
  }, 120_000);

  afterAll(async () => {
    for (const [key, value] of [["DATABASE_URL", saved.url], ["MANIMKC_ROOT", saved.manimkc]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(out, { recursive: true, force: true });
    await scratch?.drop();
  });

  const refused = async (subset: Partial<ExportSubset>, pattern: RegExp) => {
    const into = await mkdtemp(path.join(out, "cut-"));
    await expect(runExport({ out: into, subset: { ...RECIPE, ...subset } })).rejects.toThrow(pattern);
    // Refused before a file is written.
    expect(await readdir(into)).toEqual([]);
  };

  it("writes the recipe's tree and records no hash", async () => {
    const into = await mkdtemp(path.join(out, "cut-"));
    const result = await runExport({ out: into, subset: RECIPE });
    expect(result.recorded).toBe(false);
    expect(result.types.map((t) => [t.type, t.files])).toEqual([
      ["topics", 1],
      ["tags", 1],
      // cp4284.yaml and its cover.
      ["courses", 2],
      ["concepts", 11],
      ["sessions", 1],
      ["diagrams", 2],
    ]);
  });

  it("refuses a note whose prerequisite is filed under a topic it leaves out", async () => {
    await refused(
      { topics: RECIPE.topics.filter((t) => t !== "vector-and-linear-algebra-basics"), diagram: "vector-as-a-list-of-numbers" },
      /note "query-key-value-projections" requires "vector-as-a-list-of-numbers", which is filed under "vector-and-linear-algebra-basics"/,
    );
  });

  it("refuses a diagram filed under a topic it leaves out", async () => {
    await refused(
      { topics: ["transformer-architecture-and-training", "agent-tool-use-and-reasoning-loops"] },
      /diagram "vector-as-a-list-of-numbers" is filed under "vector-and-linear-algebra-basics", not a named topic/,
    );
  });

  it("refuses a course with no module under a named topic, and names where its modules sit", async () => {
    await refused(
      { topics: ["vector-and-linear-algebra-basics", "tomasulo-algorithm"] },
      /no live module of "cp4284" is filed under a named topic; its modules sit under transformer-architecture-and-training, agent-tool-use-and-reasoning-loops/,
    );
  });

  it("refuses a topic relation to a topic it leaves out, rather than dropping it", async () => {
    await scratch.db.execute(sql`insert into topic (slug, title, domain, position) values ('aaa-outside', 'Outside', 'x', 999000)`);
    await scratch.db.execute(
      sql`insert into topic_relation (from_slug, to_slug, kind) values ('aaa-outside', 'transformer-architecture-and-training', 'related')`,
    );
    try {
      await refused(
        {},
        /topic relation aaa-outside related transformer-architecture-and-training names a topic left out; name both topics or neither/,
      );
      // Naming both keeps the relation, and the subset writes.
      const into = await mkdtemp(path.join(out, "cut-"));
      await runExport({ out: into, subset: { ...RECIPE, topics: [...RECIPE.topics, "aaa-outside"] } });
    } finally {
      await scratch.db.execute(sql`delete from topic_relation where from_slug = 'aaa-outside'`);
      await scratch.db.execute(sql`delete from topic where slug = 'aaa-outside'`);
    }
  });

  it("refuses to write through a symlink that leaves the output directory", async () => {
    const elsewhere = await mkdtemp(path.join(out, "elsewhere-"));
    const into = await mkdtemp(path.join(out, "cut-"));
    await mkdir(path.join(elsewhere, "content"));
    await symlink(path.join(elsewhere, "content"), path.join(into, "content"));
    await expect(runExport({ out: into, subset: RECIPE })).rejects.toThrow(/refusing to write content\/topics\.yaml: .* outside /);
    expect(await readdir(path.join(elsewhere, "content"))).toEqual([]);
  });

  it("writes to a new directory under a symlinked ancestor", async () => {
    // The ancestor is a link; the output directory does not exist yet.
    const real = await mkdtemp(path.join(out, "real-"));
    const link = path.join(out, `link-${path.basename(real)}`);
    await symlink(real, link);
    const result = await runExport({ out: path.join(link, "new", "seed"), subset: RECIPE });
    expect(result.types.reduce((n, t) => n + t.files, 0)).toBe(18);
    expect(await readdir(path.join(real, "new", "seed"))).toEqual(["content", "learn"]);
  });

  it("refuses names that are not there", async () => {
    await refused({ topics: [...RECIPE.topics, "no-such-topic"] }, /topic "no-such-topic" does not exist/);
    await refused({ course: "cp4284-m1" }, /"cp4284-m1" is not a course/);
    await refused({ session: "no-such-session" }, /session "no-such-session" has no log/);
    await refused({ diagram: "no-such-diagram" }, /diagram "no-such-diagram" does not exist/);
  });

  it("never writes over the repository or a tree the content was imported from", async () => {
    // The seed is this database's import root, so the second is the case a
    // regenerated seed written over itself would hit; vitest.setup.ts would
    // also fail this file if a byte of it changed.
    await expect(runExport({ out: SEED, subset: RECIPE })).rejects.toThrow(/a tree this database's content was imported from/);
    await expect(runExport({ out: REPO_ROOT, subset: RECIPE })).rejects.toThrow(/it is the repository/);
  });
});
