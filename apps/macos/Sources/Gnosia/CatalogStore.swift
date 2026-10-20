//
//  CatalogStore.swift
//  Gnosia
//
//  The whole read model. One file on purpose: while the catalog moves from
//  Postgres to SQLite underneath, everything the app knows about storage —
//  the sqlite3 C calls, the mirrored column names, the blob-key-to-path rule,
//  the generated_by fallback — lives here, so a different transport later is
//  one file to replace rather than a layer to untangle.
//
//  The file this reads is written by scripts/catalog-snapshot.mjs, which is
//  also where its DDL lives. Column names mirror the drizzle schema
//  (packages/schema/src/content.ts); timestamps are seconds since
//  1970-01-01 UTC as REAL.
//

import Foundation
import CSQLite3

/// SQLITE_TRANSIENT, which the C headers define as a macro and so does not
/// reach Swift: tell SQLite to copy bound text rather than borrow the pointer.
/// Shared with LearnerStore's writer; file scope because it is a fix for a
/// header quirk, not a part of the read model.
let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

// MARK: - SQLite, the thinnest possible shell

/// A sqlite error the caller can say in a sentence.
struct CatalogError: Error, LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// One prepared statement's result set, read forward exactly once.
final class SQLiteRows {
    private let stmt: OpaquePointer
    private let db: OpaquePointer

    init(db: OpaquePointer, sql: String) throws {
        var stmt: OpaquePointer?
        let code = sqlite3_prepare_v2(db, sql, -1, &stmt, nil)
        guard code == SQLITE_OK, let stmt else {
            throw CatalogError(message: "prepare failed (\(code)): \(SQLiteRows.lastError(db))\n  in: \(sql)")
        }
        self.db = db
        self.stmt = stmt
    }

    func bind(_ values: [String]) {
        for (index, value) in values.enumerated() {
            sqlite3_bind_text(stmt, Int32(index + 1), value, -1, SQLITE_TRANSIENT)
        }
    }

    /// The next row, or nil at SQLITE_DONE.
    func next() -> Bool {
        switch sqlite3_step(stmt) {
        case SQLITE_ROW: return true
        case SQLITE_DONE: return false
        case let code:
            assertionFailure("sqlite3_step failed (\(code)): \(SQLiteRows.lastError(db))")
            return false
        }
    }

    var columnCount: Int { Int(sqlite3_column_count(stmt)) }

    func columnName(_ i: Int) -> String {
        guard let raw = sqlite3_column_name(stmt, Int32(i)) else { return "" }
        return String(cString: raw)
    }

    func text(_ i: Int) -> String? {
        guard let raw = sqlite3_column_text(stmt, Int32(i)) else { return nil }
        return String(cString: raw)
    }

    func int64(_ i: Int) -> Int64? {
        sqlite3_column_type(stmt, Int32(i)) == SQLITE_NULL ? nil : sqlite3_column_int64(stmt, Int32(i))
    }

    func double(_ i: Int) -> Double? {
        sqlite3_column_type(stmt, Int32(i)) == SQLITE_NULL ? nil : sqlite3_column_double(stmt, Int32(i))
    }

    /// The row as a name-to-string dictionary. Everything the app reads is a
    /// string, an integer or a real, and both numeric kinds arrive textually
    /// fine for the fields that take this path (PRAGMA results).
    func rowStrings() -> [String: String] {
        var row: [String: String] = [:]
        for i in 0..<columnCount { row[columnName(i)] = text(i) }
        return row
    }

    private static func lastError(_ db: OpaquePointer) -> String {
        String(cString: sqlite3_errmsg(db))
    }

    deinit { sqlite3_finalize(stmt) }
}

/// A read-only connection to the snapshot file.
final class SQLiteDatabase {
    private let db: OpaquePointer

