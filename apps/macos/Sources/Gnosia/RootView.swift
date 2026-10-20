//
//  RootView.swift
//  Gnosia
//
//  The app's one shell: a sidebar of the five surfaces — Home, Learn,
//  Review, Courses, Library — over a detail column that mounts each.
//  Learn and Library are splits of their own inside the detail; Home and
//  Review push into navigation stacks of their own.
//
//  The destinations the learning surfaces share — a concept's workspace,
//  a course page (or one module of it), a library asset — ride one enum,
//  so a thread on Home, a neighbour chip on a concept and a row in the
//  review queue all navigate the same way.
//

import AppKit
import SwiftUI

/// A place any surface can send the user — the hrefs of the web app as
/// values. `module` names the course module by slug.
enum AppDestination: Hashable {
    case concept(String)
    case course(String)
    case module(course: String, module: String)
    case asset(String)
}

extension View {
    /// Resolve the shared destinations inside a NavigationStack: each id
    /// looked up live so a row that left the catalog reads as missing
    /// rather than crashing.
    func appDestinations() -> some View {
        navigationDestination(for: AppDestination.self) { destination in
            switch destination {
            case .concept(let slug):
                ConceptDestination(slug: slug)
            case .course(let slug):
                CourseDestination(slug: slug)
            case .module(let course, let module):
                CourseDestination(slug: course, moduleID: module)
            case .asset(let id):
                AssetDestination(id: id)
            }
        }
    }
}

/// A concept slug to its workspace, or the honest "gone" when the catalog
/// no longer holds it.
private struct ConceptDestination: View {
    @Environment(CatalogStore.self) private var store
    let slug: String

    var body: some View {
        if let concept = store.concept(slug) {
            ConceptDetailView(concept: concept)
        } else {
            ContentUnavailableView(
                "Concept not in the catalog",
                systemImage: "questionmark.circle",
                description: Text("“\(slug)” is not a concept this snapshot knows.")
            )
        }
    }
}

/// A course slug to its page, or to one module of it.
private struct CourseDestination: View {
    @Environment(CatalogStore.self) private var store
    let slug: String
    var moduleID: String? = nil

    var body: some View {
        if let course = store.course(slug) {
            CourseDetailView(course: course, moduleID: moduleID)
        } else {
            ContentUnavailableView(
                "Course not in the catalog",
                systemImage: "questionmark.circle",
                description: Text("“\(slug)” is not a course this snapshot knows.")
            )
        }
    }
}

/// An asset id to its detail pane.
private struct AssetDestination: View {
    @Environment(CatalogStore.self) private var store
    let id: String

    var body: some View {
        if let asset = store.asset(id) {
            AssetDetailView(asset: asset)
        } else {
            ContentUnavailableView(
                "Asset not in the catalog",
                systemImage: "questionmark.circle",
                description: Text("“\(id)” is not an asset this snapshot knows.")
            )
        }
    }
}

private enum Section: String, CaseIterable, Identifiable {
    case home = "Home"
    case courses = "Courses"
    case learn = "Learn"
    case review = "Review"
    case library = "Library"
    case studio = "Studio"
    case ask = "Ask"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .home: return "house"
        case .learn: return "lightbulb"
        case .review: return "checkmark.circle"
        case .courses: return "book"
        case .library: return "square.grid.2x2"
        case .studio: return "wand.and.stars"
        case .ask: return "pencil"
        }
    }
}

