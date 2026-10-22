//
//  StudioRunner.swift
//  GnosiaWeb
//
//  Owns the studio runner's lifecycle for the window, the way WebServer owns
//  the Next server's. The web app inside the webview reaches the runner on
//  its fixed loopback port (7250, or $STUDIO_PORT) through /studio/api/*;
//  when nothing answers, every studio surface draws the "runner is not
//  answering" card. So the app that hosts the window also hosts the runner:
//  spawned with it, SIGTERM'd when it quits.
//
//  **Managed, on purpose — and the opposite of apps/macos.** The native
//  shell launches `npm run studio` detached (nohup) because a runner killed
//  with the app marks an in-flight render `interrupted`, and its surfaces
//  treat starting the runner as an owner's call. Here the window is the
//  whole product surface and quitting it is the owner saying the machine
//  should go quiet, so the child is terminated on willTerminate. That is
//  not a rude death: SIGTERM runs the runner's own shutdown — mirrors
//  closed, drains waited on, the running job stopped — the same signal
//  `scripts/dev.sh stop` relies on. A job caught mid-flight lands in the
//  designed `interrupted` state, listed for a person to resume.
//
//  **Adopt, never kill, a runner that is already answering.** A
//  `npm run studio` somebody started in a terminal keeps its own lifetime:
//  the app uses it while it is up and leaves it running on quit. Only a
//  runner this process spawned is terminated, because only that one is its
//  child.
//
//  The spawn is `exec node --import tsx services/studio/src/index.ts`
//  inside a login shell — the repo's own way of running a tsx entry point
//  (`npm run canvas`), and `exec` leaves the PID we hold being the runner
//  itself, so terminate() hits node and not an npm wrapper. nvm/volta PATH
//  reaches it through the login shell, the environment is the shared
//  Checkout.childEnv(), and its output appends to .studio/runner.log, the
//  file the detached launch wrote to and the launch failure note names.
//

import AppKit
import Foundation

@MainActor
@Observable
final class StudioRunner {
    enum Status: Equatable {
        /// Nothing asked yet.
        case off
        /// Spawned (or about to be) and health has not answered.
        case starting
        /// `/api/health` answered. `owned` marks the runner this process
        /// spawned — the only kind terminated on quit.
        case running(owned: Bool)
        /// The spawn failed or the child died with nothing else answering.
        /// The payload says why, or where to look.
        case failed(String)
    }

    private(set) var status: Status = .off

    private var process: Process?
    private var log: FileHandle?
    private var watch: Task<Void, Never>?
    private var exited = true
    private var stopping = false
    /// The port this launch probes, resolved once per `start()` — the
    /// merged env is a file read, and the watch polls on it every 2s.
    private var port = 7250

