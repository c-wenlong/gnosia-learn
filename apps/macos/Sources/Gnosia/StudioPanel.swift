//
//  StudioPanel.swift
//  Gnosia
//
//  The workspace's right column — apps/web/src/components/workspace/
//  StudioCards.tsx natively: the things made from a concept. Mastery with
//  its schedule, the note's checks, the assets that explain it, and the
//  neighbourhood graph.
//
//  At the fidelity the mirror holds: the web card's p(L) history bars are
//  per-answer readings, and the mirrored `observation` rows name no
//  concept, so the card keeps the mastery aggregate and its "no answers
//  recorded" line instead of inventing bars. A video's thumb is its
//  derived poster, a diagram's the rasterized SVG itself — the web's
//  AssetThumb rule — and a link asset or a session log gets its kind's
//  symbol, as the row does elsewhere natively. The web card's "Open in
//  the map" button has no native map to open yet.
//
//  The graph is the web's ConceptGraph compact: the layered drawing of
//  concept-graph.ts's `neighbourhood` — the concept, what it needs, what
//  needs it — laid out by `assignLayers`/`layoutGraph`, prerequisites
//  above what needs them so every line runs downward, a solid line a
//  hard `requires` and a dashed one background `assumes`.
//

import SwiftUI

struct StudioPanel: View {
    @Environment(CatalogStore.self) private var store
    let w: ConceptWorkspace
    /// The checks card's Quiz me — the workspace routes it to the
    /// embedded tutor's check mode.
    var quizMe: () -> Void = {}

    /// The assets card's rows — the web's filter: companion kinds
    /// (posters, transcripts, sidecars) are not studio entries of their
    /// own.
    private var standaloneAssets: [CatalogAsset] {
        w.assets.filter { !isCompanionKind($0.kind) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            card {
                HStack(alignment: .top, spacing: 12) {
                    Text(w.bucket == .untouched ? "–" : String(format: "%.2f", w.pL))
                        .font(.gnosiaTitle(30))
                        .foregroundStyle(G.accentText)
                        .monospacedDigit()
                    VStack(alignment: .leading, spacing: 2) {
                        Text("mastery p(L)")
                            .font(.callout.weight(.medium))
                            .foregroundStyle(G.text)
                        Text("\(w.observations) \(w.observations == 1 ? "observation" : "observations") · \(w.correct) correct · seen \(lastSeenLabel(w.lastSeen))")
                            .font(.caption)
                            .foregroundStyle(G.text2)
                    }
                    Spacer(minLength: 0)
                }
                // The web draws per-answer p(L) bars here; the mirror's
                // observations name no concept, so only its empty state is
                // honest.
                if w.observations == 0 {
                    Text("No answers recorded yet.")
                        .font(.caption)
                        .foregroundStyle(G.text3)
                }
                Text(reviewLine)
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
            .accessibilityLabel("Mastery")

            card {
                Text("Checks · \(w.checks.count)")
                    .font(.callout.weight(.bold))
                    .foregroundStyle(G.text)
                if w.checks.isEmpty {
                    Text("The note has no checks yet.")
                        .font(.callout)
                        .foregroundStyle(G.text3)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(w.checks, id: \.check.id) { wc in
                            HStack(spacing: 8) {
                                checkDot(wc.status)
                                MathText(text: wc.check.question, font: .callout)
                                    .foregroundStyle(G.text)
                                    .lineLimit(1)
                                Spacer(minLength: 0)
                            }
                            .help(checkWord(wc.status))
                        }
                    }
                }
                Button("Quiz me", action: quizMe)
                    .buttonStyle(.plain)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.text)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(G.surface, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border, lineWidth: 1))
                    .disabled(w.checks.isEmpty)
                    .opacity(w.checks.isEmpty ? 0.5 : 1)
            }
            .accessibilityLabel("Checks")

