//
//  StudioManager.swift
//  Gnosia
//
//  The studio surface's view of `services/studio`, and the boundary's
//  lifecycle story.
//
//  **Connect-only, deliberately.** The runner binds a fixed loopback port
//  (7250) rather than printing a `listening <port>` line the way the
//  sidecar does, so there is no spawn contract to follow, the web app does
//  the same thing (`studioOrigin()`), and its blocked screen's remedy is
//  the command a person runs, `npm run studio`. Starting this runner is an
//  owner's call: it launches paid agent sessions, its first minute runs
//  heavy doctor and manual work, and a child process killed with the app
//  would mark in-flight jobs `interrupted`, which is exactly the state the
//  runner's own reconcile pass is careful to leave for a person to resume.
//
//  So this type owns the port probe and the five reads the surface draws
//  from, health, diagrams, jobs, videos, drafts, polled on a short loop
//  while the surface is up. The runner's own lists are cached or in-memory,
//  so a four-second ask is cheap; it is also the whole progress story,
//  since the web's SSE streams are a nicety the poll stands in for.
//

import AppKit
import Foundation

@MainActor
@Observable
final class StudioManager {
    enum Status: Equatable {
        /// Nothing asked yet, or the surface is not on screen.
        case off
        /// A probe is in flight and no verdict has landed.
        case probing
        /// Nothing is listening on the port. The payload is the sentence
        /// the blocked card prints.
        case down(String)
        /// `/api/health` answered.
        case up
    }

    private(set) var status: Status = .off
    let client = StudioClient()

    /// The last answers the five reads returned, newest wins. `listingError`
    /// is the diagrams read failing, which the web treats as a blocked screen
    /// rather than an empty grid (U4's reasoning: half a grid lies).
    private(set) var health: StudioClient.Health?
    private(set) var listing: StudioClient.DiagramListing?
    private(set) var listingError: String?
    private(set) var jobs: [StudioClient.Job] = []
    private(set) var videos: [StudioClient.StudioVideo] = []
    private(set) var drafts: [StudioClient.DraftSummary] = []
    private(set) var topics: [String: String] = [:]
    private(set) var refreshedAt: Date?

    /// A detached launch is in flight. Set when `launch()` fires and
    /// cleared when health answers or the launch times out — the runner's
    /// first minute runs doctor and manual work before it binds.
    private(set) var launching = false
    /// Why the last launch attempt did not reach `.up`, when it did not.
    private(set) var launchNote: String?

    private var loop: Task<Void, Never>?

