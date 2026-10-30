//
//  LearnerStore.swift
//  Gnosia
//
//  The writable side of the app, kept out of app-catalog.db on purpose: the
//  mirror is a read-only file that a snapshot run replaces wholesale, so
//  anything the learner writes — resume points, stars, renames — would be
//  lost with it. learner.db sits beside it under the same data home
//  (GNOSIA_HOME, then ~/.gnosia — the rule
//  CatalogLocation.dataHome already resolves, shared rather than repeated).
//
//  Two groups of tables. The small marks: `watch` (where playback stopped
//  and whether it finished), `favorite` (the star) and `asset_name` (the
//  learner's own title — the same job the catalog's asset_name does for the
//  web app, and a separate row from it: a rename made here does not pretend
//  to have come from the catalog), all keyed by asset id — plus `progress`,
//  the course checklist ticks, keyed by curriculum item id. And the
//  learning state a tutor session writes: `session`, `event`, `mastery`
//  and `review`, column for column the catalog tables the snapshot
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
//  The catalog half: every write here is also the web's write. GnosiaApp
//  hands the store the SidecarManager, and each method's local row commits
//  beside the matching `/api/learner/*` call in one transaction — the
//  `mirror_queue` table, the outbox — so a committed write always owes
//  the catalog its mirror and a crash between commit and send loses nothing.
//  A flusher drains the queue oldest-first through the sidecar, and the
//  routes are the web's, so the catalog sees the same bodies the pages post.
//  A down or spawning sidecar and an unreachable catalog just make rows
//  wait: sends retry with backoff, bounded by attempts and by age, and
//  whatever outlives both is dropped, counted and logged — the divergence
//  a future sync would reconcile.
//
//  An answer's numbers are the catalog's once it has them (S9-06). The
//  app computes an answer's p(L) and card itself so it can draw them the
//  moment the pick lands, and writes them here; when the observe or grade
//  mirror lands, its reply carries what the catalog recorded and the rows
//  it moved, and `applyRecorded` replaces the estimate with them — in
//  learner.db and in `answerRecords`, which the session's feedback bar and
//  close screen read by request id.
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
    /// The file's length the last heartbeat knew — kept so a Recent row can
    /// say "2:17 of 11:36" without asking the player.
    var duration: Double? = nil
    /// The stretches that actually played here, merged, in seconds.
    var ranges: [[Double]] = []
}

// MARK: - Coverage (packages/tutor/src/playback.ts)

/// How much of a video has to have played before it counts as watched —
/// WATCHED_FRACTION in packages/tutor/src/playback.ts. Coverage, not
/// position: a learner who drags to the last second has not watched it.
let watchedFraction = 0.9

/// The most ranges one save may carry — MAX_RANGES.
let maxPlaybackRanges = 500

/// `mergeRanges`: sorted, overlapping or touching (within half a second)
/// stretches joined, empty ones dropped.
func mergeRanges(_ ranges: [[Double]]) -> [[Double]] {
    let sorted = ranges
        .filter { $0.count == 2 && $0[0].isFinite && $0[1].isFinite && $0[1] > $0[0] }
        .sorted { $0[0] < $1[0] }
    var out: [[Double]] = []
    for range in sorted {
        if let last = out.last, range[0] <= last[1] + 0.5 {
            out[out.count - 1][1] = max(last[1], range[1])
        } else {
            out.append(range)
        }
    }
    return out
}

/// `clampRanges`: every range clipped into `[0, duration]`, then merged.
func clampRanges(_ ranges: [[Double]], duration: Double) -> [[Double]] {
    mergeRanges(ranges.compactMap { $0.count == 2 ? [max(0, $0[0]), min(duration, $0[1])] : nil })
}

/// `coverage`: the fraction of `duration` the ranges cover, 0 to 1.
func playbackCoverage(_ ranges: [[Double]], duration: Double) -> Double {
    guard duration > 0 else { return 0 }
    let seconds = clampRanges(ranges, duration: duration).reduce(0) { $0 + ($1[1] - $1[0]) }
    return min(1, seconds / duration)
}

/// The longest name `asset_name` takes — ASSET_NAME_MAX in shared.ts.
let assetNameMax = 200

/// The longest scratch note `progress.note` takes — MAX_NOTE_CHARS in
/// apps/web/src/lib/learner-api.ts.
let maxNoteChars = 20_000

/// A note as the route takes it: cut to `maxNoteChars` UTF-16 units, the
/// JavaScript `.length` the route counts, never splitting a character. A
/// cut by Swift characters let an emoji-heavy note past the local check,
/// the route refused it, and the mirror dropped it for good.
func learnerNoteValue(_ note: String) -> String {
    sessionPrefix(note, utf16: maxNoteChars)
}

/// Whether a name is over `assetNameMax` as the route measures it: the
/// cleaned name, in UTF-16 units.
func assetNameTooLong(_ name: String) -> Bool {
    (cleanAssetName(name)?.utf16.count ?? 0) > assetNameMax
}

/// cleanAssetName in packages/schema/src/shared.ts: whitespace runs as one
/// space, ends trimmed, and an empty remainder means "no name of mine".
func cleanAssetName(_ value: String) -> String? {
    let cleaned = value
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
    return cleaned.isEmpty ? nil : cleaned
}

/// One `/api/learner/*` call the store owes the catalog — the queue's unit:
/// the route's path and its JSON body, already encoded so it can persist.
/// `dedupeKey` on upsert mirrors collapses a newer queued write over an
/// older one for the same row (the file itself only ever holds the latest
/// state, so replaying just that loses nothing); append mirrors —
/// `observe`, `watched` — pass nil so each lands as its own event.
private struct MirrorCall {
    /// The route's path, exactly as `SidecarClient` appends it to the base URL.
    let path: String
    let dedupeKey: String?
    /// The body as bytes — `Data` is `Sendable`, so the call crosses the
    /// flusher's suspension points safely.
    let body: Data

    /// nil when the body will not encode — a mirror that never formed owes
    /// the catalog nothing.
    init?(path: String, dedupeKey: String? = nil, body: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return nil }
        self.init(path: path, dedupeKey: dedupeKey, data: data)
    }

    init(path: String, dedupeKey: String? = nil, data: Data) {
        self.path = path
        self.dedupeKey = dedupeKey
        self.body = data
    }
}

