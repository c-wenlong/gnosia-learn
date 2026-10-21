//
//  LearnMap.swift
//  Gnosia
//
//  The domain map's read model — the Learn index's topic-cluster board.
//  A port of the pieces of the web's /learn map the board needs:
//  apps/web/src/lib/domain-map.ts (domainTree, topicOrder, levels,
//  domainLayout, cleanEdges), domain-view.ts (domainTitle, matchCounts,
//  domainOfConcepts) and concept-graph.ts's reduceEdges.
//
//  One deliberate difference, named honestly rather than hidden: the web
//  lays each topic out with dagre. There is no dagre here, so a topic's
//  concepts take layered rows instead — the same `levels` pass the web
//  uses to order its topics, one row per layer, prerequisites above the
//  concepts that need them, slugs sorted inside a row. The packing, the
//  edge reduction and every count stay the web's own.
//

import Foundation
import SwiftUI

/// The mastery palette the board draws in — the web's `--m-hi`, `--m-mid`,
/// `--m-lo` under `.gnosia`, both appearances. `--m-hi` is the brand teal,
/// which `G.accentText` already carries; the other two have no `G.` token.
extension Color {
    static let masteryHi = G.accentText
    static let masteryMid = Color(light: 0x529798, dark: 0x187b78)
    static let masteryLo = Color(light: 0xddd5c4, dark: 0x3d4c5b)
}

/// A domain slug as words — domainTitle in domain-view.ts:
/// "classical-ai" reads "Classical AI", "hci" reads "HCI".
func domainTitle(_ slug: String) -> String {
    // ACRONYMS in domain-view.ts.
    let acronyms: Set<String> = [
        "ai", "hci", "llm", "llms", "ml", "ui", "ux", "gpu", "cpu", "os", "nlp", "rl",
    ]
    let words = slug.split(whereSeparator: { $0 == "-" || $0 == "_" || $0 == " " }).map(String.init)
    guard !words.isEmpty else { return "Other" }
    return words.enumerated().map { index, word in
        if acronyms.contains(word.lowercased()) { return word.uppercased() }
        return index == 0 ? word.prefix(1).uppercased() + word.dropFirst() : word
    }
    .joined(separator: " ")
}

/// The slug a concept files under when nothing names a domain — OTHER in
/// domain-map.ts.
private let otherDomain = "other"

// MARK: - The tree (domainTree in domain-map.ts)

/// One domain of the map — DomainSummary: its concepts and topics in
/// order, its mastery counts, and its prerequisite links to the others.
struct DomainSummary: Identifiable, Hashable {
    /// A topic's concepts under the domain, in the vocabulary's order.
    struct TopicGroup: Hashable {
        let slug: String
        let title: String
        /// Sorted concept slugs.
        let concepts: [String]
    }

    var id: String { slug }
    let slug: String
    let title: String
    /// Every concept in the domain, sorted.
    let concepts: [String]
    let topics: [TopicGroup]
    var counts: [MasteryBucket: Int] = [.mastered: 0, .learning: 0, .untouched: 0]
    /// Prerequisite edges between this domain and each other one, most first.
    let links: [DomainLink]

    /// A domain this one shares prerequisite edges with, and how many.
    struct DomainLink: Hashable {
        let domain: String
        let count: Int
    }
}

/// Which domain a concept is shown under (D1 of domain-map.md): its
/// topic's, then the folder its note lives in when the topic is not one
/// the vocabulary holds, then "other" — domainOfNode.
private func domainSlug(of concept: LearnConcept, vocabulary: [String: CatalogTopic]) -> String {
    let named = concept.topicSlug.isEmpty ? nil : vocabulary[concept.topicSlug]?.domain
    let domain = named ?? concept.domain
    guard let domain, !domain.isEmpty else { return otherDomain }
    return domain
}

/// reduceEdges in concept-graph.ts: an edge already implied by a path is
/// dropped — a `requires` only by a path of `requires`, an `assumes` by
/// anything (the web's `usable`, read carefully: it is the dropped edge's
/// kind that widens the paths that count, not the path's).
func reduceEdges(_ edges: [LearnEdge]) -> [LearnEdge] {
    var out: [String: [LearnEdge]] = [:]
    for e in edges { out[e.from, default: []].append(e) }
    func implied(_ edge: LearnEdge) -> Bool {
        let usable = { (e: LearnEdge) in edge.kind == .assumes || e.kind == .requires }
        var seen: Set<String> = [edge.from]
        var stack = (out[edge.from] ?? []).filter { $0.to != edge.to && usable($0) }.map(\.to)
        while let next = stack.popLast() {
            if next == edge.to { return true }
            if seen.contains(next) { continue }
            seen.insert(next)
            for e in out[next] ?? [] where usable(e) { stack.append(e.to) }
        }
        return false
    }
    return edges.filter { !implied($0) }
}