    init() {
        NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.shutdown() }
        }
    }

    /// Bring a runner up for the window: adopt whatever answers, else spawn
    /// one. Idempotent — a running or already-starting runner is reused, a
    /// child still trying keeps its spawn rather than getting a sibling
    /// racing it for the port, and a failed start may be asked again.
    func start() async {
        if case .running = status { return }
        guard status != .starting else { return }
        status = .starting
        stopping = false
        port = Self.port()
        if await healthAnswers() {
            // A live child answering means ours bound; none means adopted.
            status = .running(owned: process != nil)
            return
        }
        // A child already spawned and not yet exited keeps its spawn: a
        // second node would only lose the same port, and overwriting
        // `process` would orphan the first on quit.
        if process == nil {
            guard spawn() else { return }
        }
        watch?.cancel()
        watch = Task { [weak self] in await self?.watchHealth() }
    }

    /// The quit path: an owned child gets SIGTERM and keeps the runner's own
    /// drain (the app does not wait — the reparented process finishes what
    /// it is writing on its own); an adopted one is left alone.
    private func shutdown() {
        stopping = true
        watch?.cancel()
        process?.terminate()
    }

    /* ------------------------------------------------------------------ */
    /* The spawn.                                                          */
    /* ------------------------------------------------------------------ */

    /// False when the spawn itself could not be set up (no checkout, no
    /// entry point, no tsx, no log); status says why.
    private func spawn() -> Bool {
        guard let root = Checkout.repoRoot() else {
            status = .failed("No checkout found — set GNOSIA_REPO to the repository root.")
            return false
        }
        guard FileManager.default.fileExists(atPath: root.appending(path: "services/studio/src/index.ts").path) else {
            status = .failed("services/studio is not in \(root.path).")
            return false
        }
        guard FileManager.default.fileExists(atPath: root.appending(path: "node_modules/tsx").path) else {
            status = .failed("tsx is not installed — run `npm install` in \(root.path).")
            return false
        }
        let logFile = root.appending(path: ".studio/runner.log")
        do {
            try FileManager.default.createDirectory(at: logFile.deletingLastPathComponent(), withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: logFile.path) {
                FileManager.default.createFile(atPath: logFile.path, contents: nil)
            }
            let handle = try FileHandle(forWritingTo: logFile)
            handle.seekToEndOfFile()
            log = handle
        } catch {
            status = .failed("Could not open .studio/runner.log: \(error.localizedDescription)")
            return false
        }

        exited = false
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-lc", "exec node --import tsx services/studio/src/index.ts"]
        proc.currentDirectoryURL = root
        proc.environment = Checkout.childEnv()
        proc.standardOutput = log
        proc.standardError = log
        proc.terminationHandler = { [weak self] _ in
            Task { @MainActor in self?.childExited() }
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

    /// Polls health until the runner answers or the child exits. The first
    /// minute of a run is doctor and manual work before the port binds, so
    /// the window the native app gives a launch — 2½ minutes — is also the
    /// point where this says "still not answering" and names the log; the
    /// poll carries on past it so a slow first run that does bind still
    /// lands on `.running`.
    private func watchHealth() async {
        let slow = ContinuousClock.now + .seconds(150)
        while !Task.isCancelled, !exited {
            if await healthAnswers() {
                status = .running(owned: true)
                return
            }
            if status == .starting, ContinuousClock.now > slow {
                status = .failed("still not answering after 2½ minutes — see .studio/runner.log")
            }
            try? await Task.sleep(for: .seconds(2))
        }
    }

    /// The child died. If we killed it (quit), there is nothing to decide.
    /// Otherwise re-probe once: ours can die on EADDRINUSE because a runner
    /// of the owner's took the port at the same moment, and answering health
    /// then means adopt it. Silence means a real failure, reported with the
    /// log's tail.
    private func childExited() {
        exited = true
        process = nil
        watch?.cancel()
        try? log?.close()
        log = nil
        guard !stopping else {
            status = .off
            return
        }
        Task {
            if await healthAnswers() {
                status = .running(owned: false)
            } else {
                status = .failed(logTail() ?? "the runner exited before it answered")
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* The probe, and where it points.                                     */
    /* ------------------------------------------------------------------ */

    /// True when `/api/health` answers 200 with a JSON object — the runner's
    /// shape, and enough to keep a foreign service holding the port from
    /// being adopted by name alone.
    private func healthAnswers() async -> Bool {
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/health") else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
            return (try? JSONSerialization.jsonObject(with: data)) is [String: Any]
        } catch {
            return false
        }
    }

    /// The port both sides read: `STUDIO_PORT` from the same merged
    /// environment the child gets, the web's `studioOrigin()` rule, or 7250.
    private static func port() -> Int {
        let raw = Int(Checkout.childEnv()["STUDIO_PORT"]?.trimmingCharacters(in: .whitespaces) ?? "") ?? 0
        return (1024 ... 65535).contains(raw) ? raw : 7250
    }

    /// The last 4 KB of the runner's log, for the failure note.
    private func logTail() -> String? {
        guard let root = Checkout.repoRoot() else { return nil }
        let file = root.appending(path: ".studio/runner.log")
        guard let handle = try? FileHandle(forReadingFrom: file) else { return nil }
        defer { try? handle.close() }
        let size = handle.seekToEndOfFile()
        handle.seek(toFileOffset: size > 4096 ? size - 4096 : 0)
        guard let data = try? handle.readToEnd(),
              let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else { return nil }
        return text
    }
}
