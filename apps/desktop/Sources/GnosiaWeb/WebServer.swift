//
//  WebServer.swift
//  GnosiaWeb
//
//  Owns the local Next server the window loads. `next dev` is the default
//  so the app always serves the checkout's current code; `next start` is
//  faster but silently serves whatever build happens to exist, so it is
//  opt-in through GNOSIA_WEB_MODE=start. The process is exec'd inside a
//  login shell so the owner's nvm/volta PATH reaches node and the PID we
//  hold *is* the server (terminate() hits node, not a wrapper). Readiness
//  is polled on the socket itself rather than parsed from stdout, so
//  dev-mode's slow first compiles do not matter — any HTTP response, even
//  a redirect to sign-in, means the server is up.
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
    /// `x-gnosia-local-token` header, when the server is ours; nil for an
    /// adopted dev server, where the owner signs in as usual.
    private(set) var launchToken: String?

    /// Minted per launch and handed to the spawned server as
    /// GNOSIA_LOCAL_TOKEN; the window's first URL redeems it at
    /// /api/auth/local for a real session cookie. Never written to disk —
    /// only the child process's environment carries it.
    private let localToken = UUID().uuidString + UUID().uuidString

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
        await Checkout.prepare()
        for attempt in 1 ... 3 {
            let port = Int.random(in: 49200 ... 59800)
            guard spawn(port: port) else { return }  // no repo/node — status is failed
            if let url = await waitReady(port: port), await proveOwned(url) {
                // The window's first load: redeem the launch token for the
                // session cookie, which 303s onward to /home. The token is
                // only ever sent after the server proves it hosts our
                // /api/auth/local route, and in a header, never the URL
                // (S7-09): anything else answering on the port, or a log of
                // request URLs, never sees the secret.
                launchToken = localToken
                status = .running(url.appending(path: "api/auth/local"))
                return
            }
            process?.terminate()
            process = nil
            // The dev-singleton case: Next refused the port because the app
            // dir already has a server, and named where it lives. That
            // server has no GNOSIA_LOCAL_TOKEN of ours, so the window opens
            // on the bare URL and the owner signs in once as usual.
            if let existing = existingServer() {
                status = .running(existing)
                return
            }
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
        guard let root = Checkout.repoRoot() else {
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
        let shell = Checkout.shell("exec node '\(next.path)' \(Self.mode(web: web)) '\(web.path)' -p \(port) -H 127.0.0.1")
        proc.executableURL = shell.executable
        proc.arguments = shell.arguments
        proc.currentDirectoryURL = root
        // The shared child environment (Checkout.childEnv: the launchers'
        // one resolver, with the catalog's file pinned). GNOSIA_CATALOG is deliberately not
        // consulted — it names the native app's read snapshot, not the live
        // database. GNOSIA_LOCAL_TOKEN is the per-launch secret
        // /api/auth/local redeems for a session cookie.
        var env = Checkout.childEnv()
        env["GNOSIA_LOCAL_TOKEN"] = localToken
        proc.environment = env
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

    /// `dev` by default: it is slower on the first hit of each route but it
    /// always serves the checkout's current code — `start` would silently
    /// run whatever `.next` build happens to be lying around, which is how
    /// a day-old build ships to the window with no hint anything is off.
    /// GNOSIA_WEB_MODE=start opts into the fast path deliberately.
    private static func mode(web: URL) -> String {
        let env = ProcessInfo.processInfo.environment["GNOSIA_WEB_MODE"]?
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
    private func existingServer() -> URL? {
        guard let range = stderrTail.range(of: "access the existing server at ") else { return nil }
        let rest = stderrTail[range.upperBound...]
        guard let end = rest.firstIndex(where: { $0 == " " || $0 == "\n" || $0 == "," || $0 == "\u{1B}" }) else {
            return URL(string: String(rest))
        }
        return URL(string: String(rest[..<end]))
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
}
