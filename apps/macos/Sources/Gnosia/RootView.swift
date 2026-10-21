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
    /// A tutor session on a concept — the web's /learn/<slug>/session.
    /// `mode` is its `?mode=` query: `.learn` is Teach me, `.check` is
    /// the workspace's Quiz me.
    case session(concept: String, mode: SessionMode = .learn)
    /// A module's check — the web's /courses/<slug>/<module>/check,
    /// the week check's session over the module's concepts.
    case check(course: String, module: String)
}

extension AppDestination {
    /// The surface a destination belongs to — which nav row its page is
    /// part of. A module is a Courses page, a concept (and its sessions
    /// and checks) a Learn page, an asset a Library page.
    fileprivate var surface: Section {
        switch self {
        case .concept, .session: return .learn
        case .course, .module, .check: return .courses
        case .asset: return .library
        }
    }
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
            case .session(let slug, let mode):
                SessionDestination(slug: slug, mode: mode)
            case .check(let course, let module):
                CheckDestination(courseSlug: course, moduleSlug: module)
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

/// A concept slug to its tutor session, or the honest "gone" — same rule
/// as ConceptDestination: the row leaving the catalog reads as missing.
private struct SessionDestination: View {
    @Environment(CatalogStore.self) private var store
    let slug: String
    var mode: SessionMode = .learn

    var body: some View {
        if store.concept(slug) != nil {
            SessionView(slug: slug, mode: mode)
        } else {
            ContentUnavailableView(
                "Concept not in the catalog",
                systemImage: "questionmark.circle",
                description: Text("“\(slug)” is not a concept this snapshot knows.")
            )
        }
    }
}

/// A course slug and a module slug to the module's check, or the honest
/// "gone" — same rule as the other destinations: a module the course no
/// longer lists reads as missing rather than crashing.
private struct CheckDestination: View {
    @Environment(CatalogStore.self) private var store
    let courseSlug: String
    let moduleSlug: String

    var body: some View {
        if let course = store.course(courseSlug),
           let module = course.modules.first(where: { $0.slug == moduleSlug || $0.id == moduleSlug }) {
            ModuleCheckView(course: course, module: module)
                .id(module.id)
        } else {
            ContentUnavailableView(
                "Module not in the catalog",
                systemImage: "questionmark.circle",
                description: Text("“\(moduleSlug)” is not a module of “\(courseSlug)” this snapshot knows.")
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
    /// The detail column's own stack: the sidebar's Courses, Pinned and
    /// Recent rows push their destination here, over the surface they
    /// belong to, the way the web's links land on its routes.
    @State private var detailPath = NavigationPath()
    /// What a sidebar push is showing — the current row's fill, cleared
    /// when the detail column pops back to its surface.
    @State private var pushed: AppDestination?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            sidebar
                .navigationSplitViewColumnWidth(min: 210, ideal: 230, max: 260)
        } detail: {
            NavigationStack(path: $detailPath) {
                surface
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(G.page)
                    .appDestinations()
                    // A pushed course or module page can link onward by
                    // the values its own views push: another course, and
                    // a module's videos by asset id.
                    .navigationDestination(for: CatalogCourse.self) { course in
                        CourseDestination(slug: course.slug)
                    }
                    .navigationDestination(for: CatalogAsset.self) { asset in
                        VideoDetailView(asset: asset)
                    }
            }
        }
        .onAppear { store.refreshLearner() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            store.refreshLearner()
        }
        .onChange(of: detailPath) { _, now in
            if now.isEmpty { pushed = nil }
        }
        // ⌘1…⌘6 walk the sidebar's rows in order, utility rows included.
        .background {
            ForEach(Array(shortcuts.enumerated()), id: \.element.id) { index, s in
                Button(s.rawValue) { go(s) }
                    .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: .command)
                    .hidden()
            }
        }
    }

    /// The web sidebar's destinations, in its order — the learning nav.
    private var primaryNav: [Section] { [.home, .courses, .learn, .library] }

    /// The native-only rows: below the sections, so the nav group stays
    /// the web's four. The Review badge keeps its row.
    private var utilityNav: [Section] { [.review, .studio] }

    /// Every shortcut row in sidebar order — the old ⌘1…⌘5 kept.
    private var shortcuts: [Section] { primaryNav + utilityNav }

    /// A nav row's press: the surface itself, a pushed page popped.
    private func go(_ s: Section) {
        section = s
        if !detailPath.isEmpty { detailPath = NavigationPath() }
        pushed = nil
    }

    /// A section row's link: its destination pushed over the surface it
    /// belongs to — a module under Courses, a concept under Learn, an
    /// asset under Library — so the row's own nav stays lit as the web's
    /// nav does under its routes.
    private func open(_ destination: AppDestination) {
        section = destination.surface
        detailPath = NavigationPath()
        detailPath.append(destination)
        pushed = destination
    }

    @ViewBuilder
    private var surface: some View {
        switch section {
        case .home: HomeView()
        case .learn: LearnView()
        case .review: ReviewView()
        case .courses: CoursesView()
        case .library: LibraryView()
        case .studio: StudioView()
        case .ask: AskView()
        }
    }

    // MARK: - Sidebar

    /// The web AppSidebar, drawn natively: the wordmark, New chat, the
    /// search field, the four learning destinations, then the sections
    /// the web scrolls — Courses, Pinned, Recent — then the native-only
    /// utility rows (Review with its badge, Studio, Settings) and the
    /// account row at the foot. A plain stack rather than a List, so the
    /// selection pill, spacing and padding match the web's numbers
    /// instead of the platform list's.
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

            ScrollView {
                SidebarSections(
                    model: store.sidebarRecent(),
                    current: pushed,
                    open: open,
                    openStudio: { go(.studio) },
                    browseCourses: { go(.courses) }
                )
            }
            .frame(maxHeight: .infinity)
            .padding(.top, 10)

            VStack(alignment: .leading, spacing: 2) {
                ForEach(utilityNav) { s in
                    navRow(s)
                }
                SettingsLink {
                    Label("Settings", systemImage: "gear")
                        .font(.callout)
                        .foregroundStyle(G.text2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 6)

            Divider().overlay(G.hair)
                .padding(.top, 6)

            SidebarAccountRow()
                .padding(.top, 4)
                .padding(.bottom, 8)
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
        Button { go(.library) } label: {
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
        Button { go(s) } label: {
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

/// Ask lives in AskView: the open-tutor chat over the sidecar. The sidebar
/// row is the web's "New chat".