/// cleanEdges: the edges whose ends are both known concepts, deduplicated
/// on (from, to, kind) and sorted so every pass reads them the same way.
private func cleanEdges(_ edges: [LearnEdge], known: (String) -> Bool) -> [LearnEdge] {
    var byKey: [String: LearnEdge] = [:]
    for e in edges where e.from != e.to && known(e.from) && known(e.to) {
        byKey["\(e.from)\u{0}\(e.to)\u{0}\(e.kind.rawValue)"] = e
    }
    return byKey.keys.sorted().map { byKey[$0]! }
}

/// levels in domain-map.ts: each id's longest chain of needs, where ids
/// that need each other (a strongly connected component) count as one and
/// share a level. Tarjan's algorithm over `needs`, visiting in `ids`
/// order — deterministic, so the same graph always gives the same picture.
/// Every value of `needs` must already be inside `ids`.
func graphLevels(_ ids: [String], needs: [String: Set<String>]) -> [String: Int] {
    let order = Dictionary(uniqueKeysWithValues: ids.enumerated().map { ($1, $0) })
    var component: [String: Int] = [:]
    var index: [String: Int] = [:]
    var low: [String: Int] = [:]
    var stack: [String] = []
    var onStack = Set<String>()
    var counter = 0
    var components = 0

    func visit(_ v: String) {
        index[v] = counter
        low[v] = counter
        counter += 1
        stack.append(v)
        onStack.insert(v)
        for w in (needs[v] ?? []).sorted(by: { (order[$0] ?? .max) < (order[$1] ?? .max) }) {
            if index[w] == nil {
                visit(w)
                low[v] = min(low[v]!, low[w]!)
            } else if onStack.contains(w) {
                low[v] = min(low[v]!, index[w]!)
            }
        }
        if low[v] == index[v] {
            var w: String
            repeat {
                w = stack.removeLast()
                onStack.remove(w)
                component[w] = components
            } while w != v
            components += 1
        }
    }
    for id in ids where index[id] == nil { visit(id) }

    var level = Array(repeating: 0, count: components)
    var members: [Int: [String]] = [:]
    for id in ids { members[component[id]!, default: []].append(id) }
    for c in 0..<components {
        for id in members[c] ?? [] {
            for n in needs[id] ?? [] {
                let d = component[n]!
                if d != c { level[c] = max(level[c], level[d] + 1) }
            }
        }
    }
    return Dictionary(uniqueKeysWithValues: ids.map { ($0, level[component[$0]!]) })
}

/// topicOrder in domain-map.ts: topics with their prerequisites first.
/// Topics that need each other count as one; a topic's level is the
/// longest chain of topics it needs, then the more topics that need one
/// the earlier it goes, then the vocabulary's order.
private func topicOrder(_ slugs: [String], topicOf: [String: String], edges: [LearnEdge]) -> [String] {
    var needs = Dictionary(uniqueKeysWithValues: slugs.map { ($0, Set<String>()) })
    for e in edges {
        if let a = topicOf[e.from], let b = topicOf[e.to], a != b {
            needs[b, default: []].insert(a)
        }
    }
    var dependants = Dictionary(uniqueKeysWithValues: slugs.map { ($0, 0) })
    for set in needs.values {
        for t in set { dependants[t, default: 0] += 1 }
    }
    let level = graphLevels(slugs, needs: needs)
    let rank = Dictionary(uniqueKeysWithValues: slugs.enumerated().map { ($1, $0) })
    return slugs.sorted {
        (level[$0] ?? 0) != (level[$1] ?? 0) ? (level[$0] ?? 0) < (level[$1] ?? 0)
            : (dependants[$0] ?? 0) != (dependants[$1] ?? 0) ? (dependants[$0] ?? 0) > (dependants[$1] ?? 0)
            : (rank[$0] ?? 0) < (rank[$1] ?? 0)
    }
}

