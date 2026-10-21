import Foundation

/// The client half of the Node sidecar boundary (`services/sidecar`).
///
/// The tutor's TypeScript implementation runs in that process; this type only
/// speaks its HTTP contract, which is the web app's `/api/agent/*` contract
/// verbatim. Spawning the process is deliberately not this type's job yet:
/// the caller hands it the `baseURL` of an already-listening sidecar (the
/// `listening <port>` line its stdout prints) — the same seam the eventual
/// `Process` wrapper will fill.
///
/// The contract is plain JSON in both directions, so there is no streaming
/// reader here: each call awaits one object, errors included.
struct SidecarClient {
    let baseURL: URL
    private let session: URLSession

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    /// The sidecar's own answer about itself: `{ ok, service, owner }`.
    struct Health: Decodable {
        let ok: Bool
        let service: String
        let owner: String
    }

    /// One chat turn's envelope, the fields `chatTurn` answers with.
    /// `check`, `concept`, `sources` and the provider fields are optional
    /// because which of them arrive depends on the tutor shape asked for.
    struct ChatMessage: Codable {
        let role: String
        let content: String
    }

    struct ChatBody: Encodable {
        var courseSlug: String?
        var moduleSlug: String?
        var topicId: String?
        var conceptSlug: String?
        var subject: String?
        var assetId: String?
        var at: Double?
        var messages: [ChatMessage]
        var learnerNote: String?
    }

    /// The refusal body every endpoint shares: `{ error, code }`.
    struct SidecarError: Error, LocalizedError, Decodable {
        let status: Int
        let code: String?
        let error: String?

        var errorDescription: String? {
            error ?? "The sidecar answered \(status)\(code.map { " (\($0))" } ?? "")."
        }
    }

    /// `GET /api/health`. Throws `SidecarError` for a non-2xx JSON refusal,
    /// `URLError` when nothing is listening — the "is it up?" call.
    func health() async throws -> Health {
        let (data, response) = try await session.data(from: baseURL.appending(path: "api/health"))
        return try decode(Health.self, from: data, response: response)
    }

    /// `POST /api/agent/chat`: one tutor turn. The raw JSON object comes back
    /// rather than a parsed reply on purpose — the turn's shape varies with
    /// the tutor asked for (topic, concept, open, asset Ask), and the caller
    /// reads the fields it asked about.
    func chat(_ body: ChatBody) async throws -> [String: Any] {
        try await post("/api/agent/chat", body: body)
    }

    /// `POST /api/agent/judge`: `{ conceptSlug, question, answer }` → the verdict object.
    func judge(conceptSlug: String, question: String, answer: String) async throws -> [String: Any] {
        try await post("/api/agent/judge", body: [
            "conceptSlug": conceptSlug,
            "question": question,
            "answer": answer,
        ])
    }

    /// `POST /api/agent/session`: `{ conceptSlug, step, avoid? }` → one generated question.
    func sessionQuestion(conceptSlug: String, step: String, avoid: [String] = []) async throws -> [String: Any] {
        try await post("/api/agent/session", body: [
            "conceptSlug": conceptSlug,
            "step": step,
            "avoid": avoid,
        ])
    }

    /// `POST /api/agent/summarize`: a transcript condensed into the recap's knowledge.
    func summarize(courseSlug: String, moduleSlug: String, topicId: String, messages: [ChatMessage]) async throws -> [String: Any] {
        try await post("/api/agent/summarize", body: [
            "courseSlug": courseSlug,
            "moduleSlug": moduleSlug,
            "topicId": topicId,
            "messages": messages.map { ["role": $0.role, "content": $0.content] },
        ])
    }

    // MARK: - learner settings

    /// A provider row of `GET /api/learner/provider-key`: what Settings may
    /// know about a key — its last four and the day, never the key itself.
    struct ProviderRow: Decodable, Identifiable {
        struct Saved: Decodable {
            let last4: String
            let updatedAt: String
            let readable: Bool
        }
        struct Custom: Decodable {
            let baseUrl: String
        }
        let id: String
        let label: String
        let model: String
        let keyUrl: String?
        let custom: Custom?
        let saved: Saved?
        let server: Bool
        /// "saved", "server", or nil — whose key the tutor calls this provider with.
        let inUse: String?
    }

