//
//  GnosiaApp.swift
//  Gnosia
//
//  The app shell: one window onto RootView's destination sidebar — Home,
//  Learn, Review, Courses, Library, Studio — and a Settings pane for the
//  catalog path. Runs unbundled from `swift run`, so init() also asks for a
//  regular activation policy — a bare executable gets no .app bundle to tell
//  the window server it is a foreground app, and without this the window can
//  open behind the terminal.
//

import AppKit
import SwiftUI

@main
struct GnosiaApp: App {
    @State private var store = CatalogStore()
    /// The writable side: learner.db. Views read the catalog store's merged
    /// marks and write through this one, then call refreshLearner().
    @State private var learner = LearnerStore()
    /// The tutor boundary: spawns services/sidecar on demand and hands Ask
    /// and Studio the SidecarClient that answers.
    @State private var sidecar = SidecarManager()

    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    var body: some Scene {
        WindowGroup("Gnosia") {
            RootView()
                .environment(store)
                .environment(learner)
                .environment(sidecar)
                .frame(minWidth: 1240, minHeight: 720)
                .task {
                    store.loadIfNeeded()
                    learner.loadIfNeeded()
                }
        }
        .windowToolbarStyle(.unified)

        Settings {
            SettingsView()
                .environment(store)
                .environment(learner)
                .environment(sidecar)
        }
    }
}