    /// Begin the poll; idempotent, so `.task` can call it freely.
    func start() {
        guard loop == nil else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(4))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
        status = .off
    }

    /// One pass: health first, then the reads, the same order the page
    /// takes, because a down runner should not be left running list
    /// subprocesses for answers nobody draws.
    func refresh() async {
        if status == .off { status = .probing }
        let health: StudioClient.Health
        do {
            health = try await client.health()
        } catch {
            self.health = nil
            status = .down(
                "Nothing is listening on \(client.baseURL.absoluteString). " +
                    "Start it with `npm run studio` from the repository root."
            )
            return
        }
        self.health = health
        status = .up
        launching = false
        launchNote = nil

        // The reads: each tolerates its own failure, the way the page costs
        // a section rather than the screen, except diagrams, which the web
        // treats as the grid's whole content and reports.
        async let listed = try? client.diagrams()
        async let jobRows = try? client.jobs(limit: 100)
        async let videoRows = try? client.videos()
        async let draftRows = try? client.drafts(limit: 100)
        async let topicRows = try? client.vocabulary()

        let (l, j, v, d, t) = await (listed, jobRows, videoRows, draftRows, topicRows)
        if let l {
            listing = l
            listingError = nil
        } else {
            listingError = "the diagram list could not be read"
        }
        if let j { jobs = j }
        if let v { videos = v }
        if let d { drafts = d }
        if let t { topics = Dictionary(t.map { ($0.slug, $0.title ?? $0.slug) }, uniquingKeysWith: { a, _ in a }) }
        refreshedAt = .now
    }

    /// `npm run studio`, launched **detached** (`nohup … &`, output to
    /// `.studio/runner.log`): the runner is reparented to launchd and
    /// outlives the app. That detachment is the point — a managed child
    /// killed on quit would mark in-flight renders `interrupted`, the state
    /// the runner's reconcile pass deliberately leaves for a person.
    ///
    /// The poll loop picks the runner up once `/api/health` answers; until
    /// then `launching` shows the card's starting state, cleared by
    /// `refresh()` on `.up` or by a 150s timeout for a wedged first run.
    func launch() {
        guard !launching else { return }
        guard let root = Self.repoRoot() else {
            launchNote = "No checkout found — set GNOSIA_REPO to the repository root."
            return
        }
        let studioHome = root.appending(path: ".studio")
        try? FileManager.default.createDirectory(at: studioHome, withIntermediateDirectories: true)

        launching = true
        launchNote = nil
        // A login shell so nvm/volta/homebrew PATH reaches npm, as with the
        // sidecar; nohup + & detach the runner from this process entirely.
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-lc", "nohup npm run studio >> .studio/runner.log 2>&1 &"]
        proc.currentDirectoryURL = root
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice
        proc.terminationHandler = { [weak self] p in
            Task { @MainActor in
                guard let self else { return }
                if p.terminationStatus != 0 {
                    self.launching = false
                    self.launchNote = "the launch failed (exit \(p.terminationStatus)) — npm may be missing from PATH"
                }
                await self.refresh()
            }
        }
        do {
            try proc.run()
        } catch {
            launching = false
            launchNote = "Could not launch npm: \(error.localizedDescription)"
            return
        }
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(150))
            guard let self, self.launching else { return }
            self.launching = false
            self.launchNote = "still not answering after 2½ minutes — see .studio/runner.log"
        }
    }

    /// The jobs still doing something, strip order: the states that hold a
    /// lease (`JOB_ACTIVE_STATES` in the schema package).
    var activeJobs: [StudioClient.Job] {
        jobs.filter { ["queued", "running", "awaiting_review"].contains($0.state) }
    }

    /// Terminal jobs, newest first, the list is already sorted that way.
    var recentJobs: [StudioClient.Job] {
        jobs.filter { !["queued", "running", "awaiting_review"].contains($0.state) }
    }

    /* ------------------------------------------------------------------ */
    /* Finder integration, the paths the runner writes under .studio/.    */
    /* ------------------------------------------------------------------ */

    /// The repository root, found the way SidecarManager finds it:
    /// `GNOSIA_REPO` wins, then the walk up from this file's compile-time
    /// path (`apps/macos/Sources/Gnosia` → root is five deletions). The
    /// runner's paths all hang off it (`REPO_ROOT` in paths.ts).
    static func repoRoot() -> URL? {
        if let env = ProcessInfo.processInfo.environment["GNOSIA_REPO"], !env.isEmpty {
            return URL(fileURLWithPath: env)
        }
        var here = URL(fileURLWithPath: #filePath)
        for _ in 0 ..< 5 { here.deleteLastPathComponent() }
        if FileManager.default.fileExists(atPath: here.appending(path: "services/studio").path) {
            return here
        }
        return nil
    }

    /// `<repo>/.studio/<parts>`, `studioHome()`'s default. A runner moved
    /// by `STUDIO_HOME` puts its files elsewhere, which this cannot know;
    /// Reveal is offered only for what is actually there.
    static func studioURL(_ parts: String...) -> URL? {
        guard let root = repoRoot() else { return nil }
        var url = root.appending(path: ".studio")
        for part in parts { url.append(path: part) }
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return url
    }

    /// Reveal `path` in Finder: select the file when it exists, open the
    /// directory otherwise.
    static func reveal(_ url: URL?) {
        guard let url else { return }
        var isDirectory: ObjCBool = false
        if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), !isDirectory.boolValue {
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } else {
            NSWorkspace.shared.open(url)
        }
    }
}
