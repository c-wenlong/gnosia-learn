// The catalog snapshot Gnosia reads: the parts of the Postgres catalog the
// macOS app draws, mirrored into one SQLite file it can open read-only.
//
// usage: node apps/macos/scripts/catalog-snapshot.mjs [--out PATH]
//
// The Postgres it reads is the same one every catalog command reads:
// DATABASE_URL when set, services/catalog/.env's DATABASE_URL next, and
// postgres://localhost:5432/gnosia last — the resolution
// services/catalog/src/env.ts gives `npm run catalog`, so a shell that can
// run the CLI can run this.
//
// Where the file lands, in order: --out, GNOSIA_CATALOG, and then
// $GNOSIA_HOME/catalog.db (~/.gnosia/catalog.db with no home variable
// unset — the same default the blob store resolves, and the path the app
// opens when nothing tells it otherwise).
//
// The mirror is written into a `.partial` file beside the target and renamed
// over it, so Gnosia never opens a half-written catalog — the same reason
// scripts/nightly-export.mjs renames exports into place.
//
// It reads Postgres and writes only the snapshot file: nothing here mutates
// the catalog, and the file it makes is the app's read model, not a second
// source of truth. The drizzle schema (packages/schema/src/content.ts) stays
// authoritative; the SQLite DDL below is the transport the app reads until
// the catalog itself lives in SQLite, and it is intentionally small — only
// the tables and columns the app draws.
//
// Timestamps are stored as REAL seconds since 1970-01-01 UTC, not ISO text,
// because both sides lose nothing to it: Postgres hands over
// `extract(epoch from ...)` and Swift compares Doubles.
//
// Exit codes: 0 snapshot written, 1 the read or write failed, 2 the
// invocation was wrong.

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import Database from 'better-sqlite3';
import pg from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CATALOG_ENV = join(ROOT, 'services/catalog/.env');
const DEFAULT_DATABASE_URL = 'postgres://localhost:5432/gnosia';
const USAGE = 'usage: node catalog-snapshot.mjs [--out PATH]';

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

function databaseUrl() {
  loadCatalogEnv();
  const raw = process.env.DATABASE_URL?.trim();
  return raw ? raw : DEFAULT_DATABASE_URL;
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
  // GNOSIA_HOME wins; SELF_LEARN_HOME stays readable for envs from before the
  // rename; ~/.gnosia is the default.
  const raw = process.env.GNOSIA_HOME?.trim() || process.env.SELF_LEARN_HOME?.trim();
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
  return join(dataHome(), 'catalog.db');
}

/**
 * The SQLite half of the mirror. `asset` keeps Postgres's column names so a
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
  topic_position INTEGER NOT NULL DEFAULT 0,
  archived_at    REAL
);
CREATE INDEX concept_topic_idx ON concept(topic_slug);

CREATE TABLE snapshot_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** The select-list `asset` shares across every row the mirror copies. */
const ASSET_COLUMNS = `id, kind, path, url, content_hash, inputs_hash, bytes,
  title, source_repo, blob_key, resource_type,
  extract(epoch from created_at)::double precision AS created_at,
  extract(epoch from updated_at)::double precision AS updated_at`;

async function snapshot(url, out) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const partial = `${out}.partial-${process.pid}`;
  rmSync(partial, { force: true });
  mkdirSync(dirname(out), { recursive: true });
  let db;
  try {
    db = new Database(partial);
    db.exec(DDL);
    db.pragma('user_version = 1');

    const write = db.transaction((rows) => {
      const { assets, derivations, assetTopics, assetConcepts, topics, concepts } = rows;

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
           topic_position, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const c of concepts) {
        conceptInsert.run(
          c.slug, c.title, c.summary, c.topic_slug, c.path, c.domain, c.body,
          c.topic_position, c.archived_at,
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
    });

    // Sequential, not Promise.all: pg@8 deprecates queuing a second query on
    // a client mid-flight, and six small reads buy nothing from it anyway.
    const assets = await client.query(`SELECT ${ASSET_COLUMNS} FROM asset`);
    const derivations = await client.query('SELECT asset_id, source_asset_id FROM asset_derivation');
    const assetTopics = await client.query('SELECT asset_id, topic_slug FROM asset_topic');
    const assetConcepts = await client.query('SELECT asset_id, concept_slug FROM asset_concept');
    const topics = await client.query(`SELECT slug, title, domain, summary, position,
      extract(epoch from archived_at)::double precision AS archived_at FROM topic`);
    const concepts = await client.query(`SELECT slug, title, summary, topic_slug, path, domain, body, topic_position,
      extract(epoch from archived_at)::double precision AS archived_at FROM concept`);
    const rows = {
      assets: assets.rows,
      derivations: derivations.rows,
      assetTopics: assetTopics.rows,
      assetConcepts: assetConcepts.rows,
      topics: topics.rows,
      concepts: concepts.rows,
    };
    write(rows);

    const meta = db.prepare('INSERT INTO snapshot_meta (key, value) VALUES (?, ?)');
    meta.run('generator', 'catalog-snapshot.mjs');
    meta.run('schema_version', '1');
    meta.run('source', 'postgres');
    meta.run('taken_at', String(Date.now() / 1000));
    // The database name, never the URL: a URL can carry a password.
    meta.run('source_database', new URL(url).pathname.replace(/^\//, ''));

    db.close();
    renameSync(partial, out);
    return { out, counts: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])) };
  } catch (error) {
    db?.close();
    rmSync(partial, { force: true });
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main(argv) {
  let args;
  try {
    ({ values: args } = parseArgs({
      args: argv,
      options: { out: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
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
    const { counts } = await snapshot(databaseUrl(), out);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`catalog snapshot → ${out}`);
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
