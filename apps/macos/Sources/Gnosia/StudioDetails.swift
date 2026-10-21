//
//  StudioDetails.swift
//  Gnosia
//
//  The studio surface's three detail screens: one job, one diagram, one
//  planner conversation. Each is a view over the runner's routes, nothing
//  reaches a file or a process directly.
//
//  Job detail carries the job panel's whole content: the runner-computed
//  comparison (before and after PNGs, inspect counts), the log tail, the
//  state-appropriate verbs, and for a video job the scene sheets plus the
//  candidate mp4 the media route streams.
//
//  Diagram detail is the inspector: the stored SVG's preview, the checkout
//  state, the canvas verbs (export, verify, inspect, commit), the mirror's
//  Open canvas, and the jobs that drew on it.
//
//  Draft detail is the conversation: the transcript, the live brief cards'
//  Draw buttons, the composer that sends a person turn, and abandon.
//

import AppKit
import SwiftUI

/// `@diagram`/`@video` tags in a message, as the runner's `{kind,start,end}`
/// triples. Positions are UTF-16 offsets, the units the Node side counts in.
func draftMentions(_ text: String) -> [[String: Any]] {
    var mentions: [[String: Any]] = []
    for kind in ["diagram", "video"] {
        let needle = "@\(kind)"
        var search = text.startIndex
        outer: while let range = text.range(of: needle, range: search ..< text.endIndex) {
            // A tag is a token: the character after it is not a letter or digit.
            if range.upperBound < text.endIndex, text[range.upperBound].isLetter || (range.upperBound < text.endIndex && text[range.upperBound].isNumber) {
                search = range.upperBound
                continue
            }
            let start = text.utf16.distance(from: text.utf16.startIndex, to: range.lowerBound)
            let end = text.utf16.distance(from: text.utf16.startIndex, to: range.upperBound)
            mentions.append(["kind": kind, "start": start, "end": end])
            break outer
        }
    }
    return mentions
}

/* -------------------------------------------------------------------------- */
/* Job detail                                                                 */
/* -------------------------------------------------------------------------- */

struct StudioJobView: View {
    @Environment(StudioManager.self) private var studio
    @Environment(\.studioPush) private var push
    let jobId: String

    @State private var job: StudioClient.Job?
    @State private var error: String?
    @State private var outcome: String?
    @State private var outcomeBad = false
    @State private var logLines: [String] = []
    @State private var logNext = 0
    @State private var before: NSImage?
    @State private var after: NSImage?
    @State private var live: NSImage?
    @State private var shotsTried = false
    @State private var sheets: [StudioClient.Sheet] = []
    @State private var sheetImages: [String: NSImage] = [:]
    @State private var mediaReady: Bool?
    @State private var seek: Double?
    @State private var changes = ""
    @State private var busy = false
    @State private var confirmAction: Confirm?

    private enum Confirm: Identifiable {
        case cancel, accept, discard
        var id: Int { switch self { case .cancel: return 0; case .accept: return 1; case .discard: return 2 } }
    }

    private var active: Bool {
        ["queued", "running", "awaiting_review"].contains(job?.state ?? "")
    }