    struct ProviderKeysReply: Decodable {
        let ok: Bool
        let reachable: Bool
        let rows: [ProviderRow]
    }

    /// One entry of the owner's model chain, as `tutor_model` stores it.
    struct ChainEntry: Codable, Equatable, Hashable {
        let provider: String
        let model: String
    }

    /// The chain answers: the GET's `reachable`, and `{ ok, chain }` from the writes.
    struct ChainReply: Decodable {
        let ok: Bool
        let reachable: Bool?
        let chain: [ChainEntry]
    }

    /// `GET /api/learner/provider-key`: every provider with its key state.
    func providerKeys() async throws -> ProviderKeysReply {
        try await typed("GET", "/api/learner/provider-key", as: ProviderKeysReply.self)
    }

    /// `GET /api/learner/tutor-model`: the owner's chain, top first.
    func tutorChain() async throws -> ChainReply {
        try await typed("GET", "/api/learner/tutor-model", as: ChainReply.self)
    }

    /// `POST /api/learner/provider-key`: `{ provider, key }` → `{ ok, key }`.
    @discardableResult
    func saveProviderKey(_ provider: String, key: String) async throws -> [String: Any] {
        try await object("POST", "/api/learner/provider-key", body: ["provider": provider, "key": key])
    }

    /// `DELETE /api/learner/provider-key`: `{ provider }` → `{ ok, removed }`.
    @discardableResult
    func removeProviderKey(_ provider: String) async throws -> [String: Any] {
        try await object("DELETE", "/api/learner/provider-key", body: ["provider": provider])
    }

    /// `POST /api/learner/provider-key/test`: `{ provider }` → `{ ok, provider, source, model, tested }`.
    func testProviderKey(_ provider: String) async throws -> [String: Any] {
        try await object("POST", "/api/learner/provider-key/test", body: ["provider": provider])
    }

    /// `POST /api/learner/tutor-model`: `{ provider, model }` → `{ ok, chain }`.
    func addTutorModel(_ provider: String, model: String) async throws -> ChainReply {
        try await typed("POST", "/api/learner/tutor-model", body: ["provider": provider, "model": model], as: ChainReply.self)
    }

    /// `PUT /api/learner/tutor-model`: the whole chain becomes this entry.
    func setTutorModel(_ provider: String, model: String) async throws -> ChainReply {
        try await typed("PUT", "/api/learner/tutor-model", body: ["provider": provider, "model": model], as: ChainReply.self)
    }

    /// `DELETE /api/learner/tutor-model`: `{ provider, model }` → `{ ok, chain }`.
    func removeTutorModel(_ provider: String, model: String) async throws -> ChainReply {
        try await typed("DELETE", "/api/learner/tutor-model", body: ["provider": provider, "model": model], as: ChainReply.self)
    }

    /// `PATCH /api/learner/tutor-model`: `{ provider, model, direction }` → `{ ok, chain }`.
    func moveTutorModel(_ provider: String, model: String, direction: String) async throws -> ChainReply {
        try await typed("PATCH", "/api/learner/tutor-model", body: ["provider": provider, "model": model, "direction": direction], as: ChainReply.self)
    }

    /// `PATCH /api/learner/tutor-model/provider`: `{ provider, direction }` → `{ ok, chain }`.
    func moveTutorProvider(_ provider: String, direction: String) async throws -> ChainReply {
        try await typed("PATCH", "/api/learner/tutor-model/provider", body: ["provider": provider, "direction": direction], as: ChainReply.self)
    }

    /// `DELETE /api/learner/tutor-model/provider`: `{ provider }` → `{ ok, chain, keyRemoved }`.
    func removeTutorProvider(_ provider: String) async throws -> [String: Any] {
        try await object("DELETE", "/api/learner/tutor-model/provider", body: ["provider": provider])
    }

    /// `POST /api/learner/tutor-model/test`: `{ provider, model }` → `{ ok, provider, model, source, served }`.
    func testTutorModel(_ provider: String, model: String) async throws -> [String: Any] {
        try await object("POST", "/api/learner/tutor-model/test", body: ["provider": provider, "model": model])
    }

    /// `POST /api/learner/tutor-model/models`: `{ provider }` → `{ ok, models, cached }`.
    func tutorModelList(_ provider: String) async throws -> [String: Any] {
        try await object("POST", "/api/learner/tutor-model/models", body: ["provider": provider])
    }

