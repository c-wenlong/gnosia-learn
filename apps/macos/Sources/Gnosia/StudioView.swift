//
//  StudioView.swift
//  Gnosia
//
//  The Studio surface, the native counterpart of `/studio`: the creation
//  composer over the runner's corpus, and the queue's monitor under it.
//
//  What the web page does and what this does:
//
//  - The web's home view is a conversation composer over the corpus, and
//    this matches it now: StudioHome.swift's composer creates the same
//    `POST /api/drafts` conversation the web's does (kind toggles, the
//    harness/model picks, the opener sent as the draft's first turn) and
//    StudioArtifactGrid is the corpus under it — one filtered, grouped
//    and sorted grid of diagrams and studio videos, the jobs making new
//    artifacts leading it and the jobs drawing on tiles riding them.
//  - JobStrip's live cards and the history panel are the Jobs section;
//    progress is the manager's SSE stream per active job, the poll as
//    the record and the fallback, the web's own split.
//  - The grid is the same grid: SVG tiles rasterized from
//    `/api/diagrams/{name}/svg`, topic chips, the unreadable banner.
//  - Tile and job detail screens carry the verbs the panels carry: export,
//    verify, inspect, commit for a diagram; cancel, accept, discard,
//    recompare, resume, revise for a job; messages, draw and abandon for a
//    conversation. The canvas itself still opens in the browser, since a
//    mirror is a `canvas serve` page rather than something the runner
//    renders.
//  - Settings (agent effort, BYOK keys) and the @ mention menu are the
//    gaps; the runner applies its own defaults and plain "@diagram" text
//    tags.
//

import AppKit
import SwiftUI

/// A pushed destination inside the studio surface. `AppDestination` handles
/// the library's rows; these are the runner's own three.
enum StudioPick: Hashable {
    case job(String)
    case diagram(String)
    case draft(String)
}

/// Pushes a `StudioPick` onto the surface's navigation path, so a detail
/// view can send the user sideways (a draft's Draw to its job).
private struct StudioPushKey: EnvironmentKey {
    /// The default never escapes the main actor: a closure pushed here is
    /// always the surface's own `path.append`.
    nonisolated(unsafe) static let defaultValue: (StudioPick) -> Void = { _ in }
}

extension EnvironmentValues {
    var studioPush: (StudioPick) -> Void {
        get { self[StudioPushKey.self] }
        set { self[StudioPushKey.self] = newValue }
    }
}

struct StudioView: View {
    @State private var studio = StudioManager()
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(G.page)
                .navigationTitle("Studio")
                .navigationDestination(for: StudioPick.self) { pick in
                    switch pick {
                    case .job(let id): StudioJobView(jobId: id)
                    case .diagram(let name): StudioDiagramView(name: name)
                    case .draft(let id): StudioDraftView(draftId: id)
                    }
                }
                .appDestinations()
                .toolbar {
                    ToolbarItemGroup(placement: .primaryAction) {
                        if studio.status == .up, let at = studio.refreshedAt {
                            Text("as of \(at, style: .time)")
                                .font(.caption)
                                .foregroundStyle(G.text3)
                                .fixedSize()
                        }
                        Button {
                            Task { await studio.refresh() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .help("Refresh")
                    }
                }
        }
        .environment(studio)
        .environment(\.studioPush) { pick in path.append(pick) }
        .onAppear { studio.start() }
        .onDisappear { studio.stop() }
    }

    @ViewBuilder
    private var content: some View {
        switch studio.status {
        case .off, .probing:
            VStack(spacing: 12) {
                ProgressView()
                Text("Contacting the studio…")
                    .font(.callout)
                    .foregroundStyle(G.text2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .down(let why):
            StudioBlockedCard(
                title: "The studio runner is not answering",
                lead: why,
                lines: [],
                commands: ["npm run studio", "# from the repository root"],
                retry: { Task { await studio.refresh() } },
                launch: { studio.launch() },
                launching: studio.launching,
                launchNote: studio.launchNote
            )
        case .up:
            monitor
        }
    }

    /// The whole surface once health answers. A failed tldrawkc doctor
    /// replaces it, the way U4 replaces the web screen: a grid whose verbs
    /// all 503 is worse than a page that says what is wrong.
    @ViewBuilder
    private var monitor: some View {
        if studio.health?.tldrawkc == false {
            StudioBlockedCard(
                title: "tldrawkc cannot run on this machine",
                lead: "Every verb the studio drives launches this tool, so nothing here would work. doctor says:",
                lines: studio.health?.checks ?? [],
                commands: [
                    "git submodule update --init tools/tldrawkc",
                    "(cd tools/tldrawkc && npm ci && npm run build)",
                ],
                retry: { Task { await studio.refresh() } }
            )
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    // The web's own order: the composer first, the corpus
                    // under it, the queue and the conversations below.
                    StudioHomeComposer()
                    statusCard
                    banners
                    StudioArtifactGrid()
                    jobsSection
                    conversationsSection
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 20)
            }
        }
    }

