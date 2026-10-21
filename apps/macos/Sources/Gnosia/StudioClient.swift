//
//  StudioClient.swift
//  Gnosia
//
//  The client half of the studio runner boundary (`services/studio`).
//
//  The runner is a loopback HTTP service on a fixed port, 7250 unless the
//  owner moved it with STUDIO_PORT, the same rule the web app's
//  `studioOrigin()` applies, and every route under it is `/api/*` JSON in
//  both directions. Nothing here spawns the process and nothing here reads
//  a file: layering rule 1 of docs/TLDRAWKC-INTEGRATION.md is that the UI
//  is a view over this API, and this type is that view's transport.
//
//  The runner's owner check (`ownerRefusal` in api.ts) serves a request
//  that carries no owner header as the runner's own owner, the same reach
//  curl has, so this client sends none.
//

import Foundation

/// One refusal envelope `{ error, detail }` as every route answers a non-2xx.
struct StudioError: Error, LocalizedError {
    let status: Int
    let message: String
    let detail: String?

    var errorDescription: String? {
        if let detail, !detail.isEmpty, detail != "null" { return "\(message), \(detail)" }
        return message
    }
}

/// JSON of unknown shape, for the fields a screen echoes rather than reads
/// (a job's `gate`, a slot's `busy`). Decodes anything; `describe` prints it.
enum JSONValue: Decodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    /// Elements kept as `[Any]` because arrays here are short and only ever printed.
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null; return }
        if let value = try? container.decode(Bool.self) { self = .bool(value); return }
        if let value = try? container.decode(Double.self) { self = .number(value); return }
        if let value = try? container.decode(String.self) { self = .string(value); return }
        if let value = try? container.decode([JSONValue].self) { self = .array(value); return }
        self = .object(try container.decode([String: JSONValue].self))
    }

    var text: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    /// A one-line print for the meta tables, never quoted out of context.
    var describe: String {
        switch self {
        case .string(let value): return value
        case .number(let value): return value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
        case .bool(let value): return value ? "true" : "false"
        case .null: return "null"
        case .array(let items): return "[\(items.map(\.describe).joined(separator: ", "))]"
        case .object(let object):
            return object.sorted(by: { $0.key < $1.key }).map { "\($0.key): \($0.value.describe)" }.joined(separator: ", ")
        }
    }
}

/// ISO 8601 with or without fractional seconds, the two shapes `toISOString()`
/// and friends leave in the runner's records.
enum StudioTime {
    /// ISO8601DateFormatter is not Sendable; these two are configured once
    /// and then only read, so sharing them is safe in practice.
    nonisolated(unsafe) private static let withMillis: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    nonisolated(unsafe) private static let plain = ISO8601DateFormatter()

    static func date(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        return withMillis.date(from: iso) ?? plain.date(from: iso)
    }

    /// "3m ago", short, for rows. Nil dates read the placeholder glyph.
    static func ago(_ iso: String?) -> String {
        guard let date = date(iso) else { return "—" }
        let interval = Date.now.timeIntervalSince(date)
        if interval < 0 { return "just now" }
        if interval < 90 { return "\(Int(interval))s ago" }
        if interval < 90 * 60 { return "\(Int(interval / 60))m ago" }
        if interval < 48 * 3600 { return "\(Int(interval / 3600))h ago" }
        return "\(Int(interval / 86_400))d ago"
    }

    /// "21 Oct, 14:03", for the detail tables.
    static func stamp(_ iso: String?) -> String {
        guard let date = date(iso) else { return "—" }
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM, HH:mm:ss"
        return formatter.string(from: date)
    }
}

struct StudioClient {
    let baseURL: URL
    private let session: URLSession

    /// `studioOrigin()`'s rule, duplicated: STUDIO_PORT wins, else 7250.
    static func defaultBaseURL(env: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        let raw = Int((env["STUDIO_PORT"] ?? "").trimmingCharacters(in: .whitespaces)) ?? 7250
        let port = (1024 ... 65_535).contains(raw) ? raw : 7250
        return URL(string: "http://127.0.0.1:\(port)")!
    }

