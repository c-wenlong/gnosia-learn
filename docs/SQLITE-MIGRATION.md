# Postgres → SQLite

The catalog is a local-first application, and its database is now one SQLite
file instead of a Postgres server. There is no server to run, no port, no
role: the file lives next to the blob store under the data root.

## Where the data is

| What | Resolves to |
|---|---|
| Default database | `$GNOSIA_HOME/catalog.db`, else `~/.gnosia/catalog.db` |
| `CATALOG_DB` | an explicit file path, wins over `DATABASE_URL` |
| `DATABASE_URL` | still read, but only path-like values mean anything now |
| `GNOSIA_HOME` | the data root the database and `blobs/` share |

`DATABASE_URL`/`CATALOG_DB` accept a plain path (`/abs`, `./rel`, `~/…`), a
`sqlite:` or `file:` URL, and the literal `:memory:` (tests). A
`postgres://`/`postgresql://` URL is refused with a pointer here rather than
read as a filename — unset it or point it at the file the port wrote.

## Coming from a Postgres database

```sh
node services/catalog/scripts/pg-to-sqlite.mjs --from postgres://localhost:5432/gnosia
# or: DATABASE_URL=postgres://… node services/catalog/scripts/pg-to-sqlite.mjs
```

The script migrates a fresh SQLite file to head, then copies every table
with `PRAGMA foreign_keys` off and runs `foreign_key_check` before finishing.
Type conversions: `jsonb` → JSON text, `timestamptz` → epoch-millisecond
integers, `bool` → `0`/`1`, `text[]` → JSON text. `asset.generated_by` is
backfilled from each id's `tool:` prefix (`manimkc:…` → `manimkc`, everything
else → `manual`).

The blob store is not in the database; `blobs/` keeps its `.owner` marker,
which the new database claims on first write the way the old one did.

## What changed under the same API

- `connect`/`withDatabase`/`inTransaction` are unchanged in shape; a
  connection is one `better-sqlite3` handle with `journal_mode=WAL`,
  `foreign_keys=ON`, and a 5-second busy timeout.
- Transactions are `begin immediate` with savepoints for nesting. Postgres
  advisory locks are gone — the write transaction serialises the whole file.
- `gnosia.revision_id` / `copy_ok` settings are per-connection flags
  exposed to triggers as `catalog_revision_id()` / `catalog_copy_ok()`.
- Postgres's `INITIALLY DEFERRED` constraint triggers have no SQLite
  spelling: an armed completeness rule is a row in `catalog_armed_rule`
  (migration `0001`), checked by `inTransaction` before commit.
- Multi-event triggers are three SQLite triggers (`_ins`, `_upd`, `_del`).
- `db.execute` keeps its `{ rows }` shape; JSON columns come back parsed,
  mirroring the pg driver's jsonb handling.
- Migrations live in `services/catalog/drizzle-sqlite/` (two entries:
  `0000_majestic_ronan`, the whole schema and seeds; `0001_catalog_armed_rule`).
  The old `drizzle/` folder is kept for the port script's reference and can be
  deleted once every active database has crossed.

## Commands

Unchanged: `npm run catalog -- migrate`, `status`, `ls`, and everything else.
There is no `create database` step — the file is created on first connect.