    init(path: String) throws {
        var db: OpaquePointer?
        let code = sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil)
        guard code == SQLITE_OK, let db else {
            throw CatalogError(message: "cannot open catalog at \(path) (\(code))")
        }
        self.db = db
    }

    func query(_ sql: String, bind values: [String] = []) throws -> SQLiteRows {
        let rows = try SQLiteRows(db: db, sql: sql)
        rows.bind(values)
        return rows
    }

    /// Every table name in the file, via sqlite_master. Reads for tables a
    /// version-1 snapshot does not carry check this first, so a new surface
    /// degrades to empty rather than failing the whole load.
    func tables() throws -> Set<String> {
        let rows = try query("SELECT name FROM sqlite_master WHERE type = 'table'")
        var names = Set<String>()
        while rows.next() {
            if let name = rows.text(0) { names.insert(name) }
        }
        return names
    }

    /// The column names of `table`, via PRAGMA table_info. Used to tell a
    /// snapshot that carries `generated_by` from one that predates it.
    func columns(of table: String) throws -> Set<String> {
        let rows = try query("PRAGMA table_info(\(table))")
        var names = Set<String>()
        while rows.next() {
            if let name = rows.text(1) { names.insert(name) }
        }
        return names
    }

    deinit { sqlite3_close(db) }
}

// MARK: - The read model

/// The video tools an asset id's first segment can name, kept in step with
/// SOURCE_REPOS in packages/schema/src/content.ts and generatedBy() in the
/// snapshot script.
private let videoTools: Set<String> = ["manimkc", "remotionkc", "revideokc", "blenderkc"]

/// Prefixes a derived asset's id wraps around its source's id; the pdf and the
/// poster are the catalog's own and answer with the video's tool instead.
private let wrapperPrefixes = ["pdf:", "poster:"]

/// Which tool an asset id says made it. The fallback for snapshot files that
/// predate the `generated_by` column; identical rules to the script's.
func generatedBy(_ id: String) -> String {
    var rest = id
    while let wrapper = wrapperPrefixes.first(where: { rest.hasPrefix($0) }) {
        rest = String(rest.dropFirst(wrapper.count))
    }
    let prefix = rest.split(separator: ":", maxSplits: 1).first.map(String.init) ?? rest
    if videoTools.contains(prefix) { return prefix }
    if prefix == "video" { return "video" }
    return "other"
}

/// A mirrored jsonb array read back as its string elements. Anything that
/// is not a JSON array is an empty list rather than an error — a hand-edited
/// or older row is read, not trusted (parsePlayback's rule on the web side).
private func jsonList(_ raw: String?) -> [String] {
    guard
        let raw,
        let data = raw.data(using: .utf8),
        let list = try? JSONSerialization.jsonObject(with: data) as? [Any]
    else { return [] }
    return list.compactMap { $0 as? String }
}

/// One asset row, as the library list and the detail panes need it.
struct CatalogAsset: Identifiable, Hashable {
    let id: String
    let kind: String
    let title: String?
    let blobKey: String?
    let bytes: Int64?
    let sourceRepo: String
    let generatedBy: String
    let inputsHash: String?
    let createdAt: Date?
    var topics: [String] = []
    var concepts: [String] = []

    var displayTitle: String { title ?? id }
}

/// The subject vocabulary's one row.
struct CatalogTopic: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let title: String
    let domain: String
}

/// One authored note under a topic, as the concept page and the graph need
/// it. `body` is the markdown after the note's frontmatter; `tags` and
/// `sources` arrive as JSON text (the mirror ships jsonb as text) and are
/// read back as lists.
struct CatalogConcept: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let title: String
    let summary: String?
    let topicSlug: String
    let domain: String?
    let body: String?
    let tags: [String]
    let sources: [String]
    let authoredAt: Date?
    let topicPosition: Int
}

/// One edge of the concept graph: `conceptSlug` depends on
/// `prerequisiteSlug`. `kind` is `requires` (hard) or `assumes` (soft), and
/// `position` the edge's place in the note's frontmatter list.
struct CatalogPrerequisite: Hashable {
    let conceptSlug: String
    let prerequisiteSlug: String
    let kind: String
    let position: Int
}

/// The learner's BKT state for one concept, as replaying the event log
/// computes it.
struct CatalogMastery: Hashable {
    let conceptSlug: String
    let pL: Double
    let observations: Int64
    let correct: Int64
    let lastSeen: Date?
}