    init(baseURL: URL = StudioClient.defaultBaseURL(), session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    /* ------------------------------------------------------------------ */
    /* Payloads                                                            */
    /* ------------------------------------------------------------------ */

    /// One `doctor` line, `status` one of pass|warn|fail.
    struct DoctorCheck: Decodable, Identifiable {
        let name: String
        let status: String
        let detail: String?
        var id: String { name }
    }

    struct Health: Decodable {
        struct DailyCap: Decodable {
            let totalUsd: Double?
            let capUsd: Double?
            let exceeded: Bool?
            let oldestAgesOutAt: String?
        }
        struct VideoHealth: Decodable {
            let ok: Bool
            let note: String?
            let running: Int?
            let queueDepth: Int?
        }
        struct DiagramAgent: Decodable {
            let ok: Bool
            let problem: String?
        }
        struct Vocabulary: Decodable {
            let stale: Bool?
            let readAt: String?
        }

        let ok: Bool
        let tldrawkc: Bool
        let claude: Bool
        let postgres: Bool
        let stale: Bool
        let checks: [DoctorCheck]?
        let queueDepth: Int?
        let running: Int?
        let costLast24h: Double?
        let plannerTurnsInFlight: Int?
        let note: String?
        let manual: String?
        let dailyCap: DailyCap?
        let video: VideoHealth?
        let vocabulary: Vocabulary?
        let diagramAgent: DiagramAgent?
    }

    struct DiagramFile: Decodable {
        let path: String
        let exists: Bool?
        let modified: String?
        let bytes: Int?
    }

    struct CheckoutView: Decodable {
        let path: String
        let revision: Int?
        let dirty: Bool
        let behind: Bool
    }

    /// `DiagramView` as the listing and the single read both report it.
    struct Diagram: Decodable, Identifiable {
        let name: String
        let title: String?
        let topic: String?
        let concepts: [String]?
        let source: String?
        let shapes: Int?
        let created: String?
        let svgState: String?
        let revision: Int?
        let tldr: DiagramFile?
        let svg: DiagramFile?
        let checkout: CheckoutView?
        var id: String { name }
    }

    struct DiagramProblem: Decodable {
        let name: String
        let path: String?
        let message: String
    }

    struct DiagramListing: Decodable {
        struct Counts: Decodable {
            let total: Int
            let withTopic: Int
            let unreadable: Int
        }
        let dir: String?
        let diagrams: [Diagram]
        let errors: [DiagramProblem]
        let counts: Counts?
        let stale: Bool?
        let readAt: String?
        let error: String?
        let note: String?
    }

    /// `catalog topic ls` rows: slug plus display title for the chips.
    struct Topic: Decodable, Identifiable {
        let slug: String
        let title: String?
        var id: String { slug }
    }

    struct LintRef: Decodable {
        let rule: String?
        let shape: String?
        let message: String?
        let severity: String?
    }

    struct ComparisonSide: Decodable {
        let shapes: Int?
        let bindings: Int?
        let lints: [LintRef]?
        let svgBytes: Int?
        let shot: Bool?
        let at: String?
    }

    struct Comparison: Decodable {
        let before: ComparisonSide?
        let after: ComparisonSide?
        let fixed: [LintRef]?
        let added: [LintRef]?
        let refreshedAt: String?
    }

    /// The pick a job ran with, each `{ requested, passed, source }`.
    struct AgentPick: Decodable {
        let requested: String?
        let passed: String?
        let source: String?
    }

    /// The few brief fields a detail pane echoes (mode, title, notes). The
    /// brief's full shape differs by kind; anything else stays in `raw`.
    struct BriefInfo: Decodable {
        let mode: String?
        let title: String?
        let intent: String?
        let notes: String?
        let source: String?
    }

    /// One job row, the union of the diagram and video `view()` envelopes.
    /// Nearly everything optional: video rows carry `slug`/`classes` where
    /// diagram rows carry `candidate`, and older runners omit fields.
    struct Job: Decodable, Identifiable {
        let jobId: String
        let kind: String?
        let state: String
        let phase: String?
        let title: String?
        let topic: String?
        let target: String?
        let candidate: String?
        let slug: String?
        let classes: [String]?
        let draftId: String?
        let parentJob: String?
        let attempt: Int?
        let turns: Int?
        let costUsd: Double?
        let costSource: String?
        let agentAuth: String?
        let resolvedModel: String?
        let agentModel: AgentPick?
        let exitCode: Int?
        let error: String?
        let errorKind: String?
        let requested: String?
        let started: String?
        let finished: String?
        let updated: String?
        let note: String?
        let indexed: Bool?
        let written: [String]?
        let files: [String]?
        let catalogErrors: [JSONValue]?
        let gate: JSONValue?
        let comparison: Comparison?
        let brief: BriefInfo?

        var id: String { jobId }
        /// Diagram or video, `kind` absent means a diagram runner old enough
        /// not to send it, which is every kind "diagram" anyway.
        var jobKind: String { kind ?? "diagram" }
        /// The slug a job draws on, from either envelope (`target` names
        /// `learn/assets/<slug>.tldr`, video `slug` names it directly).
        var targetSlug: String? {
            if let slug { return slug }
            guard let target, target.hasPrefix("learn/assets/"), target.hasSuffix(".tldr") else { return nil }
            return String(target.dropFirst("learn/assets/".count).dropLast(".tldr".count))
        }
    }

    struct LogWindow: Decodable {
        let lines: [String]
        let from: Int
        let next: Int
        let total: Int
    }

    /// One scene sheet of a video job, `url` server-relative.
    struct Sheet: Decodable, Identifiable {
        let scene: String
        let title: String?
        let url: String
        let renderedAt: String?
        let round: Int?
        var id: String { scene }
    }

    /// One landed studio video, from `GET /api/videos`.
    struct StudioVideo: Decodable, Identifiable {
        let slug: String
        let title: String?
        let topic: String?
        let concepts: [String]?
        let assetId: String?
        let posterAssetId: String?
        let durationSeconds: Double?
        let narrated: Bool?
        let revision: Int?
        let updated: String?
        var id: String { slug }
    }

    /// A row of `GET /api/drafts`.
    struct DraftSummary: Decodable, Identifiable {
        struct ConceptRef: Decodable {
            let slug: String
            let title: String?
        }
        let draftId: String
        let kind: String?
        let kinds: [String]?
        let state: String
        let title: String?
        let name: String?
        let firstMessage: String?
        let source: String?
        let concept: ConceptRef?
        let turns: Int?
        let costUsd: Double?
        let updated: String?
        let jobId: String?
        var id: String { draftId }
    }

    struct TranscriptEntry: Decodable, Identifiable {
        /// A brief a transcript entry carries, one per kind (D61). Only the
        /// kind is read here; the brief itself stays in the detail view's
        /// slot cards.
        struct EntryBrief: Decodable {
            let kind: String?
        }
        let seq: Int
        let role: String
        let text: String
        let at: String?
        let costUsd: Double?
        let superseded: Bool?
        let interrupted: Bool?
        let briefs: [EntryBrief]?
        var id: Int { seq }
    }

    /// `GET /api/drafts/{id}`, the conversation view.
    struct DraftDetail: Decodable {
        struct Slot: Decodable {
            let kind: String?
            let state: String?
            let live: Bool?
            let jobId: String?
            let jobState: String?
        }
        struct DraftError: Decodable {
            let kind: String?
            let message: String?
        }
        let draftId: String
        let state: String
        let plannerKinds: [String]?
        let source: String?
        let sourceKind: String?
        let title: String?
        let name: String?
        let turns: Int?
        let turnCap: Int?
        let costUsd: Double?
        let updated: String?
        let inFlight: Bool?
        let jobId: String?
        let waiting: [String]?
        let slots: [String: Slot]?
        let transcript: [TranscriptEntry]?
        let error: DraftError?
        let note: String?
    }

    /// A verb's answer: `{ verb, ok, exitCode, result, detail, note }`.
    struct VerbOutcome {
        let ok: Bool
        let note: String?
        /// The tail lines the verb printed, when it failed.
        let detail: [String]
    }

    /// The canvas a `POST /api/mirrors` opened.
    struct Mirror {
        let url: URL?
        let port: Int?
        let healthy: Bool?
        let note: String?
    }

    /* ------------------------------------------------------------------ */
    /* Reads                                                               */
    /* ------------------------------------------------------------------ */

    func health() async throws -> Health {
        try await get("api/health", as: Health.self)
    }

    func diagrams() async throws -> DiagramListing {
        try await get("api/diagrams", as: DiagramListing.self)
    }

    func diagram(_ name: String) async throws -> Diagram {
        try await get("api/diagrams/\(name)", as: Diagram.self)
    }

    /// `GET /api/vocabulary`: slug → title for the chips. Optional on older
    /// runners, so the caller tolerates the throw.
    func vocabulary() async throws -> [Topic] {
        let object = try await get("api/vocabulary")
        return (object["topics"] as? [[String: Any]] ?? []).compactMap { raw in
            guard let slug = raw["slug"] as? String else { return nil }
            return Topic(slug: slug, title: raw["title"] as? String)
        }
    }

    func jobs(limit: Int = 100) async throws -> [Job] {
        try await get("api/jobs", query: [URLQueryItem(name: "limit", value: String(limit))], as: JobsEnvelope.self).jobs
    }

    /// `GET /api/jobs/{id}`, the one route carrying `brief` and `comparison`.
    func job(_ id: String) async throws -> Job {
        try await get("api/jobs/\(id)", as: Job.self)
    }

    func jobLog(_ id: String, from: Int = 0, limit: Int = 400) async throws -> LogWindow {
        try await get(
            "api/jobs/\(id)/log",
            query: [URLQueryItem(name: "from", value: String(from)), URLQueryItem(name: "limit", value: String(limit))],
            as: LogWindow.self
        )
    }

    /// A job's screenshot: `before`, `after` or `live`. 404 means there is no
    /// such picture (a `new` job has no before), which the caller shows in words.
    func shot(_ id: String, which: String) async throws -> Data {
        try await bytes("api/jobs/\(id)/shot", query: [URLQueryItem(name: "which", value: which)])
    }

    /// A video job's scene sheets (PNGs), in play order.
    func sheets(_ id: String) async throws -> [Sheet] {
        let envelope = try await get("api/jobs/\(id)/sheets", as: SheetsEnvelope.self)
        return envelope.sheets
    }

    /// The candidate mp4's URL, for the player. The media route answers range
    /// requests, which is what AVPlayer asks for.
    func mediaURL(jobId: String, name: String) -> URL {
        baseURL.appending(path: "api/jobs/\(jobId)/media/\(name)")
    }

    /// Whether `media/{name}` has bytes: a one-byte range probe, since the
    /// route 404s until the gate has passed (and forever after review).
    func probeMedia(jobId: String, name: String) async -> Bool {
        var request = URLRequest(url: mediaURL(jobId: jobId, name: name))
        request.setValue("bytes=0-0", forHTTPHeaderField: "range")
        guard let (_, response) = try? await session.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200 ... 299).contains(http.statusCode)
    }

