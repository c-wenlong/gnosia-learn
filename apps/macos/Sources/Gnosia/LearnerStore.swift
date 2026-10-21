//
//  LearnerStore.swift
//  Gnosia
//
//  The writable side of the app, kept out of catalog.db on purpose: the
//  catalog is a read-only mirror that a snapshot run replaces wholesale, so
//  anything the learner writes — resume points, stars, renames — would be
//  lost with it. learner.db sits beside it under the same data home
//  (GNOSIA_HOME, then SELF_LEARN_HOME, then ~/.gnosia — the rule
//  CatalogLocation.dataHome already resolves, shared rather than repeated).
//
//  Two groups of tables. The small marks: `watch` (where playback stopped
//  and whether it finished), `favorite` (the star) and `asset_name` (the
//  learner's own title — the same job Postgres's asset_name does for the
//  web app, and a separate row from it: a rename made here does not pretend
//  to have come from the catalog), all keyed by asset id — plus `progress`,
//  the course checklist ticks, keyed by curriculum item id. And the
//  learning state a tutor session writes: `session`, `event`, `mastery`
//  and `review`, column for column the Postgres tables the snapshot
//  mirrors, so the web's `POST /api/learner/observe` has a faithful local
//  equivalent (recordSessionAnswer) and a sync that one day lifts these
//  rows does not have to reshape them. Everything reads into memory on
//  open and writes update memory only after the row lands; the mark tables
//  are small enough that no read needs the file, and the session tables
//  need no memory at all — CatalogStore re-reads the file.
//
//  SQLiteDatabase is not reused: it opens read-only by design, so the
//  writable open below is its own thin shell over the same primitives.
//

import Foundation
import CSQLite3

/// One bound value, typed so a number never travels as text.
private enum Bind {
    case text(String)
    case real(Double)
    case int(Int64)
    case null
}

/// A writable connection to learner.db. The counterpart of SQLiteDatabase:
/// READWRITE|CREATE rather than READONLY, WAL so a save during playback does
/// not queue behind or block a read on the same file.
private final class WritableDatabase {
    private let db: OpaquePointer

    init(path: String) throws {
        var db: OpaquePointer?
        let code = sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil)
        guard code == SQLITE_OK, let db else {
            if db != nil { sqlite3_close(db) }
            throw CatalogError(message: "cannot open learner store at \(path) (\(code))")
        }
        self.db = db
    }

    /// Multi-statement SQL with nothing to bind and nothing to read back:
    /// the DDL and the journal pragma at open time.
    func exec(_ sql: String) throws {
        var message: UnsafeMutablePointer<CChar>?
        let code = sqlite3_exec(db, sql, nil, nil, &message)
        guard code == SQLITE_OK else {
            let detail = message.map { String(cString: $0) } ?? String(cString: sqlite3_errmsg(db))
            sqlite3_free(message)
            throw CatalogError(message: "exec failed (\(code)): \(detail)")
        }
    }

    /// One statement that writes, bound the way SQLiteRows binds reads.
    func run(_ sql: String, _ values: [Bind]) throws {
        var stmt: OpaquePointer?
        let code = sqlite3_prepare_v2(db, sql, -1, &stmt, nil)
        guard code == SQLITE_OK, let stmt else {
            throw CatalogError(message: "prepare failed (\(code)): \(String(cString: sqlite3_errmsg(db)))\n  in: \(sql)")
        }
        defer { sqlite3_finalize(stmt) }
        for (index, value) in values.enumerated() {
            let i = Int32(index + 1)
            switch value {
            case .text(let s): sqlite3_bind_text(stmt, i, s, -1, SQLITE_TRANSIENT)
            case .real(let d): sqlite3_bind_double(stmt, i, d)
            case .int(let n): sqlite3_bind_int64(stmt, i, n)
            case .null: sqlite3_bind_null(stmt, i)
            }
        }
        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw CatalogError(message: "write failed: \(String(cString: sqlite3_errmsg(db)))\n  in: \(sql)")
        }
    }

    /// A read, through the same SQLiteRows the catalog uses.
    func query(_ sql: String, bind values: [String] = []) throws -> SQLiteRows {
        let rows = try SQLiteRows(db: db, sql: sql)
        rows.bind(values)
        return rows
    }

    deinit { sqlite3_close(db) }
}

