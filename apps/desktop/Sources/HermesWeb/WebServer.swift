//
//  WebServer.swift
//  HermesWeb
//
//  Owns the local Next server the window loads. `next dev` is the default
//  so the app always serves the checkout's current code; `next start` is
//  faster but silently serves whatever build happens to exist, so it is
//  opt-in through HERMES_WEB_MODE=start. The process is exec'd inside a
//  login shell so the owner's nvm/volta PATH reaches node and the PID we
//  hold *is* the server (terminate() hits node, not a wrapper). Readiness
//  is polled on the socket itself rather than parsed from stdout, so
//  dev-mode's slow first compiles do not matter — any HTTP response, even
//  a redirect to sign-in, means the server is up.
//
//  The first attempt takes the port the last launch used, when it is free,
//  and only then a random one: localStorage belongs to an origin, port
//  included, so a new port each launch forgot the page's own settings
//  (the subtitles choice) every time.
//
//  Next 16 refuses a second dev server for one directory and prints the
//  running one's URL; when that happens the shell adopts it rather than
//  failing — the window just connects to what is already up.
//

import AppKit
import Foundation

@MainActor
@Observable
final class WebServer {
    enum Status: Equatable {
        case off
        case starting
        case running(URL)
        case failed(String)
    }

    private(set) var status: Status = .off

    /// The token the window's first request carries in the
    /// `x-hermes-local-token` header, when the server is ours; nil for an
    /// adopted dev server, where the owner signs in as usual.
    private(set) var launchToken: String?

    /// Minted per launch and handed to the spawned server as
    /// HERMES_LOCAL_TOKEN; the window's first URL redeems it at
    /// /api/auth/local for a real session cookie. Never written to disk —
    /// only the child process's environment carries it.
    private let localToken = UUID().uuidString + UUID().uuidString

    private var process: Process?
    /// Each spawn's turn: a terminated attempt's terminationHandler can land
    /// after the next spawn began, and must not mark that one exited.
    private var attempts = AttemptClock()
    /// The current spawn's stderr capture. Held here because its handler
    /// holds it only weakly: a capture nobody holds stops reading, and a
    /// running server writing to a pipe nobody reads blocks once it fills.
    private var stderr: StderrCapture?

