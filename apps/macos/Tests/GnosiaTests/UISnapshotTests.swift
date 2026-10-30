//
//  UISnapshotTests.swift
//  GnosiaTests
//
//  Every main screen drawn to a PNG at 1280x800, light and dark, from
//  fixture data: a look at the app without running it or capturing the
//  screen. apps/macos/scripts/ui-snapshots.mjs builds the fixture (a
//  catalog from seed/, mirrored as the app reads it) and runs this suite;
//  without GNOSIA_SNAPSHOT_FIXTURE it is skipped, so `swift test` stays
//  headless.
//
//  How a screen is drawn: in an NSHostingView inside a window that is
//  never ordered on screen, with the main run loop turned until its
//  `.task` work has landed, then `cacheDisplay` into a bitmap. ImageRenderer
//  is tried on the first screen and written beside it (`home-imagerenderer`)
//  for comparison: it lays the view out once and runs none of its `.task`
//  work, so every screen that reads its data there draws its loading state,
//  and it cannot draw AppKit-backed views (NavigationSplitView's columns,
//  WKWebView, AVPlayerView) at all.
//
//  Nothing reaches a real service: the studio's routes (STUDIO_PORT, set
//  by the script to a port nothing holds) and the sidecar's are answered by
//  `FixtureRoutes` below, and the sidecar manager is one that never spawns.
//  WKWebView bodies (note prose, chat bubbles) draw their plain-text stand-in
//  or nothing when their pages have not painted yet, and a list's selected
//  row (a backdrop material `cacheDisplay` draws as solid black) is redrawn
//  as the plain unemphasized fill a window that is not key shows
//  (`flattenSelections`).
//

import AppKit
import Foundation
import SwiftUI
import Testing
@testable import Gnosia

private let env = ProcessInfo.processInfo.environment

@MainActor
@Suite(.serialized, .enabled(if: env["GNOSIA_SNAPSHOT_FIXTURE"] != nil, "run through apps/macos/scripts/ui-snapshots.mjs"))
struct UISnapshots {
    @Test func everyMainScreen() async throws {
        let out = URL(fileURLWithPath: env["GNOSIA_SNAPSHOT_DIR"] ?? NSTemporaryDirectory())
        try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        let studioPort = try #require(Int(env["STUDIO_PORT"] ?? ""), "STUDIO_PORT names the fixture studio's port")
        #expect(StudioClient.defaultBaseURL().port == studioPort)
        FixtureRoutes.studioPort = studioPort
        URLProtocol.registerClass(FixtureRoutes.self)
        defer { URLProtocol.unregisterClass(FixtureRoutes.self) }
        _ = NSApplication.shared

        let fixture = URL(fileURLWithPath: try #require(env["GNOSIA_SNAPSHOT_FIXTURE"]))
        let store = CatalogStore()
        store.location = CatalogLocation(
            catalogPath: fixture.appending(path: "app-catalog.db").path,
            blobRoot: fixture.appending(path: "home/blobs"),
            learnerPath: fixture.appending(path: "learner.db").path
        )
        store.loadIfNeeded()
        try #require(store.error == nil, "\(store.error ?? "")")
        let learner = LearnerStore(path: fixture.appending(path: "learner.db").path)
        learner.loadIfNeeded()
        let sidecar = SidecarManager(client: SidecarClient(baseURL: URL(string: "http://127.0.0.1:\(FixtureRoutes.sidecarPort)")!))
        let studio = StudioManager()

        let shooter = Shooter(out: out, store: store, learner: learner, sidecar: sidecar, studio: studio)

        // The wait below keys on spinners, so it must be able to see one.
        let probe = NSHostingView(rootView: ProgressView().frame(width: 40, height: 40))
        let probeWindow = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 40, height: 40),
                                   styleMask: [.borderless], backing: .buffered, defer: false)
        probeWindow.isReleasedWhenClosed = false
        probeWindow.contentView = probe
        probe.layoutSubtreeIfNeeded()
        #expect(Shooter.spinning(probe), "a ProgressView is not an NSProgressIndicator here; the wait cannot see spinners")
        probeWindow.close()

