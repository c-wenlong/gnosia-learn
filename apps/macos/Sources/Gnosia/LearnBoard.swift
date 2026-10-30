//
//  LearnBoard.swift
//  Gnosia
//
//  The Learn index's board — apps/web/src/components/learn/LearnIndex.tsx
//  and the domain level of DomainBrowser.tsx, natively. The header reads
//  as the web's does ("Learn · 496 concepts · 0 mastered · 11 learning ·
//  485 not started"), the search sits top-right, the Status menu and the
//  Table/Graph toggle sit under it, and the graph view opens on a card
//  per domain — the topic clusters the web's DomainCards draws — which
//  opens the domain's picture.
//
//  The levels are the web's (docs/proposals/domain-map.md, D2): the cards,
//  one domain as a picture, one topic of it. Choosing a concept anywhere
//  opens its workspace — the native mirror of the web's "Open in
//  workspace"; the web's intermediate MapPanel is folded into that step.
//  The concept rail beside the board is the drill-down list the web
//  docks beside the picture.
//

import SwiftUI

/// The index's two views — IndexView. The map is the default, as the
/// web's is (`view=table` is the only URL state).
enum LearnBoardMode: String, CaseIterable {
    case table, graph

    var label: String { rawValue.capitalized }
}

/// The whole board surface: header, controls, and whichever level and
/// view the learner is on. The parent keeps the state so the concept
/// rail beside it reads the same filter, search and place.
struct LearnBoardView: View {
    @Environment(CatalogStore.self) private var store

    /// The concept whose workspace is open — the index's `selected`,
    /// which doubles as "is the workspace on screen" here.
    @Binding var selection: String?
    @Binding var filter: IndexFilter
    @Binding var search: String
    @Binding var mode: LearnBoardMode
    /// The open domain, or nil on the cards — `place.domain`.
    @Binding var domain: String?
    /// The open topic of it — `place.topic`.
    @Binding var topic: String?