    var body: some View {
        ScrollView {
            if let job {
                loaded(job).padding(24)
            } else if let error {
                ContentUnavailableView("Job unavailable", systemImage: "questionmark.circle", description: Text(error))
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(G.page)
        .navigationTitle(job?.title ?? "Job \(jobId)")
        .task {
            while !Task.isCancelled {
                await loadOnce()
                try? await Task.sleep(for: .seconds(3))
            }
        }
        .confirmationDialog(
            "Are you sure?",
            isPresented: Binding(get: { confirmAction != nil }, set: { if !$0 { confirmAction = nil } })
        ) {
            switch confirmAction {
            case .cancel: Button("Cancel the job", role: .destructive) { act("Cancel") { try await studio.client.jobAction(jobId, "cancel") } }
            case .accept: Button("Accept the candidate") { act("Accept") { try await studio.client.jobAction(jobId, "accept") } }
            case .discard: Button("Discard the candidate", role: .destructive) { act("Discard") { try await studio.client.jobAction(jobId, "discard") } }
            case nil: EmptyView()
            }
        } message: {
            switch confirmAction {
            case .cancel: Text("Stop this job. Attempts it already spent are still counted.")
            case .accept: Text("Land the candidate: the diagram's rows and the job record update.")
            case .discard: Text("Throw the candidate away. The diagram keeps what it had.")
            case nil: EmptyView()
            }
        }
    }

    @ViewBuilder
    private func loaded(_ job: StudioClient.Job) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            header(job)
            if let outcome {
                StudioBanner(text: outcome, tone: outcomeBad ? .danger : .quiet)
            }
            actions(job)
            if let draftId = job.draftId {
                Button { push(.draft(draftId)) } label: {
                    Label("The conversation that asked for it", systemImage: "bubble.left.and.bubble.right")
                        .font(.callout)
                }
                .buttonStyle(.plain)
                .foregroundStyle(G.accentText)
            }
            artifacts(job)
            logCard
            meta(job)
        }
        .frame(maxWidth: 900, alignment: .leading)
    }