/// A persisted `mirror_queue` row, as one flush pass reads it.
private struct MirrorRow {
    let id: Int64
    let route: String
    let body: String
    let attempts: Int64
    let createdAt: Double
    /// Backoff deadline: the pass must not send before it, and must not pass
    /// it either — a row resting here blocks every newer one (head of line).
    let nextAt: Double
}

/// The learner's own file: favorites, watch marks, renames and course ticks,
/// loaded whole.
@MainActor @Observable
final class LearnerStore {
    private(set) var favorites: Set<String> = []
    /// Assets the app unstarred — kept so a snapshot `favorite:<id>` row
    /// cannot resurrect a star the learner dropped between mirrors.
    private(set) var unfavorites: Set<String> = []
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

    /// The catalog mirror's sidecar, wired by the app shell. Nil in a
    /// preview or a test is "no mirror": the local writes all still land
    /// and nothing is queued.
    var sidecar: SidecarManager?

    /// What the catalog said about each answer and review grade the mirror
    /// sent, by request id — the record `shown` lays over an estimate.
    private(set) var answerRecords: [String: AnswerRecord] = [:]
    /// Bumped each time a catalog reply moves learner.db's mastery or
    /// review rows, so the shell can re-merge them into the catalog store.
    private(set) var recordedVersion = 0

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
            // The launch retry: anything still owed goes due now rather
            // than waiting out a backoff a restart likely made moot.
            if let db {
                try? db.run("UPDATE mirror_queue SET next_at = ?",
                            [.real(Date().timeIntervalSince1970)])
            }
            refreshMirrorCounts()
            kickMirrors()
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
        // Memory must reflect the file before the toggle decides — the
        // write loads on demand, so a store opened but never read would
        // otherwise invert the verdict.
        loadIfNeeded()
        let favorited = !favorites.contains(assetID)
        // The web's `favorite` route: a preference row, upserted or cleared.
        write(mirror: MirrorCall(
            path: "/api/learner/favorite",
            dedupeKey: "favorite:\(assetID)",
            body: ["assetId": assetID, "favorite": favorited]
        )) { db in
            // Both directions keep a row: an unstar is a tombstone that
            // masks the snapshot's `favorite:<id>` preference — a delete
            // would let the mirrored star show through again until the next
            // snapshot arrives.
            try db.run(
                "INSERT OR REPLACE INTO favorite (asset_id, starred) VALUES (?, ?)",
                [.text(assetID), .int(favorited ? 1 : 0)])
            if favorited {
                favorites.insert(assetID)
                unfavorites.remove(assetID)
            } else {
                favorites.remove(assetID)
                unfavorites.insert(assetID)
            }
        }
    }

    // MARK: - Watch marks

    func watchEntry(for assetID: String) -> WatchEntry? {
        watches[assetID]
    }

    /// What a watch save mirrors to the catalog. The app has two kinds of
    /// write here — a player heartbeat and an explicit mark — and they are
    /// two different web routes, so the caller names its own.
    enum WatchMirror {
        /// The player's heartbeat: `POST /api/learner/playback`, with the
        /// stretches that played since the last one. The row keeps every
        /// stretch this app has seen, merged, and each save sends them all:
        /// the route unions them into what it stored, so a resend changes
        /// nothing, and the dedupe that collapses queued heartbeats to the
        /// newest loses nothing either. The route's own merge is what
        /// appends the `watched` event on the crossing.
        case position(duration: Double, ranges: [[Double]])
        /// The "Mark watched" / "Mark read" press: `POST /api/learner/watched`,
        /// one `watched` event, as the web's button appends.
        case marked
    }

    /// Record where an asset's playback is. `done` is the caller's verdict
    /// for a mark; a heartbeat's is the stored one or the coverage of every
    /// stretch played here reaching `watchedFraction`, and it never goes back.
    func setWatch(_ assetID: String, seconds: Double, done marked: Bool, mirror: WatchMirror) {
        let now = Date()
        let stored = watches[assetID]
        var ranges = stored?.ranges ?? []
        var done = marked || (stored?.done ?? false)
        if case .position(let duration, let played) = mirror, duration > 0 {
            // The first MAX_RANGES, as applySave keeps them, so this row and
            // the catalog's never hold different stretches of one video.
            ranges = Array(clampRanges(ranges + played, duration: duration).prefix(maxPlaybackRanges))
            done = done || playbackCoverage(ranges, duration: duration) >= watchedFraction
        }
        // The mirror body, decided up front — a zero duration has nothing
        // to claim, so no write of it is owed.
        let call: MirrorCall?
        switch mirror {
        case .position(let duration, _):
            let position = min(max(0, seconds), duration)
            call = duration > 0
                ? MirrorCall(
                    path: "/api/learner/playback",
                    dedupeKey: "playback:\(assetID)",
                    body: [
                        "assetId": assetID,
                        "duration": duration,
                        "position": position,
                        "ranges": ranges,
                    ])
                : nil
        case .marked:
            // The "Mark watched" / "Mark read" press: one `watched` event,
            // as the web's button appends. The server's append does not
            // dedupe, so neither does the queue: each press owes a send.
            call = MirrorCall(
                path: "/api/learner/watched",
                body: ["assetId": assetID])
        }
        // The duration travels in the position mirror already, so it is the
        // write's own to keep; a `.marked` press names none and the stored
        // one stays (COALESCE), as the player knew it last.
        let duration: Double?
        if case .position(let d, _) = mirror { duration = d } else { duration = nil }
        write(mirror: call) { db in
            try db.run("""
                INSERT INTO watch (asset_id, seconds, done, updated_at, duration, ranges)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (asset_id) DO UPDATE SET
                    seconds = excluded.seconds, done = excluded.done,
                    updated_at = excluded.updated_at,
                    duration = COALESCE(excluded.duration, watch.duration),
                    ranges = excluded.ranges
                """,
                [.text(assetID), .real(seconds), .int(done ? 1 : 0), .real(now.timeIntervalSince1970),
                 duration.map(Bind.real) ?? .null, .text(Self.rangesJSON(ranges))]
            )
            watches[assetID] = WatchEntry(
                seconds: seconds, done: done, updatedAt: now,
                duration: duration ?? watches[assetID]?.duration,
                ranges: ranges
            )
        }
    }

    // MARK: - Visits

    /// The web VisitTracker's `markVisited` as a local write: a `visit`
    /// event — the row Recent's module rows and the Courses section's
    /// resume lines fold from — beside the `lastVisited` preference write
    /// the web page posts, queued as the mirror. The catalog's route turns
    /// that same body into its own visit event plus `recentModules` update,
    /// so the server and this file record the same thing. It is an append
    /// mirror like `watched`: each visit owes its own send.
    func recordVisit(courseSlug: String, moduleSlug: String?) {
        let now = Date()
        var value: [String: Any] = [
            "courseSlug": courseSlug,
            "at": Self.iso8601(now),
        ]
        var payload: [String: Any] = ["course": courseSlug]
        if let moduleSlug, !moduleSlug.isEmpty {
            value["moduleSlug"] = moduleSlug
            payload["module"] = moduleSlug
        }
        write(mirror: MirrorCall(
            path: "/api/learner/preference",
            body: ["key": "lastVisited", "value": value]
        )) { db in
            try db.run(
                "INSERT INTO event (at, learner_id, type, payload) VALUES (?, 'local', 'visit', ?)",
                [.real(now.timeIntervalSince1970), .text(Self.json(payload))]
            )
        }
    }

    /// The `at` field the preference route expects — ISO 8601 with
    /// fractional seconds, the shape it already reads back.
    private static func iso8601(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }

    // MARK: - Renames

    /// The learner's own name for an asset, or nil to draw the catalog's.
    /// The empty string is clearName's tombstone — it masks the snapshot's
    /// rename without being a name itself.
    func name(for assetID: String) -> String? {
        guard let name = names[assetID], !name.isEmpty else { return nil }
        return name
    }

    /// A blank name is a cleared one: the row stores names, not intentions.
    /// Cleaned the way the web route cleans (cleanAssetName).
    func rename(_ assetID: String, to newName: String) {
        guard let cleaned = cleanAssetName(newName) else {
            clearName(assetID)
            return
        }
        // The route would refuse it, and a refused mirror is dropped, so the
        // name would live here and nowhere else. The field stops it first.
        guard !assetNameTooLong(cleaned) else { return }
        write(mirror: MirrorCall(
            path: "/api/learner/asset-name",
            dedupeKey: "asset-name:\(assetID)",
            body: ["assetId": assetID, "name": cleaned]
        )) { db in
            try db.run("INSERT OR REPLACE INTO asset_name (asset_id, name) VALUES (?, ?)",
                       [.text(assetID), .text(cleaned)])
            names[assetID] = cleaned
        }
    }

    func clearName(_ assetID: String) {
        write(mirror: MirrorCall(
            path: "/api/learner/asset-name",
            dedupeKey: "asset-name:\(assetID)",
            body: ["assetId": assetID, "name": NSNull()]
        )) { db in
            // A tombstone, not a delete: with no local row the snapshot's own
            // rename shows through again and the cleared name comes back.
            try db.run("INSERT OR REPLACE INTO asset_name (asset_id, name) VALUES (?, '')",
                       [.text(assetID)])
            names[assetID] = ""
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
    /// One deliberate difference: the catalog's pruneEmpty deletes a row left
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
        write(mirror: MirrorCall(
            path: "/api/learner/progress",
            dedupeKey: "progress:\(itemID)",
            body: ["curriculumItemId": itemID, "completed": completed]
        )) { db in
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
                // An untick needs a row to land on even when progress so far
                // lives only in the snapshot — the INSERT writes the
                // tombstone that masks it; a bare UPDATE would touch nothing
                // and the snapshot's tick would show through again.
                try db.run("""
                    INSERT INTO progress
                        (learner_id, curriculum_item_id, completed_at, created_at, updated_at)
                    VALUES ('local', ?, NULL, ?, ?)
                    ON CONFLICT (learner_id, curriculum_item_id)
                    DO UPDATE SET completed_at = NULL,
                                  updated_at = excluded.updated_at
                    """,
                    [.text(itemID), .real(now), .real(now)])
            }
            // Memory mirrors the file, so the map reads the row back rather
            // than assume: an untick keeps its row as a tombstone.
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

    /// The learner's note on one curriculum item — setNote in
    /// services/catalog/src/state/progress.ts as `POST /api/learner/note`
    /// calls it: an empty note clears to NULL. Capped at MAX_NOTE_CHARS in
    /// apps/web/src/lib/learner-api.ts, which the route enforces.
    ///
    /// The row is kept rather than deleted when it ends up holding neither
    /// tick nor note — the same tombstone rule setProgress documents:
    /// The catalog's pruneEmpty can delete because absence means "untouched"
    /// there, while this file's row masks the snapshot's progress mirror,
    /// and a deleted row would let a stale mirrored note show through.
    func setNote(_ itemID: String, note: String) {
        let value = learnerNoteValue(note)
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let now = Date().timeIntervalSince1970
        write(mirror: MirrorCall(
            path: "/api/learner/note",
            dedupeKey: "note:\(itemID)",
            body: ["curriculumItemId": itemID, "note": String(value)]
        )) { db in
            try db.run("""
                INSERT INTO progress
                    (learner_id, curriculum_item_id, note, created_at, updated_at)
                VALUES ('local', ?, ?, ?, ?)
                ON CONFLICT (learner_id, curriculum_item_id)
                DO UPDATE SET note = excluded.note,
                              updated_at = excluded.updated_at
                """,
                [.text(itemID), trimmed.isEmpty ? .null : .text(String(value)), .real(now), .real(now)])
            // Memory reads the row back, as setProgress does.
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
    /// The catalog mirror is queued in the same commit — it lands only
    /// when the row does — and a replayed write queues the same requestId,
    /// which the server answers `replayed` rather than recording twice.
    @discardableResult
    func recordSessionAnswer(_ write: SessionAnswerWrite) -> Bool {
        // The web's observe body: the server recomputes mastery and the
        // card from the evidence, so the local outcome numbers are never
        // sent. They stand only until the reply replaces them
        // (applyRecorded).
        let mirror = Self.observeJSON(write).map {
            // Deduped by requestId — the server's own replay key: queueing
            // the same answer twice (a "Try again" replay) collapses to one.
            MirrorCall(path: "/api/learner/observe",
                       dedupeKey: "observe:\(write.requestId)", data: $0)
        }
        return self.write(mirror: mirror) { db in
            try applySessionAnswer(db, write)
        }
    }

    /// The `POST /api/learner/observe` body for one recorded answer, encoded:
    /// what the web's session page posts, evidence fields only, so the
    /// catalog recomputes mastery and scheduling through `recordObservation` rather
    /// than trusting this file's numbers. Fields the route reads as optional
    /// text travel as null when absent; an empty session title is simply not
    /// sent (the route refuses one). Encoded here rather than in the client
    /// so the dictionary — built on this actor — crosses as bytes.
    static func observeJSON(_ write: SessionAnswerWrite) -> Data? {
        var body: [String: Any] = [
            "conceptSlug": write.outcome.concept,
            "correct": write.outcome.correct,
            "source": write.outcome.source,
            "requestId": write.requestId,
            "sessionId": write.sessionId,
            "question": write.question ?? NSNull(),
            "answer": write.answer ?? NSNull(),
            "chosen": write.chosen ?? NSNull(),
        ]
        if !write.sessionTitle.isEmpty { body["sessionTitle"] = write.sessionTitle }
        if !write.sessionGoal.isEmpty { body["sessionGoal"] = write.sessionGoal }
        // A week check names its module — the web's `module`, validated
        // server-side as a live module the owner can read. A concept
        // session sends no key, as the web's payload does.
        if let module = write.module { body["module"] = module }
        // How sure and why (K5), left out when absent so an answer without
        // them is the body it always was; "I don't know" has no confidence.
        if let confidence = write.confidence { body["confidence"] = confidence }
        if let thinking = write.thinking { body["thinking"] = thinking }
        return try? JSONSerialization.data(withJSONObject: body)
    }

    /// `session-close` for a session this file opened — closeInTransaction:
    /// the event, then state flipped to `closed`. A session that never
    /// opened or is closed already writes nothing, so exit paths can call
    /// this without tracking whether an answer ever landed. The mirror is
    /// owed even then — the close is the server's own idempotent write, and
    /// the session the server opened on the first bridged answer may still
    /// be running.
    func closeSession(_ id: String, concepts: [String], at: Date = Date()) {
        write(mirror: MirrorCall(
            path: "/api/learner/session/close",
            dedupeKey: "session-close:\(id)",
            body: ["sessionId": id]
        )) { db in
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
            // folds for "last opened". The catalog promotes `session` out of
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
        // `module` on a week check's event — recordObservation's
        // `module: weekModule?.id`, absent on a concept session's.
        if let module = write.module { payload["module"] = module }
        // recordObservation's `confidence` and `thinking`, absent rather
        // than null when the answer carried none.
        if let confidence = write.confidence { payload["confidence"] = confidence }
        if let thinking = write.thinking { payload["thinking"] = thinking }
        try db.run(
            "INSERT INTO event (at, learner_id, type, payload) VALUES (?, 'local', 'observation', ?)",
            [.real(at), .text(Self.json(payload))]
        )

        // writeModel: the mastery rows the answer touched — the concept's
        // own and each prerequisite propagation created or moved.
        for row in write.masteryRows {
            try upsertMastery(db, row, at: at)
        }

        // writeCard: the concept's card as SM-2 left it — due, ease, lapses
        // and all, the same columns the snapshot's review mirror carries.
        try upsertReview(db, outcome.card, reviewedFallback: write.at, at: at)
    }

    /// One mastery row, as writeModel leaves it. A prerequisite only ever
    /// propagated to was never seen: its last_seen stays NULL, as the web's
    /// row reads.
    private func upsertMastery(_ db: WritableDatabase, _ row: CatalogMastery, at: Double) throws {
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
                row.lastSeen.map { Bind.real($0.timeIntervalSince1970) } ?? .null,
                .real(at), .real(at),
            ])
    }

    /// One review card, as upsertReview leaves it.
    private func upsertReview(_ db: WritableDatabase, _ card: CatalogReview, reviewedFallback: Date, at: Double) throws {
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
                .real((card.lastReviewed ?? reviewedFallback).timeIntervalSince1970), .int(card.leech ? 1 : 0),
                .real(at), .real(at),
            ])
    }

    // MARK: - Review grades

    /// The web's `POST /api/review/grade` as a local write — gradeReview's
    /// transaction in services/catalog/src/state/review.ts: a `review`
    /// event first, then the card rescheduled and the concept's mastery
    /// entry moved, one commit so a half-written grade cannot leave the
    /// model ahead of the log it came from. No session row: a review
    /// grade stands alone, the way `learn review grade` writes one.
    ///
    /// Returns the rating now on record for this requestId — the one the
    /// write asked for, or on a replay the first write's, since a review
    /// event cannot be deleted and a double count would be permanent —
    /// or nil when the write failed, `error` saying why and the caller
    /// keeping the card for the retry. The catalog mirror queues in the
    /// same commit with the route's own body: `grade` there is the
    /// rating, the button pressed, which the server maps onto SM-2.
    @discardableResult
    func recordReviewGrade(_ write: ReviewGradeWrite) -> ReviewRating? {
        var grade = write.grade
        let ok = self.write(mirror: MirrorCall(
            path: "/api/review/grade",
            dedupeKey: "review-grade:\(write.requestId)",
            body: ["conceptId": write.conceptId, "grade": write.rating, "requestId": write.requestId]
        )) { db in
            grade = try applyReviewGrade(db, write)
        }
        return ok ? ratingForGrade(grade) : nil
    }

    /// The inserts recordReviewGrade wraps in its transaction — split out
    /// for the same reason applySessionAnswer is, and answering the grade
    /// on record so a replay reports the first write's, not the retry's.
    private func applyReviewGrade(_ db: WritableDatabase, _ write: ReviewGradeWrite) throws -> Int {
        let at = write.at.timeIntervalSince1970

        // gradeReview's replay check, inside the transaction as the web's
        // is inside the learner lock: a second call naming the same
        // requestId writes nothing and the first grade stands. The local
        // event table has no concept column — it is the mirror's flat
        // shape — so the match is inside the payload each row carries.
        if !write.requestId.isEmpty {
            let rows = try db.query(
                "SELECT payload FROM event WHERE learner_id = 'local' AND type = 'review'")
            while rows.next() {
                guard
                    let text = rows.text(0),
                    let data = text.data(using: .utf8),
                    let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                    payload["requestId"] as? String == write.requestId,
                    payload["concept"] as? String == write.conceptId
                else { continue }
                return (payload["grade"] as? NSNumber)?.intValue ?? write.grade
            }
        }

        // The `review` event — appendEvent's flat record: the concept,
        // the SM-2 grade and the BKT move in payload, the instant in the
        // row's own `at`, so `review rebuild` replays a grade written
        // here exactly as it does one from the web or the CLI.
        try db.run(
            "INSERT INTO event (at, learner_id, type, payload) VALUES (?, 'local', 'review', ?)",
            [
                .real(at),
                .text(Self.json([
                    "concept": write.conceptId,
                    "grade": write.grade,
                    "pLBefore": write.pLBefore,
                    "pLAfter": write.pLAfter,
                    "requestId": write.requestId,
                ])),
            ]
        )

        // upsertReview: the card as SM-2 left it, the same columns the
        // snapshot's review mirror carries.
        try upsertReview(db, write.card, reviewedFallback: write.at, at: at)

        // writeModel's one changed row — the concept's entry as BKT moved
        // it. Every other entry the model holds is already in the file,
        // so the single upsert is all the write owes.
        try upsertMastery(db, write.mastery, at: at)

        return write.grade
    }

    /// JSONSerialization of a small payload, "" on failure — a payload that
    /// will not encode has no business landing as `{}` pretending to be one.
    /// Drop learner.db's copies of answers the catalog has and a snapshot
    /// since mirrored back (matched by `requestId`): the merged log reads the
    /// mirror's, so the local rows only grew the file and every walk of it.
    /// An answer still owed to the catalog is never in the mirror, so it is
    /// never pruned.
    func pruneMirroredEvents(_ requestIds: Set<String>) {
        guard let db, !requestIds.isEmpty else { return }
        let ids = Array(requestIds)
        // In chunks, under SQLite's bound-parameter limit.
        for start in stride(from: 0, to: ids.count, by: 500) {
            let chunk = Array(ids[start ..< min(start + 500, ids.count)])
            let marks = Array(repeating: "?", count: chunk.count).joined(separator: ", ")
            do {
                try db.run(
                    "DELETE FROM event WHERE type IN ('observation', 'review') AND json_extract(payload, '$.requestId') IN (\(marks))",
                    chunk.map { .text($0) }
                )
            } catch {
                self.error = "learner.db: \(error.localizedDescription)"
                return
            }
        }
    }

    // MARK: - The catalog's record of an answer (S9-06)

    /// The two mirrors whose replies carry what the catalog recorded.
    static let observeRoute = "/api/learner/observe"
    static let gradeRoute = "/api/review/grade"

    /// `outcome` as the session should draw it: the catalog's record laid
    /// over the app's estimate once the reply is in.
    func shown(_ outcome: SessionAnswerOutcome) -> SessionAnswerOutcome {
        recordedOutcome(outcome, answerRecords[outcome.requestId])
    }

    /// The rating on record for a review grade's request id, once the
    /// catalog has answered.
    func recordedRating(_ requestId: String) -> ReviewRating? {
        if case .graded(let rating)? = answerRecords[requestId] { return rating }
        return nil
    }

    /// Whose numbers a review grade's outcome is, by its request id.
    func gradeStatus(_ requestId: String) -> AnswerStatus {
        switch answerRecords[requestId] {
        case .graded?, .observed?: return .recorded
        case .notRecorded(let reason)?: return .notRecorded(reason)
        case nil: return .estimated
        }
    }

    /// An observe or grade mirror landed: keep what the catalog said about
    /// the answer, and replace learner.db's estimated rows with the ones the
    /// reply carries (the sidecar reads them back after the write, so they
    /// are the catalog's as it stands — any web answer since the last
    /// snapshot included). The event's numbers follow, so nothing in the
    /// file still carries the estimate.
    ///
    /// `pending` names the concepts a still-queued answer will move: their
    /// rows are left to that answer's reply, since this one's predate it and
    /// would draw the concept back to before an answer the learner can see.
    ///
    /// `queueRow` is the mirror row the reply answered: it is deleted in the
    /// same transaction as the correction, so a correction that does not
    /// land leaves the row to be sent again (the server answers a replay
    /// with the same record). Returns whether the correction landed; the
    /// record and `recordedVersion` move only when it did.
    @discardableResult
    func applyRecorded(
        route: String, body: Data, reply: [String: Any],
        pending: Set<String> = [], queueRow: Int64? = nil
    ) -> Bool {
        guard
            let sent = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
            let requestId = sent["requestId"] as? String, !requestId.isEmpty,
            let result = reply["result"] as? [String: Any]
        else { return dropQueueRow(queueRow) }

        var eventType = "observation"
        var eventFields: [(key: String, value: Bind)] = []
        let record: AnswerRecord
        if route == Self.observeRoute, let recorded = RecordedAnswer(result: result) {
            record = .observed(recorded)
            eventFields = [("pLBefore", .real(recorded.pLBefore)), ("pLAfter", .real(recorded.pLAfter))]
            // The grade the catalog scheduled with, which follows its own
            // posterior; the sidecar adds it to the reply.
            if let grade = (result["grade"] as? NSNumber)?.intValue { eventFields.append(("grade", .int(Int64(grade)))) }
        } else if route == Self.gradeRoute,
                  let raw = (result["rating"] as? NSNumber)?.intValue,
                  let rating = ReviewRating(rawValue: raw) {
            record = .graded(rating)
            eventType = "review"
            let grade = (result["grade"] as? NSNumber)?.intValue ?? rating.grade
            eventFields = [("grade", .int(Int64(grade)))]
            if let pL = (result["pL"] as? NSNumber)?.doubleValue { eventFields.append(("pLAfter", .real(pL))) }
        } else {
            return dropQueueRow(queueRow)
        }

        // Each row keeps the catalog's own `updatedAt` as its stamp, not the
        // moment the reply arrived: CatalogStore merges learner.db over the
        // snapshot by that clock, so a web answer the catalog takes after
        // these rows were read still wins at the next snapshot.
        let rows = result["rows"] as? [String: Any] ?? [:]
        let now = Date()
        let mastery = (rows["mastery"] as? [[String: Any]] ?? []).compactMap { Self.recordedMastery($0, now: now) }
            .filter { !pending.contains($0.row.conceptSlug) }
        let review = (rows["review"] as? [[String: Any]] ?? []).compactMap { Self.recordedReview($0, now: now) }
            .filter { !pending.contains($0.row.conceptSlug) }
        let landed = write { db in
            if let queueRow { try db.run("DELETE FROM mirror_queue WHERE id = ?", [.int(queueRow)]) }
            for (row, stamp) in mastery { try upsertMastery(db, row, at: stamp) }
            for (card, stamp) in review { try upsertReview(db, card, reviewedFallback: now, at: stamp) }
            for (key, value) in eventFields {
                try db.run(
                    "UPDATE event SET payload = json_set(payload, ?, ?) WHERE type = ? AND json_extract(payload, '$.requestId') = ?",
                    [.text("$.\(key)"), value, .text(eventType), .text(requestId)]
                )
            }
        }
        guard landed else { return false }
        answerRecords[requestId] = record
        recordedVersion += 1
        return true
    }

    /// A reply with nothing to correct still ends its queue row.
    private func dropQueueRow(_ id: Int64?) -> Bool {
        guard let id, let db else { return true }
        try? db.run("DELETE FROM mirror_queue WHERE id = ?", [.int(id)])
        return true
    }

    /// The concepts the answers still in the queue (other than `excluding`,
    /// the one being answered) will move: an observe's `conceptSlug` and the
    /// prerequisites its local estimate spread to (the event's
    /// `propagated`), a grade's `conceptId`.
    private func pendingAnswerConcepts(excluding: Int64) -> Set<String> {
        guard let db,
              let rows = try? db.query(
                  "SELECT body FROM mirror_queue WHERE route IN (?, ?) AND id != ?",
                  bind: [Self.observeRoute, Self.gradeRoute, String(excluding)])
        else { return [] }
        var bodies: [[String: Any]] = []
        while rows.next() {
            if let text = rows.text(0),
               let body = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] {
                bodies.append(body)
            }
        }
        return Self.pendingConcepts(queued: bodies) { requestId in
            guard let events = try? db.query(
                "SELECT payload FROM event WHERE type = 'observation' AND json_extract(payload, '$.requestId') = ?",
                bind: [requestId])
            else { return [] }
            var spread: [String] = []
            while events.next() {
                guard let text = events.text(0),
                      let payload = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
                else { continue }
                spread += (payload["propagated"] as? [[String: Any]] ?? []).compactMap { $0["concept"] as? String }
            }
            return spread
        }
    }

    /// `pendingAnswerConcepts` over the queued bodies: each one's concept,
    /// and for an observe the prerequisites `spreadOf` its request id names.
    static func pendingConcepts(queued: [[String: Any]], spreadOf: (String) -> [String]) -> Set<String> {
        var concepts: Set<String> = []
        for body in queued {
            if let slug = (body["conceptSlug"] ?? body["conceptId"]) as? String { concepts.insert(slug) }
            if body["conceptSlug"] != nil, let id = body["requestId"] as? String {
                concepts.formUnion(spreadOf(id))
            }
        }
        return concepts
    }

    /// One `rows.mastery` entry of a reply, as the store's row type.
    private static func recordedMastery(_ raw: [String: Any], now: Date) -> (row: CatalogMastery, stamp: Double)? {
        guard let slug = raw["conceptSlug"] as? String,
              let pL = (raw["pL"] as? NSNumber)?.doubleValue, pL.isFinite
        else { return nil }
        return (CatalogMastery(
            conceptSlug: slug,
            pL: pL,
            observations: (raw["observations"] as? NSNumber)?.int64Value ?? 0,
            correct: (raw["correct"] as? NSNumber)?.int64Value ?? 0,
            lastSeen: (raw["lastSeen"] as? String).flatMap(isoDate)
        ), stamp(raw, now: now))
    }

    /// A reply row's `updatedAt` in seconds, or now for a sidecar that
    /// sends none.
    private static func stamp(_ raw: [String: Any], now: Date) -> Double {
        ((raw["updatedAt"] as? String).flatMap(isoDate) ?? now).timeIntervalSince1970
    }

    /// One `rows.review` entry of a reply, as the store's card type.
    private static func recordedReview(_ raw: [String: Any], now: Date) -> (row: CatalogReview, stamp: Double)? {
        guard let slug = raw["conceptSlug"] as? String,
              let due = (raw["due"] as? String).flatMap(isoDate)
        else { return nil }
        return (CatalogReview(
            conceptSlug: slug,
            repetitions: (raw["repetitions"] as? NSNumber)?.int64Value ?? 0,
            ease: (raw["ease"] as? NSNumber)?.doubleValue ?? SM2.defaultEase,
            intervalDays: (raw["intervalDays"] as? NSNumber)?.int64Value ?? 1,
            lapses: (raw["lapses"] as? NSNumber)?.int64Value ?? 0,
            due: due,
            lastReviewed: (raw["lastReviewed"] as? String).flatMap(isoDate),
            leech: raw["leech"] as? Bool ?? false
        ), stamp(raw, now: now))
    }

    /// The `watch.ranges` column: `[[start, end], ...]` as JSON.
    static func rangesJSON(_ ranges: [[Double]]) -> String {
        (try? JSONSerialization.data(withJSONObject: ranges))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }

    /// The column read back; anything unreadable is no ranges.
    static func parseRanges(_ text: String?) -> [[Double]] {
        guard let data = text?.data(using: .utf8),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[NSNumber]]
        else { return [] }
        return mergeRanges(list.map { $0.map(\.doubleValue) })
    }

    private static func json(_ object: [String: Any]) -> String {
        (try? JSONSerialization.data(withJSONObject: object))
            .flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }

    // MARK: - The catalog mirror (the retry queue)

    /// The Settings-readable counts: rows still owed to the catalog, rows the
    /// queue gave up on, and the latest send's error.
    private(set) var pendingMirrors = 0
    private(set) var droppedMirrors = 0
    private(set) var lastMirrorError: String?

    /// The waiter sleeping to the next row's backoff deadline — a new kick
    /// cancels and replaces it. Passes themselves are serialized by
    /// `mirrorSending`.
    private var mirrorWaiter: Task<Void, Never>?
    private var mirrorSending = false
    /// A write that lands mid-pass marks the queue dirty so the running
    /// pass loops once more — there is never a second concurrent sender.
    private var mirrorDirty = false
    /// When the sidecar itself cannot be reached the flusher rests this
    /// long — without it each 15s playback heartbeat would spawn the
    /// service again.
    private var mirrorCooldownUntil = Date.distantPast

    /// The retry bounds: backoff from 10s doubling to 30 minutes, at most
    /// 12 sends, nothing retried past a week old, and a 4xx refusal
    /// (the body is rejected, not the channel) dropped outright. What
    /// outlives the bounds is dropped, logged and counted — the local row
    /// is the record, the mirror is the copy.
    private static let mirrorBaseDelay: TimeInterval = 10
    private static let mirrorMaxDelay: TimeInterval = 30 * 60
    private static let mirrorMaxAttempts: Int64 = 12
    private static let mirrorMaxAge: TimeInterval = 7 * 24 * 3600
    private static let mirrorCooldown: TimeInterval = 60

    /// The outbox half of a write's commit — called inside the write's own
    /// transaction, so the data row and the call it owes land or roll back
    /// together. `INSERT OR REPLACE` is the dedupe: on a `dedupe` conflict
    /// the older pending row for the same key is replaced, because the file
    /// only ever holds the latest state and sending just that loses
    /// nothing. nil-dedupe rows — appends — each keep their own row.
    private func enqueueMirror(_ db: WritableDatabase, _ call: MirrorCall) throws {
        guard let json = String(data: call.body, encoding: .utf8) else {
            throw CatalogError(message: "mirror body did not encode as UTF-8")
        }
        let now = Date().timeIntervalSince1970
        try db.run("""
            INSERT OR REPLACE INTO mirror_queue (route, dedupe, body, created_at, next_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                .text(call.path),
                call.dedupeKey.map { Bind.text($0) } ?? .null,
                .text(json),
                .real(now),
                .real(now),
            ])
    }

    /// Ask the flusher for a pass now. During a pass this only marks the
    /// queue dirty — the running pass loops — so kicks never stack a second
    /// sender.
    private func kickMirrors() {
        guard sidecar != nil else { return }
        if mirrorSending { mirrorDirty = true; return }
        mirrorWaiter?.cancel()
        mirrorWaiter = Task { [weak self] in
            await self?.runMirrorPasses()
        }
    }

    /// The waiter after a pass: sleep to the earlier of the oldest row's
    /// backoff deadline and the sidecar cooldown's end — or not at all when
    /// the queue is empty and nothing is owed.
    private func scheduleMirrorWake() {
        guard let db,
              let rows = try? db.query("SELECT MIN(next_at) FROM mirror_queue"),
              rows.next(), let nextDue = rows.double(0)
        else { return }
        let now = Date().timeIntervalSince1970
        let delay = max(nextDue - now, mirrorCooldownUntil.timeIntervalSince1970 - now, 0.5)
        mirrorWaiter?.cancel()
        mirrorWaiter = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled, let self else { return }
            await self.runMirrorPasses()
        }
    }

    /// Passes until the queue stops being dirtied, then arms the next wake.
    /// Each pass drains what is due; a write that lands mid-pass just
    /// queues the next one.
    private func runMirrorPasses() async {
        guard !mirrorSending else { mirrorDirty = true; return }
        mirrorSending = true
        defer { mirrorSending = false }
        repeat {
            mirrorDirty = false
            await mirrorPass()
            refreshMirrorCounts()
        } while mirrorDirty
        scheduleMirrorWake()
    }

    /// One send pass over the due rows, oldest first — strict FIFO, so a
    /// retried write never overtakes a newer one on its way to the catalog. A
    /// send that cannot land ends the pass: the row keeps its place and its
    /// backoff says when the queue wakes next. A permanent refusal ends the
    /// row, not the pass — that write is unresolvable, the rest are not.
    private func mirrorPass() async {
        guard let sidecar, let db else { return }
        guard Date() >= mirrorCooldownUntil else { return }
        let now = Date().timeIntervalSince1970
        var due: [MirrorRow] = []
        // Every queued row, not just the due ones: a write still resting in
        // backoff is the head of the line, and a newer row must never pass
        // it — an answer's observe can fail and back off while the close
        // that depends on it sails past and is refused for good.
        if let rows = try? db.query("""
            SELECT id, route, body, attempts, created_at, next_at FROM mirror_queue
            ORDER BY id
            """) {
            while rows.next() {
                guard let id = rows.int64(0),
                      let route = rows.text(1),
                      let body = rows.text(2)
                else { continue }
                due.append(MirrorRow(
                    id: id, route: route, body: body,
                    attempts: rows.int64(3) ?? 0,
                    createdAt: rows.double(4) ?? now,
                    nextAt: rows.double(5) ?? now
                ))
            }
        }
        guard !due.isEmpty else { return }

        let client: SidecarClient
        do {
            client = try await sidecar.readyClient()
        } catch {
            // Nothing was sent, so no row burns an attempt — the pass rests
            // a minute, which also caps spawn attempts while it is down.
            mirrorCooldownUntil = Date().addingTimeInterval(Self.mirrorCooldown)
            lastMirrorError = error.localizedDescription
            return
        }

        for row in due {
            // Not yet this row's wake — stop the pass here. The row is the
            // oldest queued, so everything behind it stays behind it.
            if row.nextAt > now { break }
            do {
                let reply = try await client.replay(route: row.route, body: Data(row.body.utf8))
                if row.route == Self.observeRoute || row.route == Self.gradeRoute {
                    // The row ends with the correction, in one transaction;
                    // a correction that fails to land backs off like a send.
                    guard applyRecorded(route: row.route, body: Data(row.body.utf8), reply: reply,
                                        pending: pendingAnswerConcepts(excluding: row.id), queueRow: row.id)
                    else {
                        throw CatalogError(message: error ?? "the catalog's record could not be written to learner.db")
                    }
                } else {
                    try? db.run("DELETE FROM mirror_queue WHERE id = ?", [.int(row.id)])
                }
            } catch let refusal as SidecarClient.SidecarError where (400 ... 499).contains(refusal.status) {
                dropMirror(row, because: refusal.errorDescription ?? "refused", db: db)
            } catch {
                // A cancelled pass leaves the row untouched — whatever
                // cancelled it owns the next wake.
                if Task.isCancelled { break }
                let attempts = row.attempts + 1
                if attempts >= Self.mirrorMaxAttempts
                    || now - row.createdAt > Self.mirrorMaxAge {
                    dropMirror(row, because: error.localizedDescription, db: db)
                } else {
                    let delay = min(
                        Self.mirrorBaseDelay * pow(2, Double(attempts - 1)),
                        Self.mirrorMaxDelay
                    )
                    try? db.run(
                        "UPDATE mirror_queue SET attempts = ?, next_at = ?, last_error = ? WHERE id = ?",
                        [.int(attempts), .real(now + delay), .text(error.localizedDescription), .int(row.id)]
                    )
                    lastMirrorError = error.localizedDescription
                }
                break
            }
        }
    }

    /// A row the queue gives up on: refused permanently, out of attempts,
    /// or past a week old. The local row — the actual record — is
    /// untouched; only the mirror owed is dropped, and it is logged and
    /// counted so the divergence is visible rather than silent.
    private func dropMirror(_ row: MirrorRow, because reason: String, db: WritableDatabase) {
        try? db.run("DELETE FROM mirror_queue WHERE id = ?", [.int(row.id)])
        // An answer the catalog will never hold: the session's numbers for
        // it stay the app's, and say so.
        if row.route == Self.observeRoute || row.route == Self.gradeRoute,
           let body = (try? JSONSerialization.jsonObject(with: Data(row.body.utf8))) as? [String: Any],
           let requestId = body["requestId"] as? String {
            answerRecords[requestId] = .notRecorded(reason)
        }
        droppedMirrors += 1
        lastMirrorError = reason
        NSLog("gnosia learner mirror: dropped %@ after %@ send attempts: %@",
              row.route, String(row.attempts), reason)
    }

    /// The queue's depth as Settings shows it — read from the file rather
    /// than tracked, so it stays honest across passes and launches.
    private func refreshMirrorCounts() {
        guard let db,
              let rows = try? db.query("SELECT COUNT(*) FROM mirror_queue"),
              rows.next()
        else { return }
        pendingMirrors = Int(rows.int64(0) ?? 0)
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
            -- A writer that finds the file locked waits out a transient
            -- holder instead of failing the write straight away.
            PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS watch (
              asset_id   TEXT PRIMARY KEY,
              seconds    REAL NOT NULL,
              done       INTEGER NOT NULL DEFAULT 0,
              updated_at REAL NOT NULL,
              duration   REAL
            );
            CREATE TABLE IF NOT EXISTS favorite (
              asset_id TEXT PRIMARY KEY,
              starred  INTEGER NOT NULL DEFAULT 1
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
            -- the tables catalog-snapshot.mjs mirrors into app-catalog.db, so a
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
            -- The mirror outbox: each write's catalog call, persisted with
            -- the row it commits beside, until the sidecar answers it.
            -- `dedupe` collapses pending upserts of the same key — nil on
            -- append mirrors, which each owe their own send — and
            -- `next_at`/`attempts` are the backoff's state.
            CREATE TABLE IF NOT EXISTS mirror_queue (
              id         INTEGER PRIMARY KEY,
              route      TEXT NOT NULL,
              dedupe     TEXT UNIQUE,
              body       TEXT NOT NULL,
              created_at REAL NOT NULL,
              attempts   INTEGER NOT NULL DEFAULT 0,
              next_at    REAL NOT NULL DEFAULT 0,
              last_error TEXT
            );
            """)
        // A file written before `duration` joined `watch` takes the column
        // here — the one schema change the app's own file has needed so far.
        let cols = try db.query("PRAGMA table_info(watch)")
        var hasDuration = false
        while cols.next() { if cols.text(1) == "duration" { hasDuration = true } }
        if !hasDuration {
            try db.exec("ALTER TABLE watch ADD COLUMN duration REAL")
        }
        // `ranges` (the stretches that played, as JSON) came with coverage;
        // an older row has none and counts only what plays from now on.
        let wcols = try db.query("PRAGMA table_info(watch)")
        var hasRanges = false
        while wcols.next() { if wcols.text(1) == "ranges" { hasRanges = true } }
        if !hasRanges {
            try db.exec("ALTER TABLE watch ADD COLUMN ranges TEXT NOT NULL DEFAULT '[]'")
        }
        // `favorite.starred` came with the unstar-tombstone change; files
        // from before it carry rows that are all stars (the only kind they
        // could write), so the default keeps them true.
        let fcols = try db.query("PRAGMA table_info(favorite)")
        var hasStarred = false
        while fcols.next() { if fcols.text(1) == "starred" { hasStarred = true } }
        if !hasStarred {
            try db.exec("ALTER TABLE favorite ADD COLUMN starred INTEGER NOT NULL DEFAULT 1")
        }
        self.db = db
    }

    private func load() throws {
        guard let db else { return }

        var favorites: Set<String> = []
        var unfavorites: Set<String> = []
        let favoriteRows = try db.query("SELECT asset_id, starred FROM favorite")
        while favoriteRows.next() {
            guard let id = favoriteRows.text(0) else { continue }
            if (favoriteRows.int64(1) ?? 1) != 0 {
                favorites.insert(id)
            } else {
                unfavorites.insert(id)
            }
        }
        self.favorites = favorites
        self.unfavorites = unfavorites

        var watches: [String: WatchEntry] = [:]
        let watchRows = try db.query("SELECT asset_id, seconds, done, updated_at, duration, ranges FROM watch")
        while watchRows.next() {
            guard let id = watchRows.text(0) else { continue }
            watches[id] = WatchEntry(
                seconds: watchRows.double(1) ?? 0,
                done: (watchRows.int64(2) ?? 0) != 0,
                updatedAt: Date(timeIntervalSince1970: watchRows.double(3) ?? 0),
                duration: watchRows.double(4),
                ranges: Self.parseRanges(watchRows.text(5))
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
    ///
    /// `mirror` is the catalog half of the same commit: the call's queue
    /// row is inserted inside the write's transaction first, so a committed
    /// row always owes the catalog its mirror and a rolled-back one never
    /// does. The queue — not the caller — then owns getting it sent, and a
    /// flush pass starts as soon as this returns. When no sidecar is wired
    /// the mirror is simply not owed: the row commits alone, as it always
    /// has without one.
    ///
    /// Returns whether the write landed.
    @discardableResult
    private func write(mirror call: MirrorCall? = nil, _ body: (WritableDatabase) throws -> Void) -> Bool {
        do {
            if db == nil { try open() }
            guard let db else { throw CatalogError(message: "learner store did not open") }
            if !loaded {
                try load()
                loaded = true
            }
            // Every write is one transaction — the multi-statement bodies
            // (an answer's session/event/mastery/review spread, a tick's
            // read-back) stay atomic, and when a mirror is owed its queue
            // row commits beside them.
            try db.exec("BEGIN IMMEDIATE")
            do {
                if let call, sidecar != nil {
                    try enqueueMirror(db, call)
                }
                try body(db)
                try db.exec("COMMIT")
            } catch {
                try? db.exec("ROLLBACK")
                throw error
            }
            if call != nil, sidecar != nil {
                refreshMirrorCounts()
                kickMirrors()
            }
            error = nil
            return true
        } catch let failure as CatalogError {
            error = failure.message
        } catch {
            self.error = error.localizedDescription
        }
        return false
    }
}