    init() {
        NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.process?.terminate() }
        }
    }

    /// Bring the server up. Runs from `.off`, and again from `.failed`
    /// (the window's "Try again").
    func start() async {
        switch status {
        case .off, .failed: break
        case .starting, .running: return
        }
        status = .starting
        guard let root = Checkout.repoRoot() else {
            status = .failed("No checkout found — set HERMES_REPO to the repository root.")
            return
        }
        // Before any child: the read that lets macOS ask for the folder,
        // then the shared environment.
        if let problem = await Checkout.prepare() {
            status = .failed(problem)
            return
        }
        for attempt in 1 ... 3 {
            let port = Self.port(
                attempt: attempt,
                remembered: UserDefaults.standard.object(forKey: Self.lastPortKey) as? Int,
                isFree: Self.portIsFree,
                random: { Int.random(in: Self.portRange) }
            )
            guard let capture = spawn(root: root, port: port) else { return }  // no node: status is failed
            let outcome = await waitReady(port: port)
            if case .ready(let url) = outcome, await proveOwned(url) {
                // The window's first load: redeem the launch token for the
                // session cookie, which 303s onward to /home. The token is
                // only ever sent after the server proves it hosts our
                // /api/auth/local route, and in a header, never the URL
                // (S7-09): anything else answering on the port, or a log of
                // request URLs, never sees the secret.
                launchToken = localToken
                UserDefaults.standard.set(port, forKey: Self.lastPortKey)
                status = .running(url.appending(path: "api/auth/local"))
                return
            }
            process?.terminate()
            process = nil
            stderr = nil
            // Everything this attempt printed, before reading it: a child
            // that exits with its reason still in the pipe would otherwise
            // be reported as having said nothing.
            await capture.settle()
            let tail = capture.tail
            switch Self.judge(
                attempt: attempt, outcome: outcome, tail: tail, root: root,
                resolverFailure: Checkout.resolverFailure
            ) {
            case .adopt(let existing):
                status = .running(existing)
                return
            case .fail(let message):
                status = .failed(message)
                return
            case .retry:
                continue
            }
        }
    }

    /// The ports a spawned server may take.
    nonisolated static let portRange = 49200 ... 59800

    /// Where the last spawned server's port is kept, for the next launch.
    nonisolated static let lastPortKey = "HermesWebLastPort"

    /// The port an attempt asks Next for, as a pure rule: the first attempt
    /// takes the remembered port when it is in range and nothing holds it,
    /// so the window keeps its origin, and with it localStorage, across
    /// launches; any other attempt, or no usable remembered port, a random
    /// one. The free check is also what keeps the launch token's probe
    /// honest: a process already listening on the remembered port would
    /// otherwise answer it in our server's place.
    nonisolated static func port(
        attempt: Int, remembered: Int?, isFree: (Int) -> Bool, random: () -> Int
    ) -> Int {
        if attempt == 1, let remembered, portRange.contains(remembered), isFree(remembered) { return remembered }
        return random()
    }

    /// Whether 127.0.0.1:`port` can be bound now: a bind and a close, with
    /// SO_REUSEADDR as Node's own listen sets it, so a port whose last
    /// connections linger in TIME_WAIT still counts as free.
    nonisolated static func portIsFree(_ port: Int) -> Bool {
        let socket = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard socket >= 0 else { return false }
        defer { close(socket) }
        var yes: Int32 = 1
        setsockopt(socket, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(UInt16(clamping: port)).bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        return withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(socket, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0
            }
        }
    }

    /// What one failed attempt leads to.
    enum AttemptVerdict: Equatable {
        /// Adopt the dev server already running.
        case adopt(URL)
        /// Stop with this message.
        case fail(String)
        /// Try another port.
        case retry
    }

    /// Decides from what a failed attempt left behind, as a pure rule.
    nonisolated static func judge(
        attempt: Int, outcome: ReadyOutcome, tail: String, root: URL, resolverFailure: String?
    ) -> AttemptVerdict {
        // The dev-singleton case: Next refused the port because the app
        // dir already has a server, and named where it lives. That
        // server has no HERMES_LOCAL_TOKEN of ours, so the window opens
        // on the bare URL and the owner signs in once as usual.
        if let existing = existingServer(in: tail) { return .adopt(existing) }
        // Alive and silent for the whole wait: another port changes
        // nothing, and the likeliest cause is macOS refusing the child
        // the checkout's folder.
        if outcome == .timedOut, tail.isEmpty {
            return .fail(withResolverNote(silentMessage(root: root, seconds: readyTimeout), failure: resolverFailure))
        }
        if attempt == 3 {
            return .fail(withResolverNote(
                tail.isEmpty ? "The web server did not come up after three ports." : tail,
                failure: resolverFailure
            ))
        }
        return .retry
    }

    /// The failure text for a child that ran the whole wait and printed nothing.
    nonisolated static func silentMessage(root: URL, seconds: Int) -> String {
        "The web server is still running but silent after \(seconds) s; "
            + "macOS may be blocking access to \(root.path). Allow Hermes Web in "
            + "System Settings > Privacy & Security > Files and Folders, or move the checkout."
    }

    /// The resolver's failure, when it failed, under a launch failure: the
    /// children then ran on the fallback environment, which may be why.
    nonisolated static func withResolverNote(_ message: String, failure: String?) -> String {
        guard let why = failure else { return message }
        return message + "\n\nThe environment resolver also failed: " + why
    }

    /// Nil when the spawn itself could not be set up (no node binary); a
    /// process that starts but never listens returns its stderr capture and
    /// lets waitReady report it.
    private func spawn(root: URL, port: Int) -> StderrCapture? {
        let turn = attempts.begin()
        let next = root.appending(path: "node_modules/next/dist/bin/next")
        guard FileManager.default.fileExists(atPath: next.path) else {
            status = .failed("next is not installed — run `npm install` in \(root.path).")
            return nil
        }

        let proc = Process()
        let launch = Self.launch(root: root, next: next, mode: Self.mode(), port: port)
        let shell = Checkout.shell(launch.command)
        proc.executableURL = shell.executable
        proc.arguments = shell.arguments
        proc.currentDirectoryURL = launch.directory
        // The shared child environment (Checkout.childEnv: the launchers'
        // one resolver, with the catalog's file pinned). HERMES_LOCAL_TOKEN is the per-launch secret
        // /api/auth/local redeems for a session cookie.
        var env = Checkout.childEnv()
        env["HERMES_LOCAL_TOKEN"] = localToken
        proc.environment = env
        let err = Pipe()
        proc.standardError = err
        proc.standardOutput = FileHandle.nullDevice
        // This spawn's own pipe and turn: nothing it reports can reach the
        // next attempt.
        let capture = StderrCapture(pipe: err)
        proc.terminationHandler = { [weak self] _ in
            Task { @MainActor in self?.attempts.ended(turn) }
        }
        do {
            try proc.run()
            process = proc
            stderr = capture
            return capture
        } catch {
            capture.close()
            status = .failed("Could not spawn node: \(error.localizedDescription)")
            return nil
        }
    }

    /// The command and the directory it runs in. The directory is the web
    /// app's own, as under `npm run dev`. Next 16 compiles `next.config.ts`
    /// into a module with no filename, so Node resolves its relative
    /// imports (`./src/lib/auth/csp`) against the process's directory: a
    /// server started from the repository root, with the app's directory
    /// as an argument, bound its port and then failed every request with
    /// "Cannot find module". A relative CATALOG_DB resolves from there too
    /// (scripts/lib/dev-env.mjs).
    nonisolated static func launch(root: URL, next: URL, mode: String, port: Int) -> (command: String, directory: URL) {
        let web = root.appending(path: "apps/web")
        return ("exec node \(Checkout.shellQuoted(next.path)) \(mode) -p \(port) -H 127.0.0.1", web)
    }

    /// `dev` by default: it is slower on the first hit of each route but it
    /// always serves the checkout's current code — `start` would silently
    /// run whatever `.next` build happens to be lying around, which is how
    /// a day-old build ships to the window with no hint anything is off.
    /// HERMES_WEB_MODE=start opts into the fast path deliberately.
    private static func mode() -> String {
        let env = ProcessInfo.processInfo.environment["HERMES_WEB_MODE"]?
            .trimmingCharacters(in: .whitespaces)
        if env == "dev" || env == "start" { return env! }
        return "dev"
    }

    /// Probes `/api/auth/local` *without* the token: our server refuses
    /// with 403 and {"error":"FORBIDDEN"}, while a foreign service holding
    /// the port answers anything else — so the launch token is only sent
    /// once the listener proves it is the spawned Next server.
    private func proveOwned(_ url: URL) async -> Bool {
        guard let probe = URL(string: "\(url.absoluteString)api/auth/local") else { return false }
        var request = URLRequest(url: probe)
        request.timeoutInterval = 30
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 403 else { return false }
            return String(data: data, encoding: .utf8)?.contains("FORBIDDEN") == true
        } catch { return false }
    }

    /// "Another next dev server is already running … You can access the
    /// existing server at <url>" — the URL from the refusal, when there is
    /// one, so the window can adopt it instead of dying.
    nonisolated static func existingServer(in stderrTail: String) -> URL? {
        guard let range = stderrTail.range(of: "access the existing server at ") else { return nil }
        let rest = stderrTail[range.upperBound...]
        guard let end = rest.firstIndex(where: { $0 == " " || $0 == "\n" || $0 == "," || $0 == "\u{1B}" }) else {
            return URL(string: String(rest))
        }
        return URL(string: String(rest[..<end]))
    }

    /// How one wait for the server ended.
    enum ReadyOutcome: Equatable {
        case ready(URL)
        /// The process exited first.
        case exited
        /// The process outlived the whole wait without answering.
        case timedOut
    }

    /// Ninety seconds covers a dev-mode cold compile on a slow machine.
    nonisolated static let readyTimeout = 90

    /// Polls the socket until any response arrives — a redirect to
    /// /sign-in still proves the server bound. The process dying first
    /// ends the wait early so a port clash falls through to the retry.
    private func waitReady(port: Int) async -> ReadyOutcome {
        let url = URL(string: "http://127.0.0.1:\(port)/")!
        let deadline = ContinuousClock.now + .seconds(Self.readyTimeout)
        var request = URLRequest(url: url)
        request.timeoutInterval = 3
        while ContinuousClock.now < deadline {
            if attempts.exited { return .exited }
            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                if response is HTTPURLResponse { return .ready(url) }
            } catch { /* not listening yet */ }
            try? await Task.sleep(for: .milliseconds(400))
        }
        return attempts.exited ? .exited : .timedOut
    }
}

