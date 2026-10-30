// The catalog snapshot Gnosia reads: the parts of the catalog the macOS app
// draws, mirrored into one SQLite file it can open read-only.
//
// usage: node apps/macos/scripts/catalog-snapshot.mjs [--out PATH] [--owner ID] [--if-stale]
//
// The catalog it reads is the same SQLite file every catalog command reads:
// CATALOG_DB when set, services/catalog/.env's DATABASE_URL (or the shell's)
// next, and $GNOSIA_HOME/catalog.db last — the resolution
// services/catalog/src/env.ts gives `npm run catalog`, so a shell that can
// run the CLI can run this. A postgres:// value is refused, not read as a
// path: that is the old world, and services/catalog/scripts/pg-to-sqlite.mjs
// is the way across it.
//
// Where the file lands, in order: --out, GNOSIA_CATALOG, and then
// $GNOSIA_HOME/app-catalog.db (~/.gnosia/app-catalog.db with no home
// variable set — the path the app opens when nothing tells it otherwise).
// Not catalog.db: that name now belongs to the live database the snapshot
// reads, and writing the mirror over it would destroy it — the script
// refuses when source and target resolve to the same file.
//
// The mirror is written into a `.partial` file beside the target and renamed
// over it, so Gnosia never opens a half-written catalog — the same reason
// scripts/nightly-export.mjs renames exports into place.
//
// It reads the catalog and writes only the snapshot file: nothing here
// mutates the source, and the file it makes is the app's read model, not a
// second source of truth. The drizzle schema (packages/schema) stays
// authoritative; the SQLite DDL below is the transport the app reads, and it
// is intentionally smaller than the live schema — only the tables and
// columns the app draws, in the shape it draws them.
//
// Timestamps are stored as REAL seconds since 1970-01-01 UTC, not the live
// schema's millisecond integers: the app compares Doubles
// (`Date(timeIntervalSince1970:)`), so `ms / 1000.0` at copy time is the
// whole conversion.
//
// One owner's view, like every read the web app makes (AGENTS.md, "A read
// that forgets its owner reads every owner"): content rows are that owner's
// and the commons', learner rows are that owner's alone, and the link tables
// keep only rows whose ends were mirrored. The owner is --owner, then
// GNOSIA_SIDECAR_OWNER (the sidecar's own setting, so the app reads back
// what the sidecar writes), then `local`; it is written into snapshot_meta
// for the app to read rather than assume.
//
// --if-stale writes only when the mirror is behind: missing, of an older
// format, for another owner, or older than the catalog file or its WAL (the
// catalog runs in WAL mode, so a new row moves `catalog.db-wal` and the main
// file only at a checkpoint). A mirror that is none of those prints `fresh`
// and exits 0 without writing. The app runs it that way, so the source and
// the owner are resolved here, once, and never guessed at in Swift.
//
// Exit codes: 0 snapshot written, 1 the read or write failed, 2 the
// invocation was wrong.

import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import Database from 'better-sqlite3';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CATALOG_ENV = join(ROOT, 'services/catalog/.env');
const USAGE = 'usage: node catalog-snapshot.mjs [--out PATH] [--owner ID] [--if-stale]';

/** The owner whose rows every owner reads (COMMONS_OWNER in packages/schema/src/shared.ts). */
const COMMONS = 'commons';

/** Mirror format: 4 added event.concept_slug, event.session_id, `session` and the owner filter. */
export const SCHEMA_VERSION = 4;

class Refusal extends Error {}

/** The video tools an asset id's first segment can name, as SOURCE_REPOS lists them. */
const VIDEO_TOOLS = new Set(['manimkc', 'remotionkc', 'revideokc', 'blenderkc']);

/**
 * The wrappers a derived asset's id puts around its source's:
 * `pdf:<video id>` and `poster:<video id>` are made by the catalog, not by a
 * tool, so they unwrap and the video's own prefix answers for them.
 */
const WRAPPER_PREFIXES = ['pdf:', 'poster:'];

/**
 * Which tool an asset id says made it. `generated_by` is a column on the
 * SQLite mirror rather than a join the app repeats on every row, and the
 * same rule lives in CatalogStore.swift for snapshot files that predate the
 * column: unwrap the derived prefixes, then the first `:` segment is the
 * tool, `video:` is the studio's own namespace, and anything else — including
 * an id with no prefix at all — is `other`.
 */