            card {
                Text("Assets")
                    .font(.callout.weight(.bold))
                    .foregroundStyle(G.text)
                if standaloneAssets.isEmpty {
                    Text("No video or diagram explains this yet.")
                        .font(.callout)
                        .foregroundStyle(G.text3)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(standaloneAssets) { asset in
                            NavigationLink(value: AppDestination.asset(asset.id)) {
                                HStack(spacing: 10) {
                                    StudioAssetThumb(asset: asset)
                                    Text("\(assetKindLabel(asset.kind)) · \(store.displayTitle(for: asset))")
                                        .font(.caption)
                                        .foregroundStyle(G.text2)
                                        .lineLimit(1)
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 8)
                                .frame(height: 44)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(G.surface2, in: RoundedRectangle(cornerRadius: 12))
                                .contentShape(RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .accessibilityLabel("Assets")

            card {
                Text("Neighbourhood")
                    .font(.callout.weight(.bold))
                    .foregroundStyle(G.text)
                if neighbourhoodNodes.isEmpty {
                    Text("Nothing to draw.")
                        .font(.callout)
                        .foregroundStyle(G.text3)
                } else {
                    NeighbourhoodGraph(
                        nodes: neighbourhoodNodes,
                        edges: neighbourhoodEdges,
                        focus: w.slug
                    )
                    .padding(4)
                    .background(G.surface2, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .accessibilityLabel("Neighbourhood")
        }
    }

    /// One tight card — the web's `Card tight`: surface face, 2px border,
    /// radius 20 scaled down a touch for the column.
    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(G.border, lineWidth: 1.5))
    }

    /// The mastery card's schedule line — the web's single line:
    /// "No review scheduled" or "Next review Fri · interval 4d · ease 2.5".
    private var reviewLine: String {
        guard let review = w.review else { return "No review scheduled" }
        let due = dueLabel(review.due)
        let head = due.overdue ? "Review overdue" : "Next review \(due.label)"
        var line = "\(head) · interval \(review.intervalDays)d · ease \(String(format: "%.1f", review.ease))"
        if review.leech { line += " · leech" }
        return line
    }

    /// The checks card's status dot — passed green, missed amber, an
    /// untried check an empty ring.
    private func checkDot(_ status: CheckStatus) -> some View {
        switch status {
        case .passed:
            return AnyView(Circle().fill(G.ok).frame(width: 8, height: 8))
        case .missed:
            return AnyView(Circle().fill(G.streak).frame(width: 8, height: 8))
        case .untried:
            return AnyView(
                Circle()
                    .fill(G.surface)
                    .overlay(Circle().stroke(G.text3, lineWidth: 1.5))
                    .frame(width: 8, height: 8)
            )
        }
    }

    private func checkWord(_ status: CheckStatus) -> String {
        switch status {
        case .passed: return "answered right last time"
        case .missed: return "missed last time"
        case .untried: return "not tried yet"
        }
    }

    // MARK: - The neighbourhood

    /// The graph's node set — `neighbourhood` in concept-graph.ts: this
    /// concept, everything it needs (hard and background) and everything
    /// that needs it, found through every edge regardless of kind.
    private var neighbourhoodNodes: [NeighbourhoodGraph.Node] {
        var ids = Set([w.slug])
        for e in store.learn.edges where e.from == w.slug || e.to == w.slug {
            ids.insert(e.from)
            ids.insert(e.to)
        }
        return store.learn.concepts
            .filter { ids.contains($0.slug) }
            .map { NeighbourhoodGraph.Node(id: $0.slug, title: $0.title, bucket: $0.bucket, pL: $0.pL) }
    }

    /// Edges whose both ends are in the neighbourhood — `edgesWithin`.
    private var neighbourhoodEdges: [LearnEdge] {
        let ids = Set(neighbourhoodNodes.map(\.id))
        return store.learn.edges.filter { ids.contains($0.from) && ids.contains($0.to) }
    }
}

/// A concept node for the neighbourhood drawing — GraphNode's id,
/// title, bucket and p(L).
private struct WorkspaceGraphNode: Identifiable, Hashable {
    let id: String
    let title: String
    let bucket: MasteryBucket
    let pL: Double
}

/// The compact ConceptGraph: a layered prerequisite drawing at the web's
/// compact metrics (84pt columns, 96pt rows), shrunk to fit the card's
/// width as the web's `fit` scales its viewBox. Nodes are links, as the
/// web's are; everything else draws at the scaled metrics so the
/// arithmetic is the web's own.
private struct NeighbourhoodGraph: View {
    typealias Node = WorkspaceGraphNode

    let nodes: [Node]
    let edges: [LearnEdge]
    let focus: String

    /// The card width the drawing was last offered, so the whole thing
    /// shrinks into it the way the web's `fit` scales its viewBox.
    @State private var offered: CGFloat = 0

    // The web's compact metrics.
    private let columnWidth: CGFloat = 84
    private let rowHeight: CGFloat = 96
    private let padX: CGFloat = 12
    private let padY: CGFloat = 22
    /// A node's dot box: its centre sits this far under the top of the
    /// column the label lines run under.
    private let dotBox: CGFloat = 36
    private let lineHeight: CGFloat = 14

    /// Longest-path layering — assignLayers: a node one layer below its
    /// deepest prerequisite, both edge kinds counting, cycles cut rather
    /// than recursed into.
    private var layers: [String: Int] {
        var incoming: [String: [String]] = [:]
        for n in nodes { incoming[n.id] = [] }
        for e in edges where incoming[e.to] != nil { incoming[e.to]?.append(e.from) }
        var layer: [String: Int] = [:]
        var visiting = Set<String>()
        func depth(_ id: String) -> Int {
            if let cached = layer[id] { return cached }
            if visiting.contains(id) { return 0 }
            visiting.insert(id)
            let parents = incoming[id] ?? []
            let value = parents.isEmpty ? 0 : parents.map(depth).max()! + 1
            visiting.remove(id)
            layer[id] = value
            return value
        }
        for n in nodes { _ = depth(n.id) }
        return layer
    }

    /// label text per node — wrapLabel, two lines of ~12, the second
    /// truncated.
    private var labels: [String: [String]] {
        Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, wrapLabel($0.title, max: 12)) })
    }

    /// layoutGraph: centred rows, alphabetical within a row, positions as
    /// the dot's centre, the label running under it.
    private var layout: (size: CGSize, positions: [String: CGPoint]) {
        let layers = self.layers
        var rows: [Int: [Node]] = [:]
        for n in nodes { rows[layers[n.id] ?? 0, default: []].append(n) }
        let depths = rows.keys.sorted()
        for key in rows.keys { rows[key]?.sort { $0.title.localizedCompare($1.title) == .orderedAscending } }
        let widest = max(1, rows.values.map(\.count).max() ?? 1)
        let width = padX * 2 + CGFloat(widest) * columnWidth
        let height = padY * 2 + CGFloat(max(0, depths.count - 1)) * rowHeight + 58
        var positions: [String: CGPoint] = [:]
        for (rowIndex, depth) in depths.enumerated() {
            let row = rows[depth] ?? []
            let startX = (width - CGFloat(row.count) * columnWidth) / 2
            for (i, n) in row.enumerated() {
                positions[n.id] = CGPoint(
                    x: startX + CGFloat(i) * columnWidth + columnWidth / 2,
                    y: padY + dotBox / 2 + CGFloat(rowIndex) * rowHeight
                )
            }
        }
        return (CGSize(width: width, height: height), positions)
    }

    /// A node's own column height: the dot box, then its label lines.
    private func nodeHeight(_ id: String) -> CGFloat {
        dotBox + 2 + CGFloat(labels[id]?.count ?? 1) * lineHeight
    }

    var body: some View {
        let laid = layout
        let scale = offered > 0 ? min(1, offered / laid.size.width) : 1
        ZStack(alignment: .topLeading) {
            Canvas { ctx, _ in
                for e in edges {
                    guard let from = laid.positions[e.from], let to = laid.positions[e.to] else { continue }
                    // From under the prerequisite's label to just above the
                    // dot it feeds — the web's bezier, control points at
                    // the midpoint.
                    let lines = CGFloat(labels[e.from]?.count ?? 1)
                    let y1 = (from.y + dotBox / 2 + 2 + lines * lineHeight) * scale
                    let y2 = (to.y - (e.to == focus ? 20 : 14)) * scale
                    let mid = (y1 + y2) / 2
                    let x1 = from.x * scale, x2 = to.x * scale
                    var path = Path()
                    path.move(to: CGPoint(x: x1, y: y1))
                    path.addCurve(
                        to: CGPoint(x: x2, y: y2),
                        control1: CGPoint(x: x1, y: mid),
                        control2: CGPoint(x: x2, y: mid)
                    )
                    let colour: Color = (e.from == focus || e.to == focus) ? G.accent : G.text3.opacity(0.7)
                    ctx.stroke(
                        path,
                        with: .color(colour),
                        style: StrokeStyle(
                            lineWidth: e.kind == .assumes ? 1 : 1.5,
                            dash: e.kind == .assumes ? [4, 4] : []
                        )
                    )
                }
            }
            ForEach(nodes) { n in
                if let p = laid.positions[n.id] {
                    NavigationLink(value: AppDestination.concept(n.id)) {
                        VStack(spacing: 2) {
                            ZStack {
                                if n.id == focus {
                                    Circle()
                                        .stroke(G.accent, lineWidth: 2 * scale)
                                        .frame(width: 34 * scale, height: 34 * scale)
                                }
                                graphDot(n, scale: scale)
                            }
                            .frame(width: dotBox * scale, height: dotBox * scale)
                            ForEach(labels[n.id] ?? [n.title], id: \.self) { line in
                                Text(line)
                                    .font(.system(size: max(7, 10 * scale), weight: n.id == focus ? .semibold : .medium))
                                    .foregroundStyle(n.id == focus ? G.text : G.text2)
                                    .lineLimit(1)
                                    .frame(height: lineHeight * scale)
                            }
                        }
                        .frame(width: columnWidth * scale)
                    }
                    .buttonStyle(.plain)
                    .position(x: p.x * scale, y: (p.y - dotBox / 2) * scale + nodeHeight(n.id) * scale / 2)
                    .accessibilityLabel("\(n.title), \(n.bucket.label)\(n.bucket == .untouched ? "" : ", p(L) \(String(format: "%.2f", n.pL))")")
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: laid.size.height * scale)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { offered = $0 }
    }

    /// A node dot — the web's bucket fill/stroke pair natively: mastered
    /// solid, learning a light fill on the same ring, untouched an empty
    /// ring.
    private func graphDot(_ n: Node, scale: CGFloat) -> some View {
        let diameter: CGFloat = (n.id == focus ? 20 : 16) * scale
        return ZStack {
            switch n.bucket {
            case .mastered:
                Circle().fill(.green).frame(width: diameter, height: diameter)
                    .overlay(Circle().stroke(.green, lineWidth: 2 * scale))
            case .learning:
                Circle().fill(.orange.opacity(0.45)).frame(width: diameter, height: diameter)
                    .overlay(Circle().stroke(.orange, lineWidth: 2 * scale))
            case .untouched:
                Circle().fill(G.surface).frame(width: diameter, height: diameter)
                    .overlay(Circle().stroke(G.text3, lineWidth: 2 * scale))
            }
        }
    }
}

/// wrapLabel from concept-graph.ts: a label broken into at most two
/// lines of about `max` characters, the second truncated.
private func wrapLabel(_ title: String, max: Int = 16) -> [String] {
    let words = title.split(whereSeparator: { $0 == " " }).map(String.init).filter { !$0.isEmpty }
    var lines: [String] = []
    var line = ""
    for word in words {
        let next = line.isEmpty ? word : "\(line) \(word)"
        if next.count <= max || line.isEmpty {
            line = next
        } else {
            lines.append(line)
            line = word
        }
    }
    if !line.isEmpty { lines.append(line) }
    if lines.count <= 2 {
        return lines.map { $0.count > max + 2 ? String($0.prefix(max)) + "…" : $0 }
    }
    let second = lines.dropFirst().joined(separator: " ")
    return [lines[0], second.count > max ? String(second.prefix(max - 1)) + "…" : second]
}

/// A thumbnail for one Studio asset row — the web's AssetThumb: a
/// video's derived poster or the diagram itself, the kind's symbol when
/// there is no picture (the web draws nothing; the native row's symbol
/// is the same "no picture" state named).
private struct StudioAssetThumb: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    @State private var diagramImage: NSImage?

    var body: some View {
        Group {
            switch asset.kind {
            case "video":
                if let key = store.companions(for: asset.id).posterKey, store.blobExists(key) {
                    PosterThumbnail(url: store.blobURL(for: key), maxPixel: 160, cornerRadius: 6)
                        .frame(width: 48, height: 32)
                } else {
                    symbol
                }
            case "diagram_svg":
                if let diagramImage {
                    Image(nsImage: diagramImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 48, height: 32)
                } else {
                    symbol
                }
            case "poster":
                if let key = asset.blobKey, store.blobExists(key) {
                    PosterThumbnail(url: store.blobURL(for: key), maxPixel: 160, cornerRadius: 6)
                        .frame(width: 48, height: 32)
                } else {
                    symbol
                }
            default:
                symbol
            }
        }
        .task(id: asset.id) {
            guard asset.kind == "diagram_svg",
                  let key = asset.blobKey,
                  let svg = store.blobText(for: key)
            else { return }
            diagramImage = await SvgRasterizer.shared.image(for: svg, size: .tile)
        }
    }

    private var symbol: some View {
        Image(systemName: assetKindSymbol(asset.kind))
            .font(.callout)
            .foregroundStyle(G.text3)
            .frame(width: 24, height: 24)
    }
}