extension LearnGraph {
    /// domainTree: every concept under a domain and a topic, each domain's
    /// mastery counts and its links to the others. Domains with something
    /// studied come first, the most studied first, then the larger, so the
    /// long untouched tail sits at the end.
    ///
    /// `vocabulary` is the topic table, already in its order (position,
    /// then slug — the catalog's ORDER BY position, slug).
    func domainTree(vocabulary: [CatalogTopic]) -> [DomainSummary] {
        let bySlug = Dictionary(uniqueKeysWithValues: vocabulary.map { ($0.slug, $0) })
        let order = Dictionary(uniqueKeysWithValues: vocabulary.enumerated().map { ($1.slug, $0) })
        let domainOf = Dictionary(uniqueKeysWithValues: concepts.map { ($0.slug, domainSlug(of: $0, vocabulary: bySlug)) })

        var members: [String: [LearnConcept]] = [:]
        for c in concepts.sorted(by: { $0.slug < $1.slug }) {
            members[domainOf[c.slug]!, default: []].append(c)
        }

        var links: [String: [String: Int]] = [:]
        for e in cleanEdges(edges, known: { byId[$0] != nil }) {
            let a = domainOf[e.from]!
            let b = domainOf[e.to]!
            if a == b { continue }
            links[a, default: [:]][b, default: 0] += 1
            links[b, default: [:]][a, default: 0] += 1
        }

        let summaries: [DomainSummary] = members.map { slug, list in
            var counts: [MasteryBucket: Int] = [.mastered: 0, .learning: 0, .untouched: 0]
            for c in list { counts[c.bucket, default: 0] += 1 }
            // topicsOf: a group per topic the domain's concepts file under,
            // in the vocabulary's order, a topic it does not name after
            // them by slug.
            var groups: [String: [String]] = [:]
            for c in list {
                let key = c.topicSlug.isEmpty ? otherDomain : c.topicSlug
                groups[key, default: []].append(c.slug)
            }
            let topics = groups.map { topicSlug, ids in
                DomainSummary.TopicGroup(
                    slug: topicSlug,
                    title: bySlug[topicSlug]?.title ?? (topicSlug == otherDomain ? "Other" : topicSlug),
                    concepts: ids.sorted()
                )
            }
            .sorted {
                (order[$0.slug] ?? .max) != (order[$1.slug] ?? .max)
                    ? (order[$0.slug] ?? .max) < (order[$1.slug] ?? .max)
                    : $0.slug < $1.slug
            }
            let domainLinks = (links[slug] ?? [:])
                .map { DomainSummary.DomainLink(domain: $0.key, count: $0.value) }
                .sorted { $0.count != $1.count ? $0.count > $1.count : $0.domain < $1.domain }
            return DomainSummary(
                slug: slug,
                title: domainTitle(slug),
                concepts: list.map(\.slug),
                topics: topics,
                counts: counts,
                links: domainLinks
            )
        }
        let studied = { (d: DomainSummary) in (d.counts[.mastered] ?? 0) + (d.counts[.learning] ?? 0) }
        return summaries.sorted {
            let s0 = studied($0), s1 = studied($1)
            if s0 != s1 { return s0 > s1 }
            if $0.concepts.count != $1.concepts.count { return $0.concepts.count > $1.concepts.count }
            return $0.slug < $1.slug
        }
    }

    /// Each concept's domain, from the tree — domainOfConcepts.
    static func domainOfConcepts(_ tree: [DomainSummary]) -> [String: String] {
        var out: [String: String] = [:]
        for d in tree { for id in d.concepts { out[id] = d.slug } }
        return out
    }

    /// How many of each domain's concepts a filter and search leave
    /// showing — matchCounts (D8).
    static func matchCounts(_ tree: [DomainSummary], shown: Set<String>) -> [String: Int] {
        var out: [String: Int] = [:]
        for d in tree { out[d.slug] = d.concepts.filter { shown.contains($0) }.count }
        return out
    }
}

// MARK: - One domain as a picture (domainLayout in domain-map.ts)

/// The domain's own layout — DomainLayout minus the axes arrangement,
/// which the approximation does not draw.
struct DomainLayout {
    /// A topic's group in the picture's packed order.
    struct Group: Hashable {
        let topic: String
        let title: String
        /// Sorted concept slugs.
        let concepts: [String]
        /// The box the group is drawn in, including its title band.
        let box: CGRect
    }
    /// An edge with one end in another domain — DomainLayout.outside.
    struct OutsideEdge: Hashable {
        let edge: LearnEdge
        /// The other end's domain.
        let domain: String
        /// The end inside this one.
        let inside: String
    }