        let concept = try #require(store.concept("dot-product"))
        let course = try #require(store.courses.first)
        // The last module, so the module shot is not the course page's own
        // first module again.
        let module = try #require(course.modules.last)

        await shooter.compareImageRenderer("home", HomeView())
        await shooter.shoot("shell-home", RootView(), stack: false)
        await shooter.shoot("home", HomeView())
        await shooter.shoot("learn-map", LearnView(), stack: false)
        await shooter.shoot("library", LibraryView(), stack: false)
        await shooter.shoot("concept-chat", ConceptDetailView(concept: concept).environment(\.tutorChatSeed, Self.thread(answered: true)))
        await shooter.shoot("concept-chat-recall", ConceptDetailView(concept: concept).environment(\.tutorChatSeed, Self.recallThread()))
        await shooter.shoot("concept-chat-choice", ConceptDetailView(concept: concept).environment(\.tutorChatSeed, Self.thread(answered: false)))
        await shooter.shoot("session-sureness", SessionView(slug: concept.slug).environment(\.sessionSeedPick, 0))
        await shooter.shoot("review", ReviewView())
        await shooter.shoot("course", CourseDetailView(course: course))
        await shooter.shoot("module", CourseDetailView(course: course, moduleID: module.id))
        await shooter.shoot("studio-home", StudioView(), stack: false)
        await shooter.shoot("studio-draft", StudioDraftView(draftId: FixtureRoutes.draftId))
        await shooter.shoot("settings", SettingsView().frame(width: 1280, height: 800))

        #expect(shooter.written.count == 2 * 14 + 1, "\(shooter.written)")
    }

    /// A thread whose one tutor turn asks a recall check, live.
    static func recallThread() -> [TutorThreadTurn] {
        let answered = thread(answered: true)
        return [answered[0], answered[3]]
    }

    /// A tutor thread with a choice check and a recall check. `answered`
    /// leaves the choice answered and the recall card live; otherwise the
    /// choice card is the live one.
    static func thread(answered: Bool) -> [TutorThreadTurn] {
        let choice = TutorCardCheck(
            kind: .choice,
            question: "Two unit vectors have a dot product of 0. What is the angle between them?",
            options: ["0 degrees", "45 degrees", "90 degrees", "180 degrees"],
            why: "The dot product of unit vectors is the cosine of the angle between them, and cos 90° is 0.",
            answer: "90 degrees",
            concept: "dot-product"
        )
        let recall = TutorCardCheck(
            kind: .recall,
            question: "In your own words, what does the sign of a dot product tell you?",
            options: [], why: "",
            answer: "Positive means the vectors point broadly the same way, negative broadly opposite, zero perpendicular.",
            concept: "dot-product"
        )
        var turns = [
            TutorThreadTurn(role: "user", content: "How is the dot product related to the angle between two vectors?"),
            TutorThreadTurn(
                role: "assistant",
                content: "The dot product is $a \\cdot b = |a||b|\\cos\\theta$ [1]: it grows as the vectors line up. Let me check that.",
                check: choice, order: [2, 0, 3, 1],
                answer: answered ? TutorCheckAnswer(picked: 2, words: nil, confidence: 70) : nil
            ),
        ]
        if answered {
            turns.append(TutorThreadTurn(role: "user", content: "90 degrees · 70% sure"))
            turns.append(TutorThreadTurn(
                role: "assistant",
                content: "Right: perpendicular vectors have a dot product of zero [1]. One more, in your own words.",
                check: recall
            ))
        }
        return turns
    }
}

/// Draws views into PNGs, light then dark.
@MainActor
private final class Shooter {
    let out: URL
    let store: CatalogStore
    let learner: LearnerStore
    let sidecar: SidecarManager
    let studio: StudioManager
    private(set) var written: [String] = []

    static let size = NSSize(width: 1280, height: 800)