    /// The stored SVG's markup, for the tile and the inspector's preview.
    func diagramSvg(_ name: String) async throws -> String {
        let data = try await bytes("api/diagrams/\(name)/svg")
        return String(data: data, encoding: .utf8) ?? ""
    }

    func sheetImage(_ sheet: Sheet) async throws -> Data {
        // `url` is server-relative (`/api/jobs/...`); strip the leading slash.
        try await bytes(String(sheet.url.dropFirst()))
    }

    func videos() async throws -> [StudioVideo] {
        try await get("api/videos", as: VideosEnvelope.self).videos
    }

    func drafts(limit: Int = 100) async throws -> [DraftSummary] {
        try await get("api/drafts", query: [URLQueryItem(name: "limit", value: String(limit))], as: DraftsEnvelope.self).drafts
    }

    func draft(_ id: String) async throws -> DraftDetail {
        try await get("api/drafts/\(id)", as: DraftDetail.self)
    }

    /* ------------------------------------------------------------------ */
    /* Writes, each one POST the web's own actions call.                  */
    /* ------------------------------------------------------------------ */

    /// `POST /api/jobs/{id}/{action}` for the bodiless verbs:
    /// cancel, accept, discard, compare, resume. Returns the reply's `note`.
    @discardableResult
    func jobAction(_ id: String, _ action: String) async throws -> String? {
        let reply = try await post("api/jobs/\(id)/\(action)", body: [:])
        return reply["note"] as? String
    }