    private func header(_ job: StudioClient.Job) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                StatePill(state: job.state)
                Text(job.jobKind)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(G.text2)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2.5)
                    .background(G.surface2, in: Capsule())
                if job.error != nil, job.state == "running" {
                    Text("with an error on record")
                        .font(.caption2)
                        .foregroundStyle(G.warnText)
                }
            }
            Text(job.title ?? job.targetSlug ?? job.jobId)
                .font(.system(.title, design: .serif, weight: .bold))
                .foregroundStyle(G.text)
            Text(job.target ?? job.slug ?? job.jobId)
                .font(.callout.monospaced())
                .foregroundStyle(G.text3)
                .textSelection(.enabled)
        }
    }

    /// The verbs this state can take. They are the runner's own rules:
    /// cancel while live, accept or discard in review, resume only on an
    /// interruption, and a revise once there is a verdict to answer.
    @ViewBuilder
    private func actions(_ job: StudioClient.Job) -> some View {
        HStack(spacing: 10) {
            switch job.state {
            case "queued", "running":
                Button("Cancel") { confirmAction = .cancel }.disabled(busy)
            case "awaiting_review":
                Button("Accept") { confirmAction = .accept }
                    .buttonStyle(.borderedProminent)
                    .tint(G.btnFace)
                    .disabled(busy)
                Button("Discard") { confirmAction = .discard }.disabled(busy)
                if job.jobKind == "video" {
                    reviseField(job)
                } else {
                    Button("Compare again") { act("Compare") { try await studio.client.jobAction(jobId, "compare") } }
                        .disabled(busy)
                }
            case "interrupted":
                Button("Resume") { act("Resume") { try await studio.client.jobAction(jobId, "resume") } }
                    .buttonStyle(.borderedProminent)
                    .tint(G.btnFace)
                    .disabled(busy)
            default:
                reviseField(job)
            }
            Spacer()
            if let dir = StudioManager.studioURL("jobs", jobId) {
                Button { StudioManager.reveal(dir) } label: {
                    Label("Reveal in Finder", systemImage: "folder")
                }
                .buttonStyle(.plain)
                .foregroundStyle(G.accentText)
            }
            if busy { ProgressView().controlSize(.small) }
        }
    }

    /// The revise field: `changes` is the change request the new job's notes
    /// carry. On a terminal job it replaces the button row's empty half.
    private func reviseField(_ job: StudioClient.Job) -> some View {
        HStack(spacing: 8) {
            TextField("Change request for a re-draw", text: $changes)
                .textFieldStyle(.plain)
                .font(.callout)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .frame(maxWidth: 300)
                .background(G.surface, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border))
                .onSubmit { submitRevise(job) }
            Button("Revise") { submitRevise(job) }
                .disabled(busy || changes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private func submitRevise(_ job: StudioClient.Job) {
        let text = changes.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        act("Revise") { try await studio.client.reviseJob(jobId, changes: text) }
        changes = ""
    }

    /// The pictures and the render, by kind: a diagram's before/after pair
    /// and live shot, a video job's sheets and its playable candidate.
    @ViewBuilder
    private func artifacts(_ job: StudioClient.Job) -> some View {
        if job.jobKind == "video" {
            if mediaReady == true, let slug = job.slug {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Candidate")
                        .font(.callout.weight(.medium))
                        .foregroundStyle(G.text2)
                    PlayerView(url: studio.client.mediaURL(jobId: jobId, name: "\(slug).mp4"), seekTo: $seek)
                        .aspectRatio(16.0 / 9.0, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            if !sheets.isEmpty {
                SheetGrid(sheets: sheets, images: sheetImages)
            }
        } else if job.state == "running", let live {
            VStack(alignment: .leading, spacing: 8) {
                Text("What the agent last saw")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.text2)
                Image(nsImage: live)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
            }
        } else if job.comparison != nil || before != nil || after != nil {
            comparisonCard(job)
        }
    }

    /// The review's before/after: the runner computed the counts once, and
    /// the two PNGs are what a person looks at beside them.
    private func comparisonCard(_ job: StudioClient.Job) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("The comparison")
                .font(.callout.weight(.medium))
                .foregroundStyle(G.text2)
            HStack(alignment: .top, spacing: 14) {
                shotPane("Before", image: before, empty: job.brief?.mode == "new" ? "No before: this is a first drawing" : "No picture on record")
                shotPane("After", image: after, empty: "No picture on record")
            }
            if let comparison = job.comparison {
                HStack(spacing: 16) {
                    countLine("shapes", comparison.before?.shapes, comparison.after?.shapes)
                    countLine("lints", comparison.before?.lints?.count, comparison.after?.lints?.count)
                    if let added = comparison.added, !added.isEmpty {
                        Text("+\(added.count) lint\(added.count == 1 ? "" : "s") added")
                            .font(.caption)
                            .foregroundStyle(G.warnText)
                    }
                    if let fixed = comparison.fixed, !fixed.isEmpty {
                        Text("\(fixed.count) fixed")
                            .font(.caption)
                            .foregroundStyle(G.okText)
                    }
                }
            }
        }
    }

    private func shotPane(_ label: String, image: NSImage?, empty: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.caption.weight(.medium)).foregroundStyle(G.text3)
            if let image {
                Image(nsImage: image).resizable().aspectRatio(contentMode: .fit)
            } else {
                Text(empty)
                    .font(.caption)
                    .foregroundStyle(G.text3)
                    .frame(maxWidth: .infinity, minHeight: 120)
                    .background(G.surface2, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func countLine(_ label: String, _ before: Int?, _ after: Int?) -> some View {
        HStack(spacing: 4) {
            Text(label).font(.caption).foregroundStyle(G.text3)
            Text("\(before.map(String.init) ?? "—") → \(after.map(String.init) ?? "—")")
                .font(.caption.monospaced())
                .foregroundStyle(G.text)
        }
    }

    /// The session log's tail, kept between polls by the `from` cursor.
    private var logCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Log")
                .font(.callout.weight(.medium))
                .foregroundStyle(G.text2)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 3) {
                    ForEach(Array(logLines.suffix(300).enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.caption.monospaced())
                            .foregroundStyle(G.text2)
                            .textSelection(.enabled)
                    }
                    if logLines.isEmpty {
                        Text("Nothing on the log yet.")
                            .font(.caption)
                            .foregroundStyle(G.text3)
                    }
                }
                .padding(10)
            }
            .frame(maxHeight: 260)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
        }
    }

    /// The job's whole record, one row a line. The runner's own `note` says
    /// where it stands in a sentence.
    private func meta(_ job: StudioClient.Job) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Record")
                .font(.callout.weight(.medium))
                .foregroundStyle(G.text2)
            VStack(alignment: .leading, spacing: 5) {
                if let note = job.note { MetaRow(label: "note", value: note) }
                if let phase = job.phase { MetaRow(label: "phase", value: phase) }
                if let target = job.target { MetaRow(label: "target", value: target) }
                if let candidate = job.candidate { MetaRow(label: "candidate", value: candidate) }
                if let slug = job.slug { MetaRow(label: "slug", value: slug) }
                if let topic = job.topic { MetaRow(label: "topic", value: studio.topics[topic] ?? topic) }
                if let mode = job.brief?.mode { MetaRow(label: "mode", value: mode) }
                if let parent = job.parentJob { MetaRow(label: "parent job", value: parent) }
                if let attempt = job.attempt { MetaRow(label: "attempt", value: "\(attempt)") }
                if let turns = job.turns { MetaRow(label: "turns", value: "\(turns)") }
                if let cost = job.costUsd {
                    MetaRow(label: "cost", value: "$\(String(format: "%.2f", cost))\(job.costSource == "stream" ? " (estimate)" : "")")
                }
                if let model = job.resolvedModel ?? job.agentModel?.requested ?? job.agentModel?.passed {
                    MetaRow(label: "model", value: model)
                }
                if let auth = job.agentAuth { MetaRow(label: "agent auth", value: auth) }
                if let exit = job.exitCode { MetaRow(label: "exit code", value: "\(exit)") }
                if let gate = job.gate { MetaRow(label: "gate", value: gate.describe) }
                if let error = job.error {
                    MetaRow(label: "error", value: job.errorKind.map { "\(error) [\($0)]" } ?? error)
                }
                MetaRow(label: "requested", value: StudioTime.stamp(job.requested))
                MetaRow(label: "started", value: StudioTime.stamp(job.started))
                MetaRow(label: "finished", value: StudioTime.stamp(job.finished))
                MetaRow(label: "updated", value: StudioTime.stamp(job.updated))
                if let indexed = job.indexed { MetaRow(label: "indexed", value: indexed ? "yes" : "no") }
                if let written = job.written, !written.isEmpty { MetaRow(label: "written", value: written.joined(separator: ", ")) }
                if let files = job.files, !files.isEmpty { MetaRow(label: "files", value: files.joined(separator: ", ")) }
                if let errors = job.catalogErrors, !errors.isEmpty {
                    MetaRow(label: "catalog errors", value: errors.map(\.describe).joined(separator: "; "))
                }
            }
            .padding(14)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
        }
    }

    /* ------------------------------------------------------------------ */

    /// One poll: the job itself, then whatever its state asks for (a live
    /// picture while it draws, sheets and the candidate for a video), and
    /// always the log's next lines.
    private func loadOnce() async {
        do {
            let j = try await studio.client.job(jobId)
            job = j
            error = nil
            if j.jobKind == "video" {
                await loadVideo(j)
            } else if j.state == "running" {
                live = (try? await studio.client.shot(jobId, which: "live")).flatMap { NSImage(data: $0) }
            } else if !shotsTried {
                shotsTried = true
                async let b = try? studio.client.shot(jobId, which: "before")
                async let a = try? studio.client.shot(jobId, which: "after")
                let (bd, ad) = await (b, a)
                before = bd.flatMap { NSImage(data: $0) }
                after = ad.flatMap { NSImage(data: $0) }
            }
            if let window = try? await studio.client.jobLog(jobId, from: logNext, limit: 400) {
                logLines += window.lines
                if logLines.count > 1200 { logLines = Array(logLines.suffix(800)) }
                logNext = window.next
            }
        } catch let failure as StudioError {
            self.error = failure.errorDescription
        } catch {
            self.error = "The studio did not answer."
        }
    }

    /// A video job's two picture routes: the scene sheets (once, since the
    /// list re-reads cheap) and whether the candidate mp4 has bytes yet.
    private func loadVideo(_ j: StudioClient.Job) async {
        if sheets.isEmpty {
            sheets = (try? await studio.client.sheets(jobId)) ?? []
            for sheet in sheets where sheetImages[sheet.scene] == nil {
                if let data = try? await studio.client.sheetImage(sheet), let img = NSImage(data: data) {
                    sheetImages[sheet.scene] = img
                }
            }
        }
        if mediaReady != true, let slug = j.slug {
            mediaReady = await studio.client.probeMedia(jobId: jobId, name: "\(slug).mp4")
        }
    }

    /// Run one verb: the reply's `note` is the banner, a refusal the reason.
    private func act(_ label: String, _ body: @escaping () async throws -> String?) {
        busy = true
        outcome = nil
        Task {
            do {
                outcome = try await body() ?? "\(label) finished"
                outcomeBad = false
            } catch let failure as StudioError {
                outcome = failure.errorDescription
                outcomeBad = true
            } catch {
                outcome = "The studio did not answer."
                outcomeBad = true
            }
            busy = false
            await loadOnce()
            await studio.refresh()
        }
    }
}

