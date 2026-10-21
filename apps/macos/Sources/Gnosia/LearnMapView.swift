//
//  LearnMapView.swift
//  Gnosia
//
//  One domain (or one of its topics) as a picture — the native
//  approximation of apps/web/src/components/learn/DomainGraph.tsx.
//  A rounded group per topic, the domain's own prerequisite edges as
//  straight lines between the dots (solid for `requires`, dashed for
//  `assumes`, lighter when the line crosses between topics), and every
//  concept's dot carrying what the web's does: the bucket fill, the p(L)
//  arc for a concept being learnt, a dashed accent ring for ready to
//  learn, a red ring for keeps-slipping and a red dot for a review
//  overdue. A press on a topic's title opens the topic; a press on a
//  concept opens its workspace.
//
//  What it does not carry from the web: dagre placement (LearnMap.swift
//  lays each topic in layered rows instead), dragging nodes, the axes
//  arrangement, label culling and hover lighting — the honest subset that
//  still reads as the same picture.
//

import SwiftUI

/// The mastery palette the map draws in is `Color.masteryHi/Mid/Lo` in
/// LearnMap.swift — the web's `--m-hi`, `--m-mid`, `--m-lo` under
/// `.gnosia`, both appearances.

/// The domain picture — a bounded, scaled drawing inside its card.
struct DomainMapView: View {
    let layout: DomainLayout
    /// Every concept's index row, by slug — the picture reads title,
    /// bucket, p(L) and the three marks off it.
    let nodes: [String: IndexRow]
    /// The open topic, or nil for the whole domain.
    var topic: String? = nil
    /// Concepts the filter and search dim (D8) — they stay drawn, faded.
    var dimmed: Set<String> = []
    /// A concept was pressed — the board opens its workspace.
    var onSelect: (String) -> Void = { _ in }
    /// A topic's title was pressed — the board opens the topic.
    var onTopic: (String) -> Void = { _ in }

    /// The card width the drawing was last offered — the web's viewBox
    /// scale: the picture draws at its own units and fits the card, never
    /// blown up past MAX_SCALE so a small domain does not fill the screen.
    @State private var offered: CGFloat = 0

    /// Small domains are not blown up past this — MAX_SCALE in DomainGraph.
    private static let maxScale: CGFloat = 1.15
    /// Room kept round the picture — VIEW_PAD in domain-view.ts.
    private static let pad: CGFloat = 8
    /// The p(L) arc's radius — ARC_RADIUS.
    private static let arcRadius: CGFloat = 12
    private static let labelChars = 15

    /// The groups on screen: the domain's, or the open topic's one.
    private var groups: [DomainLayout.Group] {
        topic == nil ? layout.groups : layout.groups.filter { $0.topic == topic }
    }

    /// The concept ids on screen — shown in DomainGraph.
    private var shown: Set<String> { Set(groups.flatMap(\.concepts)) }

    /// Which topic a concept belongs to, for the edge's within/across weight.
    private var topicOf: [String: String] {
        Dictionary(uniqueKeysWithValues: groups.flatMap { g in g.concepts.map { ($0, g.topic) } })
    }

    /// What the picture frames — viewBoxFor: the whole layout, or the open
    /// topic's group box, either with the pad.
    private var frame: CGRect {
        if let topic, let group = groups.first(where: { $0.topic == topic }) {
            return group.box.insetBy(dx: -Self.pad, dy: -Self.pad)
        }
        return CGRect(x: -Self.pad, y: -Self.pad,
                      width: layout.size.width + 2 * Self.pad,
                      height: layout.size.height + 2 * Self.pad)
    }

    private var scale: CGFloat {
        offered > 0 ? min(Self.maxScale, offered / max(1, frame.width)) : 1
    }