export function generatedBy(id) {
  let rest = id;
  for (;;) {
    const wrapper = WRAPPER_PREFIXES.find((w) => rest.startsWith(w));
    if (wrapper === undefined) break;
    rest = rest.slice(wrapper.length);
  }
  const colon = rest.indexOf(':');
  const prefix = colon === -1 ? rest : rest.slice(0, colon);
  if (VIDEO_TOOLS.has(prefix)) return prefix;
  if (prefix === 'video') return 'video';
  return 'other';
}

/**
 * services/catalog/.env read the way env.ts's loadEnv reads it: present
 * variables fill gaps, the shell still wins, and a missing file is not an
 * error.
 */
function loadCatalogEnv() {
  if (!existsSync(CATALOG_ENV)) return;
  const before = { ...process.env };
  process.loadEnvFile(CATALOG_ENV);
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value;
  }
}

/**
 * The catalog file to snapshot, resolved the way env.ts's `databaseUrl` and
 * `databasePath` resolve it: CATALOG_DB, then DATABASE_URL, then
 * $GNOSIA_HOME/catalog.db. A `sqlite:` or `file:` URL becomes a path; a
 * `postgres:`/`postgresql:` URL is the old world and is refused with the
 * pointer env.ts's refusal carries. `:memory:` is refused too — a snapshot
 * needs the file another process wrote, not a fresh empty in-memory one.
 */
function catalogPath() {
  loadCatalogEnv();
  const raw = process.env.CATALOG_DB?.trim()
    || process.env.DATABASE_URL?.trim()
    || join(dataHome(), 'catalog.db');
  if (raw.startsWith('postgres://') || raw.startsWith('postgresql://')) {
    throw new Refusal(
      'the catalog is a SQLite file now, not Postgres (docs/SQLITE-MIGRATION.md); ' +
        'point CATALOG_DB at the file services/catalog/scripts/pg-to-sqlite.mjs wrote',
    );
  }
  const memory = ':memory: names an in-memory database only its process can see; point CATALOG_DB at the file';
  if (raw === ':memory:') throw new Refusal(memory);
  if (raw.startsWith('sqlite:')) {
    // env.ts's stripScheme: sqlite:///abs and sqlite:rel both name /abs-style
    // paths; sqlite::memory: is the in-memory literal this script refuses.
    const rest = raw.slice('sqlite:'.length);
    if (rest === ':memory:') throw new Refusal(memory);
    const withoutSlashes = rest.replace(/^\/+/, '');
    return resolve(withoutSlashes.startsWith('/') ? withoutSlashes : `/${withoutSlashes}`);
  }
  if (raw.startsWith('file:')) return fileURLToPath(raw);
  return resolve(expandHome(raw));
}

/**
 * `~` and `~/...` expand; a bare `~something` does not (the shell leaves it
 * alone too, and guessing at other users' homes is worse than refusing).
 * GNOSIA_HOME carries the same rule in the blob store's resolver.
 */