/// A video job's scene sheets as a tile grid, each PNG under its title.
private struct SheetGrid: View {
    let sheets: [StudioClient.Sheet]
    let images: [String: NSImage]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sheets")
                .font(.callout.weight(.medium))
                .foregroundStyle(G.text2)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160, maximum: 220), spacing: 10)], spacing: 10) {
                ForEach(sheets) { (sheet: StudioClient.Sheet) in
                    VStack(alignment: .leading, spacing: 4) {
                        if let img = images[sheet.scene] {
                            Image(nsImage: img).resizable().aspectRatio(contentMode: .fit)
                        } else {
                            G.surface2.aspectRatio(16.0 / 9.0, contentMode: .fit)
                                .overlay { ProgressView().controlSize(.small) }
                        }
                        Text(sheet.title ?? sheet.scene)
                            .font(.caption2)
                            .foregroundStyle(G.text3)
                            .lineLimit(1)
                    }
                }
            }
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Diagram detail                                                             */
/* -------------------------------------------------------------------------- */

struct StudioDiagramView: View {
    @Environment(StudioManager.self) private var studio
    @Environment(\.openWindow) private var openWindow
    let name: String

    @State private var diagram: StudioClient.Diagram?
    @State private var image: NSImage?
    @State private var error: String?
    @State private var outcome: String?
    @State private var outcomeBad = false
    @State private var commitReason = ""
    @State private var busy: String?