    /// The health line the page reads from `/api/health`: note, queue and
    /// spend in the rolling window, with the cap beside it.
    private var statusCard: some View {
        HStack(spacing: 10) {
            Image(systemName: "wand.and.stars")
                .font(.title3)
                .foregroundStyle(G.accentText)
            VStack(alignment: .leading, spacing: 2) {
                Text(studio.health?.note ?? "everything is answering")
                    .font(.callout)
                    .foregroundStyle(G.text)
                Text(statusLine)
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
    }

    private var statusLine: String {
        guard let health = studio.health else { return "" }
        var parts: [String] = []
        parts.append("\(health.running ?? 0) running")
        parts.append("\(health.queueDepth ?? 0) queued")
        if let planner = health.plannerTurnsInFlight, planner > 0 {
            parts.append("\(planner) planner turn\(planner == 1 ? "" : "s") in flight")
        }
        if let spend = health.costLast24h {
            parts.append("$\(String(format: "%.2f", spend)) in the last 24h")
        }
        if let cap = health.dailyCap?.capUsd {
            parts.append("cap $\(String(format: "%.2f", cap))")
        }
        if studio.streamStatus == .live {
            parts.append("live")
        }
        return parts.joined(separator: " · ")
    }

    /// The banners the page shows rather than a blocked screen: catalog
    /// down, stale bundle, stale vocabulary, cap reached, unreadable rows,
    /// video runner not ready, diagram jobs that cannot be queued.
    @ViewBuilder
    private var banners: some View {
        if let health = studio.health {
            if health.postgres == false {
                StudioBanner(
                    text: "Not connected to the catalog: browsing and drawing still work, and Accept waits for it, since a diagram lands in the database."
                        + (studio.listing?.stale == true && studio.listing?.readAt != nil
                            ? " This list is the copy read at \(StudioTime.stamp(studio.listing?.readAt))."
                            : ""),
                    tone: .warn
                )
            }
            if health.stale {
                StudioBanner(
                    text: "The tldrawkc page bundle is older than its source. Everything still runs; rebuild with (cd tools/tldrawkc && npm run build) when convenient.",
                    tone: .warn
                )
            }
            if health.vocabulary?.stale == true {
                StudioBanner(
                    text: health.vocabulary?.readAt != nil
                        ? "The topic list is the copy saved at \(StudioTime.stamp(health.vocabulary?.readAt)); the catalog could not be read."
                        : "The topic list could not be read and there is no saved copy, so briefs cannot be checked.",
                    tone: .warn
                )
            }
            if health.dailyCap?.exceeded == true {
                StudioBanner(text: "The daily spend cap is reached, so new jobs are refused until some of it ages out.", tone: .warn)
            }
            if health.diagramAgent?.ok == false, let problem = health.diagramAgent?.problem {
                StudioBanner(text: "Browsing, the canvas and commits work, but no diagram job can be queued: \(problem)", tone: .warn)
            }
            if health.video?.ok == false, let note = health.video?.note {
                StudioBanner(text: "Video is not ready: \(note)", tone: .quiet)
            }
            if let errors = studio.listing?.errors, !errors.isEmpty {
                StudioBanner(
                    text: "\(errors.count) diagram\(errors.count == 1 ? "" : "s") could not be read and \(errors.count == 1 ? "is" : "are") not in the grid: "
                        + errors.map { "\($0.name) (\($0.message))" }.joined(separator: "; "),
                    tone: .danger
                )
            }
            if let listingError = studio.listingError ?? studio.listing?.error {
                StudioBanner(text: "The diagram list could not be read: \(listingError)", tone: .danger)
            }
        }
    }

    // MARK: - Jobs

    /// JobStrip plus the history panel: live states as cards over the sheet,
    /// then the finished ones as a list, newest first.
    private var jobsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHead(
                title: "Jobs",
                count: studio.jobs.count,
                tail: studio.jobs.isEmpty ? nil : "\(studio.activeJobs.count) live"
            )
            if studio.jobs.isEmpty {
                Text("No jobs yet. A diagram or video lands here once a conversation presses Draw.")
                    .font(.callout)
                    .foregroundStyle(G.text3)
            } else {
                if !studio.activeJobs.isEmpty {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 300, maximum: 440), spacing: 12)], spacing: 12) {
                        ForEach(studio.activeJobs) { job in
                            JobCard(job: job)
                        }
                    }
                }
                if !studio.recentJobs.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(studio.recentJobs.prefix(12).enumerated()), id: \.element.id) { index, job in
                            if index > 0 { Divider().overlay(G.hair).padding(.leading, 12) }
                            JobRow(job: job)
                        }
                    }
                    .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                }
            }
        }
    }

    // MARK: - Conversations

    /// The planner conversations, the web sidebar's own list. "New" is the
    /// home composer's least action: a blank draft, pushed open.
    private var conversationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionHead(title: "Conversations", count: studio.drafts.count, tail: nil)
                Spacer()
                Button {
                    Task {
                        if let id = try? await studio.client.createDraft(harness: studio.harness) {
                            path.append(StudioPick.draft(id))
                        }
                    }
                } label: {
                    Label("New", systemImage: "square.and.pencil")
                        .font(.callout)
                }
                .buttonStyle(.plain)
                .foregroundStyle(G.accentText)
            }
            if studio.drafts.isEmpty {
                Text("No conversations yet. New opens one; talk an idea through, tag @diagram or @video, then Draw.")
                    .font(.callout)
                    .foregroundStyle(G.text3)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(studio.drafts.prefix(20).enumerated()), id: \.element.id) { index, draft in
                        if index > 0 { Divider().overlay(G.hair).padding(.leading, 12) }
                        NavigationLink(value: StudioPick.draft(draft.draftId)) {
                            DraftRow(draft: draft)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
            }
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Shared chrome                                                              */
/* -------------------------------------------------------------------------- */

/// The section header line: name, count, a trailing stat.
struct SectionHead: View {
    let title: String
    let count: Int
    var tail: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.callout.weight(.medium))
                .foregroundStyle(G.text2)
            Text("\(count)")
                .font(.caption.weight(.medium))
                .foregroundStyle(G.text3)
            if let tail {
                Text(tail)
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
        }
    }
}

