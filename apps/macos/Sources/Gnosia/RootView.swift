//
//  RootView.swift
//  Gnosia
//
//  The app shell: a sidebar of destinations, matching the web app's
//  AppSidebar (nav.ts): Home, Courses, Learn, Library, then Studio and
//  Settings at the foot. The library used to live inside the sidebar
//  column itself — controls, filters and rows packed into 300pt — which
//  read as a debug panel. Destinations now navigate; surfaces get the
//  window.
//
//  Home, Learn and Review are honest minimums built on data the snapshot
//  already mirrors (event log, topics, review queue): wave-2 lands the
//  real surfaces and these placeholders retire.
//

import SwiftUI

/// A sidebar destination. `key` matches the web nav's, so the two shells
/// agree on what a row means.
private enum Destination: String, CaseIterable, Identifiable {
    case home, learn, review, courses, library, studio

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home: return "Home"
        case .courses: return "Courses"
        case .learn: return "Learn"
        case .review: return "Review"
        case .library: return "Library"
        case .studio: return "Studio"
        }
    }

    var symbol: String {
        switch self {
        case .home: return "house"
        case .courses: return "books.vertical"
        case .learn: return "map"
        case .review: return "checkmark.circle"
        case .library: return "square.grid.2x2"
        case .studio: return "wand.and.stars"
        }
    }
}

struct RootView: View {
    @Environment(CatalogStore.self) private var store
    @State private var destination: Destination = .library
    @State private var selectedAssetID: String?

    var body: some View {
        NavigationSplitView {
            List(selection: $destination) {
                Section {
                    row(.home)
                    row(.learn)
                    row(.review)
                }
                Section {
                    row(.courses)
                    row(.library)
                }
                Section {
                    row(.studio)
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 180, ideal: 210, max: 240)
            .safeAreaInset(edge: .bottom) {
                SettingsLink {
                    Label("Settings", systemImage: "gear")
                        .font(.callout)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } content: {
            Group {
                switch destination {
                case .home: HomeSurface(selection: $selectedAssetID)
                case .learn: LearnSurface()
                case .review: ReviewSurface()
                case .courses: CoursesView()
                case .library: LibraryView(selection: $selectedAssetID)
                case .studio: StudioSurface()
                }
            }
            // The library grid wants two card columns even in a middling
            // window; below ~480pt it falls back to a single column anyway.
            .navigationSplitViewColumnWidth(min: 480, ideal: 620, max: .infinity)
        } detail: {
            if let id = selectedAssetID, let asset = store.asset(id) {
                AssetDetailView(asset: asset)
            } else {
                ContentUnavailableView {
                    Label("Nothing selected", systemImage: "sidebar.right")
                } description: {
                    Text("\(store.assets.count) assets in the catalog")
                }
            }
        }
        // learner.db is written beside the catalog and can change while the
        // app runs, so its marks are reread on appear and on reactivation.
        .onAppear { store.refreshLearner() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            store.refreshLearner()
        }
        // ⌘1…⌘6 walk the sidebar — the same order the rows draw in.
        .background {
            ForEach(Array(Destination.allCases.enumerated()), id: \.element.id) { index, d in
                Button(d.label) { destination = d }
                    .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: .command)
                    .hidden()
            }
        }
    }

    private func row(_ d: Destination) -> some View {
        Label(d.label, systemImage: d.symbol)
            .tag(d)
    }
}

// MARK: - Home

/// The web /home shape at its smallest honest size: the videos the owner
/// was last inside, from the mirrored event log, and the review queue's
/// due count. No greeting, no hero metric.
private struct HomeSurface: View {
    @Environment(CatalogStore.self) private var store
    @Binding var selection: String?

    /// Recently opened assets, latest first — the `watched` events the
    /// snapshot mirrored, deduped per asset.
    private var recent: [CatalogAsset] {
        var seen = Set<String>()
        return store.watchedAt
            .sorted { $0.value > $1.value }
            .compactMap { id, _ in
                guard seen.insert(id).inserted, let asset = store.asset(id) else { return nil }
                return asset
            }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if !store.reviewDue.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Due for review").font(.title3).bold()
                        Text("\(store.reviewDue.count) \(store.reviewDue.count == 1 ? "card" : "cards")")
                            .foregroundStyle(.secondary)
                    }
                }
                if !recent.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recently opened").font(.title3).bold()
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200, maximum: 240), spacing: 16)], spacing: 16) {
                            ForEach(recent.prefix(12)) { asset in
                                Button { selection = asset.id } label: {
                                    AssetCard(asset: asset)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                if recent.isEmpty && store.reviewDue.isEmpty {
                    ContentUnavailableView(
                        "Nothing yet",
                        systemImage: "house",
                        description: Text("Open something in the library and it shows up here.")
                    )
                    .frame(maxWidth: .infinity, minHeight: 320)
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Home")
    }
}

// MARK: - Learn

/// The topic map as a plain ordered list — the Learn page's backbone —
/// with each topic's concept count. The graph and concept workspace land
/// with wave-2.
private struct LearnSurface: View {
    @Environment(CatalogStore.self) private var store

    private var orderedTopics: [CatalogTopic] {
        store.topics.values.sorted {
            let lp = $0.position > 0 ? $0.position : Int.max
            let rp = $1.position > 0 ? $1.position : Int.max
            return lp != rp ? lp < rp : $0.title < $1.title
        }
    }

    private func conceptCount(_ slug: String) -> Int {
        store.concepts.filter { $0.topicSlug == slug }.count
    }

    var body: some View {
        List(orderedTopics) { topic in
            HStack {
                Text(topic.title)
                Spacer()
                let n = conceptCount(topic.slug)
                Text("\(n) \(n == 1 ? "concept" : "concepts")")
                    .foregroundStyle(.secondary)
                    .font(.callout)
            }
        }
        .navigationTitle("Learn")
    }
}

// MARK: - Review

/// The due queue as a list of cards — what a review session would drain.
private struct ReviewSurface: View {
    @Environment(CatalogStore.self) private var store

    var body: some View {
        Group {
            if store.reviewDue.isEmpty {
                ContentUnavailableView(
                    "All caught up",
                    systemImage: "checkmark.circle",
                    description: Text("Nothing in the review queue is due.")
                )
            } else {
                List(store.reviewDue, id: \.conceptSlug) { card in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(card.conceptSlug)
                        Text("due \(card.due.formatted(date: .abbreviated, time: .omitted))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Review")
    }
}

// MARK: - Studio

/// Studio runs through the local service the sidecar wave adds; until
/// then the destination says so rather than faking a surface.
private struct StudioSurface: View {
    var body: some View {
        ContentUnavailableView(
            "Studio",
            systemImage: "wand.and.stars",
            description: Text("Runs through the local sidecar service once that wave lands.")
        )
        .navigationTitle("Studio")
    }
}