/// One SM-2 card: `due` is when the concept is next owed, the rest is the
/// schedule that got it there.
struct CatalogReview: Hashable {
    let conceptSlug: String
    let repetitions: Int64
    let ease: Double
    let intervalDays: Int64
    let lapses: Int64
    let due: Date
    let lastReviewed: Date?
    let leech: Bool
}

/// A ticked checklist row: `completedAt` is the tick, `note` the learner's
/// marginalia; either can exist without the other.
struct CatalogProgress: Hashable {
    let curriculumItemId: String
    let completedAt: Date?
    let note: String?
}

/// The durable "remind me what I learnt" record for one curriculum item.
struct CatalogRecap: Hashable {
    let curriculumItemId: String
    let summary: String
    let keyPoints: [String]
    let misconceptions: [String]
    let openQuestions: [String]
    let source: String
    let sessions: Int64
}

/// The derived pieces a video carries, resolved at load: the poster jpg, the
/// pdf document, and the sidecars, all from asset_derivation.
struct VideoCompanions: Hashable {
    var posterKey: String?
    var pdfID: String?
    var pdfKey: String?
    var transcriptKey: String?
    var chaptersKey: String?
    var captionsKey: String?

    var hasTranscript: Bool { transcriptKey != nil }
    var hasChapters: Bool { chaptersKey != nil }
    var hasCaptions: Bool { captionsKey != nil }
}

/// One entry of a `<name>.chapters.json` sidecar: a section of the video with
/// its start, as the catalog's sidecar writer lays it out.
struct VideoChapter: Hashable {
    let scene: String?
    let title: String
    let start: Double
    let end: Double?
}

/// One segment of a `<name>.transcript.json` sidecar: a spoken line with the
/// span it is said over.
struct TranscriptSegment: Hashable {
    let scene: String?
    let start: Double
    let end: Double?
    let text: String
}

/// Where the two paths the app needs come from, in order.
///
/// The catalog: GNOSIA_CATALOG, then the Settings pane's field (UserDefaults
/// `catalogPath`), then <data home>/catalog.db.
///
/// The blobs: GNOSIA_BLOBS, then <data home>/blobs — the same layout
/// @gnosia/blob resolves (defaultBlobRoot in packages/blob/src/fs.ts), so a
/// blob_key `local/<sha256>.<ext>` joins the root straight into a path.
///
/// The data home: GNOSIA_HOME, then SELF_LEARN_HOME for checkouts and envs
/// from before the rename, then ~/.gnosia.
struct CatalogLocation {
    let catalogPath: String
    let blobRoot: URL

    static func resolve(
        env: [String: String] = ProcessInfo.processInfo.environment,
        defaults: UserDefaults = .standard
    ) -> CatalogLocation {
        let home = dataHome(env: env)
        let catalog = firstNonEmpty(env["GNOSIA_CATALOG"])
            ?? firstNonEmpty(defaults.string(forKey: "catalogPath"))
            ?? home.appendingPathComponent("catalog.db").path
        let blobs = firstNonEmpty(env["GNOSIA_BLOBS"])
            ?? home.appendingPathComponent("blobs").path
        return CatalogLocation(
            catalogPath: expandHome(catalog),
            blobRoot: URL(fileURLWithPath: expandHome(blobs))
        )
    }

    /// The data home both stores live under: catalog.db here, learner.db in
    /// LearnerStore. Not private so the sidecar resolves the same rule rather
    /// than a second copy of it.
    static func dataHome(env: [String: String]) -> URL {
        if let raw = env["GNOSIA_HOME"], !raw.trimmingCharacters(in: .whitespaces).isEmpty {
            return URL(fileURLWithPath: expandHome(raw.trimmingCharacters(in: .whitespaces)))
        }
        if let raw = env["SELF_LEARN_HOME"], !raw.trimmingCharacters(in: .whitespaces).isEmpty {
            return URL(fileURLWithPath: expandHome(raw.trimmingCharacters(in: .whitespaces)))
        }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".gnosia")
    }

    private static func firstNonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespaces), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    /// `~` and `~/...` expand like the shell's; anything else is left alone.
    private static func expandHome(_ path: String) -> String {
        if path == "~" { return NSHomeDirectory() }
        if path.hasPrefix("~/") { return NSHomeDirectory() + String(path.dropFirst(1)) }
        return path
    }
}

