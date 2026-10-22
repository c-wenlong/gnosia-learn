//
//  WebServer.swift
//  GnosiaWeb
//
//  Owns the local Next server the window loads. `next dev` is spawned when
//  no build exists (a fresh checkout still opens the app), `next start`
//  once `apps/web/.next/BUILD_ID` is there — GNOSIA_WEB_MODE=dev|start
//  overrides the pick. The process is exec'd inside a login shell so the
//  owner's nvm/volta PATH reaches node and the PID we hold *is* the server
//  (terminate() hits node, not a wrapper). Readiness is polled on the
//  socket itself rather than parsed from stdout, so dev-mode's slow first
//  compiles do not matter — any HTTP response, even a redirect to
//  sign-in, means the server is up.
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

    private var process: Process?
    private var exited = true
    private var stderrTail = ""

    init() {
        NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.process?.terminate() }
        }
    }

    func start() async {
        guard case .off = status else { return }
        status = .starting
        for attempt in 1 ... 3 {
            let port = Int.random(in: 49200 ... 59800)
            guard spawn(port: port) else { return }  // no repo/node — status is failed
            if let url = await waitReady(port: port) {
                status = .running(url)
                return
            }
            process?.terminate()
            process = nil
            if attempt == 3 {
                status = .failed(stderrTail.isEmpty
                    ? "The web server did not come up after three ports."
                    : stderrTail)
            }
        }
    }

    /// False when the spawn itself could not be set up (no checkout, no
    /// node binary); a process that starts but never listens returns true
    /// and lets waitReady report it.
    private func spawn(port: Int) -> Bool {
        exited = false
        stderrTail = ""
        guard let root = Self.repoRoot() else {
            status = .failed("No checkout found — set GNOSIA_REPO to the repository root.")
            return false
        }
        let web = root.appending(path: "apps/web")
        let next = root.appending(path: "node_modules/next/dist/bin/next")
        guard FileManager.default.fileExists(atPath: next.path) else {
            status = .failed("next is not installed — run `npm install` in \(root.path).")
            return false
        }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = [
            "-lc",
            "exec node '\(next.path)' \(Self.mode(web: web)) '\(web.path)' -p \(port) -H 127.0.0.1"
        ]
        proc.currentDirectoryURL = root
        let err = Pipe()
        proc.standardError = err
        proc.standardOutput = FileHandle.nullDevice
        err.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            guard let text = String(data: chunk, encoding: .utf8) else { return }
            Task { @MainActor in self?.keepStderr(text) }
        }
        proc.terminationHandler = { [weak self] _ in
            Task { @MainActor in self?.exited = true }
        }
        do {
            try proc.run()
            process = proc
            return true
        } catch {
            status = .failed("Could not spawn node: \(error.localizedDescription)")
            return false
        }
    }

    /// `start` when a production build exists, `dev` otherwise — a fresh
    /// checkout with no `.next` still opens the app.
    private static func mode(web: URL) -> String {
        let env = ProcessInfo.processInfo.environment["GNOSIA_WEB_MODE"]?
            .trimmingCharacters(in: .whitespaces)
        if env == "dev" || env == "start" { return env! }
        return FileManager.default
            .fileExists(atPath: web.appending(path: ".next/BUILD_ID").path) ? "start" : "dev"
    }

    /// Polls the socket until any response arrives — a redirect to
    /// /sign-in still proves the server bound. Ninety seconds covers a
    /// dev-mode cold compile on a slow machine; the process dying first
    /// ends the wait early so a port clash falls through to the retry.
    private func waitReady(port: Int) async -> URL? {
        let url = URL(string: "http://127.0.0.1:\(port)/")!
        let deadline = ContinuousClock.now + .seconds(90)
        var request = URLRequest(url: url)
        request.timeoutInterval = 3
        while ContinuousClock.now < deadline {
            if exited { return nil }
            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                if response is HTTPURLResponse { return url }
            } catch { /* not listening yet */ }
            try? await Task.sleep(for: .milliseconds(400))
        }
        return nil
    }

    private func keepStderr(_ text: String) {
        stderrTail = String((stderrTail + text).suffix(4000))
    }

    /// The same discovery the other apps use: GNOSIA_REPO wins, then the
    /// walk up from this file's compile-time path.
    private static func repoRoot() -> URL? {
        if let env = ProcessInfo.processInfo.environment["GNOSIA_REPO"], !env.isEmpty {
            return URL(fileURLWithPath: env)
        }
        // #filePath: <root>/apps/desktop/Sources/GnosiaWeb/WebServer.swift
        var here = URL(fileURLWithPath: #filePath)
        for _ in 0 ..< 5 { here.deleteLastPathComponent() }
        if FileManager.default.fileExists(atPath: here.appending(path: "apps/web").path) {
            return here
        }
        return nil
    }
}