    /// `POST /api/jobs/{id}/revise` with the change request it requires.
    @discardableResult
    func reviseJob(_ id: String, changes: String) async throws -> String? {
        let reply = try await post("api/jobs/\(id)/revise", body: ["changes": changes])
        return reply["note"] as? String
    }

    /// `POST /api/diagrams/{name}/{verb}`: export, inspect, verify.
    @discardableResult
    func diagramVerb(_ name: String, _ verb: String) async throws -> VerbOutcome {
        let reply = try await post("api/diagrams/\(name)/\(verb)", body: [:])
        return VerbOutcome(
            ok: reply["ok"] as? Bool ?? false,
            note: reply["note"] as? String,
            detail: (reply["detail"] as? [Any])?.compactMap { $0 as? String } ?? []
        )
    }

    /// `POST /api/diagrams/{name}/commit`, the canvas edits reaching the database.
    @discardableResult
    func commitDiagram(_ name: String, reason: String) async throws -> VerbOutcome {
        let reply = try await post("api/diagrams/\(name)/commit", body: ["reason": reason])
        return VerbOutcome(
            ok: reply["ok"] as? Bool ?? false,
            note: reply["note"] as? String,
            detail: (reply["detail"] as? [Any])?.compactMap { $0 as? String } ?? []
        )
    }