/// The catalog read: everything the app draws, loaded once per open.
@MainActor @Observable
final class CatalogStore {
    private(set) var assets: [CatalogAsset] = []
    private(set) var topics: [String: CatalogTopic] = [:]
    private(set) var concepts: [CatalogConcept] = []
    private(set) var companions: [String: VideoCompanions] = [:]
    private(set) var meta: [String: String] = [:]
    private(set) var error: String?
    private(set) var loaded = false

    // The learner tables (wave-1 surfaces). Every per-learner read scopes to
    // 'local' — LOCAL_LEARNER_ID in packages/schema — because the file is
    // this learner's mirror: another owner's rows must not leak into "due",
    // "watched" or "starred". On a version-1 snapshot all of these stay
    // empty; the file is asked which tables it has before any are read.
    private(set) var prerequisites: [CatalogPrerequisite] = []
    /// BKT state by concept slug: p(L), counts, last seen.
    private(set) var mastery: [String: CatalogMastery] = [:]
    /// Every review card, ordered by due — `reviewDue` takes its prefix.
    private(set) var reviews: [CatalogReview] = []
    /// Ticks and notes by curriculum item id.
    private(set) var progress: [String: CatalogProgress] = [:]
    private(set) var recaps: [String: CatalogRecap] = [:]
    /// The key/value corner as raw JSON text: playback rows
    /// (`playback:<asset id>`), stars (`favorite:<asset id>`) and the rest.
    /// Left unparsed on purpose — each surface decodes the keys it knows.
    private(set) var preferences: [String: String] = [:]
    /// Asset id → the last `watched` event's instant, from the event log.
    private(set) var watchedAt: [String: Date] = [:]
    /// Asset id → the learner's own title, from the catalog's asset_name.
    private(set) var assetNames: [String: String] = [:]

    private var byID: [String: CatalogAsset] = [:]
    private var conceptsBySlug: [String: CatalogConcept] = [:]

    /// Settings writes here; a reload picks it up.
    var location = CatalogLocation.resolve()

    /// The assets the library lists: the videos, in title order.
    var videos: [CatalogAsset] { assets.filter { $0.kind == "video" } }

    var assetCount: Int { assets.count }

    /// The cards whose due has passed, in due order.
    var reviewDue: [CatalogReview] { reviews.filter { $0.due <= Date() } }

    func asset(_ id: String) -> CatalogAsset? {
        byID[id]
    }

    func concept(_ slug: String) -> CatalogConcept? {
        conceptsBySlug[slug]
    }

    /// The note's markdown; the commonest thing a concept page asks for.
    func conceptBody(_ slug: String) -> String? {
        conceptsBySlug[slug]?.body
    }

    /// The requires/assumes edges out of one concept, in authored order.
    func prerequisites(of slug: String) -> [CatalogPrerequisite] {
        prerequisites.filter { $0.conceptSlug == slug }
    }

    func companions(for videoID: String) -> VideoCompanions {
        companions[videoID] ?? VideoCompanions()
    }

    /// A blob_key (`local/<sha256>.<ext>`) as a file URL under the blob root.
    func blobURL(for key: String) -> URL {
        location.blobRoot.appendingPathComponent(key)
    }

    func videoURL(for asset: CatalogAsset) -> URL? {
        asset.blobKey.map { blobURL(for: $0) }
    }

    /// The location reread and the snapshot reloaded; Settings' Reload button.
    func reload() {
        location = CatalogLocation.resolve()
        loaded = false
        loadIfNeeded()
    }