/// The filter chip: plain when idle, the brand button's face when on.
struct Chip: View {
    let label: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption)
                .foregroundStyle(on ? G.btnText : G.text2)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(on ? G.btnFace : G.surface2, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// A job state's pill: the letter's colour is the state it names.
struct StatePill: View {
    let state: String

    private var color: Color {
        switch state {
        case "queued": return G.text3
        case "running": return G.accent
        case "awaiting_review": return G.streak
        case "accepted": return G.okText
        case "failed": return G.danger
        case "interrupted": return G.warnText
        default: return G.text3
        }
    }

    var body: some View {
        Text(state.replacingOccurrences(of: "_", with: " "))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color == G.streak ? G.streakText : color)
            .padding(.horizontal, 8)
            .padding(.vertical, 2.5)
            .background(color.opacity(0.14), in: Capsule())
    }
}

/// The notice banner: quiet, warn, or danger, one message.
struct StudioBanner: View {
    enum Tone { case quiet, warn, danger }
    let text: String
    var tone: Tone = .quiet

    private var tint: Color {
        switch tone {
        case .quiet: return G.surface2
        case .warn: return G.streak.opacity(0.14)
        case .danger: return G.danger.opacity(0.12)
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if tone != .quiet {
                Image(systemName: tone == .danger ? "exclamationmark.octagon" : "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(tone == .danger ? G.danger : G.streakText)
            }
            Text(text)
                .font(.callout)
                .foregroundStyle(G.text2)
                .textSelection(.enabled)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(tint, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(tone == .quiet ? G.border : .clear))
    }
}

/// The blocked card, the web `BlockedCard`'s shape: a title, a lead, the
/// doctor's lines, the commands, a retry. `launch` shows the detached
/// `npm run studio` starter; nil on the doctor card, which no launch fixes.
struct StudioBlockedCard: View {
    let title: String
    let lead: String
    let lines: [StudioClient.DoctorCheck]
    let commands: [String]
    let retry: () -> Void
    var launch: (() -> Void)? = nil
    var launching = false
    var launchNote: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label(title, systemImage: "wand.and.stars")
                .font(.system(.title2, design: .serif, weight: .bold))
                .foregroundStyle(G.text)
            Text(lead)
                .font(.callout)
                .foregroundStyle(G.text2)
            if !lines.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(lines) { line in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: line.status == "pass" ? "checkmark.circle" : (line.status == "warn" ? "exclamationmark.triangle" : "xmark.circle"))
                                .foregroundStyle(line.status == "pass" ? G.okText : (line.status == "warn" ? G.warnText : G.danger))
                            Text("\(line.name): \(line.detail ?? line.status)")
                                .font(.callout)
                                .foregroundStyle(G.text2)
                        }
                    }
                }
            }
            if !commands.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(commands, id: \.self) { command in
                        Text(command)
                            .font(.callout.monospaced())
                            .foregroundStyle(G.text)
                            .textSelection(.enabled)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(G.surface2, in: RoundedRectangle(cornerRadius: 8))
            }
            HStack(spacing: 10) {
                Button("Try again", action: retry)
                    .buttonStyle(.borderedProminent)
                    .tint(G.btnFace)
                if let launch {
                    Button {
                        launch()
                    } label: {
                        if launching {
                            HStack(spacing: 6) {
                                ProgressView()
                                    .controlSize(.small)
                                Text("Starting the runner…")
                            }
                        } else {
                            Text("Launch studio")
                        }
                    }
                    .disabled(launching)
                }
            }
            if launching {
                Text("Detached — it keeps running after Gnosia quits. The first minute runs checks before it answers.")
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
            if let launchNote, !launching {
                Text(launchNote)
                    .font(.caption)
                    .foregroundStyle(G.danger)
            }
        }
        .padding(28)
        .frame(maxWidth: 560, alignment: .leading)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(G.border))
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}

