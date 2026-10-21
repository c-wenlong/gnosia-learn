//
//  ConceptDetailView.swift
//  Gnosia
//
//  One concept's workspace, in the shape of the web's /learn/<slug> page:
//  the title, summary and note body; the mastery card (bucket, p(L),
//  observations, last seen); the review card's schedule state; where the
//  concept sits in a course; its prerequisites, assumptions, dependants and
//  backlinks; the note's check blocks with their answered state; and the
//  assets linked to it, its own note left out.
//
//  concept-workspace-core.ts supplies the shape. One thing the mirror
//  cannot carry: `observation` events name no concept here, so instead of
//  the web's per-concept answer history the page shows the mastery row's
//  own aggregate (which the pipeline replay stamps) and each check's
//  status matched by question text across all observations.
//

import SwiftUI

struct ConceptDetailView: View {
    @Environment(CatalogStore.self) private var store
    let concept: CatalogConcept

    private var workspace: ConceptWorkspace? {
        store.workspace(for: concept.slug)
    }

    var body: some View {
        ScrollView {
            if let workspace {
                VStack(alignment: .leading, spacing: 20) {
                    header(workspace)
                    stats(workspace)
                    if let body = workspace.body, !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        MarkdownText(source: body)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        noBodyNote
                    }
                    if !workspace.checks.isEmpty { checksSection(workspace) }
                    graphSection(workspace)
                    if !workspace.assets.isEmpty { assetsSection(workspace) }
                    metaSection(workspace)
                }
                .padding(24)
                .frame(maxWidth: 720, alignment: .leading)
            } else {
                ContentUnavailableView(
                    "No workspace data",
                    systemImage: "questionmark.circle",
                    description: Text("The concept row exists but the learning tables did not load with it.")
                )
            }
        }
        .navigationTitle(concept.title)
    }

    /// Title, domain and course placement, and the summary.
    @ViewBuilder
    private func header(_ w: ConceptWorkspace) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                BucketDot(bucket: w.bucket)
                Text(w.title).font(.title2).bold()
                if w.frontier {
                    Text("On your frontier")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.green.opacity(0.15), in: Capsule())
                        .foregroundStyle(.green)
                }
                Spacer(minLength: 4)
                // The web workspace's "Teach me" — starts the concept
                // session (probe, teach, check) over the sidecar.
                NavigationLink(value: AppDestination.session(concept: w.slug)) {
                    Text("Teach me")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(G.btnText)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(G.btnFace, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: 8) {
                Text(masteryCaption(bucket: w.bucket, pL: w.pL))
                if let domain = w.domain { Text("· \(domain)") }
                if let place = w.place {
                    Text("·")
                    NavigationLink(value: AppDestination.module(course: place.courseSlug, module: place.moduleSlug)) {
                        Text(place.label)
                            .underline()
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
            }
            .font(.callout)
            .foregroundStyle(.secondary)
            if !w.summary.isEmpty {
                Text(w.summary).font(.body)
            }
            if !w.tags.isEmpty {
                Text(w.tags.map { "#\($0)" }.joined(separator: "  "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// The standing numbers: observations and correct, last seen, and the
    /// review card's schedule — the web's two rail cards in one row.
    @ViewBuilder
    private func stats(_ w: ConceptWorkspace) -> some View {
        HStack(alignment: .top, spacing: 24) {
            GroupBox("Mastery") {
                VStack(alignment: .leading, spacing: 6) {
                    stat("p(L)", w.bucket == .untouched ? "–" : String(format: "%.2f", w.pL))
                    stat("Observations", "\(w.observations)")
                    stat("Correct", "\(w.correct)")
                    stat("Last seen", lastSeenLabel(w.lastSeen))
                }
                .padding(4)
                .frame(minWidth: 150, alignment: .leading)
            }
            GroupBox("Review") {
                VStack(alignment: .leading, spacing: 6) {
                    if let review = w.review {
                        let due = dueLabel(review.due)
                        stat("Due", due.label)
                        stat("Interval", formatInterval(Int(review.intervalDays)))
                        stat("Ease", String(format: "%.2f", review.ease))
                        stat("Repetitions", "\(review.repetitions)")
                        stat("Lapses", review.leech ? "\(review.lapses) — keeps slipping" : "\(review.lapses)")
                    } else {
                        Text("Not scheduled")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(4)
                .frame(minWidth: 170, alignment: .leading)
            }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).monospacedDigit()
        }
        .font(.callout)
    }

    /// A concept without a note body still has a workspace — the mirror
    /// says why honestly.
    private var noBodyNote: some View {
        Text("The concept row was mirrored without a note body — an older snapshot, or a note never indexed.")
            .font(.callout)
            .foregroundStyle(.secondary)
    }

    /// The note's checks, each with the state the latest matching
    /// observation left it in.
    @ViewBuilder
    private func checksSection(_ w: ConceptWorkspace) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Checks").font(.headline)
            ForEach(w.checks, id: \.check.id) { wc in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: checkSymbol(wc.status))
                            .foregroundStyle(checkColor(wc.status))
                        Text(wc.check.question).font(.callout)
                    }
                    if !wc.check.answer.isEmpty {
                        Text(wc.check.answer)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .padding(.leading, 22)
                    }
                }
                .padding(.vertical, 2)
            }
            Text("Answered state is matched by question text — the mirrored observations name no concept.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }

    private func checkSymbol(_ status: CheckStatus) -> String {
        switch status {
        case .passed: return "checkmark.circle.fill"
        case .missed: return "xmark.circle.fill"
        case .untried: return "circle"
        }
    }

    private func checkColor(_ status: CheckStatus) -> Color {
        switch status {
        case .passed: return .green
        case .missed: return .red
        case .untried: return .secondary
        }
    }

    /// What the concept needs, what it assumes, what needs it and the rest
    /// of the graph's backlinks — the web workspace's graph panels as chip
    /// lists that push to each concept's own page.
    @ViewBuilder
    private func graphSection(_ w: ConceptWorkspace) -> some View {
        if !w.requires.isEmpty || !w.assumes.isEmpty || !w.dependants.isEmpty || !w.backlinks.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                if !w.requires.isEmpty { neighbours("Prerequisites", w.requires) }
                if !w.assumes.isEmpty { neighbours("Assumes", w.assumes) }
                if !w.dependants.isEmpty { neighbours("Needed by", w.dependants) }
                if !w.backlinks.isEmpty { neighbours("Backlinks", w.backlinks) }
            }
        }
    }

    private func neighbours(_ title: String, _ refs: [NeighbourRef]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            FlowLayout(spacing: 6) {
                ForEach(refs) { ref in
                    NavigationLink(value: AppDestination.concept(ref.slug)) {
                        HStack(spacing: 5) {
                            BucketDot(bucket: ref.bucket)
                            Text(ref.title).font(.callout)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.quaternary.opacity(0.5), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// The assets linked to the concept — the web workspace's asset list,
    /// each opening its own detail pane.
    @ViewBuilder
    private func assetsSection(_ w: ConceptWorkspace) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Linked assets").font(.headline)
            ForEach(w.assets) { asset in
                NavigationLink(value: AppDestination.asset(asset.id)) {
                    HStack(spacing: 8) {
                        Image(systemName: assetKindSymbol(asset.kind))
                            .foregroundStyle(.secondary)
                            .frame(width: 18)
                        Text(store.displayTitle(for: asset))
                            .font(.callout)
                            .lineLimit(1)
                        Spacer()
                        Text(assetKindLabel(asset.kind))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// The sources the note cites, and where the note would live.
    @ViewBuilder
    private func metaSection(_ w: ConceptWorkspace) -> some View {
        if !w.sources.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("Sources").font(.headline)
                ForEach(w.sources, id: \.self) { source in
                    Text(source).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

/// Chips laid out left to right, wrapping — the one layout SwiftUI does
/// not give a FlowLayout-shaped thing itself.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 {
                x = 0
                y += row + spacing
                row = 0
            }
            row = max(row, size.height)
            x += size.width + spacing
        }
        return CGSize(width: width, height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += row + spacing
                row = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            row = max(row, size.height)
            x += size.width + spacing
        }
    }
}
