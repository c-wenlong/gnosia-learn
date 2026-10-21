//
//  LearnView.swift
//  Gnosia
//
//  The Learn index: every concept in the knowledge base, studied first and
//  the untouched tail after it, alphabetical within each — the web's
//  /learn table. The Status menu is the web's own (All, Due, Learning,
//  Mastered, Not started, Keeps slipping, Ready to learn, Not in a
//  course), the counts beside each counted over all rows so they do not
//  move as the learner types, and the search is the same every-word match
//  over title, summary and slug. The map view itself is not mirrored here;
//  the table is the index's list half.
//

import SwiftUI

struct LearnView: View {
    @Environment(CatalogStore.self) private var store
    @State private var selection: String?
    @State private var filter: IndexFilter = .all
    @State private var search = ""
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

    /// Every row once — the page's toRow order kept (studied before
    /// untouched, alphabetical within each). The Status menu's counts and
    /// the bucket line read this same list so they hold still as the
    /// learner types.
    private var allRows: [IndexRow] { store.learn.indexRows() }

    /// The rows one filter state shows: the Status pick, then the query.
    private var rows: [IndexRow] {
        allRows.filter { matchesFilter($0, filter) && matchesQuery($0, search) }
    }

    var body: some View {
        // A fixed-width rail, not a nested NavigationSplitView: a second
        // split inside the detail column squeezes the window's columns and
        // slides the app sidebar offscreen on narrower windows. The web's
        // concept index is a fixed rail too — it does not collapse.
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(G.text3)
                    TextField("Search concepts", text: $search)
                        .textFieldStyle(.plain)
                }
                .font(.callout)
                .padding(.horizontal, 9)
                .padding(.vertical, 7)
                .background(G.surface2, in: RoundedRectangle(cornerRadius: 9))
                .padding(.horizontal, 10)
                .padding(.top, 10)

                controlsRow
                countsLine

                if let error = store.error {
                    ContentUnavailableView {
                        Label("No catalog", systemImage: "cylinder.split.1x2")
                    } description: {
                        Text(error).font(.caption)
                    }
                } else if store.learn.concepts.isEmpty {
                    ContentUnavailableView(
                        "No concepts",
                        systemImage: "brain",
                        description: Text("The catalog is reachable and holds no concepts — index your notes and snapshot again.")
                    )
                } else if rows.isEmpty {
                    ContentUnavailableView(
                        "No concepts match",
                        systemImage: "line.3.horizontal.decrease.circle",
                        description: Text("Nothing here is in “\(filter.label)” under this search.")
                    )
                } else {
                    List(selection: $selection) {
                        ForEach(rows) { row in
                            ConceptRow(row: row).tag(row.slug)
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
                // Every workspace in the recent set stays mounted, the
                // selected one drawn on top and the rest hidden — the
                // per-concept slots the web's sessionStorage gives each
                // tutor session, kept alive for a trip away and back.
                ZStack {
                    ForEach(mounted, id: \.self) { slug in
                        if let concept = store.concept(slug) {
                            ConceptDetailView(concept: concept)
                                .opacity(slug == selection ? 1 : 0)
                                .allowsHitTesting(slug == selection)
                                .accessibilityHidden(slug != selection)
                        }
                    }
                    if selection == nil || selection.flatMap({ store.concept($0) }) == nil {
                        ContentUnavailableView(
                            "Select a concept",
                            systemImage: "brain",
                            description: Text("\(store.learn.concepts.count) concepts in the knowledge base")
                        )
                    }
                }
                .appDestinations()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onChange(of: selection) { _, slug in touch(slug) }
        .onAppear {
            if selection == nil { selection = store.learn.defaultSelection() }
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

    /// The Status menu — every filter with how many rows it shows, counted
    /// over all rows (not the search) so the numbers do not move as the
    /// learner types.
    private var controlsRow: some View {
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
            .fixedSize()
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    /// "12 mastered · 30 learning · 200 not started" — the bucketCounts line.
    private var countsLine: some View {
        let counts = store.learn.bucketCounts(allRows)
        return Text(
            [
                (counts[.mastered] ?? 0, MasteryBucket.mastered),
                (counts[.learning] ?? 0, MasteryBucket.learning),
                (counts[.untouched] ?? 0, MasteryBucket.untouched),
            ]
            .map { "\($0.0) \($0.1.label.lowercased())" }
            .joined(separator: " · ")
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
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