    init(out: URL, store: CatalogStore, learner: LearnerStore, sidecar: SidecarManager, studio: StudioManager) {
        self.out = out
        self.store = store
        self.learner = learner
        self.sidecar = sidecar
        self.studio = studio
    }

    /// `view` with the app's environment, in a NavigationStack with the
    /// shared destinations unless it brings its own navigation.
    private func wrapped(_ view: some View, stack: Bool) -> AnyView {
        let body = stack
            ? AnyView(NavigationStack { view.appDestinations() })
            : AnyView(view)
        // The page ground the shell paints behind every surface (a bare
        // hosting view is transparent, so without it a dark screen's text
        // lands on white).
        return AnyView(
            body
                .frame(width: Self.size.width, height: Self.size.height)
                .background(G.page)
                .environment(store)
                .environment(learner)
                .environment(sidecar)
                .environment(studio)
        )
    }

    func shoot(_ name: String, _ view: some View, stack: Bool = true) async {
        for (suffix, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
            let hosting = NSHostingView(rootView: wrapped(view, stack: stack))
            hosting.frame = NSRect(origin: .zero, size: Self.size)
            let window = NSWindow(
                contentRect: hosting.frame, styleMask: [.borderless],
                backing: .buffered, defer: false
            )
            window.isReleasedWhenClosed = false
            window.appearance = NSAppearance(named: appearance)
            window.contentView = hosting
            // Turn the run loop until the view's `.task` reads (the
            // catalog, the fixture routes, an SVG raster) have landed: at
            // least two seconds, then until no spinner is left (a loading
            // screen, a picture still rasterizing), for at most ten. A
            // screen still spinning then fails the run rather than being
            // saved as if it were finished.
            // Both halves of each turn matter: suspending frees the main
            // actor for the views' own jobs (a fixture reply resuming), and
            // turning the run loop lets AppKit lay out and commit them.
            let started = Date()
            while true {
                try? await Task.sleep(for: .milliseconds(40))
                Self.turnRunLoop()
                hosting.layoutSubtreeIfNeeded()
                let waited = Date().timeIntervalSince(started)
                if waited < 2 { continue }
                if !Self.spinning(hosting) { break }
                if waited > 10 {
                    Issue.record("\(name)-\(suffix) still shows a spinner after ten seconds")
                    break
                }
            }
            Self.flattenSelections(in: hosting)
            hosting.display()
            guard let rep = hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds) else { continue }
            hosting.cacheDisplay(in: hosting.bounds, to: rep)
            write(rep, "\(name)-\(suffix)")
            window.contentView = nil
            window.close()
        }
    }

    /// Whether a progress spinner is still on screen: SwiftUI draws an
    /// indeterminate `ProgressView` with an NSProgressIndicator.
    static func spinning(_ view: NSView) -> Bool {
        // Indeterminate only: a determinate one is a progress bar (Home's
        // course meter), which is finished content.
        if let indicator = view as? NSProgressIndicator, indicator.isIndeterminate,
           !indicator.isHidden, indicator.window != nil { return true }
        return view.subviews.contains(where: spinning)
    }

    /// A list's selected row is an NSVisualEffectView with the `.selection`
    /// material, a backdrop layer that `cacheDisplay` cannot draw: it comes
    /// out as an opaque black block with the row's text lost on it (a sidebar
    /// list in a window that is never key, so the real row is the light
    /// unemphasized grey). Each one is swapped for a plain view filled with
    /// the colour AppKit draws there, so the capture shows what the window
    /// would.
    private static func flattenSelections(in view: NSView) {
        for sub in view.subviews { flattenSelections(in: sub) }
        guard let effect = view as? NSVisualEffectView, effect.material == .selection,
              !effect.isHidden, let parent = effect.superview
        else { return }
        let fill = NSView(frame: effect.frame)
        fill.wantsLayer = true
        fill.layer?.cornerRadius = effect.layer?.cornerRadius ?? 0
        var color = NSColor.unemphasizedSelectedContentBackgroundColor.cgColor
        effect.effectiveAppearance.performAsCurrentDrawingAppearance {
            color = NSColor.unemphasizedSelectedContentBackgroundColor.cgColor
        }
        fill.layer?.backgroundColor = color
        effect.isHidden = true
        parent.addSubview(fill, positioned: .below, relativeTo: effect)
    }

    /// One short turn of the main run loop, outside the async context
    /// `run(until:)` refuses.
    private static func turnRunLoop() {
        RunLoop.main.run(until: Date().addingTimeInterval(0.01))
    }

    /// The same view through ImageRenderer, for the record of what it can
    /// and cannot draw.
    func compareImageRenderer(_ name: String, _ view: some View) async {
        let renderer = ImageRenderer(content: wrapped(view, stack: true).environment(\.colorScheme, .light))
        renderer.proposedSize = ProposedViewSize(Self.size)
        guard let image = renderer.nsImage,
              let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff)
        else { return }
        write(rep, "\(name)-imagerenderer")
    }

    private func write(_ rep: NSBitmapImageRep, _ file: String) {
        guard let png = rep.representation(using: .png, properties: [:]) else { return }
        let url = out.appending(path: "\(file).png")
        if (try? png.write(to: url)) != nil { written.append(file) }
    }
}