    /// Every row once — toRow order.
    private var allRows: [IndexRow] { store.learn.indexRows() }
    /// The rows the filter and the search leave — `visible`.
    private var visible: [IndexRow] {
        allRows.filter { matchesFilter($0, filter) && matchesQuery($0, search) }
    }
    /// The topic vocabulary in its own order (position, then slug — the
    /// catalog's ORDER BY position, slug).
    private var vocabulary: [CatalogTopic] {
        store.topics.values.sorted {
            $0.position != $1.position ? $0.position < $1.position : $0.slug < $1.slug
        }
    }
    private var vocabularyBySlug: [String: CatalogTopic] { store.topics }
    private var tree: [DomainSummary] { store.learn.domainTree(vocabulary: vocabulary) }
    private var domainOf: [String: String] { LearnGraph.domainOfConcepts(tree) }
    private var byId: [String: IndexRow] {
        Dictionary(uniqueKeysWithValues: allRows.map { ($0.slug, $0) })
    }
    private var shown: Set<String> { Set(visible.map(\.slug)) }
    private var dimmed: Set<String> {
        Set(allRows.filter { !shown.contains($0.slug) }.map(\.slug))
    }
    private var searching: Bool {
        !search.trimmingCharacters(in: .whitespaces).isEmpty || filter != .all
    }
    /// The open domain's summary, validated against the tree — a slug the
    /// vocabulary stopped naming reads as the cards again, as placeOf's
    /// check does.
    private var openDomain: DomainSummary? {
        domain.flatMap { slug in tree.first { $0.slug == slug } }
    }
    private var openTopic: DomainSummary.TopicGroup? {
        guard let topic else { return nil }
        return openDomain?.topics.first { $0.slug == topic }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            controls
            if mode == .graph && store.topics.isEmpty && !store.learn.concepts.isEmpty {
                // foldersOnly — the web's Callout when the topic rows
                // cannot be read: the domains degrade to note folders.
                Text("Topics could not be read, so concepts are grouped by their note folders until they can.")
                    .font(.callout)
                    .foregroundStyle(G.text2)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(G.tint, in: RoundedRectangle(cornerRadius: 12))
            }
            if let error = store.error {
                ContentUnavailableView {
                    Label("No catalog", systemImage: "cylinder.split.1x2")
                } description: {
                    Text(error).font(.caption)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.learn.concepts.isEmpty {
                ContentUnavailableView(
                    "No concepts",
                    systemImage: "brain",
                    description: Text("The catalog is reachable and holds no concepts. Index your notes and snapshot again.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                content
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(G.page)
        .onChange(of: mode) { _, now in
            // toView in LearnIndex: the map opens on the domain of the
            // concept that was selected, or back on the cards.
            if now == .graph {
                domain = selection.flatMap { domainOf[$0] }
                topic = nil
            }
        }
    }

    /// "Learn · 496 concepts · 0 mastered · 11 learning · 485 not
    /// started" — the title block, with the search at the right as the
    /// web's header places it.
    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("Learn")
                .font(.gnosiaTitle(28))
                .foregroundStyle(G.text)
            Text(countsLine)
                .font(.callout)
                .foregroundStyle(G.text2)
            Spacer(minLength: 8)
            BoardSearchField(search: $search, onSubmit: searchSubmit)
                .frame(width: 280)
        }
    }

    /// The counts under the title — bucketCounts over all rows, so the
    /// numbers hold still as the learner types.
    private var countsLine: String {
        let counts = store.learn.bucketCounts(allRows)
        let n = allRows.count
        return "\(n) concept\(n == 1 ? "" : "s") · \(counts[.mastered] ?? 0) mastered · "
            + "\(counts[.learning] ?? 0) learning · \(counts[.untouched] ?? 0) "
            + MasteryBucket.untouched.label.lowercased()
    }

    /// The Status menu and the view toggle — the web's control row, the
    /// segmented control pushed right.
    private var controls: some View {
        HStack(spacing: 8) {
            Menu {
                ForEach(store.learn.statusFilterOptions(allRows), id: \.id) { option in
                    Button { filter = option.filter } label: {
                        if option.filter == filter {
                            Label("\(option.label) (\(option.count))", systemImage: "checkmark")
                        } else {
                            Text("\(option.label) (\(option.count))")
                        }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text("Status: \(filter.label)")
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption2)
                }
            }
            .font(.callout)
            // The label draws its own chevrons; the default style would add
            // a bezel and a second indicator around it.
            .menuStyle(.button)
            .buttonStyle(.plain)
            .menuIndicator(.hidden)
            .fixedSize()

            Spacer()

            Picker("View", selection: $mode) {
                ForEach(LearnBoardMode.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
        }
    }

    /// The level the board is on: the table, the cards, or one domain.
    @ViewBuilder
    private var content: some View {
        switch mode {
        case .table:
            LearnConceptTable(rows: visible) { open($0) }
        case .graph:
            if let domain = openDomain {
                ClusterView(
                    domain: domain,
                    layout: store.learn.domainLayout(domain, vocabulary: vocabularyBySlug),
                    topic: openTopic,
                    nodes: byId,
                    dimmed: dimmed,
                    filter: $filter,
                    onUp: { go(domain: nil, topic: nil) },
                    onTopic: { topic = $0 },
                    onSelect: { open($0) },
                    onLink: { go(domain: $0, topic: nil) }
                )
            } else {
                ClusterCards(
                    tree: tree,
                    rows: byId,
                    matches: LearnGraph.matchCounts(tree, shown: shown),
                    searching: searching,
                    onOpen: { go(domain: $0, topic: nil) }
                )
            }
        }
    }

    /// A concept pressed anywhere on the board opens its workspace —
    /// `pick` in LearnIndex, minus the place it would move to first
    /// (the place is already shown, or the table, which has none).
    private func open(_ slug: String) {
        selection = slug
    }

    /// `go` in LearnIndex: a move to another level. A selection outside
    /// the new place is let go — `shownIn`, so a workspace whose concept
    /// is not in the domain being opened does not keep it.
    private func go(domain nextDomain: String?, topic nextTopic: String?) {
        if let sel = selection, nextDomain != domainOf[sel] {
            selection = nil
        }
        domain = nextDomain
        topic = nextTopic
    }

    /// Enter in the search on the map opens the best match in its domain
    /// (D8) — the SearchField's Enter in LearnIndex, over the rows the
    /// filter and the search leave showing so it never lands on a concept
    /// the map has dimmed.
    private func searchSubmit() {
        guard mode == .graph, let id = firstMatch() else { return }
        if domainOf[id] == domain && topic == nil {
            selection = id
        } else {
            domain = domainOf[id]
            topic = nil
            selection = id
        }
    }

    /// firstMatch in map-reading.ts: a title that starts with the query
    /// first, then one whose title or slug holds every word, then one
    /// whose summary does, in the index's own order.
    private func firstMatch() -> String? {
        func words(_ text: String) -> [String] {
            text.lowercased().split(whereSeparator: { $0 == "-" || $0.isWhitespace }).map(String.init)
        }
        let q = words(search)
        if q.isEmpty { return nil }
        let phrase = q.joined(separator: " ")
        let holds = { (hay: String) in q.allSatisfy { hay.contains($0) } }
        if let starts = visible.first(where: { words($0.title).joined(separator: " ").hasPrefix(phrase) }) {
            return starts.slug
        }
        let named = { (row: IndexRow) in
            holds("\(words(row.title).joined(separator: " ")) \(words(row.slug).joined(separator: " "))")
        }
        if let match = visible.first(where: named) { return match.slug }
        return visible.first {
            holds("\(words($0.title).joined(separator: " ")) \(words($0.slug).joined(separator: " ")) \(words($0.summary).joined(separator: " "))")
        }?.slug
    }
}

/// The web's SearchField: a filled rounded field, the magnifier, the
/// text, and a clear button when it holds something.
private struct BoardSearchField: View {
    @Binding var search: String
    /// Return pressed — on the map the best match opens in its domain.
    var onSubmit: () -> Void = {}

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(G.text3)
            TextField("Search concepts", text: $search)
                .textFieldStyle(.plain)
                .onSubmit(onSubmit)
            if !search.isEmpty {
                Button { search = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(G.text3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .font(.callout)
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(G.surface2, in: RoundedRectangle(cornerRadius: 9))
    }
}

/// The domain cards (D2, D8): what each holds, how much of it is known,
//  and how much of it a search finds — DomainCards.
private struct ClusterCards: View {
    let tree: [DomainSummary]
    let rows: [String: IndexRow]
    /// Concepts per domain the search and the filter leave showing.
    let matches: [String: Int]
    let searching: Bool
    let onOpen: (String) -> Void

    private func plural(_ n: Int, _ word: String) -> String {
        "\(n) \(word)\(n == 1 ? "" : "s")"
    }

    var body: some View {
        ScrollView {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 280, maximum: 420), spacing: 12)],
                spacing: 12
            ) {
                ForEach(tree) { d in
                    ClusterCard(
                        domain: d,
                        found: matches[d.slug] ?? 0,
                        ready: d.concepts.filter { rows[$0]?.ready == true }.count,
                        due: d.concepts.filter { rows[$0]?.isDue == true }.count,
                        searching: searching,
                        onOpen: { onOpen(d.slug) }
                    )
                }
            }
            .padding(.bottom, 16)
        }
    }
}

/// One domain card: the title, "84 concepts · 16 topics", the mastered
/// and learning shares as one bar, the counts line with due in danger,
/// and the "Links to" footer.
private struct ClusterCard: View {
    let domain: DomainSummary
    let found: Int
    let ready: Int
    let due: Int
    let searching: Bool
    let onOpen: () -> Void

    @State private var hover = false

    private var total: Int { max(1, domain.concepts.count) }
    private var dim: Bool { searching && found == 0 }
    private func share(_ n: Int) -> CGFloat { CGFloat(n) / CGFloat(total) }

    private func plural(_ n: Int, _ word: String) -> String {
        "\(n) \(word)\(n == 1 ? "" : "s")"
    }

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(domain.title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(G.text)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if searching {
                        Text(found == 1 ? "1 match" : "\(found) matches")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(found > 0 ? G.accentText : G.text3)
                    }
                }
                Text("\(plural(domain.concepts.count, "concept")) · \(plural(domain.topics.count, "topic"))")
                    .font(.caption)
                    .foregroundStyle(G.text2)
                // The stacked bar: mastered hi, learning mid, the rest
                // track — the card's role="img" meter.
                GeometryReader { geo in
                    HStack(spacing: 0) {
                        Rectangle().fill(Color.masteryHi)
                            .frame(width: geo.size.width * share(domain.counts[.mastered] ?? 0))
                        Rectangle().fill(Color.masteryMid)
                            .frame(width: geo.size.width * share(domain.counts[.learning] ?? 0))
                    }
                    // The track spans the card; the HStack alone is only as
                    // wide as its fills, which drew a 2-of-2 domain and a
                    // 2-of-7 one as the same bar with nothing left to fill.
                    .frame(width: geo.size.width, alignment: .leading)
                    .background(G.surface2)
                    .clipShape(Capsule())
                }
                .frame(height: 8)
                .accessibilityLabel(
                    "\(domain.counts[.mastered] ?? 0) mastered, \(domain.counts[.learning] ?? 0) learning, "
                    + "\(domain.counts[.untouched] ?? 0) \(MasteryBucket.untouched.label.lowercased())"
                )
                (Text("\(domain.counts[.mastered] ?? 0) mastered · \(domain.counts[.learning] ?? 0) learning")
                    + (ready > 0 ? Text(" · \(ready) ready") : Text(""))
                    + (due > 0 ? Text(" · \(due) due").foregroundStyle(G.danger) : Text("")))
                    .font(.caption)
                    .foregroundStyle(G.text2)
                if !domain.links.isEmpty {
                    Text("Links to \(domain.links.prefix(3).map { domainTitle($0.domain) }.joined(separator: ", "))")
                        .font(.caption)
                        .foregroundStyle(G.text3)
                        .lineLimit(1)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(hover ? G.accent : G.border, lineWidth: 2)
            )
            .opacity(dim ? 0.4 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 20))
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

/// One domain, or one topic of it (D2 to D4): the legend, the picture,
/// the links out, and the caption. The concept list the web docks beside
/// the picture is the rail the parent draws.
private struct ClusterView: View {
    let domain: DomainSummary
    let layout: DomainLayout
    /// The open topic's group, or nil for the whole domain.
    let topic: DomainSummary.TopicGroup?
    let nodes: [String: IndexRow]
    let dimmed: Set<String>
    /// The Status filter — the legend's chips set and clear it.
    @Binding var filter: IndexFilter
    var onUp: () -> Void
    var onTopic: (String?) -> Void
    var onSelect: (String) -> Void
    /// A linked domain pressed — the board opens it.
    var onLink: (String) -> Void

    /// The concepts the picture shows — the open topic's when one is
    /// open. The legend counts among these.
    private var memberIds: [String] {
        (topic == nil ? layout.groups : layout.groups.filter { $0.topic == topic?.slug })
            .flatMap(\.concepts)
    }

    /// legendMembers: which of the shown concepts fall in each group, a
    /// ready one in its bucket's group too — counted whatever the search.
    private var members: [IndexFilter: Int] {
        var out: [IndexFilter: Int] = [.mastered: 0, .learning: 0, .untouched: 0, .ready: 0]
        for id in memberIds {
            guard let row = nodes[id] else { continue }
            for f in [IndexFilter.mastered, .learning, .untouched, .ready] where matchesFilter(row, f) {
                out[f, default: 0] += 1
            }
        }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            breadcrumb
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    LegendChips(members: members, filter: $filter)
                    DomainMapView(
                        layout: layout,
                        nodes: nodes,
                        topic: topic?.slug,
                        dimmed: dimmed,
                        onSelect: onSelect,
                        onTopic: { onTopic($0) }
                    )
                    if !domain.links.isEmpty {
                        HStack(spacing: 8) {
                            Text("Links to other domains:")
                            ForEach(domain.links, id: \.domain) { link in
                                Button {
                                    onLink(link.domain)
                                } label: {
                                    Text("\(domainTitle(link.domain)) (\(link.count))")
                                        .foregroundStyle(G.accentText)
                                        .underline(false)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(G.text2)
                        .padding(.top, 4)
                    }
                    Text("Prerequisites sit above. Solid: required. Dashed: background. The arc round a dot is its p(L); "
                        + "a dashed ring is ready to learn; a red dot is a review overdue, a red ring keeps slipping.")
                        .font(.caption)
                        .foregroundStyle(G.text3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(G.surface, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(G.border, lineWidth: 1.5))
                .padding(.bottom, 16)
            }
        }
    }

    /// "Learn › Domain [› Topic]" — each level but the last goes back up.
    private var breadcrumb: some View {
        HStack(spacing: 6) {
            Button("Learn", action: onUp)
                .buttonStyle(.plain)
                .foregroundStyle(G.text2)
            Text("›")
                .foregroundStyle(G.text3)
            if let topic {
                Button(domain.title) { onTopic(nil) }
                    .buttonStyle(.plain)
                    .foregroundStyle(G.text2)
                Text("›")
                    .foregroundStyle(G.text3)
                Text(topic.title)
                    .fontWeight(.semibold)
                    .foregroundStyle(G.text)
            } else {
                Text(domain.title)
                    .fontWeight(.semibold)
                    .foregroundStyle(G.text)
            }
        }
        .font(.callout)
    }
}

/// The table view: the index rows as a real table with the web's columns —
/// concept, mastery, due, last seen, course. Choosing a row opens the
/// concept's workspace; the web's own link is the title's.
private struct LearnConceptTable: View {
    let rows: [IndexRow]
    var onOpen: (String) -> Void

    @State private var picked: String?

    var body: some View {
        Table(rows, selection: $picked) {
            TableColumn("Concept") { row in
                HStack(spacing: 8) {
                    BucketDot(bucket: row.bucket)
                    Text(row.title).lineLimit(1)
                    if row.leech {
                        Text("Keeps slipping")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(G.danger)
                    }
                }
            }
            TableColumn("Mastery") { row in
                HStack(spacing: 8) {
                    ZStack(alignment: .leading) {
                        Capsule().fill(G.track)
                        Capsule()
                            .fill(row.bucket == .mastered ? Color.masteryHi : Color.masteryMid)
                            .frame(width: 72 * (row.bucket == .untouched ? 0 : min(1, max(0, row.pL))))
                    }
                    .frame(width: 72, height: 6)
                    Text(row.bucket == .untouched ? "–" : String(format: "%.2f", row.pL))
                        .font(.caption)
                        .foregroundStyle(G.text2)
                        .monospacedDigit()
                }
            }
            .width(min: 100, ideal: 150, max: 220)
            TableColumn("Due") { row in
                Text(row.dueLabel)
                    .font(.caption)
                    .foregroundStyle(row.overdue ? G.danger : G.text2)
            }
            .width(90)
            TableColumn("Last seen") { row in
                Text(row.lastSeenLabel)
                    .font(.caption)
                    .foregroundStyle(G.text2)
            }
            .width(100)
            TableColumn("Course") { row in
                Text(row.courseLabel ?? "–")
                    .font(.caption)
                    .foregroundStyle(G.text2)
            }
            .width(110)
        }
        .onChange(of: picked) { _, slug in
            guard let slug else { return }
            onOpen(slug)
            picked = nil
        }
        .overlay {
            if rows.isEmpty {
                ContentUnavailableView(
                    "No concepts match",
                    systemImage: "line.3.horizontal.decrease.circle",
                    description: Text("Try another filter or a shorter search.")
                )
            }
        }
    }
}

/// The legend over a domain's picture (D9): a chip per group — mastered,
/// learning, not started, ready to learn — with its swatch and its count
/// among the concepts the picture shows. A press sets the Status filter
/// to the group; pressing it again clears the filter — legendPress. The
/// web's hover preview, which lights the group in the picture, is the
/// part the approximation leaves out.
private struct LegendChips: View {
    /// How many of the shown concepts each group holds — legendMembers.
    let members: [IndexFilter: Int]
    @Binding var filter: IndexFilter

    /// LEGEND_GROUPS in learn-index.ts, in order.
    private static let groups: [(filter: IndexFilter, label: String)] = [
        (.mastered, MasteryBucket.mastered.label),
        (.learning, MasteryBucket.learning.label),
        (.untouched, MasteryBucket.untouched.label),
        (.ready, IndexFilter.ready.label),
    ]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Self.groups, id: \.filter) { group in
                let on = filter == group.filter
                Button {
                    filter = on ? .all : group.filter
                } label: {
                    HStack(spacing: 6) {
                        if group.filter == .ready {
                            // The dashed accent ring the picture draws
                            // round a ready concept — ReadyRing.
                            Circle()
                                .stroke(G.accent, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                                .frame(width: 10, height: 10)
                        } else {
                            BucketDot(bucket: group.filter == .mastered ? .mastered
                                        : group.filter == .learning ? .learning : .untouched)
                        }
                        Text(group.label)
                        Text("\(members[group.filter] ?? 0)")
                            .foregroundStyle(on ? G.accentText : G.text2)
                            .monospacedDigit()
                    }
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 10)
                    .frame(height: 28)
                    .foregroundStyle(on ? G.accentText : G.text)
                    .background(on ? G.tint : G.surface, in: Capsule())
                    .overlay(Capsule().stroke(on ? G.accent : G.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(group.label), \(members[group.filter] ?? 0)")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .accessibilityLabel("Show on the map")
    }
}
