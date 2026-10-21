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
        // Every learner.db write also mirrors into the catalog through the
        // sidecar — the bridge the store's file header describes.
        learner.sidecar = sidecar
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

        /// A canvas window per diagram, keyed by name: the studio's live
        /// tldraw surface (a `canvas serve` page) in a WKWebView, opened by
        /// the diagram detail's "Open canvas". The runner owns the mirror's
        /// lifecycle; CanvasView sends the keep-alive while a window is up.
        /// One window per value: reopening a diagram re-activates its window.
        WindowGroup("Canvas", id: "canvas", for: String.self) { $name in
            // The value is the diagram name; a window opened without one
            // (restoration edge) gets the honest empty state.
            if let name {
                CanvasView(name: name)
                    .frame(minWidth: 900, minHeight: 560)
            } else {
                ContentUnavailableView("No diagram", systemImage: "questionmark.circle", description: Text("This window was opened without a diagram name."))
                    .frame(minWidth: 480, minHeight: 320)
            }
        }
        .windowToolbarStyle(.unified)
        .defaultSize(width: 1280, height: 860)

        Settings {
            SettingsView()
                .environment(store)
                .environment(learner)
                .environment(sidecar)
        }
    }
}