    let domain: String
    /// The picture's natural size, before it is scaled to its card.
    let size: CGSize
    /// Each concept's dot centre, in the picture's own units.
    let positions: [String: CGPoint]
    /// One per topic, in the order they were packed: prerequisites first.
    let groups: [Group]
    /// The domain's own edges, both ends inside it, transitively reduced.
    let edges: [LearnEdge]
    /// Edges with one end in another domain, unreduced.
    let outside: [OutsideEdge]
    /// Each concept's layer — prerequisites first — for list order.
    let level: [String: Int]
}

/// The metrics the domain picture draws at, kept with the web's where the
/// layout depends on them — NODE_WIDTH/NODE_HEIGHT (the box a concept's
/// dot and two label lines take), DOT_TOP, GROUP_PAD, GROUP_GAP,
/// LABEL_BELOW, and the packing's ASPECT and MAX_ROW_WIDTH.
private enum MapMetrics {
    static let nodeWidth: CGFloat = 112
    static let nodeHalf: CGFloat = nodeWidth / 2
    static let columnPitch: CGFloat = 128   // NODE_WIDTH + nodesep 16
    static let rowPitch: CGFloat = 98       // NODE_HEIGHT + ranksep 40
    static let dotTop: CGFloat = 12
    static let groupPad: CGFloat = 10
    static let groupGap: CGFloat = 24
    /// The band a topic's title draws in — the web's titleBand at the
    /// size the native picture draws titles.
    static let titleBand: CGFloat = 30
    static let labelBelow: CGFloat = 46
    static let aspect: CGFloat = 1.8
    static let maxRowWidth: CGFloat = 900
    /// titleWidth's approximation: ~7.4pt a character plus the insets.
    static func titleWidth(_ title: String) -> CGFloat {
        ceil(CGFloat(title.count) * 7.4) + 24
    }
}

/// groupBox in domain-view.ts: the box a topic's group is drawn in, from
/// where its concepts' dots are — wide enough for each label, at least
/// `minWidth` (its title's width) and centred on its concepts when that is
/// wider, with the title band above the top row.
private func groupBox(_ points: [CGPoint], minWidth: CGFloat) -> CGRect {
    guard !points.isEmpty else { return .zero }
    var minX = CGFloat.infinity, minY = CGFloat.infinity
    var maxX = -CGFloat.infinity, maxY = -CGFloat.infinity
    for p in points {
        minX = min(minX, p.x); minY = min(minY, p.y)
        maxX = max(maxX, p.x); maxY = max(maxY, p.y)
    }
    let left = minX - MapMetrics.nodeHalf - MapMetrics.groupPad
    let right = maxX + MapMetrics.nodeHalf + MapMetrics.groupPad
    let width = max(right - left, minWidth)
    let x = (left + right) / 2 - width / 2
    let y = minY - MapMetrics.dotTop - MapMetrics.groupPad - MapMetrics.titleBand
    return CGRect(x: x, y: y, width: width, height: maxY + MapMetrics.labelBelow + MapMetrics.groupPad - y)
}