struct RootView: View {
    @Environment(CatalogStore.self) private var store
    @Environment(\.colorScheme) private var colorScheme
    @State private var section: Section = .home
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            sidebar
                .navigationSplitViewColumnWidth(min: 210, ideal: 230, max: 260)
        } detail: {
            surface
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(G.page)
        }
        .onAppear { store.refreshLearner() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            store.refreshLearner()
        }
        // ⌘1…⌘5 walk the primary nav in sidebar order.
        .background {
            ForEach(Array(primaryNav.enumerated()), id: \.element.id) { index, s in
                Button(s.rawValue) { section = s }
                    .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: .command)
                    .hidden()
            }
        }
    }

    /// The rows that take a shortcut and draw in the sidebar's main group,
    /// in the web sidebar's order.
    private var primaryNav: [Section] { [.home, .courses, .learn, .review, .library] }

    @ViewBuilder
    private var surface: some View {
        switch section {
        case .home: HomeView()
        case .learn: LearnView()
        case .review: ReviewView()
        case .courses: CoursesView()
        case .library: LibraryView()
        case .studio: StudioSurface()
        case .ask: AskSurface()
        }
    }

    // MARK: - Sidebar

    /// The web AppSidebar, drawn natively: the wordmark, New chat, the
    /// search field, the nav rows on a surface2 pill, then Settings at the
    /// foot. A plain stack rather than a List, so the selection pill,
    /// spacing and padding match the web's numbers instead of the
    /// platform list's.
    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            brand
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 10)

            navRow(.ask, label: "New chat", symbol: "square.and.pencil")
            searchRow
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 2) {
                ForEach(primaryNav) { s in
                    navRow(s)
                }
            }
            .padding(.top, 8)

            Divider().overlay(G.border).padding(.vertical, 10)

            navRow(.studio)

            Spacer(minLength: 0)

            Divider().overlay(G.border).padding(.bottom, 6)
            SettingsLink {
                Label("Settings", systemImage: "gear")
                    .font(.callout)
                    .foregroundStyle(G.text2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 10)
        }
        .padding(.horizontal, 10)
        .background(G.page)
    }

    /// mark + wordmark — the web sidebar's header. The wordmark PNG exists
    /// in an ink and a cream cut; pick by appearance like the site does.
    private var brand: some View {
        HStack(spacing: 8) {
            if let mark = Bundle.module.url(forResource: "mark", withExtension: "png"),
               let image = NSImage(contentsOf: mark) {
                Image(nsImage: image)
                    .resizable()
                    .frame(width: 22, height: 22)
            }
            if let wordmark = Bundle.module.url(
                forResource: colorScheme == .dark ? "wordmark-cream" : "wordmark-ink",
                withExtension: "png"
            ), let image = NSImage(contentsOf: wordmark) {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 15)
            }
            Spacer()
        }
    }

    /// The sidebar's search field, drawn as the web draws it — a filled
    /// rounded field that reads as a box, not a text cursor. Selecting it
    /// jumps to the library, where the toolbar search does the work.
    private var searchRow: some View {
        Button { section = .library } label: {
            Label("Search", systemImage: "magnifyingglass")
                .font(.callout)
                .foregroundStyle(G.text3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(G.surface2, in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    /// One sidebar row. `label`/`symbol` overridable so New chat draws in
    /// the same face as the section rows without carrying a section.
    private func navRow(_ s: Section, label: String? = nil, symbol: String? = nil) -> some View {
        Button { section = s } label: {
            HStack(spacing: 9) {
                Image(systemName: symbol ?? s.symbol)
                    .font(.callout)
                    .frame(width: 18, alignment: .center)
                Text(label ?? s.rawValue)
                    .font(.callout)
                if s == .review {
                    let due = store.learn.reviewQueue().items.count
                    if due > 0 {
                        Spacer(minLength: 0)
                        Text("\(due)")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(G.btnText)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(G.streak, in: Capsule())
                    }
                }
            }
            .foregroundStyle(section == s ? G.text : G.text2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(section == s ? G.surface2 : .clear, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Placeholder surfaces

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

/// Ask is the tutor's chat; it lands with the sidecar client. The sidebar
/// row is the web's "New chat".
private struct AskSurface: View {
    var body: some View {
        ContentUnavailableView(
            "Ask",
            systemImage: "bubble.left.and.text.bubble.right",
            description: Text("The tutor answers through the local sidecar service once that wave lands.")
        )
        .navigationTitle("Ask")
    }
}
