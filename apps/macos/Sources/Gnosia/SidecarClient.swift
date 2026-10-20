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

    // MARK: - transport

    private func post(_ path: String, body: [String: Any]) async throws -> [String: Any] {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        return try decode([String: Any].self, from: data, response: response)
    }

    /// `post` for a Codable body: encode, read back as a JSON object, and send
    /// that — nil optionals never reach the wire.
    private func post<T: Encodable>(_ path: String, body: T) async throws -> [String: Any] {
        let data = try JSONEncoder().encode(body)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        return try await post(path, body: object)
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