    /// The jobs that drew on this diagram's committed path, newest first.
    private var history: [StudioClient.Job] {
        studio.jobs.filter { $0.target == "learn/assets/\(name).tldr" }
    }

    var body: some View {
        ScrollView {
            if let diagram {
                loaded(diagram).padding(24)
            } else if let error {
                ContentUnavailableView("Diagram unavailable", systemImage: "questionmark.circle", description: Text(error))
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(G.page)
        .navigationTitle(diagram?.title ?? name)
        .task { await load() }
    }

    @ViewBuilder
    private func loaded(_ diagram: StudioClient.Diagram) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            header(diagram)
            if let outcome {
                StudioBanner(text: outcome, tone: outcomeBad ? .danger : .quiet)
            }
            verbs(diagram)
            preview
            meta(diagram)
            if !history.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionHead(title: "Jobs on this diagram", count: history.count, tail: nil)
                    VStack(spacing: 0) {
                        ForEach(Array(history.prefix(12).enumerated()), id: \.element.id) { index, job in
                            if index > 0 { Divider().overlay(G.hair).padding(.leading, 12) }
                            JobRow(job: job)
                        }
                    }
                    .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                }
            }
        }
        .frame(maxWidth: 900, alignment: .leading)
    }

    private func header(_ diagram: StudioClient.Diagram) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(diagram.title ?? name)
                .font(.system(.title, design: .serif, weight: .bold))
                .foregroundStyle(G.text)
            HStack(spacing: 8) {
                Text(diagram.tldr?.path ?? "learn/assets/\(name).tldr")
                    .font(.callout.monospaced())
                    .foregroundStyle(G.text3)
                    .textSelection(.enabled)
                if let topic = diagram.topic {
                    Text(studio.topics[topic] ?? topic)
                        .font(.caption)
                        .foregroundStyle(G.text2)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(G.surface2, in: Capsule())
                }
            }
        }
    }

    /// The inspector's verbs, all POSTs through the runner: export writes
    /// the SVG, verify checks it, inspect lints the document, commit lands
    /// the canvas's edits, and Open canvas opens the live tldraw surface
    /// in a window of its own (CanvasView).
    @ViewBuilder
    private func verbs(_ diagram: StudioClient.Diagram) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                verbButton("Export SVG", verb: "export")
                verbButton("Verify", verb: "verify")
                verbButton("Inspect", verb: "inspect")
                Button { openCanvas() } label: {
                    Label("Open canvas", systemImage: "arrow.up.forward.square")
                }
                .disabled(busy != nil)
                Spacer()
                if let checkout = StudioManager.studioURL("work", "\(name).tldr") {
                    Button { StudioManager.reveal(checkout) } label: {
                        Label("Reveal checkout", systemImage: "folder")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(G.accentText)
                }
                if busy != nil { ProgressView().controlSize(.small) }
            }
            if diagram.checkout?.dirty == true {
                HStack(spacing: 8) {
                    TextField("Reason for the commit", text: $commitReason)
                        .textFieldStyle(.plain)
                        .font(.callout)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .frame(maxWidth: 360)
                        .background(G.surface, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border))
                    Button("Commit the canvas's edits") { commit() }
                        .disabled(busy != nil || commitReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func verbButton(_ label: String, verb: String) -> some View {
        Button(label) {
            busy = verb
            outcome = nil
            Task {
                do {
                    let result = try await studio.client.diagramVerb(name, verb)
                    outcome = [result.note, result.detail.joined(separator: "\n")].compactMap { $0 }.joined(separator: "\n")
                    outcomeBad = !result.ok
                } catch let failure as StudioError {
                    outcome = failure.errorDescription
                    outcomeBad = true
                } catch {
                    outcome = "The studio did not answer."
                    outcomeBad = true
                }
                busy = nil
                await load()
            }
        }
        .disabled(busy != nil)
    }

    private func commit() {
        let reason = commitReason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !reason.isEmpty else { return }
        busy = "commit"
        outcome = nil
        Task {
            do {
                let result = try await studio.client.commitDiagram(name, reason: reason)
                outcome = result.note
                outcomeBad = !result.ok
                if result.ok { commitReason = "" }
            } catch let failure as StudioError {
                outcome = failure.errorDescription
                outcomeBad = true
            } catch {
                outcome = "The studio did not answer."
                outcomeBad = true
            }
            busy = nil
            await load()
        }
    }

    /// The canvas lives in its own window now (`canvas` scene, CanvasView):
    /// the mirror's serve page in a WKWebView, with the keep-alive the
    /// idle sweep needs. The browser open moved in there as the escape
    /// hatch.
    private func openCanvas() {
        openWindow(id: "canvas", value: name)
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("The stored SVG")
                .font(.callout.weight(.medium))
                .foregroundStyle(G.text2)
            ZStack {
                Color.white
                if let image {
                    Image(nsImage: image).resizable().aspectRatio(contentMode: .fit)
                } else {
                    Text(diagram?.svgState == "missing" ? "No SVG has been exported." : "Loading…")
                        .font(.callout)
                        .foregroundStyle(G.text3)
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(1200.0 / 850.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
        }
    }

    private func meta(_ diagram: StudioClient.Diagram) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Record")
                .font(.callout.weight(.medium))
                .foregroundStyle(G.text2)
            VStack(alignment: .leading, spacing: 5) {
                if let shapes = diagram.shapes { MetaRow(label: "shapes", value: "\(shapes)") }
                if let created = diagram.created { MetaRow(label: "created", value: StudioTime.stamp(created)) }
                MetaRow(label: "modified", value: StudioTime.stamp(diagram.tldr?.modified))
                if let revision = diagram.revision { MetaRow(label: "revision", value: "\(revision)") }
                MetaRow(label: "svg", value: diagram.svgState ?? "missing")
                if let concepts = diagram.concepts, !concepts.isEmpty {
                    MetaRow(label: "concepts", value: concepts.joined(separator: ", "))
                }
                if let source = diagram.source { MetaRow(label: "source", value: source) }
                if let checkout = diagram.checkout {
                    MetaRow(
                        label: "checkout",
                        value: checkout.dirty
                            ? "\(checkout.path) (edits not committed)"
                            : checkout.behind ? "\(checkout.path) (behind the database)" : checkout.path
                    )
                }
            }
            .padding(14)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
        }
    }

    private func load() async {
        do {
            diagram = try await studio.client.diagram(name)
            error = nil
            let svg = try await studio.client.diagramSvg(name)
            image = await SvgRasterizer.shared.image(for: svg, size: .preview)
        } catch let failure as StudioError {
            self.error = failure.errorDescription
        } catch {
            if diagram == nil { self.error = "The studio did not answer." }
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Draft detail                                                               */
/* -------------------------------------------------------------------------- */

struct StudioDraftView: View {
    @Environment(StudioManager.self) private var studio
    @Environment(\.studioPush) private var push
    let draftId: String

    @State private var draft: StudioClient.DraftDetail?
    @State private var error: String?
    @State private var outcome: String?
    @State private var outcomeBad = false
    @State private var message = ""
    @State private var busy = false
    @State private var confirming = false

    var body: some View {
        VStack(spacing: 0) {
            if let draft {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        header(draft)
                        if let outcome {
                            StudioBanner(text: outcome, tone: outcomeBad ? .danger : .quiet)
                        }
                        drawCards(draft)
                        transcript(draft)
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                composer(draft)
            } else if let error {
                ContentUnavailableView("Conversation unavailable", systemImage: "questionmark.circle", description: Text(error))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(G.page)
        .navigationTitle(draft?.name ?? draft?.title ?? "Conversation")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                if let dir = StudioManager.studioURL("drafts", draftId) {
                    Button { StudioManager.reveal(dir) } label: { Image(systemName: "folder") }
                        .help("Reveal the draft's workspace in Finder")
                }
                if let draft, draft.state != "abandoned" {
                    Button("End conversation", role: .destructive) { confirming = true }
                        .disabled(busy)
                }
            }
        }
        .task {
            while !Task.isCancelled {
                await load()
                // The planner is answering while inFlight; a quiet poll otherwise.
                try? await Task.sleep(for: .seconds(draft?.inFlight == true ? 2 : 6))
            }
        }
        .confirmationDialog("End this conversation?", isPresented: $confirming) {
            Button("End conversation", role: .destructive) { abandon() }
        } message: {
            Text("The draft and its workspace are kept until the pruner takes them; it stops answering.")
        }
    }

    private func header(_ draft: StudioClient.DraftDetail) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                StatePill(state: draft.state)
                ForEach(draft.plannerKinds ?? [], id: \.self) { kind in
                    Text(kind)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(G.text2)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2.5)
                        .background(G.surface2, in: Capsule())
                }
                if draft.inFlight == true {
                    Label("the planner is thinking", systemImage: "ellipsis.circle")
                        .font(.caption)
                        .foregroundStyle(G.accentText)
                }
                if let waiting = draft.waiting, !waiting.isEmpty {
                    Text("owes a \(waiting.joined(separator: " and ")) brief")
                        .font(.caption)
                        .foregroundStyle(G.warnText)
                }
            }
            Text(draft.name ?? draft.title ?? "Conversation")
                .font(.system(.title2, design: .serif, weight: .bold))
                .foregroundStyle(G.text)
            HStack(spacing: 10) {
                if let turns = draft.turns {
                    Text("\(turns)\(draft.turnCap.map { "/\($0)" } ?? "") turns")
                }
                if let cost = draft.costUsd {
                    Text("$\(String(format: "%.2f", cost))")
                }
                if let source = draft.source { Text("about \(source)") }
                Text(StudioTime.ago(draft.updated))
            }
            .font(.caption)
            .foregroundStyle(G.text3)
            if let error = draft.error?.message {
                Text(error).font(.caption).foregroundStyle(G.danger)
            }
            if let jobId = draft.jobId {
                Button { push(.job(jobId)) } label: {
                    Label("The job it follows", systemImage: "arrow.right.circle")
                        .font(.callout)
                }
                .buttonStyle(.plain)
                .foregroundStyle(G.accentText)
            }
        }
    }

    /// The live brief cards, pressed the way the web's cards are: one
    /// button per in-force slot, Draw for a diagram and Make for a video.
    @ViewBuilder
    private func drawCards(_ draft: StudioClient.DraftDetail) -> some View {
        let live = (draft.slots ?? [:]).filter { $0.value.live == true }.keys.sorted()
        if !live.isEmpty {
            HStack(spacing: 10) {
                ForEach(live, id: \.self) { kind in
                    Button {
                        draw(kind)
                    } label: {
                        Label(kind == "video" ? "Make video" : "Draw", systemImage: kind == "video" ? "play.rectangle" : "wand.and.stars")
                            .font(.callout.weight(.medium))
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(G.btnFace)
                    .disabled(busy)
                }
                if let jobId = (draft.slots ?? [:]).values.compactMap(\.jobId).first {
                    Button { push(.job(jobId)) } label: {
                        Text("its job")
                            .font(.callout)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(G.accentText)
                }
            }
        }
    }

    /// The thread: person turns on the right, planner turns on the left,
    /// studio notes centered. A reply that carried a brief says so under it.
    private func transcript(_ draft: StudioClient.DraftDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(draft.transcript ?? []) { entry in
                VStack(alignment: .leading, spacing: 3) {
                    if entry.role == "studio" {
                        Text(entry.text)
                            .font(.caption)
                            .foregroundStyle(G.text3)
                            .frame(maxWidth: .infinity, alignment: .center)
                    } else {
                        HStack {
                            if entry.role == "person" { Spacer(minLength: 80) }
                            Text(entry.text)
                                .font(.body)
                                .foregroundStyle(entry.role == "person" ? G.btnText : G.text)
                                .textSelection(.enabled)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(entry.role == "person" ? G.btnFace : G.surface, in: RoundedRectangle(cornerRadius: 14))
                                .overlay {
                                    if entry.role != "person" { RoundedRectangle(cornerRadius: 14).stroke(G.border) }
                                }
                            if entry.role != "person" { Spacer(minLength: 80) }
                        }
                        .opacity(entry.superseded == true ? 0.55 : 1)
                        ForEach(entry.briefs ?? [], id: \.kind) { brief in
                            Text("left a \(brief.kind ?? "") brief")
                                .font(.caption)
                                .foregroundStyle(G.accentText)
                        }
                    }
                }
            }
            if (draft.transcript ?? []).isEmpty {
                Text("Nothing said yet.")
                    .font(.callout)
                    .foregroundStyle(G.text3)
            }
        }
        .frame(maxWidth: 720, alignment: .leading)
    }

    /// The composer's minimum: a field and a send. `@diagram` and `@video`
    /// in the text tag the brief kind, the way the web's mention chips do.
    private func composer(_ draft: StudioClient.DraftDetail) -> some View {
        HStack(spacing: 10) {
            TextField("Say something, or tag @diagram / @video", text: $message, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1 ... 6)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                .onSubmit(send)
            Button { send() } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2)
            }
            .buttonStyle(.plain)
            .foregroundStyle(G.btnFace)
            .disabled(busy || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(G.page)
    }

    private func send() {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        busy = true
        outcome = nil
        Task {
            do {
                try await studio.client.sendDraftMessage(draftId, text: text, mentions: draftMentions(text))
                message = ""
                await load()
            } catch let failure as StudioError {
                outcome = failure.errorDescription
                outcomeBad = true
            } catch {
                outcome = "The studio did not answer."
                outcomeBad = true
            }
            busy = false
        }
    }

    private func draw(_ kind: String) {
        busy = true
        outcome = nil
        Task {
            do {
                if let jobId = try await studio.client.drawDraft(draftId, kind: kind) {
                    await studio.refresh()
                    push(.job(jobId))
                }
                outcomeBad = false
            } catch let failure as StudioError {
                outcome = failure.errorDescription
                outcomeBad = true
            } catch {
                outcome = "The studio did not answer."
                outcomeBad = true
            }
            busy = false
        }
    }

    private func abandon() {
        busy = true
        Task {
            try? await studio.client.abandonDraft(draftId)
            await load()
            busy = false
        }
    }

    private func load() async {
        do {
            draft = try await studio.client.draft(draftId)
            error = nil
        } catch let failure as StudioError {
            if draft == nil { self.error = failure.errorDescription }
        } catch {
            if draft == nil { self.error = "The studio did not answer." }
        }
    }
}
