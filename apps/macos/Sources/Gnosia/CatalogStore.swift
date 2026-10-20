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
//  It also reads <data home>/learner.db — the owner's own marks (stars,
//  watch positions, renames), a file beside the snapshot rather than in it
//  because it is the one store this app will write itself. Read-only here;
//  writes land with a later wave.
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

    /// Whether the snapshot carries `table`, so a section added after the
    /// file was written reads as empty rather than failing the whole open.
    func hasTable(_ name: String) throws -> Bool {
        let rows = try query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", bind: [name])
        return rows.next()
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
    /// The logical path the indexer filed it under (`learn/concepts/…/x.md`),
    /// when the kind carries one.
    let path: String?
    /// A link's destination; nil for everything else.
    let url: String?
    let blobKey: String?
    let bytes: Int64?
    let sourceRepo: String
    let generatedBy: String
    let inputsHash: String?
    let createdAt: Date?
    var topics: [String] = []
    var concepts: [String] = []

    /// What the library calls the row: its title, else its filename, else
    /// the link's host, else an honest "untitled" — the web's
    /// assetDisplayTitle rule, so both surfaces name a row the same thing.
    /// The learner's own rename, when learner.db has one, is applied on top
    /// by `CatalogStore.displayTitle(for:)`.
    var displayTitle: String {
        if let title, !title.isEmpty { return title }
        if let name = path?.split(separator: "/").last, !name.isEmpty { return String(name) }
        if let url, let host = URLComponents(string: url)?.host, !host.isEmpty { return host }
        return "Untitled \(assetKindLabel(kind).lowercased())"
    }
}

/// The subject vocabulary's one row.
struct CatalogTopic: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let title: String
    let domain: String
    /// Where it sits in the Learn map's order; 0 when the snapshot predates
    /// the column or the row carries none.
    let position: Int
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
    /// The note's logical path (`learn/concepts/<domain>/<slug>.md`) — the
    /// same string a note asset's `path` carries, which is how the
    /// workspace leaves the concept's own note out of its linked assets.
    let path: String?
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

