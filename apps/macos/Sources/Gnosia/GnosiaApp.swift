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

    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    var body: some Scene {
        WindowGroup("Gnosia") {
            RootView()
                .environment(store)
                .frame(minWidth: 1240, minHeight: 720)
                .task { store.loadIfNeeded() }
        }
        .windowToolbarStyle(.unified)

        Settings {
            SettingsView()
                .environment(store)
        }
    }
}
