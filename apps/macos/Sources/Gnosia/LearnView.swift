//
//  LearnView.swift
//  Gnosia
//
//  The Learn index as the web's /learn board: the cluster cards and the
//  domain map as the primary content (LearnBoard), the table a toggle
//  away, and the concept rail beside it as the drill-down — the board's
//  cards open a domain, the rail scopes to its concepts, and a concept
//  opens its workspace. The workspaces keep their draft slots: the last
//  eight stay mounted hidden behind the one on screen, so a session
//  walked part-way in is where the learner left it when they come back.
//
//  The state is one set the board and the rail share — the Status
//  filter, the search, the view and the place (domain, topic) — as the
//  web's LearnIndex keeps them in its component and mirrors them to the
//  URL.
//

import SwiftUI

struct LearnView: View {
    @Environment(CatalogStore.self) private var store
    /// The concept whose workspace is on screen; nil shows the board.
    @State private var selection: String?
    @State private var filter: IndexFilter = .all
    @State private var search = ""
    /// The index's view — the map opens first, as the web's does.
    @State private var mode: LearnBoardMode = .graph
    /// The board's place: the open domain and a topic of it.
    @State private var domain: String?
    @State private var topic: String?
    /// The draft slots: the concept workspaces kept mounted behind the
    /// selected one, most recently used last. The web keeps the
    /// concept's in-progress session per page visit — here a workspace
    /// stays alive while it is still in the recent set, so a session
    /// walked part-way in the centre panel is where the learner left it
    /// when they come back, and the slot evicted beyond the bound is
    /// the web's "went away": its session closes as the view unmounts.
    @State private var mounted: [String] = []

    /// How many workspaces stay alive at once. The web's per-tab store
    /// has no bound; eight is the working set a browse keeps, past which
    /// the oldest slot closes like the page it replaced.
    private static let draftSlots = 8

    private var allRows: [IndexRow] { store.learn.indexRows() }

    /// The rows one filter state shows: the Status pick, then the query.
    private var rows: [IndexRow] {
        allRows.filter { matchesFilter($0, filter) && matchesQuery($0, search) }
    }

    /// The topic vocabulary in its own order — domainTree's input.
    private var vocabulary: [CatalogTopic] {
        store.topics.values.sorted {
            $0.position != $1.position ? $0.position < $1.position : $0.slug < $1.slug
        }
    }

    private var tree: [DomainSummary] { store.learn.domainTree(vocabulary: vocabulary) }

    /// The open domain, validated against the tree.
    private var openDomain: DomainSummary? {
        domain.flatMap { slug in tree.first { $0.slug == slug } }
    }

    /// The open domain's picture — the rail reads the same group order
    /// and reading order the board draws.
    private var openLayout: DomainLayout? {
        openDomain.map { store.learn.domainLayout($0, vocabulary: store.topics) }
    }

    private var domainOf: [String: String] { LearnGraph.domainOfConcepts(tree) }

    /// The rail's concepts: the open domain or topic's, in the picture's
    /// reading order — the web list's `reading` sort (the layout's y,
    /// then x). Without a place, every row the filter shows, in the
    /// index's own order.
    private var railRows: [IndexRow] {
        let byId = Dictionary(uniqueKeysWithValues: allRows.map { ($0.slug, $0) })
        guard let d = openDomain, let layout = openLayout else { return rows }
        let scoped: [String]
        if let topic, let group = d.topics.first(where: { $0.slug == topic }) {
            scoped = group.concepts
        } else {
            scoped = d.concepts
        }
        let at = layout.positions
        return scoped.compactMap { byId[$0] }
            .sorted {
                let a = at[$0.slug] ?? .zero
                let b = at[$1.slug] ?? .zero
                return a.y != b.y ? a.y < b.y : a.x < b.x
            }
    }

    /// The slugs the filter and search leave — the rail dims what they
    /// would hide while a place is open, as the map dims its dots.
    private var shown: Set<String> { Set(rows.map(\.slug)) }