extension LearnGraph {
    /// One domain as a picture (D3, D4): a group per topic, packed left to
    /// right in rows sized so the whole is about ASPECT wide (at most
    /// MAX_ROW_WIDTH), prerequisite topics first. The drawn edges are the
    /// domain's own, transitively reduced; the ones that reach another
    /// domain land in `outside`, not on the picture.
    ///
    /// Where the web runs dagre inside each topic, this lays the concepts
    /// out in rows of `levels`: one row per layer of needs inside the
    /// topic, slugs sorted inside a row, each row centred.
    ///
    /// `vocabulary` is the topic table by slug, as `domainTree` takes it.
    func domainLayout(_ domain: DomainSummary, vocabulary: [String: CatalogTopic]) -> DomainLayout {
        let member = Set(domain.concepts)
        let clean = cleanEdges(edges, known: { member.contains($0) })
        let own = clean.filter { member.contains($0.from) && member.contains($0.to) }
        let drawn = reduceEdges(own)
        // Edges the domain shares with others, and which end is ours. The
        // tree's link counts agree because the same cleaned set feeds both.
        let all = cleanEdges(edges, known: { byId[$0] != nil })
        let domainOf = Dictionary(uniqueKeysWithValues: concepts.map { ($0.slug, domainSlug(of: $0, vocabulary: vocabulary)) })
        let outside = all
            .filter { member.contains($0.from) != member.contains($0.to) }
            .map { e -> DomainLayout.OutsideEdge in
                let inside = member.contains(e.from) ? e.from : e.to
                let there = inside == e.from ? e.to : e.from
                return DomainLayout.OutsideEdge(edge: e, domain: domainOf[there] ?? otherDomain, inside: inside)
            }

        // Each topic's concepts in layers: needs are the topic's own
        // reduced edges, so a loop cannot strand a pair on the last row.
        var level: [String: Int] = [:]
        var local: [String: (box: CGRect, dots: [String: CGPoint])] = [:]
        var groups: [DomainSummary.TopicGroup] = []
        for group in domain.topics {
            let ids = group.concepts
            let inside = Set(ids)
            var needs: [String: Set<String>] = Dictionary(uniqueKeysWithValues: ids.map { ($0, Set<String>()) })
            for e in reduceEdges(own.filter { inside.contains($0.from) && inside.contains($0.to) }) {
                needs[e.to, default: []].insert(e.from)
            }
            let levels = graphLevels(ids, needs: needs)
            for id in ids { level[id] = levels[id] ?? 0 }
            var rows: [Int: [String]] = [:]
            for id in ids { rows[levels[id] ?? 0, default: []].append(id) }
            let widest = rows.values.map(\.count).max() ?? 1
            let innerWidth = max(CGFloat(widest) * MapMetrics.columnPitch, MapMetrics.titleWidth(group.title))
            var dots: [String: CGPoint] = [:]
            for (rowLevel, row) in rows {
                let ordered = row.sorted()
                let startX = (innerWidth - CGFloat(ordered.count) * MapMetrics.columnPitch) / 2
                for (i, id) in ordered.enumerated() {
                    dots[id] = CGPoint(
                        x: startX + CGFloat(i) * MapMetrics.columnPitch + MapMetrics.columnPitch / 2,
                        y: CGFloat(rowLevel) * MapMetrics.rowPitch
                    )
                }
            }
            let box = groupBox(Array(dots.values), minWidth: MapMetrics.titleWidth(group.title))
            // The dots are kept local to the group's box: packing moves the
            // box, the dots ride along.
            local[group.slug] = (box, Dictionary(uniqueKeysWithValues: dots.map {
                ($0.key, CGPoint(x: $0.value.x - box.minX, y: $0.value.y - box.minY))
            }))
            groups.append(group)
        }

        // Pack the groups in topic order, left to right, wrapping at the
        // row width — domainLayout's flow.
        let topicOf = Dictionary(uniqueKeysWithValues: groups.flatMap { g in g.concepts.map { ($0, g.slug) } })
        let ordered = topicOrder(groups.map(\.slug), topicOf: topicOf, edges: own)
        let area = groups.reduce(0) { $0 + (local[$1.slug]!.box.width + MapMetrics.groupGap) * (local[$1.slug]!.box.height + MapMetrics.groupGap) }
        let widest = groups.map { local[$0.slug]!.box.width }.max() ?? 0
        let rowWidth = max(widest, min(MapMetrics.maxRowWidth, (area * MapMetrics.aspect).squareRoot().rounded()))

        var positions: [String: CGPoint] = [:]
        var placed: [DomainLayout.Group] = []
        var x: CGFloat = 0
        var top: CGFloat = 0
        var rowHeight: CGFloat = 0
        var width: CGFloat = 0
        for slug in ordered {
            let laid = local[slug]!
            if x > 0 && x + laid.box.width > rowWidth {
                x = 0
                top += rowHeight + MapMetrics.groupGap
                rowHeight = 0
            }
            for (id, p) in laid.dots {
                positions[id] = CGPoint(x: x + p.x, y: top + p.y)
            }
            let g = groups.first { $0.slug == slug }!
            placed.append(DomainLayout.Group(
                topic: g.slug, title: g.title, concepts: g.concepts,
                box: CGRect(x: x, y: top, width: laid.box.width, height: laid.box.height)
            ))
            width = max(width, x + laid.box.width)
            rowHeight = max(rowHeight, laid.box.height)
            x += laid.box.width + MapMetrics.groupGap
        }

        return DomainLayout(
            domain: domain.slug,
            size: CGSize(width: width, height: groups.isEmpty ? 0 : top + rowHeight),
            positions: positions,
            groups: placed,
            edges: drawn,
            outside: outside,
            level: level
        )
    }
}