/// The studio's and the sidecar's routes, answered from fixtures: a studio
/// with two diagrams, a running and a finished job, and a conversation
/// whose planner drew a picture and offers a video; a sidecar with one
/// provider key and a model chain.
final class FixtureRoutes: URLProtocol {
    nonisolated(unsafe) static var studioPort = 0
    static let sidecarPort = 65232
    static let draftId = "d-fixture-1"

    override class func canInit(with request: URLRequest) -> Bool {
        guard let url = request.url, url.host == "127.0.0.1" else { return false }
        return url.port == studioPort || url.port == sidecarPort
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }
        let (status, body, type) = url.port == Self.sidecarPort ? Self.sidecar(url) : Self.studio(url)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": type])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func json(_ object: Any, status: Int = 200) -> (Int, Data, String) {
        (status, (try? JSONSerialization.data(withJSONObject: object)) ?? Data(), "application/json")
    }

    private static let picture = """
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 220">\
    <rect width="480" height="220" rx="16" fill="#f4efe3"/>\
    <line x1="60" y1="170" x2="420" y2="170" stroke="#15283a" stroke-width="3"/>\
    <line x1="60" y1="170" x2="300" y2="50" stroke="#148285" stroke-width="4"/>\
    <line x1="60" y1="170" x2="380" y2="170" stroke="#b3842c" stroke-width="4"/>\
    <text x="310" y="46" font-family="Helvetica" font-size="18" fill="#15283a">a</text>\
    <text x="388" y="196" font-family="Helvetica" font-size="18" fill="#15283a">b</text>\
    <text x="120" y="160" font-family="Helvetica" font-size="16" fill="#605b54">θ</text>\
    </svg>
    """

    private static func studio(_ url: URL) -> (Int, Data, String) {
        let now = ISO8601DateFormatter().string(from: Date())
        switch url.path {
        case "/api/health":
            return json([
                "ok": true, "tldrawkc": true, "claude": true, "postgres": true, "stale": false,
                "queueDepth": 0, "running": 1, "costLast24h": 0.42,
                "video": ["ok": true, "running": 0, "queueDepth": 0],
                "diagramAgent": ["ok": true], "vocabulary": ["stale": false],
                "dailyCap": ["totalUsd": 0.42, "capUsd": 5.0, "exceeded": false],
            ])
        case "/api/diagrams":
            return json([
                "diagrams": [
                    ["name": "dot-product", "title": "Dot product as projection", "topic": "foundations",
                     "concepts": ["dot-product"], "shapes": 14, "svgState": "fresh", "revision": 3, "created": now],
                    ["name": "self-attention", "title": "Self-attention, one head", "topic": "transformers",
                     "concepts": ["self-attention"], "shapes": 31, "svgState": "stale", "revision": 1, "created": now],
                ],
                "errors": [], "counts": ["total": 2, "withTopic": 2, "unreadable": 0],
            ])
        case let path where path.hasPrefix("/api/diagrams/") && path.hasSuffix("/svg"):
            return (200, Data(picture.utf8), "image/svg+xml")
        case "/api/vocabulary":
            return json(["topics": [
                ["slug": "foundations", "title": "Foundations", "domain": "Maths"],
                ["slug": "transformers", "title": "Transformers", "domain": "Machine learning"],
                ["slug": "agents", "title": "Agents", "domain": "Machine learning"],
            ]])
        case "/api/videos":
            return json(["videos": []])
        case "/api/jobs":
            return json(["jobs": [
                ["jobId": "j-running", "kind": "diagram", "state": "running", "phase": "drawing",
                 "title": "Softmax as a temperature dial", "topic": "transformers", "slug": "softmax",
                 "draftId": draftId, "started": now, "updated": now, "costUsd": 0.12],
                ["jobId": "j-review", "kind": "diagram", "state": "awaiting_review",
                 "title": "Attention weights heat map", "topic": "transformers", "slug": "attention-weights",
                 "started": now, "finished": now, "updated": now, "costUsd": 0.31],
            ]])
        case "/api/drafts":
            return json(["drafts": [
                ["draftId": draftId, "kind": "diagram", "kinds": ["diagram"], "state": "open",
                 "title": "Dot product, drawn", "firstMessage": "Draw the dot product as a projection",
                 "concept": ["slug": "dot-product", "title": "Dot product"], "turns": 2, "costUsd": 0.04, "updated": now],
            ]])
        case "/api/drafts/\(draftId)":
            return json([
                "draftId": draftId, "state": "open", "plannerKinds": ["diagram", "video"],
                "title": "Dot product, drawn", "turns": 2, "turnCap": 40, "costUsd": 0.04, "updated": now,
                "inFlight": false, "trust": [], "estimates": ["video": ["low": 0.74, "high": 1.35, "n": 4]],
                "transcript": [
                    ["seq": 1, "role": "person", "text": "Draw the dot product as a projection of a onto b.", "at": now],
                    ["seq": 2, "role": "planner", "at": now, "costUsd": 0.04,
                     "text": "Here is a first sketch: a, b and the angle between them.\n\n```svg\n\(picture)\n```\n\nA short video would show the projection sliding as the angle changes.",
                     "suggest": ["video"],
                     "pitch": "A 40 second video: the angle sweeps from 0 to 180 degrees and the projection shrinks, flips and grows."],
                ],
            ])
        default:
            return json(["error": "not in the fixture", "code": "NOT_FOUND"], status: 404)
        }
    }

    private static func sidecar(_ url: URL) -> (Int, Data, String) {
        switch url.path {
        case "/api/health":
            return json(["ok": true, "service": "gnosia-sidecar", "owner": "local", "secret": true])
        case "/api/learner/provider-key":
            return json(["ok": true, "reachable": true, "rows": [
                ["id": "anthropic", "label": "Anthropic", "model": "claude-sonnet", "keyUrl": "https://console.anthropic.com",
                 "saved": ["last4": "a1b2", "updatedAt": "2026-10-20T09:00:00.000Z", "readable": true],
                 "server": false, "inUse": "saved"],
                ["id": "openai", "label": "OpenAI", "model": "gpt-6-luna", "server": true, "inUse": "server"],
            ]])
        case "/api/learner/tutor-model":
            return json(["ok": true, "reachable": true, "chain": [
                ["provider": "anthropic", "model": "claude-sonnet"],
                ["provider": "openai", "model": "gpt-6-luna"],
            ]])
        default:
            return json(["error": "The fixture sidecar has no model.", "code": "MISSING_API_KEY"], status: 503)
        }
    }
}