    /// `POST /api/learner/custom-provider`: `{ label, baseUrl, key }` →
    /// `{ ok, provider, key }`. A provider the owner adds (T14) goes in whole
    /// or not at all: the row and its sealed key are one write.
    func addCustomProvider(label: String, baseUrl: String, key: String) async throws -> [String: Any] {
        try await object("POST", "/api/learner/custom-provider", body: ["label": label, "baseUrl": baseUrl, "key": key])
    }

    /// `PATCH /api/learner/custom-provider`: `{ provider, label, baseUrl,
    /// key? }` → `{ ok, provider, key }`. The name and the URL always travel
    /// together; a nil `key` leaves the saved one alone, a refused one leaves
    /// the name and the URL as they were.
    func changeCustomProvider(_ provider: String, label: String, baseUrl: String, key: String?) async throws -> [String: Any] {
        var body: [String: Any] = ["provider": provider, "label": label, "baseUrl": baseUrl]
        if let key { body["key"] = key }
        return try await object("PATCH", "/api/learner/custom-provider", body: body)
    }

    // MARK: - learner state writes

    // The native app's Postgres half: the same `/api/learner/*` bodies the
    // web's pages post, so one write lands in learner.db and its mirror in
    // Postgres. The LearnerStore queues each call in `mirror_queue` beside
    // the row it commits with, and the flusher sends them through `replay`
    // — a down sidecar or unreachable Postgres holds the row for retry,
    // never drops the write. The typed methods below stay as the routes'
    // reference; the queue replays bodies it persisted, not calls.

    /// The retry queue's send: `POST` a persisted body back to its route.
    /// The body arrives already encoded — it was stored as bytes — and the
    /// reply only needs checking, which `decode`'s refusal pass does.
    func replay(route: String, body: Data) async throws {
        let (data, response) = try await send("POST", route, data: body)
        _ = try decode([String: Any].self, from: data, response: response)
    }

    /// `POST /api/learner/favorite`: `{ assetId, favorite }` → `{ ok, result }`.
    @discardableResult
    func setFavorite(_ assetId: String, favorite: Bool) async throws -> [String: Any] {
        try await object("POST", "/api/learner/favorite", body: ["assetId": assetId, "favorite": favorite])
    }

    /// `POST /api/learner/watched`: `{ assetId }` → `{ ok, result }`. One
    /// press, one `watched` event — the server's append does not dedupe.
    @discardableResult
    func markWatched(_ assetId: String) async throws -> [String: Any] {
        try await object("POST", "/api/learner/watched", body: ["assetId": assetId])
    }

    /// `POST /api/learner/playback`: `{ assetId, duration, position, ranges }`
    /// → `{ ok, result }`. The ranges merge under the learner lock; the save
    /// that takes coverage past the watched fraction appends the `watched`
    /// event server-side.
    @discardableResult
    func savePlayback(_ assetId: String, duration: Double, position: Double, ranges: [[Double]]) async throws -> [String: Any] {
        try await object("POST", "/api/learner/playback", body: [
            "assetId": assetId,
            "duration": duration,
            "position": position,
            "ranges": ranges,
        ])
    }

    /// `POST /api/learner/progress`: `{ curriculumItemId, completed }` → `{ ok, result }`.
    @discardableResult
    func setProgress(_ curriculumItemId: String, completed: Bool) async throws -> [String: Any] {
        try await object("POST", "/api/learner/progress", body: [
            "curriculumItemId": curriculumItemId,
            "completed": completed,
        ])
    }

    /// `POST /api/learner/asset-name`: `{ assetId, name }` → `{ ok, result }`;
    /// a nil `name` goes over the wire as null, which clears the learner's name.
    @discardableResult
    func renameAsset(_ assetId: String, name: String?) async throws -> [String: Any] {
        try await object("POST", "/api/learner/asset-name", body: [
            "assetId": assetId,
            "name": name ?? NSNull(),
        ])
    }

    /// `POST /api/learner/note`: `{ curriculumItemId, note }` → `{ ok, result }`.
    /// No native surface writes notes today; the method exists so the bridge
    /// contract is complete when one does.
    @discardableResult
    func setNote(_ curriculumItemId: String, note: String) async throws -> [String: Any] {
        try await object("POST", "/api/learner/note", body: [
            "curriculumItemId": curriculumItemId,
            "note": note,
        ])
    }