/// What the app last recorded for one asset: where playback stopped, whether
/// it finished, and when the row was written (for "last watched" displays).
struct WatchEntry: Hashable {
    var seconds: Double
    var done: Bool
    var updatedAt: Date
}

/// How much of a video has to have played before it counts as watched —
/// WATCHED_FRACTION in apps/web/src/lib/playback.ts. The web measures the
/// stretches that actually played; this app does not track ranges, so here
/// the playhead reaching 90% of the duration is the crossing.
let watchedFraction = 0.9

/// The longest name `asset_name` takes — ASSET_NAME_MAX in shared.ts.
let assetNameMax = 200

/// cleanAssetName in packages/schema/src/shared.ts: whitespace runs as one
/// space, ends trimmed, and an empty remainder means "no name of mine".
func cleanAssetName(_ value: String) -> String? {
    let cleaned = value
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
    return cleaned.isEmpty ? nil : cleaned
}

/// The learner's own file: favorites, watch marks, renames and course ticks,
/// loaded whole.
@MainActor @Observable
final class LearnerStore {
    private(set) var favorites: Set<String> = []
    private(set) var watches: [String: WatchEntry] = [:]
    private(set) var names: [String: String] = [:]
    /// Ticks and notes by curriculum item id — this app's own writes, which
    /// CatalogStore merges over the snapshot's progress mirror.
    private(set) var progress: [String: CatalogProgress] = [:]
    private(set) var error: String?
    private(set) var loaded = false

    /// The file this store writes; injectable so a test or preview can keep
    /// its writes off the real home.
    let path: String
    private var db: WritableDatabase?

    init(path: String = LearnerStore.defaultPath()) {
        self.path = path
    }

    /// <data home>/learner.db, the data home resolved exactly as the
    /// catalog's is. nonisolated: a path is not actor state, and an
    /// init's default argument is evaluated off the actor.
    nonisolated static func defaultPath(env: [String: String] = ProcessInfo.processInfo.environment) -> String {
        CatalogLocation.dataHome(env: env).appendingPathComponent("learner.db").path
    }

