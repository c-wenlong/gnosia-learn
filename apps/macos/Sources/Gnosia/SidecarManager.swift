import AppKit
import Foundation

/// Owns the Node sidecar process the tutor talks through.
///
/// `SidecarClient` speaks the HTTP contract; this type owns the process that
/// answers it: spawn `npx tsx services/sidecar/src/index.ts` from the repo
/// root, read stdout until the `listening <port>` line the service prints
/// after binding, then hand the client that loopback port. The process is a
/// child of the app: it is terminated on `stop()` and on app quit, and if it
/// exits on its own the status drops to `failed` with stderr's tail.
///
/// Repo discovery: `GNOSIA_REPO` wins, then the walk up from this file's
/// compile-time path (`apps/macos/Sources/Gnosia` → root is four levels).
/// A bundled app without the repo has no sidecar to spawn and the surfaces
/// say so, matching how the web pages degrade when the API is down.
@MainActor
@Observable
final class SidecarManager {
    enum Status: Equatable {
        case off
        case starting
        case running(port: Int)
        case failed(String)
    }

    private(set) var status: Status = .off
    private(set) var client: SidecarClient?

    private var process: Process?
    private var stdoutData = Data()
    private var stderrTail = ""
    private var startupWaits: [UUID: CheckedContinuation<Int, Error>] = [:]

    init() {
        NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.process?.terminate() }
        }
    }

    /// Idempotent: a running or already-starting sidecar is reused.
    func start() {
        guard client == nil, status != .starting else { return }
        status = .starting
        Task { await spawn() }
    }

    func stop() {
        process?.terminate()
        teardown()
        status = .off
    }

    /// The client once the sidecar has bound, spawning it first when needed.
    /// Ask's `send` awaits this so a cold start just looks like a slow turn.
    func readyClient() async throws -> SidecarClient {
        if let client { return client }
        start()
        let port = try await waitForListening()
        let made = SidecarClient(baseURL: URL(string: "http://127.0.0.1:\(port)")!)
        _ = try await made.health()
        client = made
        status = .running(port: port)
        return made
    }

    // MARK: - process

    private func spawn() async {
        guard let root = Self.repoRoot() else {
            status = .failed("No checkout found — set GNOSIA_REPO to the repository root.")
            return
        }
        let entry = root.appending(path: "services/sidecar/src/index.ts")
        guard FileManager.default.fileExists(atPath: entry.path) else {
            status = .failed("services/sidecar is not in \(root.path).")
            return
        }

        let proc = Process()
        let stdout = Pipe()
        let stderr = Pipe()
        // A login shell so nvm/volta/homebrew PATH from the owner's profile
        // reaches npx; an app launched from Finder gets a bare /usr/bin PATH.
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-lc", "npx tsx services/sidecar/src/index.ts"]
        proc.currentDirectoryURL = root
        proc.standardOutput = stdout
        proc.standardError = stderr
        process = proc

        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            Task { @MainActor in self?.readStdout(chunk) }
        }
        stderr.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            guard let text = String(data: chunk, encoding: .utf8) else { return }
            Task { @MainActor in self?.keepStderr(text) }
        }
        proc.terminationHandler = { [weak self] proc in
            Task { @MainActor in self?.exited(proc) }
        }

        do {
            try proc.run()
        } catch {
            status = .failed("Could not spawn npx: \(error.localizedDescription)")
        }
    }

    /// The stdout contract: one line `listening <port>` once the socket is
    /// bound. Everything else the service says goes to stderr, so any line not
    /// matching is shell-init noise on stdout and is skipped.
    private func readStdout(_ chunk: Data) {
        stdoutData.append(chunk)
        while let nl = stdoutData.firstIndex(of: 0x0A) {
            let line = stdoutData.subdata(in: stdoutData.startIndex ..< nl)
            stdoutData.removeSubrange(stdoutData.startIndex ... nl)
            guard let text = String(data: line, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
                text.hasPrefix("listening "),
                let port = Int(text.dropFirst("listening ".count))
            else { continue }
            let waits = startupWaits
            startupWaits = [:]
            waits.values.forEach { $0.resume(returning: port) }
        }
    }

    private func keepStderr(_ text: String) {
        stderrTail = String((stderrTail + text).suffix(2000))
    }

    private func exited(_ proc: Process) {
        let reason = stderrTail.trimmingCharacters(in: .whitespacesAndNewlines)
        let waits = startupWaits
        startupWaits = [:]
        waits.values.forEach {
            $0.resume(throwing: SidecarClient.SidecarError(
                status: Int(proc.terminationStatus),
                code: "EXITED",
                error: reason.isEmpty ? "The sidecar exited before it was listening." : reason
            ))
        }
        teardown()
        if case .running = status { status = .failed("The sidecar stopped.") }
        else if case .starting = status { status = .failed(reason.isEmpty ? "The sidecar exited." : reason) }
    }

    private func teardown() {
        process = nil
        client = nil
        stdoutData = Data()
    }

    /// Suspends until the `listening` line or the process exits. Bounded by a
    /// 20s cap so a wedged tsx install can't leave Ask spinning forever.
    private func waitForListening() async throws -> Int {
        try await withCheckedThrowingContinuation { wait in
            let id = UUID()
            startupWaits[id] = wait
            Task {
                try? await Task.sleep(for: .seconds(20))
                if let pending = startupWaits.removeValue(forKey: id) {
                    pending.resume(throwing: SidecarClient.SidecarError(
                        status: 0, code: "TIMEOUT",
                        error: "The sidecar did not print a listening port in 20s."
                    ))
                }
            }
        }
    }

    private static func repoRoot() -> URL? {
        if let env = ProcessInfo.processInfo.environment["GNOSIA_REPO"], !env.isEmpty {
            return URL(fileURLWithPath: env)
        }
        // #filePath: <root>/apps/macos/Sources/Gnosia/SidecarManager.swift
        var here = URL(fileURLWithPath: #filePath)
        for _ in 0 ..< 5 { here.deleteLastPathComponent() }
        if FileManager.default.fileExists(atPath: here.appending(path: "services/sidecar").path) {
            return here
        }
        return nil
    }
}
