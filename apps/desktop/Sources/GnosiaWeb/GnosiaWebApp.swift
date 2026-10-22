//
//  GnosiaWebApp.swift
//  GnosiaWeb
//
//  The desktop shell for the web app: one window hosting a WKWebView on a
//  locally spawned Next server, so the app people use is the app itself —
//  no second UI to keep in parity. Runs unbundled from `swift run` too, so
//  init() asks for a regular activation policy the way GnosiaApp does.
//

import AppKit
import SwiftUI

@main
struct GnosiaWebApp: App {
    @State private var server = WebServer()
    @State private var studio = StudioRunner()

    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    var body: some Scene {
        WindowGroup("Gnosia") {
            ContentView()
                .environment(server)
                .frame(minWidth: 1240, minHeight: 720)
                // Two .task modifiers, not one awaited pair: the runner's
                // first minute is heavy and the window should not hold its
                // own server start behind it, nor vice versa.
                .task { await server.start() }
                .task { await studio.start() }
        }
        .windowToolbarStyle(.unified)
        .commands { AppCommands() }
    }
}

private struct ContentView: View {
    @Environment(WebServer.self) private var server

    var body: some View {
        switch server.status {
        case .running(let url):
            WebView(url: url)
        case .failed(let message):
            ContentUnavailableView {
                Label("The web app did not start", systemImage: "server.rack")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await server.start() } }
            }
        default:
            VStack(spacing: 12) {
                ProgressView()
                Text("Starting the local server…")
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct AppCommands: Commands {
    var body: some Commands {
        // A WKWebView answers the standard edit selectors through the
        // responder chain, so copy/paste/select-all just need menu items to
        // exist for the shortcuts to reach it.
        CommandGroup(replacing: .pasteboard) {
            Button("Cut") { send(Selector("cut:")) }.keyboardShortcut("x")
            Button("Copy") { send(Selector("copy:")) }.keyboardShortcut("c")
            Button("Paste") { send(Selector("paste:")) }.keyboardShortcut("v")
            Button("Select All") { send(Selector("selectAll:")) }.keyboardShortcut("a")
        }
        CommandMenu("View") {
            Button("Reload") {
                NotificationCenter.default.post(name: .gnosiaWebReload, object: nil)
            }
            .keyboardShortcut("r")
        }
    }

    private func send(_ sel: Selector) {
        NSApp.sendAction(sel, to: nil, from: nil)
    }
}
