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

    private static func dataHome(env: [String: String]) -> URL {
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
    private(set) var companions: [String: VideoCompanions] = [:]
    private(set) var meta: [String: String] = [:]
    private(set) var error: String?
    private(set) var loaded = false
    private var byID: [String: CatalogAsset] = [:]

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

    /// Settings writes here; a reload picks it up.
    var location = CatalogLocation.resolve()

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

        var meta: [String: String] = [:]
        if let metaRows = try? db.query("SELECT key, value FROM snapshot_meta") {
            while metaRows.next() {
                if let key = metaRows.text(0), let value = metaRows.text(1) { meta[key] = value }
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

        topics = topicsBySlug
        assets = ordered
        companions = companionsByVideo
        conceptBodies = bodies
        self.noteConcepts = noteConcepts
        self.meta = meta

        loadLearner()
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