    /// wrapLabel — two lines of about `labelChars`, the second truncated.
    private func labelLines(_ title: String) -> [String] {
        let words = title.split(whereSeparator: { $0 == " " }).map(String.init).filter { !$0.isEmpty }
        var lines: [String] = []
        var line = ""
        for word in words {
            let next = line.isEmpty ? word : "\(line) \(word)"
            if next.count <= Self.labelChars || line.isEmpty {
                line = next
            } else {
                lines.append(line)
                line = word
            }
        }
        if !line.isEmpty { lines.append(line) }
        if lines.count <= 2 {
            return lines.map { $0.count > Self.labelChars + 2 ? String($0.prefix(Self.labelChars)) + "…" : $0 }
        }
        let second = lines.dropFirst().joined(separator: " ")
        return [lines[0], second.count > Self.labelChars
            ? String(second.prefix(Self.labelChars - 1)) + "…" : second]
    }

    /// The label's foot: how far under the dot its lines end — labelFoot
    /// at LABEL_SIZE (the web's exact 36/50 for one and two lines; a
    /// label that is not there leaves the edge at the dot, DOT_GAP 14).
    private func labelFoot(_ id: String) -> CGFloat {
        let lines = labelLines(nodes[id]?.title ?? id).count
        return lines <= 0 ? 14 : 22 + CGFloat(lines) * 14
    }

    /// edgeEnds in domain-view.ts: where an edge's line starts and ends —
    /// sideways when the dots are level, out of the label's foot and into
    /// the dot's top going down, the reverse coming up.
    private func edgeEnds(_ e: LearnEdge) -> (CGPoint, CGPoint)? {
        guard let from = layout.positions[e.from], let to = layout.positions[e.to] else { return nil }
        let dy = to.y - from.y
        if abs(dy) < 20 {
            let side: CGFloat = to.x >= from.x ? 1 : -1
            return (CGPoint(x: from.x + side * 14, y: from.y),
                    CGPoint(x: to.x - side * 14, y: to.y))
        }
        if dy > 0 {
            return (CGPoint(x: from.x, y: from.y + labelFoot(e.from)),
                    CGPoint(x: to.x, y: to.y - 14))
        }
        return (CGPoint(x: from.x, y: from.y - 14),
                CGPoint(x: to.x, y: to.y + labelFoot(e.to)))
    }

