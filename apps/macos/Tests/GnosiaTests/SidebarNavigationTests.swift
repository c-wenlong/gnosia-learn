//
//  SidebarNavigationTests.swift
//  GnosiaTests
//
//  A sidebar row's push draws its page. The shell's detail column is one
//  NavigationStack, and each sidebar row appends an AppDestination to it
//  over the surface the destination belongs to. When that surface brought
//  a NavigationStack of its own at its root (CoursesView did), the nested
//  stack took the push and, holding no AppDestination of its own, drew
//  SwiftUI's lone warning triangle: every course row and every Recent
//  module row opened onto a blank pane, while concept rows (whose surface
//  has no stack at its root) worked.
//
//  The shell is hosted in a window never ordered on screen, over a catalog
//  that holds nothing, and the rows are pressed through the
//  `sidebarSeedOpens` seed. `destinationShown` reports each destination
//  whose page appeared; the triangle runs no destination, so a push nothing
//  resolved reads as the destination never reported. Headless, and it
//  reads no real catalog.
//

import AppKit
import Foundation
import SwiftUI
import Testing
@testable import Gnosia

@MainActor
@Suite(.serialized)
struct SidebarNavigation {
    /// One of each kind of sidebar row: a course row (the course page, or
    /// the module it resumes), a Recent module, a concept, a video.
    nonisolated static let rows: [AppDestination] = [
        .course("cs4223"),
        .module(course: "cs4223", module: "week-5"),
        .concept("self-attention"),
        .asset("video:attention"),
    ]

    /// Each row pressed from Home, as the app starts.
    @Test(arguments: rows)
    func rowFromHome(_ row: AppDestination) async throws {
        let shown = try await pagesShown(pressing: [row])
        #expect(shown.last == row, "pressed \(row), pages shown: \(shown)")
    }

    /// A module row pressed while another row's page is up: a course's,
    /// a concept's, a video's.
    @Test(arguments: rows)
    func moduleRowAfter(_ first: AppDestination) async throws {
        let module = AppDestination.module(course: "cs3230", module: "m1")
        let shown = try await pagesShown(pressing: [first, module])
        #expect(shown.last == module, "pressed \(first) then \(module), pages shown: \(shown)")
    }

    /// The destinations whose pages appeared once `rows` were pressed in
    /// order, the seed's 300 ms apart, waiting up to five seconds past the
    /// last press for its page.
    private func pagesShown(pressing rows: [AppDestination]) async throws -> [AppDestination] {
        _ = NSApplication.shared
        let home = FileManager.default.temporaryDirectory
            .appending(path: "gnosia-sidebar-nav-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: home) }

        let store = CatalogStore()
        store.location = CatalogLocation(
            catalogPath: home.appending(path: "no-catalog.db").path,
            blobRoot: home.appending(path: "blobs"),
            learnerPath: home.appending(path: "learner.db").path
        )
        store.loadIfNeeded()
        let learner = LearnerStore(path: home.appending(path: "learner.db").path)

        var shown: [AppDestination] = []
        let size = NSRect(x: 0, y: 0, width: 1280, height: 800)
        let hosting = NSHostingView(rootView: RootView()
            .environment(\.sidebarSeedOpens, rows)
            .environment(\.destinationShown) { shown.append($0) }
            .frame(width: size.width, height: size.height)
            .environment(store)
            .environment(learner))
        hosting.frame = size
        let window = NSWindow(contentRect: size, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = hosting
        defer {
            window.contentView = nil
            window.close()
        }

        let started = Date()
        let lastPress = Double(rows.count) * 0.3
        while Date().timeIntervalSince(started) < lastPress + 5 {
            try await Task.sleep(for: .milliseconds(50))
            Self.turnRunLoop()
            hosting.layoutSubtreeIfNeeded()
            if Date().timeIntervalSince(started) > lastPress + 0.5, shown.last == rows.last { break }
        }
        return shown
    }

    /// One short turn of the main run loop, outside the async context
    /// `run(until:)` refuses.
    private static func turnRunLoop() {
        RunLoop.main.run(until: Date().addingTimeInterval(0.01))
    }
}
