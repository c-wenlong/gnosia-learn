// SQLite helpers the scripts share: opening the catalog's database file,
// copying it (the operation `createdb -T` was on Postgres), and dropping it.
// scripts/e2e.mjs and scripts/flip-rehearsal.mjs both copy `self_learn`'s
// file, and a copy that has to be right under open connections is easy to
// get subtly wrong (a `cp` of the main file can miss pages still in the
// -wal), so it lives here once.
//
// A script opens the file itself with `openDatabase` for a read (the flipped
// types, the backup's table list); the handle registers none of the
// functions the triggers call, so anything that writes must either register
// them or go through `catalog` (services/catalog/src/db.ts does both).
import Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';

/**
 * The catalog's SQLite file as a better-sqlite3 handle: `journal_mode=WAL`
 * persists in the file, so nothing is set here. The handle has none of the
 * functions `connect` registers (`catalog_copy_ok()` and friends), which is
 * fine for reads and for `backup`; a write that fires a copy-guard trigger
 * would fail for want of them, and a caller that means it registers them.
 */
export function openDatabase(file) {
  // `fileMustExist`: a bare `new Database(path)` creates an empty file, and
  // every caller here opens a database it believes already exists — a typo'd
  // `--from` must refuse, not leave a file it never made.
  return new Database(file, { fileMustExist: true });
}

/**
 * Copy `from`'s database into `to`, which must not exist as a database yet.
 * The SQLite backup API, not `cp`: a plain copy of the main file can leave
 * behind committed pages still sitting in the -wal, and `createdb -T`'s
 * refusal when the template had sessions open is the other way this one
 * never fails — the backup reads a consistent snapshot either way.
 * `created` is called the moment `to` is a file the copy may have started
 * writing, so a caller whose copy fails or is interrupted still knows there
 * is a file to remove. Returns how it copied, for a report.
 */
export async function copyDatabase(from, to, { created = () => {} } = {}) {
  const source = openDatabase(from);
  created();
  try {
    await source.backup(to);
  } finally {
    source.close();
  }
  return 'file copy';
}

/**
 * Remove a database file and its -wal/-shm sidecars, the way `dropdb
 * --if-exists --force` did. Sidecars first: a -wal left beside a file that
 * is then rewritten would belong to no database SQLite knows, and a stale
 * -shm is dropped with it. Returns whether the file is gone.
 */
export function dropDatabase(file) {
  rmSync(file, { force: true });
  rmSync(`${file}-wal`, { force: true });
  rmSync(`${file}-shm`, { force: true });
  return !existsSync(file);
}

/**
 * The tables a database file holds, sorted: the backup's completeness check
 * (`pg_restore --list` named them on Postgres). Throws when the file cannot
 * be opened — the caller phrases the refusal.
 */
export function tablesIn(file) {
  const db = openDatabase(file);
  try {
    return db
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name")
      .all()
      .map((row) => row.name);
  } finally {
    db.close();
  }
}

/**
 * One query's rows as objects, or null when the file cannot be opened or
 * the SQL fails — the psql `-Atc` the scripts used, kept lazy for the same
 * reason: a missing or unreadable file is the caller's refusal to phrase.
 */
export function rowsIn(file, text) {
  let db;
  try {
    db = openDatabase(file);
    return db.prepare(text).all();
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
