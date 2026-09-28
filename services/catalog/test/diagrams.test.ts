import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { fsStore, type BlobStore } from "@self-learn/blob";
import { fileSource } from "@self-learn/content";
import { assetJob, blobObject, diagram, job } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runExport } from "../src/commands/export";
import { runImportCommand } from "../src/commands/index-command";
import { runParity } from "../src/commands/parity";
import { dbSource } from "../src/content/source";
import { flip } from "../src/content/flip";
import {
  checkoutDiagram,
  commitDiagram,
  DiagramError,
  documentBytes,
  documentHash,
  listDiagrams,
  putDiagram,
  putSvgOnly,
  type PutInput,
} from "../src/content/diagrams";
import { connect } from "../src/db";
import { REPO_ROOT } from "../src/env";
import { canvasCliPath, hasCanvasCli } from "../src/index/tldr";
import { lockEntity } from "../src/content/revisions";
import { cliScope } from "../src/content/scope";
import { applyMigrations } from "../src/migrations";
import { makeFixture, note, tagsYaml, topicsYaml, type Fixture } from "./fixture-tree";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";
import { LOCAL_LEARNER_ID, ownerScope } from "@self-learn/schema";

/** Who these reads are for: the one owner there is today (phase 4 scoping). */
const LOCAL = ownerScope(LOCAL_LEARNER_ID);

/**
 * Diagrams in the database (Track D of docs/CONTENT-MIGRATION.md): the import
 * that stores a `.tldr` as a row and its SVG as a blob, the export and parity
 * that give them back, and `put`, `checkout` and `commit`, the write path the
 * studio's Accept and the plugin use.
 *
 * Everything is written under the OS temp directory: the fixture tree, the
 * blob store's root and the checkouts. The tracked `learn/assets/` is never
 * read or written here.
 */

const reachable = await probe();
const run = promisify(execFile);

function documentOf(over: { topic?: string; title?: string; concepts?: string[]; shapes?: number } = {}): string {
  const shapes = Array.from({ length: over.shapes ?? 2 }, (_, i) => ({
    typeName: "shape",
    id: `shape:s${i}`,
    type: "geo",
    x: i * 10,
    y: 0,
    props: { w: 100, h: 50 },
  }));
  return JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2 },
    records: [
      ...shapes,
      {
        typeName: "document",
        id: "document:document",
        gridSize: 10,
        name: "",
        meta: {
          tldrawkc: {
            kc: 1,
            topic: over.topic ?? "alpha",
            title: over.title ?? "A test diagram",
            concepts: over.concepts ?? ["base"],
            created: "2026-09-28T00:00:00.000Z",
          },
        },
      },
      { typeName: "page", id: "page:page", name: "Page 1", index: "a1", meta: {} },
    ],
  });
}

