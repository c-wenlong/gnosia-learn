//
//  StudioEvents.swift
//  Gnosia
//
//  The server-sent-events half of the studio runner boundary: the native
//  counterpart of the web studio's `EventSource` on `/api/jobs/{id}/events`
//  (JobsProvider.tsx / use-video-job.ts).
//
//  The route is the same one the browser opens: one GET that the runner
//  holds open, each event a `id:`/`event:`/`data:` block, a `: keep-alive`
//  comment every twenty seconds, and `Last-Event-ID` on a reconnect
//  replaying the buffered events after it. Diagram and video jobs share
//  the route and the wire format (api.ts's `events` and
//  video/routes.ts's copy of it).
//
//  URLSession has no EventSource, so this is the smallest honest piece of
//  one: `session.bytes` gives the held response as an async byte stream,
//  the parser below applies the SSE line grammar to it, and the manager
//  owns what EventSource owns in the browser — the reconnect, the resume
//  token, and the polling fallback while the stream is down.
//
//  Two things the stream itself guarantees:
//
//  - **Connect means live.** `connect` returning is the moment the
//    headers are in, so the caller marks the stream open before the first
//    event rather than when it lands — a fresh queued job can have an
//    empty buffer and nothing to say for a while.
//  - **Silence means dead.** The runner comments `: keep-alive` every
//    twenty seconds precisely so a quiet stream is still alive; a stream
//    with no bytes for longer than that interval is a half-open
//    connection (the laptop slept, the runner died without a FIN), which
//    the watchdog closes so the reconnect path runs.
//

import Foundation

/// One event off the wire, `StudioEvent` in the runner's store.ts: the
/// seq is the SSE `id:` field and the resume token, `note` the
/// plain-English progress line the strip shows, `state`/`phase` the
/// fields a live patch applies to the polled job row.
struct StudioJobEvent: Decodable, Identifiable {
    let type: String
    let seq: Int
    let at: String?
    let job: String?
    let note: String?
    let state: String?
    let phase: String?
    let gate: JSONValue?

    var id: Int { seq }
    /// `done`, `error` and `gate` end something: the web refreshes the
    /// record on them, so the manager does the same.
    var terminal: Bool { type == "done" || type == "error" || type == "gate" }
}

/// An `AsyncThrowingStream` of a job's SSE events. Not a type so much as
/// the two functions the manager's reconnect loop needs.
enum StudioEventStream {
    /// The request the route answers. `after` is the browser's
    /// `Last-Event-ID`: the runner replays buffer events with `seq` above
    /// it, so a reconnect passes the last seq it saw.
    static func request(baseURL: URL, jobId: String, after: Int) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: "api/jobs/\(jobId)/events"))
        if after > 0 { request.setValue("\(after)", forHTTPHeaderField: "Last-Event-ID") }
        return request
    }

    /// Open the stream. Throws the runner's refusal status on a non-2xx,
    /// the URL error when nothing is listening; returns the parsed events
    /// once the headers are in, which is the caller's signal to mark the
    /// stream live.
    static func connect(_ request: URLRequest, session: URLSession) async throws -> AsyncThrowingStream<StudioJobEvent, Error> {
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw StudioError(status: status, message: "The events stream answered \(status).", detail: nil)
        }
        return AsyncThrowingStream { continuation in
            // The watchdog's clock: `last byte at`, a locked box so the
            // byte loop and the watchdog task share one instant.
            let watch = Watch()
            let producer = Task {
                do {
                    try await parse(bytes, watch: watch, into: continuation)
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            // The runner's keep-alive arrives every 20s; twice that with
            // no bytes at all is a connection that only looks open.
            let watchdog = Task {
                while !Task.isCancelled && !producer.isCancelled {
                    try? await Task.sleep(for: .seconds(15))
                    if watch.idle > 45 {
                        producer.cancel()
                        return
                    }
                }
            }
            continuation.onTermination = { _ in
                producer.cancel()
                watchdog.cancel()
            }
        }
    }

    /// One stream's activity stamp. `NSLock` rather than an actor: the
    /// byte loop ticks it inline and an actor hop per chunk is the
    /// deadlock this type exists to avoid.
    private final class Watch: @unchecked Sendable {
        private let lock = NSLock()
        private var stamp = Date.now

        func tick() {
            lock.lock()
            stamp = .now
            lock.unlock()
        }

        var idle: TimeInterval {
            lock.lock()
            defer { lock.unlock() }
            return Date.now.timeIntervalSince(stamp)
        }
    }

    /// The SSE grammar over the byte stream: `field: value` lines, `\r\n`
    /// tolerated, `:` lines comments, a blank line a dispatch, `data`
    /// lines joined with newlines. Only data-bearing blocks are yielded —
    /// the runner's others are the keep-alive and the omitted-count
    /// comment, which carry nothing a screen needs.
    ///
    /// Byte-wise, not `bytes.lines`: `AsyncLineSequence` drops the empty
    /// lines, and the empty line *is* the event boundary — with it gone,
    /// the next event's `data` joins the last one's into unparseable
    /// JSON and every event is lost (measured against a mock stream).
    private static func parse(
        _ bytes: URLSession.AsyncBytes,
        watch: Watch,
        into continuation: AsyncThrowingStream<StudioJobEvent, Error>.Continuation
    ) async throws {
        var data: [String] = []

        func dispatch() {
            defer { data = [] }
            guard !data.isEmpty else { return }
            let body = data.joined(separator: "\n")
            guard let parsed = try? JSONDecoder().decode(StudioJobEvent.self, from: Data(body.utf8)) else { return }
            continuation.yield(parsed)
        }

        func field(_ line: String) {
            if line.hasPrefix(":") { return }
            guard let colon = line.firstIndex(of: ":") else { return }
            let name = String(line[line.startIndex ..< colon])
            var value = String(line[line.index(after: colon)...])
            if value.hasPrefix(" ") { value.removeFirst() }
            // `event` and `id` need no keeping: the payload's own `type`
            // and `seq` are the same strings, and the seq is the resume
            // token the caller stores.
            if name == "data" { data.append(value) }
        }

        var lineBytes: [UInt8] = []
        lineBytes.reserveCapacity(512)
        for try await byte in bytes {
            watch.tick()
            // `\n` never sits inside a multi-byte UTF-8 sequence, so a
            // byte split is a line split; each line decodes whole.
            if byte == 0x0A {
                var line = String(decoding: lineBytes, as: UTF8.self)
                lineBytes.removeAll(keepingCapacity: true)
                if line.hasSuffix("\r") { line = String(line.dropLast()) }
                if line.isEmpty { dispatch() } else { field(line) }
            } else {
                lineBytes.append(byte)
            }
        }
        if !lineBytes.isEmpty { field(String(decoding: lineBytes, as: UTF8.self)) }
        dispatch()
    }
}