/// One label/value line in a meta card. Values are selectable; the runner's
/// numbers are the point of the screen.
struct MetaRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(label)
                .font(.caption)
                .foregroundStyle(G.text3)
                .frame(width: 110, alignment: .trailing)
            Text(value)
                .font(.callout)
                .foregroundStyle(G.text)
                .textSelection(.enabled)
            Spacer()
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Rows and tiles                                                             */
/* -------------------------------------------------------------------------- */

/// A live job's card in the strip grid.
struct JobCard: View {
    @Environment(StudioManager.self) private var studio
    let job: StudioClient.Job

    var body: some View {
        NavigationLink(value: StudioPick.job(job.jobId)) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    StatePill(state: job.state)
                    Text(job.jobKind)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(G.text2)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2.5)
                        .background(G.surface2, in: Capsule())
                    Spacer()
                    if let cost = job.costUsd {
                        Text("$\(String(format: "%.2f", cost))")
                            .font(.caption)
                            .foregroundStyle(G.text3)
                    }
                }
                Text(job.title ?? job.targetSlug ?? job.jobId)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.text)
                    .lineLimit(2)
                if let note = studio.latestNote(job.jobId) {
                    // The stream's progress line — the web strip's
                    // narration — with the dot saying it is arriving live.
                    HStack(alignment: .top, spacing: 6) {
                        Circle()
                            .fill(studio.isLive(job.jobId) ? G.ok : G.text3)
                            .frame(width: 6, height: 6)
                            .padding(.top, 3)
                        Text(note)
                            .font(.caption)
                            .foregroundStyle(G.text2)
                            .lineLimit(2)
                    }
                }
                Text(cardTail)
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
        }
        .buttonStyle(.plain)
    }

    private var cardTail: String {
        var parts: [String] = []
        if let phase = job.phase, job.state == "running" { parts.append(phase.replacingOccurrences(of: "_", with: " ")) }
        if let attempt = job.attempt, attempt > 1 { parts.append("attempt \(attempt)") }
        if let turns = job.turns { parts.append("\(turns) turns") }
        parts.append(StudioTime.ago(job.updated ?? job.requested))
        return parts.joined(separator: " · ")
    }
}

/// A finished job's one-line row in the history list.
struct JobRow: View {
    let job: StudioClient.Job

