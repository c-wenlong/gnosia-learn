import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { fsStore } from "@self-learn/blob";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runExport } from "../src/commands/export";
import { runFlip } from "../src/commands/flip";
import { runImportCommand } from "../src/commands/index-command";
import { putDiagram } from "../src/content/diagrams";
import { otherCheckout } from "../src/content/import-root";
import { addTag } from "../src/content/tags";
import { addTopic, type By, editTopic, mapTopic } from "../src/content/topics";
import { writeContent } from "../src/content/write";
import { writeThrough } from "../src/content/write-through";
import { applyMigrations } from "../src/migrations";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { copyScratchDatabase, createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * Where a seam write puts its files (D17; `content/import-root.ts`), and what
 * it does when a file moves under it (`content/write-through.ts`).
 *
 * The cases the review of phase 1 reproduced by hand: a `createdb -T` copy of
 * a database inherits the tree its template was imported from, and a seam
 * write on the copy used to rewrite that tree, which for the owner is their
 * working copy; a save made to a file while a write was in flight was
 * overwritten; and once topics were flipped nothing could map a new manimkc
 * folder, so the first new rendered topic blocked every `catalog index`.
 *
 * Every tree here is under the OS temp directory, and every database is a
 * scratch one or a copy of one.
 */

const reachable = await probe();
const run = promisify(execFile);

const by: By = { author: "local", authorKind: "person", reason: "a test" };

const NO_MANIMKC = path.join(tmpdir(), "catalog-test-no-manimkc");

function pointAt(name: string, env: { manimkc?: string; blobHome?: string } = {}): () => void {
  const keys = ["DATABASE_URL", "MANIMKC_ROOT", "SELF_LEARN_HOME"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const url = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
  url.pathname = `/${name}`;
  process.env["DATABASE_URL"] = url.toString();
  process.env["MANIMKC_ROOT"] = env.manimkc ?? NO_MANIMKC;
  if (env.blobHome !== undefined) process.env["SELF_LEARN_HOME"] = env.blobHome;
  return () => {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function against<T>(name: string, fn: () => Promise<T>, env: { manimkc?: string; blobHome?: string } = {}): Promise<T> {
  const restore = pointAt(name, env);
  try {
    return await fn();
  } finally {
    restore();
  }
}

/** Every file under `root` and its bytes: the whole tree, to prove nothing in it moved. */
async function snapshot(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.set(path.relative(root, full), (await readFile(full)).toString("base64"));
    }
  };
  await walk(root);
  return out;
}

async function tree(): Promise<Fixture> {
  const fixture = await makeFixture();
  await fixture.write(
    "content/topics.yaml",
    topicsYaml([
      { slug: "alpha", domain: "testing", concepts: ["base"], courses: ["xx1000-m1"], manimkc: ["one/first"] },
      { slug: "beta", domain: "testing" },
    ]),
  );
  await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
  await fixture.write("content/courses/xx1000.yaml", COURSE);
  await fixture.write("learn/concepts/testing/base.md", note({ id: "base", title: "Base" }));
  return fixture;
}

const COURSE = [
  "id: xx1000",
  "slug: xx1000",
  "code: XX1000",
  "title: A test course",
  "credits: 4",
  "order: 1",
  "inferred: false",
  "tags: [testing]",
  "modules:",
  "  - id: xx1000-m1",
  "    slug: m1",
  "    title: Module one",
  "    order: 1",
  "    topic: alpha",
  "    topics:",
  "      - id: xx1000-m1-t1",
  "        title: First item",
  "        concepts:",
  "          - base",
  "        subtopics: []",
  "    resources: []",
  "capstone: Build something",
  "",
].join("\n");

const documentOf = (title: string) =>
  JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2 },
    records: [
      {
        typeName: "document",
        id: "document:document",
        meta: { tldrawkc: { kc: 1, topic: "alpha", title, concepts: ["base"] } },
      },
    ],
  });

