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
    case learn = "Learn"
    case review = "Review"
    case courses = "Courses"
    case library = "Library"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .home: return "house"
        case .learn: return "brain"
        case .review: return "rectangle.stack"
        case .courses: return "graduationcap"
        case .library: return "books.vertical"
        }
    }
}

struct RootView: View {
    @Environment(CatalogStore.self) private var store
    @State private var section: Section? = .home

    var body: some View {
        NavigationSplitView {
            List(Section.allCases, selection: $section) { s in
                Label(s.rawValue, systemImage: s.symbol)
                    .badge(s == .review ? store.learn.reviewQueue().items.count : 0)
                    .tag(s)
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 160, ideal: 180)
        } detail: {
            switch section ?? .home {
            case .home: HomeView()
            case .learn: LearnView()
            case .review: ReviewView()
            case .courses: CoursesView()
            case .library: LibraryView()
            }
        }
    }
}