    var body: some View {
        let scale = self.scale
        let frame = self.frame
        let placed = { (p: CGPoint) in CGPoint(x: (p.x - frame.minX) * scale, y: (p.y - frame.minY) * scale) }
        ZStack(alignment: .topLeading) {
            // Edges under everything: straight lines, text3 at the web's
            // opacities — 0.7 inside a topic, 0.3 across topics.
            Canvas { ctx, _ in
                for e in layout.edges where shown.contains(e.from) && shown.contains(e.to) {
                    guard let (from, to) = edgeEnds(e) else { continue }
                    var path = Path()
                    path.move(to: placed(from))
                    path.addLine(to: placed(to))
                    let across = topicOf[e.from] != topicOf[e.to]
                    ctx.stroke(
                        path,
                        with: .color(G.text3.opacity(across ? 0.3 : 0.7)),
                        style: StrokeStyle(lineWidth: 1, dash: e.kind == .assumes ? [4, 3] : [])
                    )
                }
            }

            // The topic boxes — rx 14, surface2 on a hairline, the title
            // bold at the inset. A press on the title opens the topic.
            ForEach(groups, id: \.topic) { group in
                let box = CGRect(
                    x: (group.box.minX - frame.minX) * scale,
                    y: (group.box.minY - frame.minY) * scale,
                    width: group.box.width * scale,
                    height: group.box.height * scale
                )
                RoundedRectangle(cornerRadius: 14 * scale)
                    .fill(G.surface2)
                    .overlay(RoundedRectangle(cornerRadius: 14 * scale).stroke(G.hair, lineWidth: 1))
                    // The title inside the box's top band, pressed to open
                    // the topic — data-topic-title's onClick.
                    .overlay(alignment: .topLeading) {
                        Button {
                            onTopic(group.topic)
                        } label: {
                            Text(group.title)
                                .font(.system(size: max(9, 12.5 * scale), weight: .bold))
                                .foregroundStyle(G.text2)
                                .lineLimit(1)
                                .padding(.leading, 12 * scale)
                                .padding(.top, 7 * scale)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Topic \(group.title)")
                    }
                    .frame(width: box.width, height: box.height)
                    .position(x: box.midX, y: box.midY)
            }

            // The concepts: knockout under the dot, the marks' rings, the
            // p(L) arc, the bucket dot, and up to two label lines under it.
            ForEach(Array(shown).sorted(), id: \.self) { id in
                if let row = nodes[id], let p = layout.positions[id] {
                    Button {
                        onSelect(id)
                    } label: {
                        VStack(spacing: 2 * scale) {
                            ZStack {
                                Circle().fill(G.surface2)
                                    .frame(width: 26 * scale, height: 26 * scale)
                                if row.ready {
                                    Circle()
                                        .stroke(G.accent, style: StrokeStyle(lineWidth: 1.5 * scale, dash: [3, 2]))
                                        .frame(width: 30 * scale, height: 30 * scale)
                                }
                                if row.leech {
                                    Circle()
                                        .stroke(G.danger, lineWidth: 1.5 * scale)
                                        .frame(width: 36 * scale, height: 36 * scale)
                                }
                                if row.bucket == .learning {
                                    Circle()
                                        .trim(from: 0, to: min(1, max(0, row.pL)))
                                        .stroke(Color.masteryHi, style: StrokeStyle(lineWidth: 2.5 * scale, lineCap: .round))
                                        .rotationEffect(.degrees(-90))
                                        .frame(width: 2 * Self.arcRadius * scale, height: 2 * Self.arcRadius * scale)
                                }
                                dot(row, scale: scale)
                                if row.overdue {
                                    Circle()
                                        .fill(G.danger)
                                        .frame(width: 7 * scale, height: 7 * scale)
                                        .offset(x: 9 * scale, y: -9 * scale)
                                }
                            }
                            .frame(width: 40 * scale, height: 36 * scale)
                            ForEach(Array(labelLines(row.title).enumerated()), id: \.offset) { _, line in
                                Text(line)
                                    .font(.system(size: max(9, 12.5 * scale), weight: .medium))
                                    .foregroundStyle(G.text2)
                                    .lineLimit(1)
                            }
                        }
                        .frame(width: 112 * scale)
                    }
                    .buttonStyle(.plain)
                    .opacity(dimmed.contains(id) ? 0.2 : 1)
                    // .position centres the whole node (dot box plus its
                    // label lines) on the point: the dot lands where the
                    // layout put it when the centre sits half the label
                    // block under it.
                    .position(x: placed(p).x, y: placed(p).y + scale + labelHeight(id, scale: scale) / 2)
                    .accessibilityLabel(nodeCaption(row))
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: frame.height * scale)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { offered = $0 }
    }

    /// The label block's height under the dot box — the wrapped lines at
    /// the drawn font's line height.
    private func labelHeight(_ id: String, scale: CGFloat) -> CGFloat {
        CGFloat(labelLines(nodes[id]?.title ?? id).count) * 16 * scale
    }

    /// The bucket dot — DOT in DomainGraph: mastered solid m-hi, learning
    /// m-mid on an m-hi ring, untouched a surface fill on an m-lo ring.
    private func dot(_ row: IndexRow, scale: CGFloat) -> some View {
        let diameter: CGFloat = 16 * scale
        return ZStack {
            switch row.bucket {
            case .mastered:
                Circle().fill(Color.masteryHi).frame(width: diameter, height: diameter)
            case .learning:
                Circle().fill(Color.masteryMid).frame(width: diameter, height: diameter)
                    .overlay(Circle().stroke(Color.masteryHi, lineWidth: 2 * scale))
            case .untouched:
                Circle().fill(G.surface).frame(width: diameter, height: diameter)
                    .overlay(Circle().stroke(Color.masteryLo, lineWidth: 2 * scale))
            }
        }
    }

    /// The accessible name the web composes for a concept.
    private func nodeCaption(_ row: IndexRow) -> String {
        var parts = [row.title, row.bucket.label]
        if row.bucket != .untouched { parts.append("p(L) \(String(format: "%.2f", row.pL))") }
        if row.ready { parts.append("ready to learn") }
        if row.overdue { parts.append("review overdue") }
        if row.leech { parts.append("keeps slipping") }
        return parts.joined(separator: ", ")
    }
}