/// One row of the mirrored event log. The snapshot ships only these fields —
/// Postgres' promoted `concept_slug` and `session_id` columns are not
/// mirrored — so `payload` is where `course`/`module`, `asset`, `goal` and
/// `concepts` live, and an `observation` row cannot name its concept.
struct CatalogEvent {
    let id: Int64
    let at: Date
    let type: String
    let payload: [String: Any]
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
    /// The owner's marks file; may not exist yet, which reads as empty.
    let learnerPath: String

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
        let learner = firstNonEmpty(env["GNOSIA_LEARNER"])
            ?? home.appendingPathComponent("learner.db").path
        return CatalogLocation(
            catalogPath: expandHome(catalog),
            blobRoot: URL(fileURLWithPath: expandHome(blobs)),
            learnerPath: expandHome(learner)
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
    /// The mirrored event log, in log order. The snapshot ships only
    /// id/at/type/payload — Postgres' promoted `concept_slug` and
    /// `session_id` columns stay behind (catalog-snapshot.mjs), so a surface
    /// reads the payload for `course`/`module`/`asset`/`goal`/`concepts`
    /// and accepts that an observation cannot name its concept.
    private(set) var events: [CatalogEvent] = []
    /// Concept slug → its `concept_curriculum_item` links as
    /// (item id, authored position), item id ascending — the web's
    /// `KbConcept.topics`/`positions` pair, keyed the same way.
    private(set) var conceptItems: [String: [(itemId: String, position: Int)]] = [:]
    /// The learning read model — concepts as KbConcepts, the frontier, the
    /// path's standing — built from the rows above at the end of load().
    /// Empty before the first load and after a failed one.
    private(set) var learn = LearnGraph()

    // Learner marks, from <data home>/learner.db. Empty when the file is
    // absent or unreadable — a library without marks, not an error.
    private(set) var favorites: Set<String> = []
    private(set) var watch: [String: WatchMark] = [:]
    private(set) var names: [String: String] = [:]

    /// slug → markdown, for the note detail pane. A note asset's body is
    /// its one linked concept's `body` — the same row the web's file route
    /// serves for the kind (`resolveRowText`).
    private var conceptBodies: [String: String] = [:]
    /// note asset id → that concept's slug.
    private var noteConcepts: [String: String] = [:]

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

        let hasPosition = try db.columns(of: "topic").contains("position")
        var topicsBySlug: [String: CatalogTopic] = [:]
        let topicRows = try db.query("""
            SELECT slug, title, domain, \(hasPosition ? "position" : "0")
            FROM topic WHERE archived_at IS NULL
            """)
        while topicRows.next() {
            if let slug = topicRows.text(0), let title = topicRows.text(1) {
                topicsBySlug[slug] = CatalogTopic(
                    slug: slug,
                    title: title,
                    domain: topicRows.text(2) ?? "",
                    position: Int(topicRows.int64(3) ?? 0)
                )
            }
        }

        var ordered: [CatalogAsset] = []
        let assetRows = try db.query("""
            SELECT id, kind, title, blob_key, bytes, source_repo, inputs_hash, created_at,
                   \(generatedByColumn), path, url
            FROM asset
            ORDER BY COALESCE(title, id)
            """)
        while assetRows.next() {
            guard let id = assetRows.text(0), let kind = assetRows.text(1) else { continue }
            let asset = CatalogAsset(
                id: id,
                kind: kind,
                title: assetRows.text(2),
                path: assetRows.text(9),
                url: assetRows.text(10),
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
            let pathColumn = conceptColumns.contains("path") ? "path" : "NULL"
            let conceptRows = try db.query("""
                SELECT slug, title, summary, topic_slug, domain, body,
                       \(tagsColumn), \(sourcesColumn), \(authoredColumn), topic_position,
                       \(pathColumn)
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
                    path: conceptRows.text(10),
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

        // The whole event log, newest surfaces need more than the `watched`
        // fold above: `visit` rows carry course/module, `session-start` a
        // `goal` concept slug, `session-close` a `concepts` list, and an
        // `observation` its question text — which is as close as the mirror
        // gets to naming the concept an observation belongs to.
        var events: [CatalogEvent] = []
        if tables.contains("event") {
            let rows = try db.query("""
                SELECT id, at, type, payload FROM event
                WHERE learner_id = 'local' ORDER BY at, id
                """)
            while rows.next() {
                guard let at = rows.double(1) else { continue }
                events.append(CatalogEvent(
                    id: rows.int64(0) ?? 0,
                    at: Date(timeIntervalSince1970: at),
                    type: rows.text(2) ?? "",
                    payload: Self.jsonObject(rows.text(3))
                ))
            }
        }

        // Concept → curriculum-item links, item id ascending — the direction
        // loadCourses' link read does not keep, and the web's
        // KbConcept.topics/positions pair that placement reads.
        var conceptItems: [String: [(itemId: String, position: Int)]] = [:]
        if tables.contains("concept_curriculum_item") {
            let rows = try db.query("""
                SELECT concept_slug, curriculum_item_id, position
                FROM concept_curriculum_item
                ORDER BY concept_slug, curriculum_item_id
                """)
            while rows.next() {
                guard let slug = rows.text(0), let item = rows.text(1) else { continue }
                conceptItems[slug, default: []].append((itemId: item, position: Int(rows.int64(2) ?? 0)))
            }
        }

        var assetNames: [String: String] = [:]
        if tables.contains("asset_name") {
            let rows = try db.query("SELECT asset_id, title FROM asset_name WHERE learner_id = 'local'")
            while rows.next() {
                if let id = rows.text(0), let title = rows.text(1) { assetNames[id] = title }
            }
        }

        // Note bodies: a note asset is linked to exactly one concept — its
        // own — and the concept row's `body` is the markdown the web's file
        // route serves for the kind. Snapshots that predate the concept
        // table read as no bodies, the same as a note whose link is missing.
        var bodies: [String: String] = [:]
        if let bodyRows = try? db.query("SELECT slug, body FROM concept WHERE body IS NOT NULL") {
            while bodyRows.next() {
                if let slug = bodyRows.text(0), let body = bodyRows.text(1) { bodies[slug] = body }
            }
        }
        var noteConcepts: [String: String] = [:]
        for asset in ordered where asset.kind == "note" {
            if let slug = assetConcepts[asset.id]?.first { noteConcepts[asset.id] = slug }
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
        self.events = events
        self.conceptItems = conceptItems
        self.assetNames = assetNames
        conceptBodies = bodies
        self.noteConcepts = noteConcepts
        self.meta = meta

        loadLearner()

        // The course tree. A snapshot from before user_version 3 has no
        // `collection` table; the surface then reads empty rather than taking
        // the library down with it.
        if try db.hasTable("collection") {
            try loadCourses(db, ordered: ordered)
        }

        // The learning graph goes last: it folds the course tree, the
        // concept rows and the learner state into the knowledge base the
        // learn surfaces all read.
        learn = LearnGraph(
            concepts: conceptList,
            prerequisites: prerequisites,
            mastery: mastery,
            reviews: reviews,
            conceptItems: conceptItems,
            courses: courses,
            progress: progress,
            preferences: preferences,
            knownTopics: Set(topicsBySlug.keys)
        )
    }

    // MARK: - Sidecars

    /// The chapters a video's `.chapters.json` blob holds: `[{scene, title,
    /// start, end}]`, the same file the web player lays on its scrub bar. An
    /// unreadable blob is an empty list, not an error — the video still plays.
    func chapters(for videoID: String) -> [VideoChapter] {
        guard let key = companions[videoID]?.chaptersKey else { return [] }
        return chapters(blobKey: key)
    }

    /// The spoken lines a video's `.transcript.json` blob holds under
    /// `segments`: `[{scene, start, end, text}]`, the list the web detail page
    /// shows beside its player.
    func transcript(for videoID: String) -> [TranscriptSegment] {
        guard let key = companions[videoID]?.transcriptKey else { return [] }
        return transcript(blobKey: key)
    }

    // MARK: - Courses

    /// Every live course in authored order (`collection.position`, then id —
    /// the order readCourses in services/catalog returns them).
    private(set) var courses: [CatalogCourse] = []
    /// The theme vocabulary, `tag` rows by id, for labels in the list filter
    /// and the related-courses card.
    private(set) var courseTags: [String: CourseTag] = [:]
    /// Tag ids in the file's own order, so the filter menu lists them the way
    /// content/tags.yaml does.
    private(set) var courseTagOrder: [String] = []
    private var coursesBySlug: [String: CatalogCourse] = [:]
    /// Concept slug to its note's title, for the steps a lesson draws.
    private var conceptTitles: [String: String] = [:]
    /// Vocabulary slug to its summary: a module's description on the web page
    /// is its topic's summary.
    private var topicSummaries: [String: String] = [:]
    /// Module id to whether another live module names the same topic — the
    /// rule that keeps a shared topic's videos off a listing module's path.
    private var topicSharedByModule: [String: Bool] = [:]
    private var assetsByTopicSlug: [String: [CatalogAsset]] = [:]
    private var assetsByConceptSlug: [String: [CatalogAsset]] = [:]

    /// The kinds that accompany another asset rather than open on their own:
    /// `companionKinds` at file scope below (COMPANION_KINDS in
    /// apps/web/src/lib/library.ts). They count out of a module's asset tally,
    /// as the library's default view leaves them out.

    func course(_ slug: String) -> CatalogCourse? {
        coursesBySlug[slug]
    }

    /// The courses sharing at least one theme tag with `course`
    /// (getRelatedCourses in apps/web/src/data/courses).
    func relatedCourses(to course: CatalogCourse) -> [CatalogCourse] {
        guard !course.tags.isEmpty else { return [] }
        let wanted = Set(course.tags)
        return courses.filter { $0.id != course.id && $0.tags.contains(where: wanted.contains) }
    }

    /// The course's cover image: `cover_blob_key` under the blob root, as the
    /// web's /api/courses/<slug>/cover route serves the same object.
    func coverURL(for course: CatalogCourse) -> URL? {
        course.coverKey.map { blobURL(for: $0) }
    }

    func conceptTitle(_ slug: String) -> String? {
        conceptTitles[slug]
    }

    /// The module's description on the web page: its topic's `summary`.
    func topicSummary(_ slug: String) -> String? {
        topicSummaries[slug]
    }

    /// Whether another live module, of any course, names the same vocabulary
    /// topic (topicShared in apps/web/src/lib/course-assets.ts).
    func topicShared(byModule moduleID: String) -> Bool {
        topicSharedByModule[moduleID] ?? false
    }

    /// Every asset filed under the topic (`asset_topic`), title order.
    func assetsTagged(_ topicSlug: String) -> [CatalogAsset] {
        assetsByTopicSlug[topicSlug] ?? []
    }

    /// The count the module's meta line prints: the topic's assets minus the
    /// companion kinds (ModuleAssets.count in course-assets.ts).
    func moduleAssetCount(topicSlug: String) -> Int {
        assetsTagged(topicSlug).filter { !isCompanionKind($0.kind) }.count
    }

    /// The assets an `asset_concept` row links to the concept — what a step
    /// on the module path can place.
    func assetsLinked(concept slug: String) -> [CatalogAsset] {
        assetsByConceptSlug[slug] ?? []
    }

    /// A video the course lists by id, when the id resolves to a readable
    /// video; any other listed id resolves to nil, as the web path leaves it
    /// off (resolve() in apps/web/src/lib/module-path.ts).
    func listedVideo(_ id: String) -> CatalogAsset? {
        let found = asset(id)
        return found?.kind == "video" ? found : nil
    }

    /// The course tree out of the mirrored tables, the same seven reads
    /// readCourses (services/catalog/src/content/readers/courses.ts) makes:
    /// courses with their tags, modules with their topic, items with their
    /// concepts and listed videos, and the curated links with their lessons.
    /// Everything archived stays in the file but is filtered here, as the
    /// web reader filters it.
    private func loadCourses(_ db: SQLiteDatabase, ordered: [CatalogAsset]) throws {
        var tagsById: [String: CourseTag] = [:]
        var tagOrder: [String] = []
        let tagRows = try db.query("SELECT id, label, description FROM tag ORDER BY position, id")
        while tagRows.next() {
            guard let id = tagRows.text(0), let label = tagRows.text(1) else { continue }
            tagsById[id] = CourseTag(id: id, label: label, description: tagRows.text(2))
            tagOrder.append(id)
        }

        var tagIdsByCourse: [String: [String]] = [:]
        let courseTagRows = try db.query("""
            SELECT t.collection_id, t.tag_id FROM collection_tag t
            JOIN collection c ON c.id = t.collection_id
            WHERE c.kind = 'course' AND c.archived_at IS NULL
            ORDER BY t.collection_id, t.position, t.tag_id
            """)
        while courseTagRows.next() {
            if let courseID = courseTagRows.text(0), let tagID = courseTagRows.text(1) {
                tagIdsByCourse[courseID, default: []].append(tagID)
            }
        }

        // A module's topic is its first topic_slug collection_item row; its
        // `videos:` list is metadata.videos; both verbatim from the reader.
        struct ModuleRow {
            let id, parentID, slug, title: String
            let position: Int
            let topic: String
            let videos: [String]
        }
        var modulesByCourse: [String: [ModuleRow]] = [:]
        var naming: [String: Int] = [:]
        let moduleRows = try db.query("""
            SELECT c.id, c.parent_id, c.slug, c.title, c.position, c.metadata,
                   (SELECT m.topic_slug FROM collection_item m
                    WHERE m.collection_id = c.id AND m.topic_slug IS NOT NULL
                    ORDER BY m.position LIMIT 1) AS topic
            FROM collection c
            WHERE c.kind = 'module' AND c.archived_at IS NULL
            ORDER BY c.parent_id, c.position, c.id
            """)
        while moduleRows.next() {
            guard let id = moduleRows.text(0), let parentID = moduleRows.text(1),
                  let slug = moduleRows.text(2), let title = moduleRows.text(3) else { continue }
            let topic = moduleRows.text(6) ?? ""
            let videos = Self.jsonStrings(Self.jsonObject(moduleRows.text(5))["videos"])
            modulesByCourse[parentID, default: []].append(
                ModuleRow(id: id, parentID: parentID, slug: slug, title: title,
                          position: Int(moduleRows.int64(4) ?? 0), topic: topic, videos: videos)
            )
            if !topic.isEmpty { naming[topic, default: 0] += 1 }
        }

        var itemsByModule: [String: [CourseItem]] = [:]
        let itemRows = try db.query("""
            SELECT id, collection_id, title, subtopics, videos FROM curriculum_item
            WHERE archived_at IS NULL
            ORDER BY collection_id, position, id
            """)
        while itemRows.next() {
            guard let id = itemRows.text(0), let moduleID = itemRows.text(1),
                  let title = itemRows.text(2) else { continue }
            itemsByModule[moduleID, default: []].append(
                CourseItem(
                    id: id, title: title,
                    subtopics: Self.jsonStrings(itemRows.text(3)),
                    concepts: [], videos: Self.jsonStrings(itemRows.text(4))
                )
            )
        }

        // An item's concept list, in the link's authored order: a row the
        // indexer placed (position > 0) keeps its place; an unplaced one
        // (position 0, from before positions existed) follows them, ranked by
        // slug — the same shape conceptsForTopic gives it.
        var conceptsByItem: [String: [String]] = [:]
        let linkRows = try db.query("""
            SELECT curriculum_item_id, concept_slug FROM concept_curriculum_item
            ORDER BY curriculum_item_id,
                     CASE WHEN position > 0 THEN 0 ELSE 1 END, position, concept_slug
            """)
        while linkRows.next() {
            if let itemID = linkRows.text(0), let slug = linkRows.text(1) {
                conceptsByItem[itemID, default: []].append(slug)
            }
        }
        for (moduleID, items) in itemsByModule {
            itemsByModule[moduleID] = items.map { item in
                var item = item
                item.concepts = conceptsByItem[item.id] ?? []
                return item
            }
        }

        // A module's resources are the `link:` assets it holds through
        // collection_item; a resource's lessons are its curriculum_item_asset
        // rows that name a live item of the same module.
        var lessonsByResource: [String: [(itemID: String, moduleID: String)]] = [:]
        let lessonRows = try db.query("""
            SELECT l.asset_id, l.curriculum_item_id, i.collection_id
            FROM curriculum_item_asset l
            JOIN curriculum_item i ON i.id = l.curriculum_item_id
            WHERE i.archived_at IS NULL
            ORDER BY l.asset_id, l.position, l.curriculum_item_id
            """)
        while lessonRows.next() {
            guard let assetID = lessonRows.text(0), let itemID = lessonRows.text(1),
                  let moduleID = lessonRows.text(2) else { continue }
            lessonsByResource[assetID, default: []].append((itemID: itemID, moduleID: moduleID))
        }

        var resourcesByModule: [String: [CourseResource]] = [:]
        let resourceRows = try db.query("""
            SELECT m.collection_id, a.id, a.title, a.url, a.resource_type
            FROM collection_item m
            JOIN asset a ON a.id = m.asset_id
            WHERE a.kind = 'link' AND a.id LIKE 'link:%'
            ORDER BY m.collection_id, m.position, a.id
            """)
        while resourceRows.next() {
            guard let moduleID = resourceRows.text(0), let assetID = resourceRows.text(1) else { continue }
            let lessons = (lessonsByResource[assetID] ?? [])
                .filter { $0.moduleID == moduleID }
                .map { $0.itemID }
            resourcesByModule[moduleID, default: []].append(
                CourseResource(
                    id: assetID,
                    title: resourceRows.text(2) ?? "",
                    url: resourceRows.text(3) ?? "",
                    type: resourceRows.text(4) ?? "other",
                    lessons: lessons
                )
            )
        }

        var summaries: [String: String] = [:]
        let summaryRows = try db.query("SELECT slug, summary FROM topic")
        while summaryRows.next() {
            if let slug = summaryRows.text(0) { summaries[slug] = summaryRows.text(1) ?? "" }
        }

        var titles: [String: String] = [:]
        let conceptRows = try db.query("SELECT slug, title FROM concept WHERE archived_at IS NULL")
        while conceptRows.next() {
            if let slug = conceptRows.text(0), let title = conceptRows.text(1) {
                titles[slug] = title
            }
        }

        var byTopic: [String: [CatalogAsset]] = [:]
        var byConcept: [String: [CatalogAsset]] = [:]
        for asset in ordered {
            for slug in asset.topics { byTopic[slug, default: []].append(asset) }
            for slug in asset.concepts { byConcept[slug, default: []].append(asset) }
        }

        let courseRows = try db.query("""
            SELECT id, slug, title, position, metadata, cover_blob_key
            FROM collection
            WHERE kind = 'course' AND archived_at IS NULL
            ORDER BY position, id
            """)
        var loaded: [CatalogCourse] = []
        while courseRows.next() {
            guard let id = courseRows.text(0), let slug = courseRows.text(1),
                  let title = courseRows.text(2) else { continue }
            let meta = Self.jsonObject(courseRows.text(4))
            let modules = (modulesByCourse[id] ?? []).map { row in
                CourseModule(
                    id: row.id, slug: row.slug, title: row.title, order: row.position,
                    topic: row.topic, videos: row.videos,
                    items: itemsByModule[row.id] ?? [],
                    resources: resourcesByModule[row.id] ?? []
                )
            }
            loaded.append(
                CatalogCourse(
                    id: id, slug: slug,
                    code: Self.jsonText(meta["code"]) ?? "",
                    title: title,
                    credits: Self.jsonInt(meta["credits"]) ?? 0,
                    order: Int(courseRows.int64(3) ?? 0),
                    inferred: meta["inferred"] as? Bool ?? false,
                    prereq: Self.jsonText(meta["prereq"]),
                    track: Self.jsonText(meta["track"]),
                    notes: Self.jsonText(meta["notes"]),
                    capstone: Self.jsonText(meta["capstone"]) ?? "",
                    coverKey: courseRows.text(5),
                    tags: tagIdsByCourse[id] ?? [],
                    modules: modules
                )
            )
        }

        var shared: [String: Bool] = [:]
        for rows in modulesByCourse.values {
            for row in rows where !row.topic.isEmpty {
                shared[row.id] = (naming[row.topic] ?? 0) > 1
            }
        }

        courses = loaded
        coursesBySlug = Dictionary(uniqueKeysWithValues: loaded.map { ($0.slug, $0) })
        courseTags = tagsById
        courseTagOrder = tagOrder
        topicSummaries = summaries
        conceptTitles = titles
        topicSharedByModule = shared
        assetsByTopicSlug = byTopic
        assetsByConceptSlug = byConcept
    }

    /// A mirrored jsonb column parsed to an object; anything unreadable is `{}`.
    private static func jsonObject(_ text: String?) -> [String: Any] {
        guard let data = text?.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        return object
    }

    /// A mirrored jsonb array of strings; anything else is `[]`.
    private static func jsonStrings(_ value: Any?) -> [String] {
        (value as? [Any])?.compactMap { $0 as? String } ?? []
    }

    private static func jsonStrings(_ text: String?) -> [String] {
        guard let data = text?.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data)
        else { return [] }
        return jsonStrings(array)
    }

    /// What the file reader keeps of an optional text key: absent, or trimmed
    /// and non-empty (optional() in readers/courses.ts).
    private static func jsonText(_ value: Any?) -> String? {
        guard let text = (value as? String)?.trimmingCharacters(in: .whitespaces),
              !text.isEmpty else { return nil }
        return text
    }

    private static func jsonInt(_ value: Any?) -> Int? {
        if let n = value as? Int { return n }
        if let n = value as? Double { return Int(n) }
        if let n = value as? NSNumber { return n.intValue }
        return nil
    }
}

// MARK: - Course read models

/// One cross-course theme, a `tag` row; a course file's `tags:` names these.
struct CourseTag: Identifiable, Hashable {
    let id: String
    let label: String
    let description: String?
}

/// One checklist row inside a module: a `curriculum_item` row, which the web
/// app's content types call a Topic. Its concepts carry the link's authored
/// order.
struct CourseItem: Identifiable, Hashable {
    let id: String
    let title: String
    var subtopics: [String]
    var concepts: [String]
    /// Asset ids the lesson's `videos:` lists; they resolve when drawn, not here.
    var videos: [String]
}

/// A curated reading a module lists: the `link:` asset it holds through
/// `collection_item`, with the lessons it goes with from
/// `curriculum_item_asset`.
struct CourseResource: Identifiable, Hashable {
    /// The asset id (`link:cs4263-m2-r1`), kept whole so the store can look it up.
    let id: String
    let title: String
    let url: String
    /// The asset's `resource_type`: paper, docs, video, book, practice or other.
    let type: String
    /// Live item ids of the same module, in the order written.
    var lessons: [String]
}

/// A module: a live `collection` of kind `module` under a course, with its
/// checklist resolved.
struct CourseModule: Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    /// The `position` column: the module's place in the course's `order:`.
    let order: Int
    /// The vocabulary slug its topic `collection_item` names; "" when none.
    let topic: String
    /// Asset ids the module's `videos:` lists (metadata.videos).
    var videos: [String]
    var items: [CourseItem]
    var resources: [CourseResource]
}

/// A course: a live `collection` of kind `course` with the metadata the cards
/// and the rail show.
struct CatalogCourse: Identifiable, Hashable {
    let id: String
    let slug: String
    /// `metadata.code`: the printed course code ("CS4263").
    let code: String
    let title: String
    let credits: Int
    /// The `position` column: its place in the authored shortlist.
    let order: Int
    /// `metadata.inferred`: the syllabus was inferred from the announcement.
    let inferred: Bool
    let prereq: String?
    let track: String?
    /// `metadata.notes`: the course file's summary, the rail's "About" text.
    let notes: String?
    let capstone: String
    /// `cover_blob_key`: the cover photo in the blob store.
    let coverKey: String?
    /// Tag ids in `collection_tag.position` order.
    let tags: [String]
    var modules: [CourseModule]

    var itemCount: Int { modules.reduce(0) { $0 + $1.items.count } }
    /// "7 modules · 20 topics" — courseCounts in apps/web/src/lib/course-summary.ts.
    var countsLine: String {
        let m = modules.count, t = itemCount
        return "\(m) \(m == 1 ? "module" : "modules") · \(t) \(t == 1 ? "topic" : "topics")"
    }
}

// MARK: - Kind vocabulary
//
// The labels and the standalone/companion split, kept in step with the
// web's apps/web/src/components/asset-meta.ts and apps/web/src/lib/library.ts,
// so a row means the same thing on both surfaces.

/// Kinds that accompany another asset rather than stand on their own: the
/// sidecars beside each video, the poster and pdf made with it, and the
/// canvas a diagram was drawn in. All leaves them out; the Others tab is
/// where they live.
private let companionKinds: Set<String> = [
    "transcript", "captions", "chapters", "diagram_source", "poster", "pdf",
]

func isCompanionKind(_ kind: String) -> Bool { companionKinds.contains(kind) }

/// The standalone kind order — effort and standalone value, not alphabetical.
/// An unknown kind sorts after all of them, by name, so a new indexer's rows
/// are last rather than accidentally first.
private let standaloneKindOrder = ["video", "diagram_svg", "note", "session", "link"]

func kindRank(_ kind: String) -> Int {
    standaloneKindOrder.firstIndex(of: kind) ?? standaloneKindOrder.count
}

/// The web's labels for the kinds the catalog holds today; an unknown kind
/// reads as its own name, first word capitalized.
func assetKindLabel(_ kind: String) -> String {
    switch kind {
    case "video": return "Video"
    case "diagram_svg": return "Diagram"
    case "diagram_source": return "Diagram source"
    case "transcript": return "Transcript"
    case "captions": return "Captions"
    case "chapters": return "Chapters"
    case "note": return "Note"
    case "session": return "Session log"
    case "link": return "Link"
    case "poster": return "Poster"
    case "pdf": return "PDF"
    default:
        let words = kind
            .replacingOccurrences(of: #"[_-]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        guard let first = words.first else { return "Asset" }
        return first.uppercased() + words.dropFirst()
    }
}

/// The list-row and detail-chip symbol for a kind.
func assetKindSymbol(_ kind: String) -> String {
    switch kind {
    case "video": return "play.rectangle"
    case "diagram_svg": return "square.on.square"
    case "diagram_source": return "curlybraces"
    case "transcript": return "text.bubble"
    case "captions": return "captions.bubble"
    case "chapters": return "list.bullet"
    case "note": return "note.text"
    case "session": return "bubble.left.and.bubble.right"
    case "link": return "link"
    case "poster": return "photo"
    case "pdf": return "doc.richtext"
    default: return "doc"
    }
}

/// "42 files", "1 file" — the web's filesNoun, for the count under the strip.
func filesNoun(_ count: Int) -> String { count == 1 ? "file" : "files" }

// MARK: - Learner marks
//
// <data home>/learner.db is the owner's own file: stars (`favorite`), watch
// positions (`watch`) and renames (`asset_name`), written beside the
// catalog rather than into the snapshot because it is the one store this
// app will mutate itself. This side only reads, and reads tolerantly — a
// missing file, a missing table or a half-written row is empty state, and
// opening read-only means this app never creates the file by accident.

/// One `watch` row: how far the owner got, and whether it counts as done.
struct WatchMark: Hashable {
    let seconds: Double
    let done: Bool
}

extension CatalogStore {
    /// Re-read learner.db without reloading the catalog. The file is small
    /// and can change while the app is open — a writer lands in a sibling
    /// wave — so the library calls this on appear and on reactivation.
    func refreshLearner() {
        loadLearner()
    }

    /// Whether the owner starred this asset.
    func isFavorite(_ id: String) -> Bool { favorites.contains(id) }

    /// The watch mark for this asset, or nil when never opened.
    func watchMark(_ id: String) -> WatchMark? { watch[id] }

    /// The learner's rename when learner.db carries one, else the asset's
    /// own title — what rows and detail panes should all print.
    func displayTitle(for asset: CatalogAsset) -> String {
        names[asset.id] ?? asset.displayTitle
    }

    fileprivate func loadLearner() {
        let path = location.learnerPath
        guard
            FileManager.default.fileExists(atPath: path),
            let db = try? SQLiteDatabase(path: path)
        else {
            favorites = []
            watch = [:]
            names = [:]
            return
        }

        var starred = Set<String>()
        if let rows = try? db.query("SELECT asset_id FROM favorite") {
            while rows.next() {
                if let id = rows.text(0) { starred.insert(id) }
            }
        }

        var marks: [String: WatchMark] = [:]
        if let rows = try? db.query("SELECT asset_id, seconds, done FROM watch") {
            while rows.next() {
                guard let id = rows.text(0), let seconds = rows.double(1) else { continue }
                marks[id] = WatchMark(seconds: seconds, done: (rows.int64(2) ?? 0) != 0)
            }
        }

        var renames: [String: String] = [:]
        if let rows = try? db.query("SELECT asset_id, name FROM asset_name") {
            while rows.next() {
                if let id = rows.text(0), let name = rows.text(1), !name.isEmpty {
                    renames[id] = name
                }
            }
        }

        favorites = starred
        watch = marks
        names = renames
    }
}

// MARK: - Any-asset blob reads
//
// `chapters(for:)` and `transcript(for:)` start from a video and find its
// sidecars through asset_derivation. These start from the sidecar row
// itself, so a transcript or caption file opened as its own asset reads its
// blob through the same decoders. Everything is best-effort: an unreadable
// or missing blob is an empty result, which the pane renders as a missing
// file rather than a crash.

/// One cue of a WEBVTT captions blob: the span and what is said over it.
struct CaptionCue: Hashable {
    let start: Double
    let end: Double?
    let text: String
}

extension CatalogStore {
    /// A `.chapters.json` blob, decoded. Same shape as `chapters(for:)`.
    func chapters(blobKey key: String) -> [VideoChapter] {
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

    /// A `.transcript.json` blob's `segments`, decoded. Same shape as
    /// `transcript(for:)`; the document's `chapters` stay with the video.
    func transcript(blobKey key: String) -> [TranscriptSegment] {
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

    /// A `.vtt` captions blob as cue lines: blocks split on blank lines, the
    /// `hh:mm:ss.mmm --> hh:mm:ss.mmm` line inside each, the text under it.
    func captions(blobKey key: String) -> [CaptionCue] {
        guard let text = blobText(for: key) else { return [] }
        return Self.parseVTT(text)
    }

    /// A note's markdown: the `body` of the one concept the note is linked
    /// to — the same row the web's file route serves for the kind
    /// (`resolveRowText` under "concepts"). Nil when the link or the body is
    /// missing, or the snapshot predates the concept table.
    func noteBody(for asset: CatalogAsset) -> String? {
        guard let slug = noteConcepts[asset.id] else { return nil }
        return conceptBodies[slug]
    }

    /// A blob read as UTF-8, capped — for kinds with no better preview and
    /// for the SVG the detail pane inlines into a page.
    func blobText(for key: String, limit: Int = 4_000_000) -> String? {
        guard let data = try? Data(contentsOf: blobURL(for: key)) else { return nil }
        return String(data: data.prefix(limit), encoding: .utf8)
    }

    /// Whether the blob this key names is actually on disk — a row can name
    /// a blob nobody has stored yet, which the pane renders as missing.
    func blobExists(_ key: String) -> Bool {
        FileManager.default.fileExists(atPath: blobURL(for: key).path)
    }

    /// Blocks separated by blank lines; an index line and a `NOTE` are
    /// passed over, the timing line opens a cue, the rest is its text.
    private static func parseVTT(_ text: String) -> [CaptionCue] {
        var cues: [CaptionCue] = []
        var start: Double?
        var end: Double?
        var lines: [String] = []
        func flush() {
            if let start, !lines.isEmpty {
                cues.append(CaptionCue(start: start, end: end, text: lines.joined(separator: " ")))
            }
            start = nil
            end = nil
            lines = []
        }
        for raw in text.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty {
                flush()
            } else if line == "WEBVTT" || line.hasPrefix("NOTE") || line == "STYLE" || line == "REGION" {
                continue
            } else if let span = cueSpan(line) {
                start = span.start
                end = span.end
            } else if start != nil {
                lines.append(line)
            }
        }
        flush()
        return cues
    }

    /// `mm:ss.mmm --> mm:ss.mmm` (hours optional), with cue settings after
    /// the end time ignored.
    private static func cueSpan(_ line: String) -> (start: Double, end: Double)? {
        guard let arrow = line.range(of: "-->") else { return nil }
        let lhs = line[..<arrow.lowerBound].trimmingCharacters(in: .whitespaces)
        let rhs = line[arrow.upperBound...]
            .split(whereSeparator: { $0 == " " || $0 == "\t" })
            .first.map(String.init) ?? ""
        guard let start = vttTimestamp(lhs), let end = vttTimestamp(rhs) else { return nil }
        return (start, end)
    }

    private static func vttTimestamp(_ raw: String) -> Double? {
        let parts = raw.split(separator: ":")
        guard parts.count >= 2 else { return nil }
        var total = 0.0
        for part in parts {
            guard let value = Double(part) else { return nil }
            total = total * 60 + value
        }
        return total
    }
}
