import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { asset, assetDerivation, blobObject, LOCAL_LEARNER_ID, ownerScope } from "@self-learn/schema";

import { runImportCommand } from "../../../../../../services/catalog/src/commands/index-command";
import { documentBytes } from "../../../../../../services/catalog/src/content/diagram-document";
import { flip } from "../../../../../../services/catalog/src/content/flip";
import { commitNoteText, noteRevision } from "../../../../../../services/catalog/src/content/note-rows";
import { appendLog, logAssetId } from "../../../../../../services/catalog/src/content/session-logs";
import { dbSource } from "../../../../../../services/catalog/src/content/source";
import { applyMigrations } from "../../../../../../services/catalog/src/migrations";
import { BEFORE_BLOB_CONTRACT, partialMigrations } from "../../../../../../services/catalog/test/partial-migrations";
import {
  makeFixture,
  note,
  tagsYaml,
  topicsYaml,
  type Fixture,
} from "../../../../../../services/catalog/test/fixture-tree";
import {
  createScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

/**
 * The asset routes and the pages' checks once the database owns notes, logs
 * and diagrams (S4 and S5 of the phase 1 review, docs/CONTENT-MIGRATION.md).
 *
 * A fixture tree is imported into a scratch database and `concepts`,
 * `sessions` and `diagrams` are flipped for real. `ASSET_FILES_ENABLED` is off
 * for the whole file, and none of these rows has a file under this checkout
 * (the legacy branch resolves `self-learn` paths against the repository, not
 * the fixture), so a 200 can only have come from a row or the blob store.
 * Before the fix a note came back as its tree file as of the flip, a log
 * started after the flip was 404 `file-missing`, a `.tldr` was
 * `unsupported-type`, and every page said "files off" for an SVG the route
 * served from the store.
 */

// The routes call the handlers directly, outside the request scope Next sets
// up, where `connection()` throws; inside a real request it resolves at once.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

const reachable = await probe();
const ORIGIN = "http://localhost:3000";

const NOTE_ID = "note:learn/concepts/testing/base.md";
const TLDR_ID = "diagram:learn/assets/first-diagram.tldr";
const SVG_ID = "diagram:learn/assets/first-diagram.svg";
const OLD_LOG_ID = "session:learn/sessions/2026-01-01-old.md";
const LEGACY_ID = "manimkc:out/testing/legacy/legacy.mp4";
const STORED_ID = "manimkc:out/testing/stored/stored.mp4";
const BARE_ID = "manimkc:out/testing/bare/bare.mp4";
const LEGACY_TRANSCRIPT_ID = "manimkc:out/testing/legacy/legacy.transcript.json";

const OLD_LOG =
  "---\ntitle: Old\ndate: 2026-01-01T00:00:00.000Z\ngoal: base\ntype: learning-session\n---\n\n# Old\n\n> Live log.\n- [[base]] once\n\n";

function documentOf(): string {
  return JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2 },
    records: [
      { typeName: "shape", id: "shape:s0", type: "geo", x: 0, y: 0, props: { w: 100, h: 50 } },
      {
        typeName: "document",
        id: "document:document",
        gridSize: 10,
        name: "",
        meta: {
          tldrawkc: {
            kc: 1,
            topic: "alpha",
            title: "First",
            concepts: ["base"],
            created: "2026-09-28T00:00:00.000Z",
          },
        },
      },
      { typeName: "page", id: "page:page", name: "Page 1", index: "a1", meta: {} },
    ],
  });
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>first</title></svg>`;

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

describe.skipIf(!reachable.ok)("asset routes on a flipped database", () => {
  let scratch: Scratch;
  let fixture: Fixture;
  let home: string;
  let FILE: Handler;
  let STATUS: Handler;
  let library: typeof import("@/lib/asset-library");
  const saved: Record<string, string | undefined> = {};

  const call = (handler: Handler, suffix: string, id: string, headers: Record<string, string> = {}) =>
    handler(new Request(`${ORIGIN}/api/assets/${encodeURIComponent(id)}/${suffix}`, { headers }), {
      params: Promise.resolve({ id }),
    });

  beforeAll(async () => {
    for (const key of ["DATABASE_URL", "SELF_LEARN_HOME", "MANIMKC_ROOT", "ASSET_FILES_ENABLED", "CONTENT_SOURCE"]) {
      saved[key] = process.env[key];
    }
    scratch = await createScratchDatabase();
    // At 0012: these rows carry a path and no blob, which the contract (0013)
    // forbids; p2/readers-db-only rewrites the suite for the contract.
    await applyMigrations(scratch.db, { folder: await partialMigrations(BEFORE_BLOB_CONTRACT) });
    home = await mkdtemp(path.join(tmpdir(), "asset-rows-"));
    process.env.DATABASE_URL = scratch.url;
    process.env.SELF_LEARN_HOME = home;
    process.env.MANIMKC_ROOT = path.join(tmpdir(), "asset-rows-no-manimkc");
    delete process.env.ASSET_FILES_ENABLED;
    delete process.env.CONTENT_SOURCE;

    fixture = await makeFixture();
    await fixture.write(
      "content/topics.yaml",
      topicsYaml([{ slug: "alpha", domain: "testing", concepts: ["base"], courses: ["xx1000-m1"] }]),
    );
    await fixture.write("content/tags.yaml", tagsYaml(["testing"]));
    await fixture.write(
      "content/courses/xx1000.yaml",
      [
        "id: xx1000", "slug: xx1000", "code: XX1000", "title: A test course", "credits: 4", "order: 1",
        "inferred: false", "tags: []", "modules:", "  - id: xx1000-m1", "    slug: m1",
        "    title: Module one", "    order: 1", "    topic: alpha", "    topics:", "      - id: xx1000-m1-t1",
        "        title: First item", "        subtopics: []", "    resources: []", "capstone: Build something", "",
      ].join("\n"),
    );
    await fixture.write(
      "learn/concepts/testing/base.md",
      note({ id: "base", title: "Base", body: "# Base\n\nSee ![[first-diagram.svg]] for the picture.\n" }),
    );
    await fixture.write("learn/sessions/2026-01-01-old.md", OLD_LOG);
    await fixture.write("learn/assets/first-diagram.tldr", documentOf());
    await fixture.write("learn/assets/first-diagram.svg", SVG);

    await runImportCommand({ dir: fixture.root });
    // A render the store never took: the one row here that needs the disk.
    // Written before the flips, which arm the guard against direct writes.
    // Two videos in the store, only one with a stored poster, as an upload
    // that ran without ffmpeg leaves them. Rows only: the thumbnail decision
    // reads the table, and the card asks the route for the bytes.
    const present = (n: string) => ({
      key: `local/${n.repeat(64)}.${n === "c" ? "jpg" : "mp4"}`,
      sha256: n.repeat(64),
      bytes: 1,
      mime: "video/mp4",
      provider: "fs",
      state: "present",
      confirmedAt: new Date(),
    });
    await scratch.db.insert(blobObject).values([present("a"), present("b"), present("c")]);
    const video = (id: string, file: string, blobKey: string | null, kind = "video") => ({
      id,
      kind,
      path: file,
      url: null,
      contentHash: "0".repeat(64),
      bytes: 10,
      title: id,
      sourceRepo: kind === "poster" ? "self-learn" : "manimkc",
      blobKey,
    });
    await scratch.db.insert(asset).values([
      video(LEGACY_ID, "out/testing/legacy/legacy.mp4", null),
      video(LEGACY_TRANSCRIPT_ID, "out/testing/legacy/legacy.transcript.json", null, "transcript"),
      video(STORED_ID, "out/testing/stored/stored.mp4", `local/${"a".repeat(64)}.mp4`),
      video(BARE_ID, "out/testing/bare/bare.mp4", `local/${"b".repeat(64)}.mp4`),
      { ...video(`poster:${STORED_ID}`, "", `local/${"c".repeat(64)}.jpg`, "poster"), path: null },
    ]);
    await scratch.db.insert(assetDerivation).values({ assetId: `poster:${STORED_ID}`, sourceAssetId: STORED_ID });
    for (const type of ["concepts", "sessions", "diagrams"] as const) await flip(scratch.db, { type });

    ({ GET: FILE } = (await import("./[id]/file/route")) as { GET: Handler });
    ({ GET: STATUS } = (await import("./[id]/status/route")) as { GET: Handler });
    library = await import("@/lib/asset-library");
  }, 120_000);

  afterAll(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await scratch?.drop();
    await fixture?.cleanup();
    if (home !== undefined) await rm(home, { recursive: true, force: true });
  });

  it("serves a note as its row renders it, with a line committed after the flip", async () => {
    const base = await noteRevision(scratch.db, "base");
    const current = (await dbSource(scratch.db, ownerScope(LOCAL_LEARNER_ID)).concept("base"))?.markdown ?? "";
    await commitNoteText(scratch.db, "base", current.replace(/\n$/, "\n\nA line only the row has.\n"), {
      base,
      reason: "a test commit after the flip",
    });

    const response = await call(FILE, "file", NOTE_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    const body = await response.text();
    expect(body).toBe((await dbSource(scratch.db, ownerScope(LOCAL_LEARNER_ID)).concept("base"))?.markdown);
    expect(body).toContain("A line only the row has.");
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength(body, "utf8")));
  });

  it("answers a Range request on row text with the slice", async () => {
    const whole = Buffer.from((await dbSource(scratch.db, ownerScope(LOCAL_LEARNER_ID)).concept("base"))?.markdown ?? "", "utf8");
    const response = await call(FILE, "file", NOTE_ID, { range: "bytes=0-2" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 0-2/${whole.length}`);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(whole.subarray(0, 3));
    expect((await call(FILE, "file", NOTE_ID, { range: `bytes=${whole.length + 5}-` })).status).toBe(416);
  });

  it("serves a log as its entries concatenated, including one started after the flip", async () => {
    const old = await call(FILE, "file", OLD_LOG_ID);
    expect(old.status).toBe(200);
    expect(await old.text()).toBe(OLD_LOG);

    const id = "2026-09-28-after-flip";
    await appendLog(scratch.db, id, "---\ntitle: After\n---\n\n# After\n\n", { reason: "a test start" });
    await appendLog(scratch.db, id, "- [[base]] asked and answered\n\n", { reason: "a test log" });
    const fresh = await call(FILE, "file", logAssetId(id));
    expect(fresh.status).toBe(200);
    expect(await fresh.text()).toBe("---\ntitle: After\n---\n\n# After\n\n- [[base]] asked and answered\n\n");
  });

  it("serves a .tldr as the canonical JSON the database stores", async () => {
    const response = await call(FILE, "file", TLDR_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(documentBytes(JSON.parse(documentOf())));
  });

  it("serves the SVG from the blob store with the switch off", async () => {
    const response = await call(FILE, "file", SVG_ID);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SVG);
  });

  it("says ok on the status route for every row-backed asset, and files-off for the one on disk", async () => {
    for (const id of [NOTE_ID, TLDR_ID, SVG_ID, OLD_LOG_ID]) {
      const response = await call(STATUS, "status", id);
      expect({ id, status: response.status }).toEqual({ id, status: 200 });
    }
    const legacy = await call(STATUS, "status", LEGACY_ID);
    expect(legacy.status).toBe(404);
    expect(((await legacy.json()) as { code: string }).code).toBe("files-off");
  });

  it("reads the files again when CONTENT_SOURCE points the type back at them", async () => {
    process.env.CONTENT_SOURCE = "concepts=files";
    try {
      const response = await call(FILE, "file", NOTE_ID);
      // The legacy branch, which the switch gates.
      expect(response.status).toBe(404);
      expect(((await response.json()) as { code: string }).code).toBe("files-off");
    } finally {
      delete process.env.CONTENT_SOURCE;
    }
  });

  it("decides the pages' answers per row, so a stored or row-backed asset is not 'files off'", async () => {
    const problems = await library.readFileProblems([NOTE_ID, TLDR_ID, SVG_ID, LEGACY_ID]);
    expect(Object.fromEntries(problems)).toEqual({
      [NOTE_ID]: null,
      [TLDR_ID]: null,
      [SVG_ID]: null,
      [LEGACY_ID]: "files-off",
    });

    const rows = [
      { id: SVG_ID, kind: "diagram_svg", sourceRepo: "self-learn" },
      { id: NOTE_ID, kind: "note", sourceRepo: "self-learn" },
      { id: LEGACY_ID, kind: "video", sourceRepo: "manimkc" },
    ];
    const access = await library.readFileAccess(rows);
    expect(access.selfLearn.ok).toBe(false);
    expect([...access.served].sort()).toEqual([NOTE_ID, SVG_ID].sort());
    expect(library.thumbnailFor(rows[0]!, access)).toBe(`/api/assets/${encodeURIComponent(SVG_ID)}/file`);
    expect(library.thumbnailFor(rows[2]!, access)).toBeNull();
  });

  it("draws a stored video's card from its stored poster, and none for one stored without a poster", async () => {
    const rows = [
      { id: STORED_ID, kind: "video", sourceRepo: "manimkc" },
      { id: BARE_ID, kind: "video", sourceRepo: "manimkc" },
    ];
    const access = await library.readFileAccess(rows);
    // Both play: their bytes are in the store.
    expect([...access.served].sort()).toEqual([BARE_ID, STORED_ID].sort());
    expect(library.thumbnailFor(rows[0]!, access)).toBe(`/api/assets/${encodeURIComponent(STORED_ID)}/poster`);
    // No stored poster, and cutting one reads the file the switch keeps off.
    expect(library.thumbnailFor(rows[1]!, access)).toBeNull();
  });

  it("searches a row-backed note's words with the switch off, and counts the transcript it could not read", async () => {
    const at = (id: string, kind: string, file: string) => ({
      id,
      kind,
      path: file,
      url: null,
      bytes: 1,
      title: null,
      sourceRepo: kind === "note" ? "self-learn" : "manimkc",
      topics: [],
      createdAt: "",
    });
    const out = await library.readSearchText(
      [
        at(NOTE_ID, "note", "learn/concepts/testing/base.md"),
        at(LEGACY_TRANSCRIPT_ID, "transcript", "out/testing/legacy/legacy.transcript.json"),
        // Unreadable for a reason that is not the switch: not counted.
        at("manimkc:out/testing/gone.transcript.json", "transcript", "out/testing/gone.transcript.json"),
      ],
      ["line"],
    );
    expect(out.searchedText).toBe(true);
    expect(out.texts.get(NOTE_ID)).toContain("a line only the row has.");
    expect(out.skipped).toBe(1);
  });

  it("reads a row-backed note's text for the library page with the switch off", async () => {
    const text = await library.readAssetText(scratch.db, NOTE_ID);
    expect(text).toContain("A line only the row has.");
    expect(await library.readAssetText(scratch.db, LEGACY_ID)).toBeNull();
  });
});