    var body: some View {
        // A fixed-width rail, not a nested NavigationSplitView: a second
        // split inside the detail column squeezes the window's columns and
        // slides the app sidebar offscreen on narrower windows. The web's
        // concept list beside the picture is a fixed column too.
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                if selection != nil {
                    // The way back to the board while a workspace is on
                    // screen — the web's breadcrumb top level.
                    Button { selection = nil } label: {
                        Label("Learn", systemImage: "chevron.left")
                            .font(.callout.weight(.medium))
                            .foregroundStyle(G.text2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 10)
                    .padding(.top, 10)
                }

                if let d = openDomain {
                    // The place the rail is scoped to — back to the cards,
                    // the domain's title, and how many concepts it holds.
                    HStack(spacing: 6) {
                        Button { domain = nil; topic = nil } label: {
                            Image(systemName: "chevron.left")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(G.text2)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("All domains")
                        Text(d.title)
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(G.text)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        Text("\(d.concepts.count)")
                            .font(.caption)
                            .foregroundStyle(G.text3)
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, selection == nil ? 12 : 4)
                    .padding(.bottom, 6)
                }

                if railRows.isEmpty && store.error == nil && !store.learn.concepts.isEmpty {
                    ContentUnavailableView(
                        "No concepts match",
                        systemImage: "line.3.horizontal.decrease.circle",
                        description: Text("Nothing here is in “\(filter.label)” under this search.")
                    )
                } else {
                    List(selection: railSelection) {
                        if let d = openDomain, let layout = openLayout {
                            railGroups(d, layout: layout)
                        } else {
                            ForEach(railRows) { row in
                                ConceptRow(row: row).tag(row.slug)
                            }
                        }
                    }
                    .listStyle(.sidebar)
                }
            }
            .frame(width: 300)
            .frame(maxHeight: .infinity)
            .background(G.surface)

            Divider().overlay(G.border)

            NavigationStack {
                // The board under the workspaces: it stays mounted so its
                // place and scroll are where they were left, and every
                // workspace in the recent set stays mounted too, the
                // selected one drawn on top and the rest hidden — the
                // per-concept slots the web's sessionStorage gives each
                // tutor session, kept alive for a trip away and back.
                // A selection that does not resolve to a concept shows
                // the board, as the placeholder used to.
                let live = selection.flatMap { store.concept($0) != nil ? $0 : nil }
                ZStack {
                    LearnBoardView(
                        selection: $selection,
                        filter: $filter,
                        search: $search,
                        mode: $mode,
                        domain: $domain,
                        topic: $topic
                    )
                    .opacity(live == nil ? 1 : 0)
                    .allowsHitTesting(live == nil)
                    .accessibilityHidden(live != nil)
                    ForEach(mounted, id: \.self) { slug in
                        if let concept = store.concept(slug) {
                            ConceptDetailView(concept: concept)
                                .opacity(slug == live ? 1 : 0)
                                .allowsHitTesting(slug == live)
                                .accessibilityHidden(slug != live)
                        }
                    }
                }
                .appDestinations()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onChange(of: selection) { _, slug in touch(slug) }
    }

    /// `pick` in LearnIndex through the rail: a concept inside the place
    /// selects; one outside moves the place to where it lives, so the
    /// board and the rail open on its domain when its workspace closes.
    /// The web's own list only ever holds the place's concepts — an
    /// unscoped rail pick is the Enter-search's `go` beside it.
    private var railSelection: Binding<String?> {
        Binding(
            get: { selection },
            set: { slug in
                guard let slug else { selection = nil; return }
                let inPlace = domainOf[slug] == domain
                    && (topic == nil
                        || openDomain?.topics.first { $0.slug == topic }?.concepts.contains(slug) == true)
                if !inPlace {
                    domain = domainOf[slug]
                    topic = nil
                }
                selection = slug
            }
        )
    }

    /// The open domain's topics as the rail's sections, in the picture's
    /// packed order — the web ConceptList's `layout.groups`. The topic
    /// titles are the buttons that open a topic; the concepts under them
    /// dim when the filter or search would hide them.
    @ViewBuilder
    private func railGroups(_ domain: DomainSummary, layout: DomainLayout) -> some View {
        let groups = topic == nil
            ? layout.groups
            : layout.groups.filter { $0.topic == topic }
        let topicOf = Dictionary(uniqueKeysWithValues: layout.groups.flatMap { g in
            g.concepts.map { ($0, g.topic) }
        })
        let byGroup = Dictionary(grouping: railRows, by: { topicOf[$0.slug] ?? "" })
        ForEach(groups, id: \.topic) { group in
            Section {
                ForEach(byGroup[group.topic] ?? []) { row in
                    ConceptRow(row: row)
                        .opacity(shown.contains(row.slug) ? 1 : 0.4)
                        .tag(row.slug)
                }
            } header: {
                Button {
                    self.topic = self.topic == group.topic ? nil : group.topic
                } label: {
                    Text(group.title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(G.text2)
                }
                .buttonStyle(.plain)
                .disabled(topic != nil)
            }
        }
    }

    /// `slug` visited: it becomes the freshest slot, evicting the
    /// stalest past the bound — its unmount is the page leave that
    /// closes what its session had open.
    private func touch(_ slug: String?) {
        guard let slug else { return }
        mounted.removeAll { $0 == slug }
        mounted.append(slug)
        while mounted.count > Self.draftSlots { mounted.removeFirst() }
    }
}

/// One index row: the mastery dot and caption, the title, and the columns
/// the web table carries — due, last seen, keeps-slipping and the course it
/// sits in.
private struct ConceptRow: View {
    let row: IndexRow

    var body: some View {
        HStack(spacing: 10) {
            BucketDot(bucket: row.bucket)

            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    if row.isDue {
                        Text(row.dueLabel)
                            .foregroundStyle(row.overdue ? .red : .orange)
                    } else if row.due != nil {
                        Text("due \(row.dueLabel)")
                    }
                    Text("seen \(row.lastSeenLabel)")
                    if let course = row.courseLabel { Text(course) }
                    if row.leech {
                        Text("Keeps slipping")
                            .foregroundStyle(.red)
                    }
                    if row.ready {
                        Text("Ready")
                            .foregroundStyle(.green)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }
}