describe.skipIf(!reachable.ok)("a copy of a database never writes into the tree its template was imported from", () => {
  let primary: Scratch;
  let copy: Scratch;
  let template: Fixture;
  let own: string;
  let blobHome: string;
  let before: Map<string, string>;

  beforeAll(async () => {
    primary = await createScratchDatabase();
    await applyMigrations(primary.db);
    template = await tree();
    own = await mkdtemp(path.join(tmpdir(), "catalog-copy-own-"));
    blobHome = await mkdtemp(path.join(tmpdir(), "catalog-copy-blobs-"));
    await against(
      primary.name,
      async () => {
        await runImportCommand({ dir: template.root });
        // The tree in the export's own bytes, so the writers find it in step.
        await runExport({ out: template.root });
        await runFlip({ type: "tags" });
      },
      { blobHome },
    );
    copy = await copyScratchDatabase(primary);
    before = await snapshot(template.root);
  }, 120_000);

  afterAll(async () => {
    await copy?.drop();
    await primary?.drop();
    await template?.cleanup();
    for (const dir of [own, blobHome]) if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it("inherits the template's root, and refuses a topic write rather than rewrite that tree", async () => {
    const { rows } = await copy.db.execute<{ root: string }>(
      sql`select metadata ->> 'root' as root from index_run where source = 'topics'`,
    );
    expect(rows[0]?.root).toBe(template.root);
    await expect(
      addTopic(copy.db, { slug: "gamma", title: "Gamma", domain: "testing" }, by),
    ).rejects.toThrow(/topics was last imported from .* by another database \(self_learn_test_\w+:\d+\), not by this one/s);
    await expect(editTopic(copy.db, { slug: "alpha", summary: "changed on the copy" }, by)).rejects.toThrow(
      /another database/,
    );
    await expect(addTag(copy.db, { id: "copied", label: "Copied", description: "on the copy" }, by)).rejects.toThrow(
      /tags was last imported from .* by another database/s,
    );
    // Refused means rolled back: the copy holds no new rows either.
    const { rows: gamma } = await copy.db.execute(sql`select 1 from topic where slug = 'gamma'`);
    expect(gamma).toEqual([]);
    expect(await snapshot(template.root)).toEqual(before);
  });

  it("refuses a pre-flip diagram put on the copy, so the template's learn/assets is never written", async () => {
    const work = await mkdtemp(path.join(tmpdir(), "catalog-copy-put-"));
    try {
      const tldr = path.join(work, "copied.tldr");
      const svg = path.join(work, "copied.svg");
      await writeFile(tldr, documentOf("Copied"));
      await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
      await expect(
        against(
          copy.name,
          () =>
            putDiagram(copy.db, fsStore(path.join(blobHome, "blobs")), {
              slug: "copied",
              tldr,
              svg,
              reason: "on the copy",
              author: "local",
              authorKind: "person",
            }),
          { blobHome },
        ),
      ).rejects.toThrow(/diagrams was last imported from .* by another database/s);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
    expect(await snapshot(template.root)).toEqual(before);
  });

  it("refuses a flip on the copy until the copy has imported a tree of its own", async () => {
    await expect(against(copy.name, () => runFlip({ type: "topics" }))).rejects.toThrow(
      /topics was last imported from .* by another database .* so parity against it would check a tree this database never read/s,
    );
  });

  it("records no export hash for an export into a folder that is not the copy's own root", async () => {
    const result = await against(copy.name, () => runExport({ out: own }), { blobHome });
    expect(result.types.every((t) => !t.recorded)).toBe(true);
  });

  it("writes into the folder the copy was itself imported from, flipped types included, and never the template's", async () => {
    const imported = await against(copy.name, () => runImportCommand({ dir: own }), { blobHome });
    // tags is owned: skipped, but the folder is now where its files are.
    expect(imported.skipped.map((s) => s.source)).toContain("tags");
    const topics = await addTopic(copy.db, { slug: "gamma", title: "Gamma", domain: "testing" }, by);
    expect(topics.exported.map((e) => [e.type, e.root, e.written])).toEqual([
      ["topics", own, ["content/topics.yaml"]],
    ]);
    const tags = await addTag(copy.db, { id: "copied", label: "Copied", description: "on the copy" }, by);
    expect(tags.exported.map((e) => [e.type, e.root])).toEqual([["tags", own]]);
    expect(await readFile(path.join(own, "content/topics.yaml"), "utf8")).toContain("slug: gamma");
    expect(await readFile(path.join(own, "content/tags.yaml"), "utf8")).toContain("id: copied");
    expect(await snapshot(template.root)).toEqual(before);
  }, 60_000);

  it("leaves the template writing its own tree, as before", async () => {
    const result = await addTopic(primary.db, { slug: "delta", title: "Delta", domain: "testing" }, by);
    expect(result.exported[0]?.root).toBe(template.root);
    expect(await readFile(path.join(template.root, "content/topics.yaml"), "utf8")).toContain("slug: delta");
  });
});

describe("a root in another checkout of the repository", () => {
  let base: string;

  beforeAll(async () => {
    base = await mkdtemp(path.join(tmpdir(), "catalog-checkouts-"));
    const main = path.join(base, "main");
    await mkdir(main);
    const git = (cwd: string, ...args: string[]) =>
      run("git", ["-C", cwd, "-c", "user.name=test", "-c", "user.email=test@example.com", ...args]);
    await git(main, "init", "-q");
    await git(main, "commit", "-q", "--allow-empty", "-m", "first");
    await git(main, "worktree", "add", "-q", path.join(base, "other"));
    await mkdir(path.join(base, "main", "content"));
    await mkdir(path.join(base, "other", "content"));
    await mkdir(path.join(base, "loose"));
  });

  afterAll(async () => {
    if (base !== undefined) await rm(base, { recursive: true, force: true });
  });

  it("is named when it lies in another worktree of the checkout this code runs from", async () => {
    const found = await otherCheckout(path.join(base, "other", "content"), path.join(base, "main"));
    expect(found).not.toBeNull();
    expect(path.basename(found ?? "")).toBe("other");
  });

  it("is allowed in the checkout this code runs from, and outside any checkout", async () => {
    expect(await otherCheckout(path.join(base, "main", "content"), path.join(base, "main"))).toBeNull();
    expect(await otherCheckout(path.join(base, "loose"), path.join(base, "main"))).toBeNull();
  });
});

describe.skipIf(!reachable.ok)("a file saved while a write-through is in flight", () => {
  let scratch: Scratch;
  let fixture: Fixture;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await tree();
    await against(scratch.name, async () => {
      await runImportCommand({ dir: fixture.root });
      await runExport({ out: fixture.root });
    });
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
  });

  /** A write-through that edits a topic, while "an editor" saves the file between the check and the rename. */
  const racing = (saved: string, title: string) =>
    writeThrough(scratch.db, ["topics"], async (tx) => {
      const [row] = (await tx.execute(sql`select * from topic where slug = 'alpha'`)).rows as Record<string, unknown>[];
      const latest = (
        await tx.execute<{ id: number }>(
          sql`select max(id)::int as id from content_revision where entity_type = 'topic' and entity_id = 'alpha'`,
        )
      ).rows[0]?.id;
      await writeContent(tx, {
        type: "topic",
        id: "alpha",
        next: {
          row: {
            slug: "alpha",
            title,
            domain: row?.["domain"],
            summary: row?.["summary"],
            aliases: row?.["aliases"],
            position: row?.["position"],
            ownerId: row?.["owner_id"],
          },
        },
        base: latest ?? null,
        ...by,
      });
      await writeFile(path.join(fixture.root, "content/topics.yaml"), saved);
    });

  it("keeps the saved file and puts the database's version beside it as .incoming", async () => {
    const file = path.join(fixture.root, "content/topics.yaml");
    const saved = `${await readFile(file, "utf8")}# saved by hand while the write ran\n`;
    const result = await racing(saved, "Alpha, retitled");
    expect(result.exported[0]?.written).toEqual([]);
    expect(result.exported[0]?.conflicts).toEqual([
      { path: "content/topics.yaml", incoming: "content/topics.yaml.incoming" },
    ]);
    // Without the read just before the rename, the save would be gone.
    expect(await readFile(file, "utf8")).toBe(saved);
    expect(await readFile(`${file}.incoming`, "utf8")).toContain("title: Alpha, retitled");
  });

  it("takes the next free name while an earlier .incoming waits to be merged", async () => {
    const file = path.join(fixture.root, "content/topics.yaml");
    // The tree has to be in step again for the check to let the write start.
    await writeFile(file, await readFile(`${file}.incoming`));
    const saved = `${await readFile(file, "utf8")}# saved again\n`;
    const result = await racing(saved, "Alpha, retitled twice");
    expect(result.exported[0]?.conflicts).toEqual([
      { path: "content/topics.yaml", incoming: "content/topics.yaml.incoming.2" },
    ]);
    expect(await readFile(`${file}.incoming`, "utf8")).toContain("title: Alpha, retitled\n");
    expect(await readFile(`${file}.incoming.2`, "utf8")).toContain("title: Alpha, retitled twice");
    expect(await readFile(file, "utf8")).toBe(saved);
  });
});

describe.skipIf(!reachable.ok)("catalog topic map, once topics are flipped", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let manimkc: string;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await tree();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([
        { slug: "alpha", domain: "testing", concepts: ["base"], courses: ["xx1000-m1"], manimkc: ["one/first"] },
        { slug: "beta", domain: "testing", manimkc: ["two/held"] },
      ]),
    );
    await against(scratch.name, async () => {
      await runImportCommand({ dir: fixture.root });
      await runExport({ out: fixture.root });
      await runFlip({ type: "topics" });
    });
    // A manimkc checkout with one rendered topic folder no topic maps yet: a
    // CLI that answers `topics --json` and `mirrors --json` the way the real
    // one does, with nothing rendered, so no video file is needed.
    manimkc = await mkdtemp(path.join(tmpdir(), "catalog-fake-manimkc-"));
    const cli = path.join(manimkc, "tools", "cli", "manimkc");
    await mkdir(path.dirname(cli), { recursive: true });
    await writeFile(
      cli,
      [
        "import json, sys",
        'root = sys.argv[sys.argv.index("--root") + 1]',
        'if "mirrors" in sys.argv:',
        '    print(json.dumps({"outRoot": root, "destinations": {}}))',
        "else:",
        '    folders = ["one/first", "one/new"]',
        '    print(json.dumps({"outRoot": root, "topics": [{"path": p, "title": p, "topic": None, "out_dir": "out/" + p, "sections": []} for p in folders], "drift": {"orphans": [], "unrendered": []}}))',
        "",
      ].join("\n"),
    );
    await chmod(cli, 0o755);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await fixture?.cleanup();
    if (manimkc !== undefined) await rm(manimkc, { recursive: true, force: true });
  });

  const index = () => against(scratch.name, () => runImportCommand({ dir: fixture.root }), { manimkc });

  it("refuses a hand edit of maps.manimkc, and the index refuses the new folder", async () => {
    await expect(index()).rejects.toThrow(/manimkc topic "one\/new" is in no topic's maps\.manimkc/);
    const file = path.join(fixture.root, "content/topics.yaml");
    const original = await readFile(file, "utf8");
    await writeFile(file, original.replace("manimkc: [one/first]", "manimkc: [one/first, one/new]"));
    try {
      await expect(index()).rejects.toThrow(/the database owns topics.*Edited since the last export/s);
    } finally {
      await writeFile(file, original);
    }
  }, 60_000);

  it("maps the folder through the seam and rewrites the export, after which the index runs", async () => {
    const result = await mapTopic(scratch.db, { slug: "alpha", manimkc: ["one/new"] }, by);
    expect(result).toMatchObject({ slug: "alpha", changed: true, manimkc: ["one/first", "one/new"] });
    expect(result.exported.map((e) => [e.type, e.written])).toEqual([["topics", ["content/topics.yaml"]]]);
    expect(await readFile(path.join(fixture.root, "content/topics.yaml"), "utf8")).toContain(
      "manimkc: [one/first, one/new]",
    );
    const { rows } = await scratch.db.execute<{ reason: string }>(
      sql`select reason from content_revision where entity_type = 'topic' and entity_id = 'alpha' order by seq desc limit 1`,
    );
    expect(rows[0]?.reason).toBe("a test");
    const indexed = await index();
    expect(indexed.skipped.map((s) => s.source)).toContain("topics");
    expect(indexed.sources.map((s) => s.source)).toContain("manimkc");
  }, 60_000);

  it("refuses a folder another topic holds, naming it, and a folder the topic does not map on --remove", async () => {
    await expect(mapTopic(scratch.db, { slug: "alpha", manimkc: ["two/held"] }, by)).rejects.toThrow(
      /two\/held is already mapped to "beta".*catalog topic map beta --manimkc two\/held --remove/s,
    );
    await expect(mapTopic(scratch.db, { slug: "alpha", manimkc: ["two/held"], remove: true }, by)).rejects.toThrow(
      /"alpha" does not map two\/held/,
    );
    await expect(mapTopic(scratch.db, { slug: "alpha", manimkc: ["topics/one/new"] }, by)).rejects.toThrow(
      /manimkc's "topics\/" dropped/,
    );
  });

  it("unmaps with --remove, and the index then refuses the folder again", async () => {
    const result = await mapTopic(scratch.db, { slug: "alpha", manimkc: ["one/new"], remove: true }, by);
    expect(result.manimkc).toEqual(["one/first"]);
    await expect(index()).rejects.toThrow(/manimkc topic "one\/new" is in no topic's maps\.manimkc/);
  }, 60_000);
});