    var body: some View {
        NavigationLink(value: StudioPick.job(job.jobId)) {
            HStack(spacing: 10) {
                StatePill(state: job.state)
                Text(job.jobKind)
                    .font(.caption)
                    .foregroundStyle(G.text3)
                Text(job.title ?? job.targetSlug ?? job.jobId)
                    .font(.callout)
                    .foregroundStyle(G.text)
                    .lineLimit(1)
                Spacer()
                if let cost = job.costUsd {
                    Text("$\(String(format: "%.2f", cost))\(job.costSource == "stream" ? " est." : "")")
                        .font(.caption)
                        .foregroundStyle(G.text3)
                }
                Text(StudioTime.ago(job.finished ?? job.updated))
                    .font(.caption)
                    .foregroundStyle(G.text3)
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(G.text3)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A diagram tile: the stored SVG rasterized, the title, the topic and the
/// freshness chips the web tile carries.
struct DiagramTile: View {
    @Environment(StudioManager.self) private var studio
    let diagram: StudioClient.Diagram

    @State private var image: NSImage?
    @State private var noSvg = false

    var body: some View {
        NavigationLink(value: StudioPick.diagram(diagram.name)) {
            VStack(alignment: .leading, spacing: 8) {
                ZStack {
                    if let image {
                        Image(nsImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    } else if noSvg {
                        Image(systemName: "square.dashed")
                            .font(.title2)
                            .foregroundStyle(G.text3)
                    } else {
                        ProgressView().controlSize(.small)
                    }
                }
                .frame(maxWidth: .infinity)
                .aspectRatio(480.0 / 340.0, contentMode: .fit)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border))

                Text(diagram.title ?? diagram.name)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.text)
                    .lineLimit(2)

                HStack(spacing: 6) {
                    if let topic = diagram.topic {
                        Text(studio.topics[topic] ?? topic)
                            .font(.caption2)
                            .foregroundStyle(G.text2)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(G.surface2, in: Capsule())
                    }
                    if diagram.svgState == "stale" {
                        Text("stale svg")
                            .font(.caption2)
                            .foregroundStyle(G.warnText)
                    } else if diagram.svgState == "missing" {
                        Text("no svg")
                            .font(.caption2)
                            .foregroundStyle(G.text3)
                    }
                    Spacer()
                    if let shapes = diagram.shapes {
                        Text("\(shapes)")
                            .font(.caption2)
                            .foregroundStyle(G.text3)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .task(id: diagram.name) {
            do {
                let svg = try await studio.client.diagramSvg(diagram.name)
                image = await SvgRasterizer.shared.image(for: svg, size: .tile)
                noSvg = image == nil
            } catch {
                noSvg = true
            }
        }
    }
}

/// A landed studio video's row.
struct VideoRow: View {
    let video: StudioClient.StudioVideo

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "play.rectangle")
                .font(.title3)
                .foregroundStyle(G.accentText)
                .frame(width: 30)
            VStack(alignment: .leading, spacing: 3) {
                Text(video.title ?? video.slug)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.text)
                    .lineLimit(1)
                Text(video.slug)
                    .font(.caption.monospaced())
                    .foregroundStyle(G.text3)
            }
            Spacer()
            if video.narrated == true {
                Image(systemName: "waveform")
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
            if let seconds = video.durationSeconds {
                Text(String(format: "%d:%02d", Int(seconds) / 60, Int(seconds) % 60))
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
            Text(StudioTime.ago(video.updated))
                .font(.caption)
                .foregroundStyle(G.text3)
            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(G.text3)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }
}

/// A conversation's row: its name or title, the state, and the kinds it can
/// make.
struct DraftRow: View {
    let draft: StudioClient.DraftSummary

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.callout)
                .foregroundStyle(G.accentText)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text(draft.name ?? draft.title ?? draft.firstMessage ?? draft.concept?.title ?? "(untitled)")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.text)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(draft.state)
                        .font(.caption)
                        .foregroundStyle(draft.state == "abandoned" ? G.text3 : G.accentText)
                    ForEach(draft.kinds ?? [], id: \.self) { kind in
                        Text(kind)
                            .font(.caption2)
                            .foregroundStyle(G.text2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1.5)
                            .background(G.surface2, in: Capsule())
                    }
                    if let turns = draft.turns {
                        Text("\(turns) turns")
                            .font(.caption)
                            .foregroundStyle(G.text3)
                    }
                }
            }
            Spacer()
            if let cost = draft.costUsd {
                Text("$\(String(format: "%.2f", cost))")
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
            Text(StudioTime.ago(draft.updated))
                .font(.caption)
                .foregroundStyle(G.text3)
            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(G.text3)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }
}
