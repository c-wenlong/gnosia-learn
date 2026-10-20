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
private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

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

/// The derived pieces a video carries, resolved at load: the poster jpg, the
/// pdf document, and which sidecars exist, all from asset_derivation.
struct VideoCompanions: Hashable {
    var posterKey: String?
    var pdfID: String?
    var pdfKey: String?
    var hasTranscript = false
    var hasChapters = false
    var hasCaptions = false
}

/// Where the two paths the app needs come from, in order.
///
/// The catalog: GNOSIA_CATALOG, then the Settings pane's field (UserDefaults
/// `catalogPath`), then $SELF_LEARN_HOME/catalog.db, then
/// ~/.self-learn/catalog.db.
///
/// The blobs: GNOSIA_BLOBS, then $SELF_LEARN_HOME/blobs, then
/// ~/.self-learn/blobs — the same default @self-learn/blob resolves
/// (defaultBlobRoot in packages/blob/src/fs.ts), so a blob_key
/// `local/<sha256>.<ext>` joins the root straight into a path.
struct CatalogLocation {
    let catalogPath: String
    let blobRoot: URL

    static func resolve(
        env: [String: String] = ProcessInfo.processInfo.environment,
        defaults: UserDefaults = .standard
    ) -> CatalogLocation {
        let home = selfLearnHome(env: env)
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

    private static func selfLearnHome(env: [String: String]) -> URL {
        let home = FileManager.default.homeDirectoryForCurrentUser
        guard let raw = env["SELF_LEARN_HOME"], !raw.trimmingCharacters(in: .whitespaces).isEmpty else {
            return home.appendingPathComponent(".self-learn")
        }
        return URL(fileURLWithPath: expandHome(raw.trimmingCharacters(in: .whitespaces)))
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
    private(set) var companions: [String: VideoCompanions] = [:]
    private(set) var meta: [String: String] = [:]
    private(set) var error: String?
    private(set) var loaded = false
    private var byID: [String: CatalogAsset] = [:]

    /// Settings writes here; a reload picks it up.
    var location = CatalogLocation.resolve()

    /// The assets the library lists: the videos, in title order.
    var videos: [CatalogAsset] { assets.filter { $0.kind == "video" } }

    var assetCount: Int { assets.count }

    func asset(_ id: String) -> CatalogAsset? {
        byID[id]
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
                sourceRepo: assetRows.text(5) ?? "self-learn",
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
            case "transcript": box.hasTranscript = true
            case "chapters": box.hasChapters = true
            case "captions": box.hasCaptions = true
            default: break
            }
            companionsByVideo[videoID] = box
        }

        var meta: [String: String] = [:]
        if let metaRows = try? db.query("SELECT key, value FROM snapshot_meta") {
            while metaRows.next() {
                if let key = metaRows.text(0), let value = metaRows.text(1) { meta[key] = value }
            }
        }

        topics = topicsBySlug
        assets = ordered
        companions = companionsByVideo
        self.meta = meta
    }
}
