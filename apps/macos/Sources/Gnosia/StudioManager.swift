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
//  So this type owns the port probe, the five reads the surface draws
//  from — health, diagrams, jobs, videos, drafts — polled on a short
//  loop while the surface is up, and the live half the web gets from
//  `EventSource`: one SSE stream per job still holding its lease, over
//  `GET /api/jobs/{id}/events` (StudioEvents.swift is the client).
//
//  The web's own split is kept (JobsProvider's `connection`): an event
//  moves the screen the moment it lands — the note line and the
//  state/phase patch apply to the polled row, a `done`/`error`/`gate`
//  event re-polls the record at once — while the polled list stays the
//  record. The poll slows to the web's ten-second reconcile cadence
//  while a stream is live and keeps its old four-second cadence
//  otherwise, which is also the fallback when a stream has dropped. A
//  drop reconnects with a doubling backoff, `Last-Event-ID` resuming
//  where the buffer left off, the same contract the browser's
//  EventSource follows.
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

    /* ------------------------------------------------------------------ */
    /* The live half, the web's EventSource streams.                      */
    /* ------------------------------------------------------------------ */

    /// The jobs whose `/events` stream is open right now: an id sits in
    /// here only between the response headers arriving and the stream's
    /// drop, so `isLive` is the honest "am I streaming" answer.
    private(set) var liveJobs: Set<String> = []
    /// The events each job's stream has carried, deduped by seq and kept
    /// in seq order — the web provider's `stream.events`, held per job
    /// rather than only for the watched one.
    private(set) var streamEvents: [String: [StudioJobEvent]] = [:]
    /// The seq each job's next connect resumes from, sent as
    /// `Last-Event-ID`; the runner replays buffer events above it.
    private var lastSeq: [String: Int] = [:]
    /// One reconnect task per job it watches, cancelled when the job
    /// leaves the active set.
    private var streams: [String: Task<Void, Never>] = [:]

    /// The web's `Connection`: nothing to watch is `off`, an open stream
    /// for the watched job is `live`, anything else the polling fallback.
    enum StreamStatus { case off, polling, live }

    /// The job the strip follows — `activeJob` in studio-jobs.ts, the
    /// first row still holding its lease.
    var watching: String? { activeJobs.first?.jobId }

    var streamStatus: StreamStatus {
        guard let watching else { return .off }
        return liveJobs.contains(watching) ? .live : .polling
    }

    /// Whether a job's stream is open right now.
    func isLive(_ jobId: String) -> Bool { liveJobs.contains(jobId) }

    /// The buffered events for a job, oldest first.
    func events(for jobId: String) -> [StudioJobEvent] { streamEvents[jobId] ?? [] }

    /// The newest progress line the stream carried for a job — what the
    /// web's narration list is built from.
    func latestNote(_ jobId: String) -> String? {
        streamEvents[jobId]?.last(where: { $0.note?.isEmpty == false })?.note
    }

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
                // The web's cadence: ten seconds while the stream is live,
                // since it carries the moment and the poll only reconciles;
                // the old four otherwise, which is also the fallback while
                // a stream is down.
                let every: Double = self?.streamStatus == .live ? 10 : 4
                try? await Task.sleep(for: .seconds(every))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
        for (_, task) in streams { task.cancel() }
        streams.removeAll()
        liveJobs.removeAll()
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
            reconcileStreams(activeIds: [])
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
        reconcileStreams(activeIds: Set(activeJobs.map(\.jobId)))
    }

    /* ------------------------------------------------------------------ */
    /* The streams: open per active job, dropped when it leaves.          */
    /* ------------------------------------------------------------------ */

    /// Start a stream task for every job still holding a lease, cancel
    /// the ones whose job left the set. Where the web opens one stream
    /// for `activeJob` plus a second inside a panel watching a different
    /// job, one task per active job covers the same ground — a diagram
    /// and a video can both be live at once.
    private func reconcileStreams(activeIds: Set<String>) {
        for (id, task) in streams where !activeIds.contains(id) {
            task.cancel()
            streams[id] = nil
            liveJobs.remove(id)
        }
        for id in activeIds where streams[id] == nil {
            streams[id] = Task { [weak self] in
                await self?.streamLoop(jobId: id)
            }
        }
    }

    /// One job's connection: connect, mark live, hand events to `ingest`
    /// until the stream ends or the task is cancelled; on a drop, back
    /// off and reconnect resuming from the last seq. The doubling waits
    /// (1s to 30s) reset the moment a connect answers — a stream that
    /// opens is healthy whatever happened before it.
    private func streamLoop(jobId: String) async {
        var backoff: Double = 1
        while !Task.isCancelled {
            do {
                let request = StudioEventStream.request(
                    baseURL: client.baseURL,
                    jobId: jobId,
                    after: lastSeq[jobId] ?? 0
                )
                let stream = try await StudioEventStream.connect(request, session: .shared)
                backoff = 1
                liveJobs.insert(jobId)
                for try await event in stream {
                    ingest(event, jobId: jobId)
                }
            } catch {
                // Dropped, refused, or the runner went away: polling is
                // the record while the loop sleeps and retries.
            }
            liveJobs.remove(jobId)
            guard !Task.isCancelled else { break }
            try? await Task.sleep(for: .seconds(backoff))
            backoff = min(backoff * 2, 30)
        }
    }

    /// One event: remember the resume token, fold it into the job's
    /// buffer, patch the polled row with what it carries, and re-poll
    /// the record on the events that end something — exactly what the
    /// web's `receive` does in JobsProvider.
    private func ingest(_ event: StudioJobEvent, jobId: String) {
        lastSeq[jobId] = max(lastSeq[jobId] ?? 0, event.seq)
        var held = streamEvents[jobId] ?? []
        if !held.contains(where: { $0.seq == event.seq }) {
            held.append(event)
            held.sort { $0.seq < $1.seq }
            if held.count > 200 { held = Array(held.suffix(200)) }
            streamEvents[jobId] = held
        }
        // The live patch: the event's state/phase/note land on the row
        // now; the next poll is the record and wins whatever disagrees.
        if let index = jobs.firstIndex(where: { $0.jobId == jobId }) {
            if let state = event.state { jobs[index].state = state }
            if let phase = event.phase { jobs[index].phase = phase }
            if let note = event.note { jobs[index].note = note }
            if let at = event.at { jobs[index].updated = at }
        }
        if event.terminal {
            // The stream said the job moved; the record says where to.
            Task { await refresh() }
        }
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