    /// `POST /api/mirrors { file }`, a `canvas serve` over the checkout, whose
    /// URL the caller opens in the browser.
    func openMirror(file: String) async throws -> Mirror {
        let reply = try await post("api/mirrors", body: ["file": file])
        return Mirror(
            url: (reply["url"] as? String).flatMap(URL.init(string:)),
            port: reply["port"] as? Int,
            healthy: reply["healthy"] as? Bool,
            note: reply["note"] as? String
        )
    }

    /// `POST /api/drafts`, a blank conversation (`source: null`), answered
    /// with its id. The key makes a retry land on the same draft.
    func createDraft() async throws -> String {
        let reply = try await post("api/drafts", body: [
            "source": NSNull(),
            "idempotencyKey": "gnosia-macos:\(UUID().uuidString)",
        ])
        guard let id = reply["draftId"] as? String else {
            throw StudioError(status: 200, message: "the runner answered with no draft", detail: nil)
        }
        return id
    }

    /// `POST /api/drafts/{id}/messages`: one person turn. `mentions` are the
    /// `{kind,start,end}` triples the runner checks against the text.
    func sendDraftMessage(_ id: String, text: String, mentions: [[String: Any]] = []) async throws {
        try await post("api/drafts/\(id)/messages", body: ["text": text, "mentions": mentions])
    }

    /// `POST /api/drafts/{id}/draw`: turn the in-force brief of `kind` into a
    /// queued job. Returns the job id when one was queued (single-kind press).
    @discardableResult
    func drawDraft(_ id: String, kind: String) async throws -> String? {
        let reply = try await post("api/drafts/\(id)/draw", body: [
            "kind": kind,
            "idempotencyKey": "gnosia-macos:\(UUID().uuidString)",
        ])
        return reply["jobId"] as? String
    }

    /// `POST /api/drafts/{id}/abandon`, close the conversation.
    func abandonDraft(_ id: String) async throws {
        try await post("api/drafts/\(id)/abandon", body: [:])
    }

    /* ------------------------------------------------------------------ */
    /* Transport, the same shape as SidecarClient's half.                 */
    /* ------------------------------------------------------------------ */

    /// `appending(path:)` percent-encodes a `?` into the path, so query
    /// strings go through `appending(queryItems:)` instead.
    private func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        var url = baseURL.appending(path: path)
        if !query.isEmpty { url.append(queryItems: query) }
        return url
    }

    private func get(_ path: String, query: [URLQueryItem] = []) async throws -> [String: Any] {
        let (data, response) = try await session.data(from: url(path, query: query))
        try refuseIfNeeded(data, response: response)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw StudioError(status: 0, message: "The reply was not a JSON object.", detail: nil)
        }
        return object
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], as type: T.Type) async throws -> T {
        let (data, response) = try await session.data(from: url(path, query: query))
        try refuseIfNeeded(data, response: response)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Binary routes: shots, sheets, SVG. Non-2xx is still a JSON refusal.
    private func bytes(_ path: String, query: [URLQueryItem] = []) async throws -> Data {
        let (data, response) = try await session.data(from: url(path, query: query))
        try refuseIfNeeded(data, response: response)
        return data
    }

    @discardableResult
    private func post(_ path: String, body: [String: Any]) async throws -> [String: Any] {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        try refuseIfNeeded(data, response: response)
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            // Some verbs (cancel) answer JSON anyway; an empty body reads as {}.
            return [:]
        }
        return object
    }

    /// A 2xx passes through; anything else is read as the `{ error, detail }`
    /// refusal before it is thrown. `detail` can be a string or an object.
    private func refuseIfNeeded(_ data: Data, response: URLResponse) throws {
        guard let status = (response as? HTTPURLResponse)?.statusCode, !(200 ... 299).contains(status) else { return }
        let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let message = body?["error"] as? String ?? "The studio answered \(status)."
        var detail: String?
        if let raw = body?["detail"] {
            if let text = raw as? String {
                detail = text
            } else {
                detail = (try? JSONSerialization.data(withJSONObject: raw)).flatMap { String(data: $0, encoding: .utf8) }
            }
        }
        throw StudioError(status: status, message: message, detail: detail)
    }

    private struct JobsEnvelope: Decodable { let jobs: [Job] }
    private struct SheetsEnvelope: Decodable { let sheets: [Sheet] }
    private struct VideosEnvelope: Decodable { let videos: [StudioVideo] }
    private struct DraftsEnvelope: Decodable { let drafts: [DraftSummary] }
}