/// Which spawn is current, and whether it has exited. Each spawn takes a
/// turn; an exit reported for an older turn (a terminated attempt whose
/// terminationHandler lands after the next spawn) changes nothing.
struct AttemptClock {
    private(set) var current = 0
    private(set) var exited = true

    mutating func begin() -> Int {
        current += 1
        exited = false
        return current
    }

    mutating func ended(_ turn: Int) {
        if turn == current { exited = true }
    }
}

/// One child's stderr, kept to its last `limit` characters. The handler
/// is cleared at end of file (where it would otherwise fire again and again
/// with nothing) and by `close()`, and it writes only to this capture, so
/// one spawn's output never lands in another's tail. Reads and writes go
/// through a lock, in the order the pipe delivered them.
final class StderrCapture: @unchecked Sendable {
    private let lock = NSLock()
    private let handle: FileHandle
    private let limit: Int
    private var text = ""
    private var closed = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    /// Signalled once, by `close()`, for a caller on a plain thread.
    private let closedSignalled = DispatchSemaphore(value: 0)

    init(pipe: Pipe, limit: Int = 4000) {
        handle = pipe.fileHandleForReading
        self.limit = limit
        handle.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            guard let self else {
                handle.readabilityHandler = nil
                return
            }
            if chunk.isEmpty { self.close() } else { self.append(chunk) }
        }
    }

    /// What the child has printed so far, trimmed.
    var tail: String {
        lock.withLock { text }.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var isClosed: Bool { lock.withLock { closed } }

    private func append(_ chunk: Data) {
        lock.withLock {
            guard !closed else { return }
            text = String((text + String(decoding: chunk, as: UTF8.self)).suffix(limit))
        }
    }

    /// Stop reading: end of file, or the attempt is over.
    func close() {
        let waiting: [CheckedContinuation<Void, Never>] = lock.withLock {
            if closed { return [] }
            closed = true
            defer { waiters = [] }
            return waiters
        }
        handle.readabilityHandler = nil
        waiting.forEach { $0.resume() }
        closedSignalled.signal()
    }

    /// `settle()` for a caller on a plain thread (the resolver's): wait for
    /// end of file, at most `timeout` seconds, then stop reading.
    func waitClosed(timeout: TimeInterval) {
        _ = closedSignalled.wait(timeout: .now() + timeout)
        close()
    }

    /// Wait for end of file, at most `timeout`, then stop reading either
    /// way: a grandchild (a Next worker) can hold the pipe open after the
    /// child itself is gone.
    func settle(timeout: Duration = .seconds(1)) async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.closedSignal() }
            group.addTask {
                try? await Task.sleep(for: timeout)
                self.close()
            }
            await group.next()
            group.cancelAll()
        }
        close()
    }

    private func closedSignal() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let done: Bool = lock.withLock {
                if closed { return true }
                waiters.append(continuation)
                return false
            }
            if done { continuation.resume() }
        }
    }
}