    /// `POST /api/learner/name`: `{ name }` → `{ ok, result }`; null clears.
    /// As with `setNote`, kept for completeness — nothing native asks the
    /// learner's name.
    @discardableResult
    func setDisplayName(_ name: String?) async throws -> [String: Any] {
        try await object("POST", "/api/learner/name", body: ["name": name ?? NSNull()])
    }

    /// `POST /api/learner/observe`: one graded answer, the body the web's
    /// session page posts — `{ conceptSlug, correct, source, requestId,
    /// sessionId, … }`. The server recomputes mastery and the card; the
    /// `requestId` makes a resent answer a replay rather than a second write.
    /// The body arrives already encoded: `Data` is Sendable, so the caller's
    /// main-actor dictionary crosses the isolation boundary as bytes.
    @discardableResult
    func observe(json body: Data) async throws -> [String: Any] {
        let (data, response) = try await send("POST", "/api/learner/observe", data: body)
        return try decode([String: Any].self, from: data, response: response)
    }

    /// `POST /api/learner/session/close`: `{ sessionId }` → `{ ok, result }`.
    /// Idempotent: an already-closed or never-opened session answers
    /// `closed: false` and writes nothing.
    @discardableResult
    func closeSession(_ sessionId: String) async throws -> [String: Any] {
        try await object("POST", "/api/learner/session/close", body: ["sessionId": sessionId])
    }

    // MARK: - transport

    private func post(_ path: String, body: [String: Any]) async throws -> [String: Any] {
        try await object("POST", path, body: body)
    }

    /// `post` for a Codable body: encode, read back as a JSON object, and send
    /// that — nil optionals never reach the wire.
    private func post<T: Encodable>(_ path: String, body: T) async throws -> [String: Any] {
        let data = try JSONEncoder().encode(body)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        return try await post(path, body: object)
    }

    /// One request on the shared transport: JSON body in, raw reply out —
    /// the refusal check happens in `decode`, so each caller parses what it asked for.
    private func send(_ method: String, _ path: String, body: [String: Any]?) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        // The sidecar's guard wants application/json on every body-carrying
        // method, so a DELETE or PATCH sends its content-type too.
        if method != "GET", method != "HEAD" {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
        }
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return try await session.data(for: request)
    }

    /// `send` with the body already encoded: `observe`, whose dictionary is
    /// built on another actor and so has to cross as bytes, not an object.
    private func send(_ method: String, _ path: String, data: Data) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = data
        return try await session.data(for: request)
    }

    /// The reply as a JSON object: the agent and learner-write envelopes.
    private func object(_ method: String, _ path: String, body: [String: Any]? = nil) async throws -> [String: Any] {
        let (data, response) = try await send(method, path, body: body)
        return try decode([String: Any].self, from: data, response: response)
    }

    /// The reply decoded: the status reads' envelopes.
    private func typed<T: Decodable>(_ method: String, _ path: String, body: [String: Any]? = nil, as type: T.Type) async throws -> T {
        let (data, response) = try await send(method, path, body: body)
        return try decode(T.self, from: data, response: response)
    }

    /// The shared status check: a 2xx passes through, anything else is read
    /// as the `{ error, code }` refusal before it is thrown.
    private func refuseIfNeeded(_ data: Data, response: URLResponse) throws {
        guard let status = (response as? HTTPURLResponse)?.statusCode, !(200 ... 299).contains(status) else { return }
        let refusal = try? JSONDecoder().decode(PlainRefusal.self, from: data)
        throw SidecarError(status: status, code: refusal?.code, error: refusal?.error)
    }

    private func decode(_ type: [String: Any].Type, from data: Data, response: URLResponse) throws -> [String: Any] {
        try refuseIfNeeded(data, response: response)
        let parsed = try JSONSerialization.jsonObject(with: data)
        guard let object = parsed as? [String: Any] else {
            throw SidecarError(status: (response as? HTTPURLResponse)?.statusCode ?? 0, code: "BAD_REPLY", error: "The reply was not a JSON object.")
        }
        return object
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data, response: URLResponse) throws -> T {
        try refuseIfNeeded(data, response: response)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// `{ error, code }` as every endpoint's refusal carries it.
    private struct PlainRefusal: Decodable {
        let error: String?
        let code: String?
    }
}