function expandHome(path) {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

function dataHome() {
  // GNOSIA_HOME wins; ~/.gnosia is the default.
  const raw = process.env.GNOSIA_HOME?.trim();
  if (raw === undefined || raw === '') return join(homedir(), '.gnosia');
  const expanded = expandHome(raw);
  if (!isAbsolute(expanded)) {
    throw new Refusal(`GNOSIA_HOME must be absolute or start with ~/, not ${JSON.stringify(raw)}`);
  }
  return expanded;
}

function outputPath(args) {
  const raw = args.out ?? process.env.GNOSIA_CATALOG;
  if (raw !== undefined && raw.trim() !== '') return resolve(expandHome(raw.trim()));
  // app-catalog.db, not catalog.db: the live catalog already owns that name
  // under the data home, and the mirror must not stand where it does.
  return join(dataHome(), 'app-catalog.db');
}

/**
 * The mirror half of the file. `asset` keeps the catalog's column names so a
 * reader that knows the catalog knows the snapshot; `generated_by` is the
 * one computed column, filled by `generatedBy` above. `snapshot_meta` says
 * where the file came from and when, for the app's settings pane.
 */
const DDL = `
CREATE TABLE asset (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  title         TEXT,
  path          TEXT,
  url           TEXT,
  content_hash  TEXT,
  inputs_hash   TEXT,
  bytes         INTEGER,
  source_repo   TEXT NOT NULL,
  blob_key      TEXT,
  resource_type TEXT,
  generated_by  TEXT NOT NULL,
  created_at    REAL,
  updated_at    REAL
);
CREATE INDEX asset_kind_idx ON asset(kind);
CREATE INDEX asset_generated_by_idx ON asset(generated_by);
CREATE INDEX asset_blob_key_idx ON asset(blob_key);

CREATE TABLE asset_derivation (
  asset_id        TEXT NOT NULL,
  source_asset_id TEXT NOT NULL,
  PRIMARY KEY (asset_id, source_asset_id)
);
CREATE INDEX asset_derivation_source_idx ON asset_derivation(source_asset_id);

CREATE TABLE asset_topic (
  asset_id   TEXT NOT NULL,
  topic_slug TEXT NOT NULL,
  PRIMARY KEY (asset_id, topic_slug)
);
CREATE INDEX asset_topic_slug_idx ON asset_topic(topic_slug);

CREATE TABLE asset_concept (
  asset_id     TEXT NOT NULL,
  concept_slug TEXT NOT NULL,
  PRIMARY KEY (asset_id, concept_slug)
);
CREATE INDEX asset_concept_slug_idx ON asset_concept(concept_slug);

CREATE TABLE topic (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  domain      TEXT NOT NULL,
  summary     TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  archived_at REAL
);
CREATE INDEX topic_domain_idx ON topic(domain);

CREATE TABLE concept (
  slug           TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  summary        TEXT,
  topic_slug     TEXT NOT NULL,
  path           TEXT,
  domain         TEXT,
  body           TEXT,
  tags           TEXT NOT NULL DEFAULT '[]',
  sources        TEXT NOT NULL DEFAULT '[]',
  authored_at    REAL,
  topic_position INTEGER NOT NULL DEFAULT 0,
  owner_id       TEXT,
  archived_at    REAL,
  created_at     REAL,
  updated_at     REAL
);
CREATE INDEX concept_topic_idx ON concept(topic_slug);

-- ==== wave-1 surfaces ====
-- The learner half: rows the catalog holds the only copy of
-- (packages/schema's state.ts), mirrored so the app reads the review queue,
-- watch state and renames without a server. JSON columns land as TEXT
-- holding the same JSON and leech as 0/1 — the file is a transport, and the
-- app parses only what it draws.
CREATE TABLE concept_prerequisite (
  concept_slug      TEXT NOT NULL,
  prerequisite_slug TEXT NOT NULL,
  kind              TEXT NOT NULL,
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        REAL,
  PRIMARY KEY (concept_slug, prerequisite_slug, kind)
);
CREATE INDEX concept_prerequisite_req_idx ON concept_prerequisite(prerequisite_slug);

CREATE TABLE mastery (
  learner_id   TEXT NOT NULL,
  concept_slug TEXT NOT NULL,
  p_l          REAL NOT NULL DEFAULT 0,
  observations INTEGER NOT NULL DEFAULT 0,
  correct      INTEGER NOT NULL DEFAULT 0,
  last_seen    REAL,
  created_at   REAL,
  updated_at   REAL,
  PRIMARY KEY (learner_id, concept_slug)
);
CREATE INDEX mastery_concept_idx ON mastery(concept_slug);

CREATE TABLE review (
  learner_id    TEXT NOT NULL,
  concept_slug  TEXT NOT NULL,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  ease          REAL NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 1,
  lapses        INTEGER NOT NULL DEFAULT 0,
  due           REAL NOT NULL,
  last_reviewed REAL,
  leech         INTEGER NOT NULL DEFAULT 0,
  created_at    REAL,
  updated_at    REAL,
  PRIMARY KEY (learner_id, concept_slug)
);
CREATE INDEX review_due_idx ON review(due);

CREATE TABLE progress (
  learner_id         TEXT NOT NULL,
  curriculum_item_id TEXT NOT NULL,
  completed_at       REAL,
  note               TEXT,
  created_at         REAL,
  updated_at         REAL,
  PRIMARY KEY (learner_id, curriculum_item_id)
);
CREATE INDEX progress_item_idx ON progress(curriculum_item_id);

CREATE TABLE recap (
  learner_id         TEXT NOT NULL,
  curriculum_item_id TEXT NOT NULL,
  summary            TEXT NOT NULL DEFAULT '',
  key_points         TEXT NOT NULL DEFAULT '[]',
  misconceptions     TEXT NOT NULL DEFAULT '[]',
  open_questions     TEXT NOT NULL DEFAULT '[]',
  source             TEXT NOT NULL,
  sessions           INTEGER NOT NULL DEFAULT 0,
  created_at         REAL,
  updated_at         REAL,
  PRIMARY KEY (learner_id, curriculum_item_id)
);

CREATE TABLE preference (
  learner_id TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_at REAL,
  updated_at REAL,
  PRIMARY KEY (learner_id, key)
);

-- The catalog promotes an event's concept and session out of the payload
-- into columns (services/catalog/src/state/events.ts, toRow); the mirror
-- keeps them, so a check's status is matched on its own concept rather
-- than on question text across every concept. created_at stays out.
CREATE TABLE event (
  id           INTEGER PRIMARY KEY,
  at           REAL NOT NULL,
  learner_id   TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  concept_slug TEXT,
  session_id   TEXT
);
CREATE INDEX event_at_idx ON event(at);
CREATE INDEX event_concept_idx ON event(concept_slug);

-- Tutor and studio sessions, so a session started on the web shows on the
-- app's Recent beside the ones it opened itself.
CREATE TABLE session (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  state      TEXT NOT NULL,
  title      TEXT,
  goal       TEXT,
  started_at REAL,
  updated_at REAL
);

CREATE TABLE asset_name (
  learner_id TEXT NOT NULL,
  asset_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  created_at REAL,
  updated_at REAL,
  PRIMARY KEY (learner_id, asset_id)
);
-- ==== courses ====
-- The course tree and the link tables the course pages read, with the same
-- columns the catalog has (packages/schema/src/content.ts). JSON columns
-- land as text the app parses; archived rows are mirrored too, because the
-- web reader's archived_at-is-null filter is part of the shape.
CREATE TABLE collection (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  parent_id      TEXT,
  position       INTEGER NOT NULL DEFAULT 0,
  metadata       TEXT NOT NULL DEFAULT '{}',
  cover_blob_key TEXT,
  archived_at    REAL,
  created_at     REAL,
  updated_at     REAL
);
CREATE INDEX collection_parent_idx ON collection(parent_id);

CREATE TABLE curriculum_item (
  id            TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  title         TEXT NOT NULL,
  subtopics     TEXT NOT NULL DEFAULT '[]',
  videos        TEXT NOT NULL DEFAULT '[]',
  archived_at   REAL,
  created_at    REAL,
  updated_at    REAL
);
CREATE INDEX curriculum_item_collection_idx ON curriculum_item(collection_id);

CREATE TABLE collection_item (
  id             INTEGER PRIMARY KEY,
  collection_id  TEXT NOT NULL,
  position       INTEGER NOT NULL DEFAULT 0,
  topic_slug     TEXT,
  concept_slug   TEXT,
  asset_id       TEXT,
  topic_position INTEGER NOT NULL DEFAULT 0,
  created_at     REAL
);
CREATE INDEX collection_item_collection_idx ON collection_item(collection_id);
CREATE INDEX collection_item_asset_idx ON collection_item(asset_id);

CREATE TABLE concept_curriculum_item (
  concept_slug       TEXT NOT NULL,
  curriculum_item_id TEXT NOT NULL,
  position           INTEGER NOT NULL DEFAULT 0,
  created_at         REAL,
  PRIMARY KEY (concept_slug, curriculum_item_id)
);
CREATE INDEX concept_curriculum_item_item_idx ON concept_curriculum_item(curriculum_item_id);

CREATE TABLE curriculum_item_asset (
  curriculum_item_id TEXT NOT NULL,
  asset_id           TEXT NOT NULL,
  position           INTEGER NOT NULL DEFAULT 0,
  created_at         REAL,
  PRIMARY KEY (curriculum_item_id, asset_id)
);
CREATE INDEX curriculum_item_asset_asset_idx ON curriculum_item_asset(asset_id);

CREATE TABLE tag (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  REAL,
  updated_at  REAL
);

CREATE TABLE collection_tag (
  collection_id TEXT NOT NULL,
  tag_id        TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    REAL,
  PRIMARY KEY (collection_id, tag_id)
);
CREATE INDEX collection_tag_tag_idx ON collection_tag(tag_id);
-- ==== end courses ====

CREATE TABLE snapshot_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * The select-list `asset` shares across every row the mirror copies. The
 * live schema stores instants as integer milliseconds (timestamp_ms in
 * packages/schema/src/columns.ts); the mirror stores REAL seconds, so every
 * timestamp the queries read is divided by 1000.0 on the way over.
 */
const ASSET_COLUMNS = `id, kind, path, url, content_hash, inputs_hash, bytes,
  title, source_repo, blob_key, resource_type,
  created_at / 1000.0 AS created_at,
  updated_at / 1000.0 AS updated_at`;

/** A file's modification time in ms, or null when it is not there. */
function mtimeOf(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Why the mirror at `out` needs rewriting for `owner` from `sourcePath`, or
 * null when it is current. A source that is not there is the snapshot's own
 * refusal to report, so it reads as stale.
 */
export function staleness(sourcePath, out, owner) {
  const mirrorAt = mtimeOf(out);
  if (mirrorAt === null) return 'no mirror yet';
  const sourceAt = mtimeOf(sourcePath);
  if (sourceAt === null) return 'no catalog to compare';
  let meta;
  try {
    const db = new Database(out, { readonly: true, fileMustExist: true });
    try {
      meta = Object.fromEntries(db.prepare('SELECT key, value FROM snapshot_meta').all().map((r) => [r.key, r.value]));
    } finally {
      db.close();
    }
  } catch {
    return 'the mirror cannot be read';
  }
  if (meta.schema_version !== String(SCHEMA_VERSION)) return `format ${meta.schema_version ?? '?'}, not ${SCHEMA_VERSION}`;
  if ((meta.owner ?? 'local') !== owner) return `made for ${meta.owner ?? 'local'}, not ${owner}`;
  const newest = Math.max(sourceAt, mtimeOf(`${sourcePath}-wal`) ?? 0);
  return newest > mirrorAt ? 'the catalog changed since' : null;
}

export async function snapshot(sourcePath, out, owner = 'local') {
  // The live catalog and its mirror cannot be one file: the write goes
  // through a `.partial` rename that would put the reduced shape over the
  // full database, deleting everything the mirror leaves out.
  if (resolve(sourcePath) === resolve(out)) {
    throw new Refusal(
      `the snapshot would overwrite its own source (${out}); ` +
        'pass --out or set GNOSIA_CATALOG to a different file',
    );
  }
  if (!existsSync(sourcePath)) {
    throw new Refusal(
      `no catalog at ${sourcePath} — run \`npm run catalog -- migrate\` first, ` +
        'or point CATALOG_DB at the file',
    );
  }
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  // `.all()` returns plain rows the way pg's `result.rows` did, so the
  // reads below keep their old shape. `@owner` and `@commons` bind the one
  // owner the file is for.
  const scope = { owner, commons: COMMONS };
  const all = (sql) => (sql.includes('@') ? source.prepare(sql).all(scope) : source.prepare(sql).all());

  const partial = `${out}.partial-${process.pid}`;
  rmSync(partial, { force: true });
  mkdirSync(dirname(out), { recursive: true });
  let db;
  try {
    db = new Database(partial);
    db.exec(DDL);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);

    const write = db.transaction((rows) => {
      const {
        assets, derivations, assetTopics, assetConcepts, topics, concepts,
        prerequisites, masteries, reviews, progress, recaps, preferences,
        events, sessions, assetNames,
        collections, curriculumItems, collectionItems, itemConcepts, itemAssets,
        tags, collectionTags,
      } = rows;

      const assetInsert = db.prepare(
        `INSERT INTO asset (id, kind, path, url, content_hash, inputs_hash, bytes,
           title, source_repo, blob_key, resource_type, generated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const a of assets) {
        assetInsert.run(
          a.id, a.kind, a.path, a.url, a.content_hash, a.inputs_hash, a.bytes,
          a.title, a.source_repo, a.blob_key, a.resource_type, generatedBy(a.id),
          a.created_at, a.updated_at,
        );
      }

      const derivationInsert = db.prepare(
        'INSERT OR IGNORE INTO asset_derivation (asset_id, source_asset_id) VALUES (?, ?)',
      );
      for (const d of derivations) derivationInsert.run(d.asset_id, d.source_asset_id);

      const topicInsert = db.prepare(
        `INSERT INTO topic (slug, title, domain, summary, position, archived_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const t of topics) {
        topicInsert.run(t.slug, t.title, t.domain, t.summary, t.position, t.archived_at);
      }

      const conceptInsert = db.prepare(
        `INSERT INTO concept (slug, title, summary, topic_slug, path, domain, body,
           tags, sources, authored_at, topic_position, owner_id, archived_at,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const c of concepts) {
        conceptInsert.run(
          c.slug, c.title, c.summary, c.topic_slug, c.path, c.domain, c.body,
          c.tags, c.sources, c.authored_at, c.topic_position, c.owner_id,
          c.archived_at, c.created_at, c.updated_at,
        );
      }

      const assetTopicInsert = db.prepare(
        'INSERT OR IGNORE INTO asset_topic (asset_id, topic_slug) VALUES (?, ?)',
      );
      for (const at of assetTopics) assetTopicInsert.run(at.asset_id, at.topic_slug);

      const assetConceptInsert = db.prepare(
        'INSERT OR IGNORE INTO asset_concept (asset_id, concept_slug) VALUES (?, ?)',
      );
      for (const ac of assetConcepts) assetConceptInsert.run(ac.asset_id, ac.concept_slug);

      const prerequisiteInsert = db.prepare(
        `INSERT OR IGNORE INTO concept_prerequisite
           (concept_slug, prerequisite_slug, kind, position, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const p of prerequisites) {
        prerequisiteInsert.run(p.concept_slug, p.prerequisite_slug, p.kind, p.position, p.created_at);
      }

      const masteryInsert = db.prepare(
        `INSERT INTO mastery (learner_id, concept_slug, p_l, observations, correct,
           last_seen, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const m of masteries) {
        masteryInsert.run(
          m.learner_id, m.concept_slug, m.p_l, m.observations, m.correct,
          m.last_seen, m.created_at, m.updated_at,
        );
      }

      const reviewInsert = db.prepare(
        `INSERT INTO review (learner_id, concept_slug, repetitions, ease, interval_days,
           lapses, due, last_reviewed, leech, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const r of reviews) {
        reviewInsert.run(
          r.learner_id, r.concept_slug, r.repetitions, r.ease, r.interval_days,
          r.lapses, r.due, r.last_reviewed, r.leech, r.created_at, r.updated_at,
        );
      }

      const progressInsert = db.prepare(
        `INSERT INTO progress (learner_id, curriculum_item_id, completed_at, note,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const p of progress) {
        progressInsert.run(
          p.learner_id, p.curriculum_item_id, p.completed_at, p.note,
          p.created_at, p.updated_at,
        );
      }

      const recapInsert = db.prepare(
        `INSERT INTO recap (learner_id, curriculum_item_id, summary, key_points,
           misconceptions, open_questions, source, sessions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const r of recaps) {
        recapInsert.run(
          r.learner_id, r.curriculum_item_id, r.summary, r.key_points,
          r.misconceptions, r.open_questions, r.source, r.sessions,
          r.created_at, r.updated_at,
        );
      }

      const preferenceInsert = db.prepare(
        `INSERT INTO preference (learner_id, key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const p of preferences) {
        preferenceInsert.run(p.learner_id, p.key, p.value, p.created_at, p.updated_at);
      }

      const eventInsert = db.prepare(
        `INSERT INTO event (id, at, learner_id, type, payload, concept_slug, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const e of events) {
        eventInsert.run(e.id, e.at, e.learner_id, e.type, e.payload, e.concept_slug, e.session_id);
      }

      const sessionInsert = db.prepare(
        `INSERT INTO session (id, kind, learner_id, state, title, goal, started_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const x of sessions) {
        sessionInsert.run(x.id, x.kind, x.learner_id, x.state, x.title, x.goal, x.started_at, x.updated_at);
      }

      const nameInsert = db.prepare(
        `INSERT INTO asset_name (learner_id, asset_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const n of assetNames) {
        nameInsert.run(n.learner_id, n.asset_id, n.title, n.created_at, n.updated_at);
      }
      // ==== courses ====
      const collectionInsert = db.prepare(
        `INSERT INTO collection (id, kind, slug, title, parent_id, position, metadata,
           cover_blob_key, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const c of collections) {
        collectionInsert.run(
          c.id, c.kind, c.slug, c.title, c.parent_id, c.position, c.metadata,
          c.cover_blob_key, c.archived_at, c.created_at, c.updated_at,
        );
      }

      const curriculumItemInsert = db.prepare(
        `INSERT INTO curriculum_item (id, collection_id, position, title, subtopics,
           videos, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const i of curriculumItems) {
        curriculumItemInsert.run(
          i.id, i.collection_id, i.position, i.title, i.subtopics,
          i.videos, i.archived_at, i.created_at, i.updated_at,
        );
      }

      const collectionItemInsert = db.prepare(
        `INSERT INTO collection_item (id, collection_id, position, topic_slug,
           concept_slug, asset_id, topic_position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const m of collectionItems) {
        collectionItemInsert.run(
          Number(m.id), m.collection_id, m.position, m.topic_slug,
          m.concept_slug, m.asset_id, m.topic_position, m.created_at,
        );
      }

      const itemConceptInsert = db.prepare(
        `INSERT OR IGNORE INTO concept_curriculum_item (concept_slug, curriculum_item_id, position, created_at)
         VALUES (?, ?, ?, ?)`,
      );
      for (const l of itemConcepts) {
        itemConceptInsert.run(l.concept_slug, l.curriculum_item_id, l.position, l.created_at);
      }

      const itemAssetInsert = db.prepare(
        `INSERT OR IGNORE INTO curriculum_item_asset (curriculum_item_id, asset_id, position, created_at)
         VALUES (?, ?, ?, ?)`,
      );
      for (const l of itemAssets) {
        itemAssetInsert.run(l.curriculum_item_id, l.asset_id, l.position, l.created_at);
      }

      const tagInsert = db.prepare(
        `INSERT INTO tag (id, label, description, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const t of tags) {
        tagInsert.run(t.id, t.label, t.description, t.position, t.created_at, t.updated_at);
      }

      const collectionTagInsert = db.prepare(
        `INSERT OR IGNORE INTO collection_tag (collection_id, tag_id, position, created_at)
         VALUES (?, ?, ?, ?)`,
      );
      for (const t of collectionTags) {
        collectionTagInsert.run(t.collection_id, t.tag_id, t.position, t.created_at);
      }
      // ==== end courses ====
    });

    // The catalog is already SQLite, so these reads go straight through
    // better-sqlite3. JSON columns are text on both sides — the file holds
    // the same JSON the live schema does — and instants arrive as integer
    // milliseconds, divided by 1000.0 into the REAL seconds the mirror
    // stores.
    const rows = {
      assets: all(`SELECT ${ASSET_COLUMNS} FROM asset WHERE owner_id IN (@owner, @commons)`),
      derivations: all(`SELECT asset_id, source_asset_id FROM asset_derivation
        WHERE asset_id IN (SELECT id FROM asset WHERE owner_id IN (@owner, @commons)) AND source_asset_id IN (SELECT id FROM asset WHERE owner_id IN (@owner, @commons))`),
      assetTopics: all(`SELECT asset_id, topic_slug FROM asset_topic
        WHERE asset_id IN (SELECT id FROM asset WHERE owner_id IN (@owner, @commons)) AND topic_slug IN (SELECT slug FROM topic WHERE owner_id IN (@owner, @commons))`),
      assetConcepts: all(`SELECT asset_id, concept_slug FROM asset_concept
        WHERE asset_id IN (SELECT id FROM asset WHERE owner_id IN (@owner, @commons)) AND concept_slug IN (SELECT slug FROM concept WHERE owner_id IN (@owner, @commons))`),
      topics: all(`SELECT slug, title, domain, summary, position,
        archived_at / 1000.0 AS archived_at FROM topic WHERE owner_id IN (@owner, @commons)`),
      concepts: all(`SELECT slug, title, summary, topic_slug, path, domain, body,
        tags, sources,
        authored_at / 1000.0 AS authored_at,
        topic_position, owner_id,
        archived_at / 1000.0 AS archived_at,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM concept WHERE owner_id IN (@owner, @commons)`),
      prerequisites: all(`SELECT concept_slug, prerequisite_slug, kind, position,
        created_at / 1000.0 AS created_at FROM concept_prerequisite
        WHERE concept_slug IN (SELECT slug FROM concept WHERE owner_id IN (@owner, @commons)) AND prerequisite_slug IN (SELECT slug FROM concept WHERE owner_id IN (@owner, @commons))`),
      masteries: all(`SELECT learner_id, concept_slug, p_l, observations, correct,
        last_seen / 1000.0 AS last_seen,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM mastery
        WHERE learner_id = @owner`),
      reviews: all(`SELECT learner_id, concept_slug, repetitions, ease, interval_days,
        lapses, due / 1000.0 AS due,
        last_reviewed / 1000.0 AS last_reviewed,
        leech,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM review
        WHERE learner_id = @owner`),
      progress: all(`SELECT learner_id, curriculum_item_id,
        completed_at / 1000.0 AS completed_at, note,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM progress
        WHERE learner_id = @owner`),
      recaps: all(`SELECT learner_id, curriculum_item_id, summary,
        key_points, misconceptions, open_questions, source, sessions,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM recap
        WHERE learner_id = @owner`),
      preferences: all(`SELECT learner_id, key, value,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM preference
        WHERE learner_id = @owner`),
      // Ordered as readEvents orders (`at`, then `id`): replay and
      // last-watched both read the log's order, not just its set.
      events: all(`SELECT id, at / 1000.0 AS at,
        learner_id, type, payload, concept_slug, session_id FROM event
        WHERE learner_id = @owner ORDER BY at, id`),
      sessions: all(`SELECT id, kind, learner_id, state, title, goal,
        started_at / 1000.0 AS started_at,
        updated_at / 1000.0 AS updated_at FROM session
        WHERE learner_id = @owner`),
      assetNames: all(`SELECT learner_id, asset_id, title,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM asset_name
        WHERE learner_id = @owner`),
      // ==== courses ====
      // The tables readCourses joins to build a Course (readers/courses.ts):
      // the collection tree, the checklist rows, the membership rows that give
      // a module its topic and its curated links, the item's concept list, and
      // the reading-to-lesson links. JSON columns go over as text for the app
      // to parse, so `metadata`, `subtopics`, `videos` come across uncast.
      collections: all(`SELECT id, kind, slug, title, parent_id, position,
        metadata, cover_blob_key,
        archived_at / 1000.0 AS archived_at,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM collection WHERE owner_id IN (@owner, @commons)`),
      curriculumItems: all(`SELECT id, collection_id, position, title,
        subtopics, videos,
        archived_at / 1000.0 AS archived_at,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM curriculum_item WHERE owner_id IN (@owner, @commons)`),
      collectionItems: all(`SELECT id, collection_id, position, topic_slug,
        concept_slug, asset_id, topic_position,
        created_at / 1000.0 AS created_at FROM collection_item
        WHERE collection_id IN (SELECT id FROM collection WHERE owner_id IN (@owner, @commons))
          AND (topic_slug IS NULL OR topic_slug IN (SELECT slug FROM topic WHERE owner_id IN (@owner, @commons)))
          AND (concept_slug IS NULL OR concept_slug IN (SELECT slug FROM concept WHERE owner_id IN (@owner, @commons)))
          AND (asset_id IS NULL OR asset_id IN (SELECT id FROM asset WHERE owner_id IN (@owner, @commons)))`),
      itemConcepts: all(`SELECT concept_slug, curriculum_item_id, position,
        created_at / 1000.0 AS created_at FROM concept_curriculum_item
        WHERE concept_slug IN (SELECT slug FROM concept WHERE owner_id IN (@owner, @commons)) AND curriculum_item_id IN (SELECT id FROM curriculum_item WHERE owner_id IN (@owner, @commons))`),
      itemAssets: all(`SELECT curriculum_item_id, asset_id, position,
        created_at / 1000.0 AS created_at FROM curriculum_item_asset
        WHERE curriculum_item_id IN (SELECT id FROM curriculum_item WHERE owner_id IN (@owner, @commons)) AND asset_id IN (SELECT id FROM asset WHERE owner_id IN (@owner, @commons))`),
      tags: all(`SELECT id, label, description, position,
        created_at / 1000.0 AS created_at,
        updated_at / 1000.0 AS updated_at FROM tag WHERE owner_id IN (@owner, @commons)`),
      collectionTags: all(`SELECT collection_id, tag_id, position,
        created_at / 1000.0 AS created_at FROM collection_tag
        WHERE collection_id IN (SELECT id FROM collection WHERE owner_id IN (@owner, @commons)) AND tag_id IN (SELECT id FROM tag WHERE owner_id IN (@owner, @commons))`),
      // ==== end courses ====
    };
    write(rows);

    const meta = db.prepare('INSERT INTO snapshot_meta (key, value) VALUES (?, ?)');
    meta.run('generator', 'catalog-snapshot.mjs');
    meta.run('schema_version', String(SCHEMA_VERSION));
    meta.run('owner', owner);
    meta.run('source', 'sqlite');
    meta.run('taken_at', String(Date.now() / 1000));
    // The file path: a path can carry no password, so it is safe to show.
    meta.run('source_database', sourcePath);

    db.close();
    renameSync(partial, out);
    return { out, counts: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])) };
  } catch (error) {
    db?.close();
    rmSync(partial, { force: true });
    throw error;
  } finally {
    source.close();
  }
}

async function main(argv) {
  let args;
  try {
    ({ values: args } = parseArgs({
      args: argv,
      options: {
        out: { type: 'string' },
        owner: { type: 'string' },
        'if-stale': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
    }));
  } catch (error) {
    console.error(`catalog-snapshot: ${error.message}\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  try {
    const out = outputPath(args);
    // The source first: it loads services/catalog/.env, which may name the owner.
    const source = catalogPath();
    const owner = args.owner?.trim() || process.env.GNOSIA_SIDECAR_OWNER?.trim() || 'local';
    if (args['if-stale'] && staleness(source, out, owner) === null) {
      console.log('fresh');
      return 0;
    }
    const { counts } = await snapshot(source, out, owner);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`catalog snapshot for ${owner} → ${out}`);
    for (const [table, n] of Object.entries(counts)) console.log(`  ${table}: ${n}`);
    console.log(`  ${total} rows mirrored`);
    return 0;
  } catch (error) {
    console.error(`catalog-snapshot: ${error.message}`);
    return 1;
  }
}

const invoked = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) process.exit(await main(process.argv.slice(2)));