    func loadIfNeeded() {
        guard !loaded else { return }
        loaded = true
        do {
            try load()
            error = nil
        } catch let failure as CatalogError {
            error = failure.message
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func load() throws {
        guard FileManager.default.fileExists(atPath: location.catalogPath) else {
            throw CatalogError(
                message: """
                No catalog at \(location.catalogPath).
                Make one: node scripts/catalog-snapshot.mjs from the app's directory \
                (or set GNOSIA_CATALOG / the Settings field to wherever it is).
                """
            )
        }
        let db = try SQLiteDatabase(path: location.catalogPath)
        let hasGeneratedBy = try db.columns(of: "asset").contains("generated_by")
        let generatedByColumn = hasGeneratedBy ? "generated_by" : "NULL"

        var topicsBySlug: [String: CatalogTopic] = [:]
        let topicRows = try db.query("SELECT slug, title, domain FROM topic WHERE archived_at IS NULL")
        while topicRows.next() {
            if let slug = topicRows.text(0), let title = topicRows.text(1) {
                topicsBySlug[slug] = CatalogTopic(slug: slug, title: title, domain: topicRows.text(2) ?? "")
            }
        }

        var ordered: [CatalogAsset] = []
        let assetRows = try db.query("""
            SELECT id, kind, title, blob_key, bytes, source_repo, inputs_hash, created_at, \(generatedByColumn)
            FROM asset
            ORDER BY COALESCE(title, id)
            """)
        while assetRows.next() {
            guard let id = assetRows.text(0), let kind = assetRows.text(1) else { continue }
            let asset = CatalogAsset(
                id: id,
                kind: kind,
                title: assetRows.text(2),
                blobKey: assetRows.text(3),
                bytes: assetRows.int64(4),
                sourceRepo: assetRows.text(5) ?? "gnosia",
                generatedBy: assetRows.text(8) ?? generatedBy(id),
                inputsHash: assetRows.text(6),
                createdAt: assetRows.double(7).map { Date(timeIntervalSince1970: $0) }
            )
            ordered.append(asset)
        }

        let topicLinks = try db.query("SELECT asset_id, topic_slug FROM asset_topic")
        var assetTopics: [String: [String]] = [:]
        while topicLinks.next() {
            if let assetID = topicLinks.text(0), let slug = topicLinks.text(1) {
                assetTopics[assetID, default: []].append(slug)
            }
        }

        let conceptLinks = try db.query("SELECT asset_id, concept_slug FROM asset_concept")
        var assetConcepts: [String: [String]] = [:]
        while conceptLinks.next() {
            if let assetID = conceptLinks.text(0), let slug = conceptLinks.text(1) {
                assetConcepts[assetID, default: []].append(slug)
            }
        }

        ordered = ordered.map { asset in
            var asset = asset
            asset.topics = assetTopics[asset.id] ?? []
            asset.concepts = assetConcepts[asset.id] ?? []
            return asset
        }
        byID = Dictionary(uniqueKeysWithValues: ordered.map { ($0.id, $0) })

        // Companions: what each video was derived into. `asset_id` is the
        // derived asset, `source_asset_id` the video it was made from.
        var companionsByVideo: [String: VideoCompanions] = [:]
        let derivationRows = try db.query("""
            SELECT d.source_asset_id, a.kind, a.id, a.blob_key
            FROM asset_derivation d
            JOIN asset a ON a.id = d.asset_id
            WHERE a.kind IN ('poster', 'pdf', 'transcript', 'chapters', 'captions')
            """)
        while derivationRows.next() {
            guard let videoID = derivationRows.text(0), let kind = derivationRows.text(1) else { continue }
            var box = companionsByVideo[videoID] ?? VideoCompanions()
            switch kind {
            case "poster": box.posterKey = derivationRows.text(3)
            case "pdf":
                box.pdfID = derivationRows.text(2)
                box.pdfKey = derivationRows.text(3)
            case "transcript": box.transcriptKey = derivationRows.text(3)
            case "chapters": box.chaptersKey = derivationRows.text(3)
            case "captions": box.captionsKey = derivationRows.text(3)
            default: break
            }
            companionsByVideo[videoID] = box
        }

        // MARK: Wave-1 surfaces
        // Each read checks the file has the table first, so a version-1
        // snapshot (or one from a script that predates a table) loads with
        // the surface empty rather than failing the whole catalog.
        let tables = try db.tables()

        var conceptList: [CatalogConcept] = []
        var conceptsBySlug: [String: CatalogConcept] = [:]
        let conceptColumns = try db.columns(of: "concept")
        if !conceptColumns.isEmpty {
            // Version-2 columns, absent on a version-1 snapshot: NULLs stand
            // in so the row read is one shape either way.
            let extended = conceptColumns.contains("tags")
            let tagsColumn = extended ? "tags" : "NULL"
            let sourcesColumn = extended ? "sources" : "NULL"
            let authoredColumn = extended ? "authored_at" : "NULL"
            let conceptRows = try db.query("""
                SELECT slug, title, summary, topic_slug, domain, body,
                       \(tagsColumn), \(sourcesColumn), \(authoredColumn), topic_position
                FROM concept
                WHERE archived_at IS NULL
                ORDER BY topic_slug, topic_position
                """)
            while conceptRows.next() {
                guard let slug = conceptRows.text(0), let title = conceptRows.text(1) else { continue }
                let concept = CatalogConcept(
                    slug: slug,
                    title: title,
                    summary: conceptRows.text(2),
                    topicSlug: conceptRows.text(3) ?? "",
                    domain: conceptRows.text(4),
                    body: conceptRows.text(5),
                    tags: jsonList(conceptRows.text(6)),
                    sources: jsonList(conceptRows.text(7)),
                    authoredAt: conceptRows.double(8).map { Date(timeIntervalSince1970: $0) },
                    topicPosition: Int(conceptRows.int64(9) ?? 0)
                )
                conceptList.append(concept)
                conceptsBySlug[slug] = concept
            }
        }

        var prerequisites: [CatalogPrerequisite] = []
        if tables.contains("concept_prerequisite") {
            let rows = try db.query("""
                SELECT concept_slug, prerequisite_slug, kind, position
                FROM concept_prerequisite
                ORDER BY concept_slug, position
                """)
            while rows.next() {
                guard let slug = rows.text(0), let prereq = rows.text(1) else { continue }
                prerequisites.append(CatalogPrerequisite(
                    conceptSlug: slug,
                    prerequisiteSlug: prereq,
                    kind: rows.text(2) ?? "requires",
                    position: Int(rows.int64(3) ?? 0)
                ))
            }
        }

        var mastery: [String: CatalogMastery] = [:]
        if tables.contains("mastery") {
            let rows = try db.query("""
                SELECT concept_slug, p_l, observations, correct, last_seen
                FROM mastery WHERE learner_id = 'local'
                """)
            while rows.next() {
                guard let slug = rows.text(0) else { continue }
                mastery[slug] = CatalogMastery(
                    conceptSlug: slug,
                    pL: rows.double(1) ?? 0,
                    observations: rows.int64(2) ?? 0,
                    correct: rows.int64(3) ?? 0,
                    lastSeen: rows.double(4).map { Date(timeIntervalSince1970: $0) }
                )
            }
        }

        var reviews: [CatalogReview] = []
        if tables.contains("review") {
            let rows = try db.query("""
                SELECT concept_slug, repetitions, ease, interval_days, lapses,
                       due, last_reviewed, leech
                FROM review WHERE learner_id = 'local'
                ORDER BY due
                """)
            while rows.next() {
                guard let slug = rows.text(0), let due = rows.double(5) else { continue }
                reviews.append(CatalogReview(
                    conceptSlug: slug,
                    repetitions: rows.int64(1) ?? 0,
                    ease: rows.double(2) ?? 0,
                    intervalDays: rows.int64(3) ?? 1,
                    lapses: rows.int64(4) ?? 0,
                    due: Date(timeIntervalSince1970: due),
                    lastReviewed: rows.double(6).map { Date(timeIntervalSince1970: $0) },
                    leech: (rows.int64(7) ?? 0) != 0
                ))
            }
        }

        var progress: [String: CatalogProgress] = [:]
        if tables.contains("progress") {
            let rows = try db.query("""
                SELECT curriculum_item_id, completed_at, note
                FROM progress WHERE learner_id = 'local'
                """)
            while rows.next() {
                guard let item = rows.text(0) else { continue }
                progress[item] = CatalogProgress(
                    curriculumItemId: item,
                    completedAt: rows.double(1).map { Date(timeIntervalSince1970: $0) },
                    note: rows.text(2)
                )
            }
        }

        var recaps: [String: CatalogRecap] = [:]
        if tables.contains("recap") {
            let rows = try db.query("""
                SELECT curriculum_item_id, summary, key_points, misconceptions,
                       open_questions, source, sessions
                FROM recap WHERE learner_id = 'local'
                """)
            while rows.next() {
                guard let item = rows.text(0) else { continue }
                recaps[item] = CatalogRecap(
                    curriculumItemId: item,
                    summary: rows.text(1) ?? "",
                    keyPoints: jsonList(rows.text(2)),
                    misconceptions: jsonList(rows.text(3)),
                    openQuestions: jsonList(rows.text(4)),
                    source: rows.text(5) ?? "agent",
                    sessions: rows.int64(6) ?? 0
                )
            }
        }

        var preferences: [String: String] = [:]
        if tables.contains("preference") {
            let rows = try db.query("SELECT key, value FROM preference WHERE learner_id = 'local'")
            while rows.next() {
                if let key = rows.text(0), let value = rows.text(1) { preferences[key] = value }
            }
        }

        // The last `watched` event per asset — the verdict the web app reads
        // from the same log in readLastWatched (payload's `asset` is the
        // join; the row's `at` is the instant). Playback position itself is
        // not here: the web app keeps it in `playback:<asset>` preferences.
        var watchedAt: [String: Date] = [:]
        if tables.contains("event") {
            let rows = try db.query("""
                SELECT json_extract(payload, '$.asset'), MAX(at)
                FROM event
                WHERE type = 'watched' AND learner_id = 'local'
                GROUP BY 1
                """)
            while rows.next() {
                if let assetID = rows.text(0), let at = rows.double(1) {
                    watchedAt[assetID] = Date(timeIntervalSince1970: at)
                }
            }
        }

        var assetNames: [String: String] = [:]
        if tables.contains("asset_name") {
            let rows = try db.query("SELECT asset_id, title FROM asset_name WHERE learner_id = 'local'")
            while rows.next() {
                if let id = rows.text(0), let title = rows.text(1) { assetNames[id] = title }
            }
        }

        var meta: [String: String] = [:]
        if let metaRows = try? db.query("SELECT key, value FROM snapshot_meta") {
            while metaRows.next() {
                if let key = metaRows.text(0), let value = metaRows.text(1) { meta[key] = value }
            }
        }

        topics = topicsBySlug
        assets = ordered
        concepts = conceptList
        self.conceptsBySlug = conceptsBySlug
        companions = companionsByVideo
        self.prerequisites = prerequisites
        self.mastery = mastery
        self.reviews = reviews
        self.progress = progress
        self.recaps = recaps
        self.preferences = preferences
        self.watchedAt = watchedAt
        self.assetNames = assetNames
        self.meta = meta
    }

    // MARK: - Sidecars

    /// The chapters a video's `.chapters.json` blob holds: `[{scene, title,
    /// start, end}]`, the same file the web player lays on its scrub bar. An
    /// unreadable blob is an empty list, not an error — the video still plays.
    func chapters(for videoID: String) -> [VideoChapter] {
        guard let key = companions[videoID]?.chaptersKey else { return [] }
        guard
            let data = try? Data(contentsOf: blobURL(for: key)),
            let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return raw.compactMap { entry in
            guard let title = entry["title"] as? String, let start = entry["start"] as? Double else { return nil }
            return VideoChapter(
                scene: entry["scene"] as? String,
                title: title,
                start: start,
                end: entry["end"] as? Double
            )
        }
    }

    /// The spoken lines a video's `.transcript.json` blob holds under
    /// `segments`: `[{scene, start, end, text}]`, the list the web detail page
    /// shows beside its player.
    func transcript(for videoID: String) -> [TranscriptSegment] {
        guard let key = companions[videoID]?.transcriptKey else { return [] }
        guard
            let data = try? Data(contentsOf: blobURL(for: key)),
            let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let segments = raw["segments"] as? [[String: Any]]
        else { return [] }
        return segments.compactMap { entry in
            guard let text = entry["text"] as? String, let start = entry["start"] as? Double else { return nil }
            return TranscriptSegment(
                scene: entry["scene"] as? String,
                start: start,
                end: entry["end"] as? Double,
                text: text
            )
        }
    }
}
