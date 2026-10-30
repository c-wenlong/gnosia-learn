import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migratedScratchDatabase, type Scratch } from "../../../services/catalog/test/scratch-database";
import { ASSETS, seedAssets, seedContent } from "../../../services/catalog/test/state-fixture";
// @ts-expect-error: a plain ESM script with no declarations; vitest runs it as it is.
import { SCHEMA_VERSION, snapshot, staleness } from "./catalog-snapshot.mjs";

/**
 * The mirror the macOS app reads, made from a real migrated catalog: every
 * table and column the app reads exists (so a schema rename fails here, not
 * silently at the owner's launch), events keep their promoted concept and
 * session (S9-05), and only one owner's rows land (S9-11).
 */

let scratch: Scratch;
let dir: string;
let out: string;
let mirror: Database.Database;

beforeAll(async () => {
  scratch = await migratedScratchDatabase();
  const db = scratch.db;
  await seedContent(db);
  await seedAssets(db);
  // A second owner: a learner, a topic of theirs, one of the seeded assets
  // moved to them, and their own event. None of it may reach `local`'s file.
  db.run(sql`INSERT INTO learner (id) VALUES ('someone')`);
  db.run(sql`INSERT INTO topic (slug, title, domain, owner_id) VALUES ('their-topic', 'Theirs', 'fixtures', 'someone')`);
  db.run(sql`UPDATE asset SET owner_id = 'someone' WHERE id = ${ASSETS.link}`);
  db.run(sql`INSERT INTO session (id, kind, learner_id, title, goal) VALUES ('s-local', 'tutor', 'local', 'Alpha, from the web', 'alpha')`);
  db.run(sql`INSERT INTO session (id, kind, learner_id) VALUES ('s-theirs', 'tutor', 'someone')`);
  db.run(sql`INSERT INTO event (learner_id, type, payload, concept_slug, session_id)
    VALUES ('local', 'observation', '{"question":"What is alpha?","correct":true}', 'alpha', 's-local')`);
  db.run(sql`INSERT INTO event (learner_id, type, payload) VALUES ('someone', 'visit', '{}')`);
  // A link from `local`'s module to the other owner's asset: one end is out of scope.
  db.run(sql`INSERT INTO collection_item (collection_id, position, asset_id) VALUES ('fx-m1', 0, ${ASSETS.link})`);

  dir = mkdtempSync(join(tmpdir(), "gnosia-snapshot-"));
  out = join(dir, "app-catalog.db");
  await snapshot(scratch.url, out, "local");
  mirror = new Database(out, { readonly: true });
});

afterAll(async () => {
  mirror?.close();
  await scratch?.drop();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const rows = (query: string) => mirror.prepare(query).all() as Array<Record<string, unknown>>;

describe("the macOS catalog snapshot", () => {
  it("stamps its format and its owner", () => {
    expect(mirror.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
    const meta = Object.fromEntries(rows("SELECT key, value FROM snapshot_meta").map((r) => [r.key, r.value]));
    expect(meta).toMatchObject({ owner: "local", schema_version: String(SCHEMA_VERSION) });
  });

  it("keeps an event's concept and session, and mirrors sessions", () => {
    expect(rows("SELECT type, concept_slug, session_id FROM event")).toEqual([
      { type: "observation", concept_slug: "alpha", session_id: "s-local" },
    ]);
    expect(rows("SELECT id, kind, title, goal FROM session")).toEqual([
      { id: "s-local", kind: "tutor", title: "Alpha, from the web", goal: "alpha" },
    ]);
  });

  it("mirrors one owner's rows and the commons', and no one else's", () => {
    const topics = rows("SELECT slug FROM topic").map((r) => r.slug);
    expect(topics).toContain("fixture-topic");
    expect(topics).not.toContain("their-topic");
    const assets = rows("SELECT id FROM asset").map((r) => r.id);
    expect(assets).toContain(ASSETS.video);
    expect(assets).not.toContain(ASSETS.link);
    expect(rows("SELECT asset_id FROM asset_concept").map((r) => r.asset_id)).not.toContain(ASSETS.link);
    expect(rows("SELECT asset_id FROM collection_item").map((r) => r.asset_id)).not.toContain(ASSETS.link);
  });

  it("says when the mirror is behind, and why", async () => {
    expect(staleness(scratch.url, out, "local")).toBeNull();
    expect(staleness(scratch.url, out, "someone")).toMatch(/made for local/);
    expect(staleness(scratch.url, join(dir, "missing.db"), "local")).toMatch(/no mirror/);
    // A write lands in the WAL, which moves even when the main file does not.
    const past = new Date(Date.now() - 60_000);
    utimesSync(out, past, past);
    scratch.db.run(sql`INSERT INTO event (learner_id, type, payload) VALUES ('local', 'visit', '{}')`);
    expect(staleness(scratch.url, out, "local")).toMatch(/changed/);
  });

  it("has every column the app reads", () => {
    const columns = (table: string) => rows(`PRAGMA table_info(${table})`).map((r) => r.name);
    expect(columns("event")).toEqual(
      expect.arrayContaining(["id", "at", "learner_id", "type", "payload", "concept_slug", "session_id"]),
    );
    expect(columns("session")).toEqual(
      expect.arrayContaining(["id", "kind", "learner_id", "state", "title", "goal", "started_at", "updated_at"]),
    );
    expect(columns("concept")).toEqual(expect.arrayContaining(["slug", "title", "topic_slug", "body", "owner_id"]));
  });
});