const svgOf = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>${label}</title></svg>`;

/** Point the command runners, which connect through DATABASE_URL, at a scratch database. */
function pointAt(name: string, blobHome: string): () => void {
  const keys = ["DATABASE_URL", "MANIMKC_ROOT", "SELF_LEARN_HOME"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const url = new URL(process.env["DATABASE_URL"] ?? "postgres://localhost:5432/self_learn");
  url.pathname = `/${name}`;
  process.env["DATABASE_URL"] = url.toString();
  process.env["MANIMKC_ROOT"] = path.join(tmpdir(), "catalog-test-no-manimkc");
  process.env["SELF_LEARN_HOME"] = blobHome;
  return () => {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function tree(): Promise<Fixture> {
  const fixture = await makeFixture();
  await fixture.write(
    "content/topics.yaml",
    topicsYaml([
      { slug: "alpha", domain: "testing", concepts: ["base"], courses: ["xx1000-m1"] },
      { slug: "beta", domain: "testing" },
    ]),
  );
  await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
  await fixture.write(
    "content/courses/xx1000.yaml",
    [
      "id: xx1000",
      "slug: xx1000",
      "code: XX1000",
      "title: A test course",
      "credits: 4",
      "order: 1",
      "inferred: false",
      "tags: []",
      "modules:",
      "  - id: xx1000-m1",
      "    slug: m1",
      "    title: Module one",
      "    order: 1",
      "    topic: alpha",
      "    topics:",
      "      - id: xx1000-m1-t1",
      "        title: First item",
      "        concepts: [base]",
      "        subtopics: []",
      "    resources: []",
      "capstone: Build something",
      "",
    ].join("\n"),
  );
  await fixture.write("learn/concepts/testing/base.md", note({ id: "base", title: "Base" }));
  await fixture.write("learn/assets/first-diagram.tldr", documentOf({ title: "First" }));
  await fixture.write("learn/assets/first-diagram.svg", svgOf("first"));
  return fixture;
}

describe.skipIf(!reachable.ok)("diagrams in the database", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let work: string;
  let blobHome: string;
  let store: BlobStore;
  let restore: () => void;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    fixture = await tree();
    work = await mkdtemp(path.join(tmpdir(), "catalog-diagram-work-"));
    blobHome = await mkdtemp(path.join(tmpdir(), "catalog-diagram-blobs-"));
    store = fsStore(path.join(blobHome, "blobs"));
    restore = pointAt(scratch.name, blobHome);
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await scratch?.drop();
    await fixture?.cleanup();
    for (const dir of [work, blobHome]) if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  /** A file outside every tree, as a job's candidate is. */
  async function file(name: string, contents: string): Promise<string> {
    const target = path.join(work, "files", name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
    return target;
  }

  const put = (over: Partial<PutInput> & Pick<PutInput, "slug" | "tldr">) =>
    putDiagram(scratch.db, store, {
      svg: null,
      reason: "a test",
      author: "local",
      authorKind: "person",
      ...over,
    });

  it("imports a .tldr as a diagram row and its SVG as a blob", async () => {
    const result = await runImportCommand({ dir: fixture.root });
    const written = result.sources.find((s) => s.source === "diagrams");
    expect(written?.revisions).toEqual({ asset: 2, diagram: 1 });

    const [row] = await scratch.db.select().from(diagram).where(eq(diagram.slug, "first-diagram"));
    const source = JSON.parse(documentOf({ title: "First" })) as unknown;
    expect(row?.document).toEqual(source);
    expect(row?.documentHash).toBe(documentHash(source));
    expect(row?.topicSlug).toBe("alpha");
    expect(row?.svgDocumentHash).toBe(row?.documentHash);

    const [blob] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, row?.svgBlobKey ?? ""));
    expect(blob?.state).toBe("present");
    expect(await readFile(path.join(blobHome, "blobs", blob?.key ?? ""), "utf8")).toBe(svgOf("first"));

    const [listed] = await listDiagrams(scratch.db, cliScope());
    expect(listed).toMatchObject({
      slug: "first-diagram",
      title: "First",
      topic: "alpha",
      concepts: ["base"],
      shapes: 2,
      svgState: "current",
      path: "learn/assets/first-diagram.tldr",
      svgPath: "learn/assets/first-diagram.svg",
    });
  });

  it("reads a diagram back through the seam exactly as the file source reads it", async () => {
    const fromRows = await dbSource(scratch.db, LOCAL).diagram("first-diagram");
    const fromFiles = await fileSource(fixture.root).diagram("first-diagram");
    expect(fromRows).toEqual(fromFiles);
    expect(await dbSource(scratch.db, LOCAL).diagram("no-such-diagram")).toBeNull();
  });

  it("writes zero revisions and uploads nothing on a second import", async () => {
    const result = await runImportCommand({ dir: fixture.root, only: ["diagrams"] });
    const written = result.sources.find((s) => s.source === "diagrams");
    expect(written?.revisions).toEqual({});
    expect(written?.notes).toContain("1 file(s) in the blob store, 0 uploaded by this run");
  });

  it("exports the document and the SVG from the database, with parity clean against the files", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "catalog-diagram-export-"));
    try {
      await runExport({ out, only: ["diagrams"] });
      expect(await readFile(path.join(out, "learn/assets/first-diagram.svg"), "utf8")).toBe(svgOf("first"));
      const exported = JSON.parse(await readFile(path.join(out, "learn/assets/first-diagram.tldr"), "utf8")) as unknown;
      expect(exported).toEqual(JSON.parse(documentOf({ title: "First" })));
      const parity = await runParity({ dir: fixture.root, only: ["diagrams"] });
      expect(parity.clean).toBe(true);
      expect(parity.types[0]?.counts.expected).toEqual({ svg: 1, tldr: 1 });
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  it("puts a diagram as a row and a blob, and writes it through to the files that still own diagrams", async () => {
    const result = await put({
      slug: "second-diagram",
      tldr: await file("second.tldr", documentOf({ title: "Second" })),
      svg: await file("second.svg", svgOf("second")),
      base: null,
    });
    expect(result.changed).toBe(true);
    expect(result.svg?.uploaded).toBe(true);
    // D17: until the flip an index reads these files, so they must hold the write.
    expect(result.files).toEqual(["learn/assets/second-diagram.svg", "learn/assets/second-diagram.tldr"]);
    expect(await readFile(path.join(fixture.root, "learn/assets/second-diagram.svg"), "utf8")).toBe(svgOf("second"));
    // Written as the export writes it: the document's canonical JSON.
    expect(await readFile(path.join(fixture.root, "learn/assets/second-diagram.tldr"))).toEqual(
      documentBytes(JSON.parse(documentOf({ title: "Second" }))),
    );
    const again = await runImportCommand({ dir: fixture.root, only: ["diagrams"] });
    expect(again.sources.find((s) => s.source === "diagrams")?.revisions).toEqual({});

    const history = await scratch.db.execute<{ entity_type: string; op: string; reason: string }>(
      sql`select entity_type, op, reason from content_revision
          where entity_id in ('second-diagram', 'diagram:learn/assets/second-diagram.tldr', 'diagram:learn/assets/second-diagram.svg')
          order by id`,
    );
    expect(history.rows).toEqual([
      { entity_type: "diagram", op: "create", reason: "a test" },
      { entity_type: "asset", op: "create", reason: "a test" },
      { entity_type: "asset", op: "create", reason: "a test" },
    ]);
    const svgAsset = await scratch.db.execute<{ blob_key: string; path: string }>(
      sql`select blob_key, path from asset where id = 'diagram:learn/assets/second-diagram.svg'`,
    );
    expect(svgAsset.rows[0]).toEqual({ blob_key: result.svg?.key, path: "learn/assets/second-diagram.svg" });
  });

  it("keeps the stored SVG when a put brings none, and calls it stale", async () => {
    const result = await put({
      slug: "second-diagram",
      tldr: await file("second-b.tldr", documentOf({ title: "Second, again", shapes: 3 })),
    });
    expect(result.svg?.current).toBe(false);
    const [listed] = await listDiagrams(scratch.db, cliScope(), "second-diagram");
    expect(listed?.svgState).toBe("stale");
    expect(listed?.shapes).toBe(3);
  });

  it("keeps an SVG stale through the next import, since the database knows what it was exported from", async () => {
    // The put above changed the document and kept the SVG, and wrote only the
    // .tldr through; the SVG on disk is still the old bytes.
    await runImportCommand({ dir: fixture.root, only: ["diagrams"] });
    const [listed] = await listDiagrams(scratch.db, cliScope(), "second-diagram");
    expect(listed?.svgState).toBe("stale");
  });

  it("refuses a document whose topic or stamp does not resolve, by name", async () => {
    await expect(
      put({ slug: "third-diagram", tldr: await file("bad-topic.tldr", documentOf({ topic: "nowhere" })) }),
    ).rejects.toThrow(/names topic "nowhere"/);
    const unstamped = JSON.stringify({ records: [{ typeName: "document", id: "document:document", meta: {} }] });
    await expect(put({ slug: "third-diagram", tldr: await file("unstamped.tldr", unstamped) })).rejects.toThrow(
      /carries no tldrawkc metadata/,
    );
    await expect(put({ slug: "Not A Slug", tldr: await file("x.tldr", documentOf()) })).rejects.toThrow(
      /not a diagram slug/,
    );
  });

  it("leaves a pending row and no asset change when the upload is interrupted", async () => {
    const failing: BlobStore = {
      ...store,
      put: async (_key, body) => {
        body.destroy();
        throw new Error("the disk went away");
      },
    };
    const assetBefore = await scratch.db.execute(sql`select * from asset where id like 'diagram:learn/assets/first-diagram%' order by id`);
    const [diagramBefore] = await scratch.db.select().from(diagram).where(eq(diagram.slug, "first-diagram"));
    await expect(
      putDiagram(scratch.db, failing, {
        slug: "first-diagram",
        tldr: await file("first-c.tldr", documentOf({ title: "First, edited" })),
        svg: await file("first-c.svg", svgOf("first, edited")),
        reason: "an interrupted accept",
        author: "local",
        authorKind: "person",
      }),
    ).rejects.toThrow("the disk went away");

    const pending = await scratch.db.select().from(blobObject).where(eq(blobObject.state, "pending"));
    expect(pending).toHaveLength(1);
    expect(pending[0]?.bytes).toBe(Buffer.byteLength(svgOf("first, edited")));
    const assetAfter = await scratch.db.execute(sql`select * from asset where id like 'diagram:learn/assets/first-diagram%' order by id`);
    expect(assetAfter.rows).toEqual(assetBefore.rows);
    const [diagramAfter] = await scratch.db.select().from(diagram).where(eq(diagram.slug, "first-diagram"));
    expect(diagramAfter).toEqual(diagramBefore);
  });

  it("checks out, refuses a commit whose base moved, and keeps the checkout", async () => {
    const dir = path.join(work, "checkouts");
    const out = await checkoutDiagram(scratch.db, store, "first-diagram", dir, cliScope());
    expect(out.revision).not.toBeNull();
    expect(JSON.parse(await readFile(out.path, "utf8"))).toEqual(JSON.parse(documentOf({ title: "First" })));
    expect(await readFile(path.join(dir, "first-diagram.svg"), "utf8")).toBe(svgOf("first"));

    // Somebody else writes first.
    await put({ slug: "first-diagram", tldr: await file("first-d.tldr", documentOf({ title: "First, theirs" })) });

    const mine = documentOf({ title: "First, mine" });
    await writeFile(out.path, mine);
    await expect(
      commitDiagram(scratch.db, store, { slug: "first-diagram", dir, reason: "mine", author: "local", authorKind: "person" }),
    ).rejects.toMatchObject({ code: "stale-base" });
    expect(await readFile(out.path, "utf8")).toBe(mine);

    // A checkout with edits nobody committed is not overwritten.
    await expect(checkoutDiagram(scratch.db, store, "first-diagram", dir, cliScope())).rejects.toBeInstanceOf(DiagramError);
    const fresh = await checkoutDiagram(scratch.db, store, "first-diagram", dir, cliScope(), { force: true });
    expect(JSON.parse(await readFile(fresh.path, "utf8"))).toEqual(JSON.parse(documentOf({ title: "First, theirs" })));

    // From the latest base, the same edit goes through.
    await writeFile(fresh.path, mine);
    const committed = await commitDiagram(scratch.db, store, {
      slug: "first-diagram",
      dir,
      reason: "mine, again",
      author: "local",
      authorKind: "person",
    });
    expect(committed.changed).toBe(true);
    expect(committed.base).toBe(fresh.revision);
    expect(committed.title).toBe("First, mine");
  });

  it("starts a new diagram from a checkout of a slug that does not exist", async () => {
    const dir = path.join(work, "checkouts");
    const out = await checkoutDiagram(scratch.db, store, "brand-new", dir, cliScope());
    expect(out).toMatchObject({ exists: false, revision: null });
    await expect(stat(out.path)).rejects.toThrow();
    await writeFile(out.path, documentOf({ title: "Brand new" }));
    await writeFile(path.join(dir, "brand-new.svg"), svgOf("brand new"));
    const committed = await commitDiagram(scratch.db, store, {
      slug: "brand-new",
      dir,
      reason: "drawn in a checkout",
      author: "diagram-maker",
      authorKind: "agent",
    });
    expect(committed.svg?.current).toBe(true);
    const [listed] = await listDiagrams(scratch.db, cliScope(), "brand-new");
    expect(listed?.svgState).toBe("current");
  });

  it("records a job's output, refuses a topic other than the job's, and retries as a no-op", async () => {
    await scratch.db.insert(job).values({
      id: "job-one",
      kind: "diagram",
      state: "awaiting_review",
      topicSlug: "alpha",
      targetPath: "learn/assets/job-diagram.tldr",
      idempotencyKey: "job-one",
    });
    const tldr = await file("job.tldr", documentOf({ title: "From a job" }));
    const svg = await file("job.svg", svgOf("from a job"));
    await expect(
      put({ slug: "job-diagram", tldr: await file("job-beta.tldr", documentOf({ topic: "beta" })), jobId: "job-one" }),
    ).rejects.toThrow(/enqueued under "alpha"/);
    await expect(put({ slug: "other-diagram", tldr, jobId: "job-one" })).rejects.toThrow(/targets learn\/assets\/job-diagram.tldr/);

    const first = await put({ slug: "job-diagram", tldr, svg, jobId: "job-one", base: null });
    const outputs = await scratch.db.select().from(assetJob).where(eq(assetJob.jobId, "job-one"));
    expect(outputs.map((o) => o.assetId).sort()).toEqual([
      "diagram:learn/assets/job-diagram.svg",
      "diagram:learn/assets/job-diagram.tldr",
    ]);
    const revisions = await scratch.db.execute<{ job_id: string }>(
      sql`select distinct job_id from content_revision where job_id is not null`,
    );
    expect(revisions.rows).toEqual([{ job_id: "job-one" }]);

    // The studio died after the put and before it recorded the accept: the
    // retry starts from the same base, finds its own write, and changes nothing.
    const again = await put({ slug: "job-diagram", tldr, svg, jobId: "job-one", base: null });
    expect(again.changed).toBe(false);
    expect(again.revision).toBe(first.revision);

    // Different bytes from the same base are a new write, not a retry.
    await expect(
      put({ slug: "job-diagram", tldr: await file("job-b.tldr", documentOf({ title: "Changed" })), jobId: "job-one", base: null }),
    ).rejects.toMatchObject({ code: "stale-base" });

    // Once accepted, the job's output is a record: an identical retry is still
    // fine, and anything else under its name is refused.
    await scratch.db.update(job).set({ state: "accepted" }).where(eq(job.id, "job-one"));
    expect((await put({ slug: "job-diagram", tldr, svg, jobId: "job-one", base: null })).changed).toBe(false);
    await expect(
      put({ slug: "job-diagram", tldr: await file("job-c.tldr", documentOf({ title: "Later" })), jobId: "job-one" }),
    ).rejects.toThrow(/is accepted/);
  });

  it("counts an exported SVG as an edit a refresh must not throw away", async () => {
    const dir = path.join(work, "svg-checkouts");
    await checkoutDiagram(scratch.db, store, "second-diagram", dir, cliScope());
    await writeFile(path.join(dir, "second-diagram.svg"), svgOf("exported, not committed"));
    await put({ slug: "second-diagram", tldr: await file("second-c.tldr", documentOf({ title: "Moved on" })) });
    await expect(checkoutDiagram(scratch.db, store, "second-diagram", dir, cliScope())).rejects.toMatchObject({
      code: "dirty-checkout",
    });
    expect(await readFile(path.join(dir, "second-diagram.svg"), "utf8")).toBe(svgOf("exported, not committed"));
  });

  const putSvg = async (slug: string, topic: string, concepts: string[], contents: string) =>
    putSvgOnly(scratch.db, store, {
      slug,
      svg: await file(`${slug}-only.svg`, contents),
      topic,
      concepts,
      reason: "drawn by hand",
      author: "diagram-maker",
      authorKind: "agent",
    });

  it("stores an SVG drawn without the canvas as an asset and a blob, which the next import leaves alone", async () => {
    const result = await putSvg("base", "alpha", ["base"], svgOf("by hand"));
    expect(result).toMatchObject({ changed: true, concepts: ["base"], files: ["learn/assets/base.svg"] });
    expect(await readFile(path.join(fixture.root, "learn/assets/base.svg"), "utf8")).toBe(svgOf("by hand"));
    const [row] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, result.svg?.key ?? ""));
    expect(row?.state).toBe("present");
    // Filed by its name, which is what the import reads it back as.
    const again = await runImportCommand({ dir: fixture.root, only: ["diagrams"] });
    expect(again.sources.find((s) => s.source === "diagrams")?.revisions).toEqual({});
  });

  it("refuses an SVG on its own that the import would file differently, or whose slug has a document", async () => {
    // "hand-drawn" names no concept, so the import would file it under no topic.
    await expect(putSvg("hand-drawn", "alpha", [], svgOf("x"))).rejects.toMatchObject({ code: "write-through" });
    // "base" is under alpha, not beta.
    await expect(putSvg("base", "beta", ["base"], svgOf("x"))).rejects.toMatchObject({ code: "write-through" });
    await expect(putSvg("first-diagram", "alpha", [], svgOf("x"))).rejects.toMatchObject({ code: "unresolved" });
    await expect(readdir(path.join(fixture.root, "learn/assets"))).resolves.not.toContain("hand-drawn.svg");
  });

  it("refuses an SVG on its own while a document for its slug waits on disk for an import", async () => {
    // Review on #143: the next import would file the SVG under that document's stamp.
    await fixture.write("learn/assets/base.tldr", documentOf({ title: "Not imported yet" }));
    try {
      await expect(putSvg("base", "alpha", ["base"], svgOf("x"))).rejects.toThrow(/not imported yet/);
    } finally {
      await rm(path.join(fixture.root, "learn/assets/base.tldr"), { force: true });
    }
  });

  it("writes no file once the database owns diagrams", async () => {
    await flip(scratch.db, { type: "diagrams", readers: new Set(["diagrams"]) });
    const before = await readdir(path.join(fixture.root, "learn/assets"));
    const result = await put({
      slug: "after-the-flip",
      tldr: await file("after.tldr", documentOf({ title: "After" })),
      svg: await file("after.svg", svgOf("after")),
    });
    expect(result.changed).toBe(true);
    expect(result.files).toEqual([]);
    expect(await readdir(path.join(fixture.root, "learn/assets"))).toEqual(before);
    const [listed] = await listDiagrams(scratch.db, cliScope(), "after-the-flip");
    expect(listed?.svgState).toBe("current");
    // An SVG on its own is filed as named once no import reads files back.
    const bare = await putSvg("hand-drawn", "beta", [], svgOf("after, by hand"));
    expect(bare).toMatchObject({ changed: true, files: [], concepts: [] });
    expect(await readdir(path.join(fixture.root, "learn/assets"))).toEqual(before);
  });

  it("refuses an SVG on its own when a document lands while it waits, rather than replacing that document's SVG", async () => {
    // Review on #143: the no-document answer has to hold through the write.
    // A second connection plays the document put: it holds the SVG asset's
    // lock, waits until the SVG-only put is blocked on that lock (so it has
    // already passed its early check and read nothing under the lock yet),
    // then lands the document and commits. The put must find it then.
    const slug = "raced";
    const other = connect({ url: scratch.url });
    let pending: Promise<unknown> = Promise.resolve();
    try {
      await other.db.transaction(async (tx) => {
        await lockEntity(tx, "asset", `diagram:learn/assets/${slug}.svg`);
        pending = putSvg(slug, "beta", [], svgOf("by hand, late"));
        pending.catch(() => undefined);
        const deadline = Date.now() + 10_000;
        for (;;) {
          const waiting = await tx.execute<{ n: number }>(
            // This scratch database is this file's alone, and its tests run one at a time.
            sql`select count(*)::int as n from pg_locks
                where locktype = 'advisory' and not granted
                  and database = (select oid from pg_database where datname = current_database())`,
          );
          if ((waiting.rows[0]?.n ?? 0) > 0) break;
          if (Date.now() > deadline) throw new Error("the SVG-only put never waited on the lock");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await putDiagram(tx, store, {
          slug,
          tldr: await file("raced.tldr", documentOf({ title: "Raced" })),
          svg: await file("raced.svg", svgOf("exported")),
          reason: "a test",
          author: "local",
          authorKind: "person",
        });
      });
    } finally {
      await other.close();
    }
    await expect(pending).rejects.toMatchObject({ code: "unresolved" });
    const [row] = await scratch.db.select().from(diagram).where(eq(diagram.slug, slug));
    const assets = await scratch.db.execute<{ blob_key: string }>(
      sql`select blob_key from asset where id = ${`diagram:learn/assets/${slug}.svg`}`,
    );
    expect(assets.rows[0]?.blob_key).toBe(row?.svgBlobKey);
  });

  it.skipIf(!hasCanvasCli(REPO_ROOT))("lists what `tldrawkc list` lists for the same documents", async () => {
    // Put the fixture's own file back, so both sides read one document.
    await put({ slug: "first-diagram", tldr: path.join(fixture.root, "learn/assets/first-diagram.tldr") });
    const { stdout } = await run("node", [canvasCliPath(REPO_ROOT), "list", path.join(fixture.root, "learn/assets"), "--json"]);
    const tool = (JSON.parse(stdout) as { diagrams: { name: string; shapes: number; meta: Record<string, unknown> }[] })
      .diagrams.find((d) => d.name === "first-diagram");
    const [ours] = await listDiagrams(scratch.db, cliScope(), "first-diagram");
    expect(ours).toMatchObject({
      shapes: tool?.shapes,
      title: tool?.meta.title,
      topic: tool?.meta.topic,
      concepts: tool?.meta.concepts,
      created: tool?.meta.created,
    });
  });
});