    /// `loaded` means memory reflects the file: it is set only after a
    /// successful read, so a failed open does not leave the maps claiming
    /// empty while the file holds rows.
    func loadIfNeeded() {
        guard !loaded else { return }
        do {
            if db == nil { try open() }
            try load()
            loaded = true
            error = nil
        } catch let failure as CatalogError {
            error = failure.message
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The file reread; for the same kind of button the catalog's reload is.
    func reload() {
        db = nil
        loaded = false
        loadIfNeeded()
    }

    // MARK: - Favorites

    func isFavorite(_ assetID: String) -> Bool {
        favorites.contains(assetID)
    }

    func toggleFavorite(_ assetID: String) {
        write { db in
            if favorites.contains(assetID) {
                try db.run("DELETE FROM favorite WHERE asset_id = ?", [.text(assetID)])
                favorites.remove(assetID)
            } else {
                try db.run("INSERT OR IGNORE INTO favorite (asset_id) VALUES (?)", [.text(assetID)])
                favorites.insert(assetID)
            }
        }
    }

    // MARK: - Watch marks

    func watchEntry(for assetID: String) -> WatchEntry? {
        watches[assetID]
    }

    /// Record where an asset's playback is. `done` is the watched verdict —
    /// the caller decides the fraction, the store only remembers.
    func setWatch(_ assetID: String, seconds: Double, done: Bool) {
        let now = Date()
        write { db in
            try db.run(
                "INSERT OR REPLACE INTO watch (asset_id, seconds, done, updated_at) VALUES (?, ?, ?, ?)",
                [.text(assetID), .real(seconds), .int(done ? 1 : 0), .real(now.timeIntervalSince1970)]
            )
            watches[assetID] = WatchEntry(seconds: seconds, done: done, updatedAt: now)
        }
    }

    // MARK: - Renames

    /// The learner's own name for an asset, or nil to draw the catalog's.
    func name(for assetID: String) -> String? {
        names[assetID]
    }

    /// A blank name is a cleared one: the row stores names, not intentions.
    /// Cleaned the way the web route cleans (cleanAssetName).
    func rename(_ assetID: String, to newName: String) {
        guard let cleaned = cleanAssetName(newName) else {
            clearName(assetID)
            return
        }
        write { db in
            try db.run("INSERT OR REPLACE INTO asset_name (asset_id, name) VALUES (?, ?)",
                       [.text(assetID), .text(cleaned)])
            names[assetID] = cleaned
        }
    }

    func clearName(_ assetID: String) {
        write { db in
            try db.run("DELETE FROM asset_name WHERE asset_id = ?", [.text(assetID)])
            names.removeValue(forKey: assetID)
        }
    }

    // MARK: - Course ticks

    func progressMark(for itemID: String) -> CatalogProgress? {
        progress[itemID]
    }

    func isDone(_ itemID: String) -> Bool {
        progress[itemID]?.completedAt != nil
    }

    /// Tick or untick a curriculum item — setProgress in
    /// services/catalog/src/state/progress.ts: a tick writes `completed_at`,
    /// an untick nulls it.
    ///
    /// One deliberate difference: Postgres's pruneEmpty deletes a row left
    /// with neither tick nor note, and this one does not. There the row's
    /// absence means "untouched"; here the row is an overlay on the
    /// snapshot's progress mirror, so deleting an untick would let the
    /// mirror's older tick show through again. A NULL `completed_at` is the
    /// tombstone that keeps the untick honest.
    ///
    /// `assertReadableItems` is also not re-run: the only callers are item
    /// rows the catalog itself rendered, so the item exists by construction.
    func setProgress(_ itemID: String, completed: Bool) {
        let now = Date().timeIntervalSince1970
        write { db in
            if completed {
                try db.run("""
                    INSERT INTO progress
                        (learner_id, curriculum_item_id, completed_at, created_at, updated_at)
                    VALUES ('local', ?, ?, ?, ?)
                    ON CONFLICT (learner_id, curriculum_item_id)
                    DO UPDATE SET completed_at = excluded.completed_at,
                                  updated_at = excluded.updated_at
                    """,
                    [.text(itemID), .real(now), .real(now), .real(now)])
            } else {
                try db.run("""
                    UPDATE progress SET completed_at = NULL, updated_at = ?
                    WHERE learner_id = 'local' AND curriculum_item_id = ?
                    """,
                    [.real(now), .text(itemID)])
            }
            // Memory mirrors the file, so the map reads the row back rather
            // than assume: an untick keeps it (the tombstone above), an
            // untick on an item never written lands nowhere at all.
            let row = try db.query("""
                SELECT completed_at, note, updated_at FROM progress
                WHERE learner_id = 'local' AND curriculum_item_id = ?
                """, bind: [itemID])
            if row.next() {
                progress[itemID] = CatalogProgress(
                    curriculumItemId: itemID,
                    completedAt: row.double(0).map { Date(timeIntervalSince1970: $0) },
                    note: row.text(1),
                    updatedAt: row.double(2).map { Date(timeIntervalSince1970: $0) }
                )
            } else {
                progress.removeValue(forKey: itemID)
            }
        }
    }

    // MARK: - Sessions, observations, mastery and review

    /// The web's `POST /api/learner/observe` as a local write — observe.ts's
    /// transaction: open the session row if this is its first answer,
    /// append the `observation` event, upsert the mastery rows the model
    /// computed (the concept's own and every prerequisite propagation
    /// touched) and the review card, all inside one transaction so a
    /// half-written answer cannot leave mastery ahead of the log it came
    /// from.
    ///
    /// Returns false when the write failed — `error` says why, and the
    /// caller is expected to keep the pick so "Try again" can replay it.
    @discardableResult
    func recordSessionAnswer(_ write: SessionAnswerWrite) -> Bool {
        var saved = false
        self.write { db in
            try db.exec("BEGIN IMMEDIATE")
            do {
                try applySessionAnswer(db, write)
                try db.exec("COMMIT")
                saved = true
            } catch {
                try? db.exec("ROLLBACK")
                throw error
            }
        }
        return saved
    }

    /// `session-close` for a session this file opened — closeInTransaction:
    /// the event, then state flipped to `closed`. A session that never
    /// opened or is closed already writes nothing, so exit paths can call
    /// this without tracking whether an answer ever landed.
    func closeSession(_ id: String, concepts: [String], at: Date = Date()) {
        write { db in
            try db.exec("BEGIN IMMEDIATE")
            do {
                let rows = try db.query(
                    "SELECT state FROM session WHERE id = ? AND learner_id = 'local'",
                    bind: [id]
                )
                if rows.next(), rows.text(0) == "running" {
                    try db.run(
                        "INSERT INTO event (at, learner_id, type, payload) VALUES (?, 'local', 'session-close', ?)",
                        [
                            .real(at.timeIntervalSince1970),
                            .text(Self.json([
                                "session": id,
                                "concepts": concepts,
                            ])),
                        ]
                    )
                    try db.run(
                        "UPDATE session SET state = 'closed', updated_at = ? WHERE id = ?",
                        [.real(at.timeIntervalSince1970), .text(id)]
                    )
                }
                try db.exec("COMMIT")
            } catch {
                try? db.exec("ROLLBACK")
                throw error
            }
        }
    }

    /// The inserts recordSessionAnswer wraps in its transaction — split out
    /// only so the transaction's shape reads on its own.
    private func applySessionAnswer(_ db: WritableDatabase, _ write: SessionAnswerWrite) throws {
        let at = write.at.timeIntervalSince1970
        let outcome = write.outcome

        // openInTransaction: the session row opens with the first answer —
        // a session no answer recorded has nothing to open, and an id that
        // exists must be this learner's running tutor session, or this is
        // not the log it thinks it is writing to.
        let existing = try db.query(
            "SELECT kind, learner_id, state FROM session WHERE id = ?",
            bind: [write.sessionId]
        )
        if existing.next() {
            guard
                existing.text(0) == "tutor",
                existing.text(1) == "local",
                existing.text(2) == "running"
            else {
                throw CatalogError(
                    message: "session \(write.sessionId) is \(existing.text(2) ?? "unknown"), not a running tutor session"
                )
            }
        } else {
            try db.run("""
                INSERT INTO session (id, kind, learner_id, state, title, goal, started_at, updated_at)
                VALUES (?, 'tutor', 'local', 'running', ?, ?, ?, ?)
                """,
                [
                    .text(write.sessionId), .text(write.sessionTitle), .text(write.sessionGoal),
                    .real(at), .real(at),
                ])
            // session-start — the event readSessionHome's conceptTouches
            // folds for "last opened". Postgres promotes `session` out of
            // the payload into session_id; the mirror keeps the flat record
            // whole so this row alone still names its session.
            try db.run(
                "INSERT INTO event (at, learner_id, type, payload) VALUES (?, 'local', 'session-start', ?)",
                [.real(at), .text(Self.json(["session": write.sessionId, "goal": write.sessionGoal]))]
            )
        }

        // The observation event — the flat EventRecord, the same shape the
        // old events.jsonl wrote: concept, verdict and schedule evidence in
        // payload, since the mirror's event table promotes nothing.
        var payload: [String: Any] = [
            "concept": outcome.concept,
            "correct": outcome.correct,
            "propagated": outcome.propagated.map { ["concept": $0.concept, "hops": $0.hops] as [String: Any] },
            "source": outcome.source,
            "opportunity": outcome.opportunity,
            "grade": outcome.grade,
            "scheduled": true,
            "pLBefore": outcome.pLBefore,
            "pLAfter": outcome.pLAfter,
            "session": write.sessionId,
            "requestId": write.requestId,
        ]
        payload["question"] = write.question ?? NSNull()
        payload["answer"] = write.answer ?? NSNull()
        payload["chosen"] = write.chosen ?? NSNull()
        try db.run(
            "INSERT INTO event (at, learner_id, type, payload) VALUES (?, 'local', 'observation', ?)",
            [.real(at), .text(Self.json(payload))]
        )

        // writeModel: the mastery rows the answer touched — the concept's
        // own and each prerequisite propagation created or moved.
        for row in write.masteryRows {
            try db.run("""
                INSERT INTO mastery (learner_id, concept_slug, p_l, observations, correct,
                    last_seen, created_at, updated_at)
                VALUES ('local', ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (learner_id, concept_slug) DO UPDATE SET
                    p_l = excluded.p_l, observations = excluded.observations,
                    correct = excluded.correct, last_seen = excluded.last_seen,
                    updated_at = excluded.updated_at
                """,
                [
                    .text(row.conceptSlug), .real(row.pL), .int(row.observations), .int(row.correct),
                    // A prerequisite only ever propagated to was never seen:
                    // its last_seen stays NULL, as the web's row reads.
                    row.lastSeen.map { Bind.real($0.timeIntervalSince1970) } ?? .null,
                    .real(at), .real(at),
                ])
        }

        // writeCard: the concept's card as SM-2 left it — due, ease, lapses
        // and all, the same columns the snapshot's review mirror carries.
        let card = outcome.card
        try db.run("""
            INSERT INTO review (learner_id, concept_slug, repetitions, ease, interval_days,
                lapses, due, last_reviewed, leech, created_at, updated_at)
            VALUES ('local', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (learner_id, concept_slug) DO UPDATE SET
                repetitions = excluded.repetitions, ease = excluded.ease,
                interval_days = excluded.interval_days, lapses = excluded.lapses,
                due = excluded.due, last_reviewed = excluded.last_reviewed,
                leech = excluded.leech, updated_at = excluded.updated_at
            """,
            [
                .text(card.conceptSlug), .int(card.repetitions), .real(card.ease),
                .int(card.intervalDays), .int(card.lapses), .real(card.due.timeIntervalSince1970),
                .real((card.lastReviewed ?? write.at).timeIntervalSince1970), .int(card.leech ? 1 : 0),
                .real(at), .real(at),
            ])
    }

    /// JSONSerialization of a small payload, "" on failure — a payload that
    /// will not encode has no business landing as `{}` pretending to be one.
    private static func json(_ object: [String: Any]) -> String {
        (try? JSONSerialization.data(withJSONObject: object))
            .flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }

    // MARK: - The file

    private func open() throws {
        try FileManager.default.createDirectory(
            at: URL(fileURLWithPath: path).deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let db = try WritableDatabase(path: path)
        try db.exec("""
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS watch (
              asset_id   TEXT PRIMARY KEY,
              seconds    REAL NOT NULL,
              done       INTEGER NOT NULL DEFAULT 0,
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS favorite (
              asset_id TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS asset_name (
              asset_id TEXT PRIMARY KEY,
              name     TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS progress (
              learner_id         TEXT NOT NULL DEFAULT 'local',
              curriculum_item_id TEXT NOT NULL,
              completed_at       REAL,
              note               TEXT,
              created_at         REAL,
              updated_at         REAL,
              PRIMARY KEY (learner_id, curriculum_item_id)
            );
            -- The learning-state tables a session writes, column for column
            -- the tables catalog-snapshot.mjs mirrors into catalog.db, so a
            -- read that expects the mirror's shape finds it here and a
            -- future sync does not have to reshape anything.
            CREATE TABLE IF NOT EXISTS session (
              id         TEXT PRIMARY KEY,
              kind       TEXT NOT NULL DEFAULT 'tutor',
              learner_id TEXT NOT NULL DEFAULT 'local',
              state      TEXT NOT NULL DEFAULT 'running',
              title      TEXT,
              goal       TEXT,
              started_at REAL,
              updated_at REAL
            );
            CREATE TABLE IF NOT EXISTS event (
              id         INTEGER PRIMARY KEY,
              at         REAL NOT NULL,
              learner_id TEXT NOT NULL DEFAULT 'local',
              type       TEXT NOT NULL,
              payload    TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS mastery (
              learner_id   TEXT NOT NULL DEFAULT 'local',
              concept_slug TEXT NOT NULL,
              p_l          REAL NOT NULL DEFAULT 0,
              observations INTEGER NOT NULL DEFAULT 0,
              correct      INTEGER NOT NULL DEFAULT 0,
              last_seen    REAL,
              created_at   REAL,
              updated_at   REAL,
              PRIMARY KEY (learner_id, concept_slug)
            );
            CREATE TABLE IF NOT EXISTS review (
              learner_id    TEXT NOT NULL DEFAULT 'local',
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
            """)
        self.db = db
    }

    private func load() throws {
        guard let db else { return }

        var favorites: Set<String> = []
        let favoriteRows = try db.query("SELECT asset_id FROM favorite")
        while favoriteRows.next() {
            if let id = favoriteRows.text(0) { favorites.insert(id) }
        }

        var watches: [String: WatchEntry] = [:]
        let watchRows = try db.query("SELECT asset_id, seconds, done, updated_at FROM watch")
        while watchRows.next() {
            guard let id = watchRows.text(0) else { continue }
            watches[id] = WatchEntry(
                seconds: watchRows.double(1) ?? 0,
                done: (watchRows.int64(2) ?? 0) != 0,
                updatedAt: Date(timeIntervalSince1970: watchRows.double(3) ?? 0)
            )
        }

        var names: [String: String] = [:]
        let nameRows = try db.query("SELECT asset_id, name FROM asset_name")
        while nameRows.next() {
            if let id = nameRows.text(0), let name = nameRows.text(1) { names[id] = name }
        }

        var progress: [String: CatalogProgress] = [:]
        let progressRows = try db.query("""
            SELECT curriculum_item_id, completed_at, note, updated_at
            FROM progress WHERE learner_id = 'local'
            """)
        while progressRows.next() {
            guard let item = progressRows.text(0) else { continue }
            progress[item] = CatalogProgress(
                curriculumItemId: item,
                completedAt: progressRows.double(1).map { Date(timeIntervalSince1970: $0) },
                note: progressRows.text(2),
                updatedAt: progressRows.double(3).map { Date(timeIntervalSince1970: $0) }
            )
        }

        self.favorites = favorites
        self.watches = watches
        self.names = names
        self.progress = progress
    }

    /// A write and its memory update as one step: if the row does not land,
    /// nothing draws as if it had, and `error` says why. The file opens and
    /// reads on demand, so a write before load still starts from what the
    /// file holds rather than from empty.
    private func write(_ body: (WritableDatabase) throws -> Void) {
        do {
            if db == nil { try open() }
            guard let db else { throw CatalogError(message: "learner store did not open") }
            if !loaded {
                try load()
                loaded = true
            }
            try body(db)
            error = nil
        } catch let failure as CatalogError {
            error = failure.message
        } catch {
            self.error = error.localizedDescription
        }
    }
}
