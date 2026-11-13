//
//  HermesWebApp.swift
//  HermesWeb
//
//  The desktop shell for the web app: one window hosting a WKWebView on a
//  locally spawned Next server, so the app people use is the app itself —
//  no second UI to keep in parity. Runs unbundled from `swift run` too, so
//  init() asks for a regular activation policy: an unbundled executable
//  otherwise gets no Dock icon and no menu bar.
//

import AppKit
import SwiftUI

@main
struct HermesWebApp: App {
    @State private var server = WebServer()
    @State private var studio = StudioRunner()

    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    var body: some Scene {
        WindowGroup("Hermes") {
            ContentView()
                .environment(server)
                .frame(minWidth: shellWindowMinimumSize.width, minHeight: shellWindowMinimumSize.height)
                // Two .task modifiers, not one awaited pair: the runner's
                // first minute is heavy and the window should not hold its
                // own server start behind it, nor vice versa.
                .task { await server.start() }
                // Only when the web serves the studio (S9-15): without
                // STUDIO_ENABLED /studio 404s, and a runner booted anyway
                // would hold port 7250 for nothing. And only on the
                // environment the web gets: at once when the resolver
                // answered, else once the web is up on the fallback. A
                // runner started on the fallback while the web's "Try
                // again" went on to resolve would open another catalog.
                .task {
                    if await Checkout.prepare() == nil, Checkout.isResolved { await startStudio() }
                }
                .onChange(of: server.status) { _, status in
                    if case .running = status { Task { await startStudio() } }
                }
        }
        .windowToolbarStyle(.unified)
        .commands { AppCommands() }
    }

    /// `StudioRunner.start()` is idempotent, so both callers may ask.
    private func startStudio() async {
        if Checkout.studioEnabled(Checkout.childEnv()) { await studio.start() }
    }
}

private struct ContentView: View {
    @Environment(WebServer.self) private var server

    var body: some View {
        switch server.status {
        case .running(let url):
            WebView(url: url, token: server.launchToken)
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
        CommandGroup(after: .pasteboard) {
            Divider()
            Button("Find…") { post(.hermesWebFind) }.keyboardShortcut("f")
            Button("Find Next") { post(.hermesWebFindNext) }.keyboardShortcut("g")
            Button("Find Previous") { post(.hermesWebFindPrevious) }
                .keyboardShortcut("g", modifiers: [.command, .shift])
        }
        CommandGroup(replacing: .printItem) {
            Button("Print…") { post(.hermesWebPrint) }.keyboardShortcut("p")
        }
        CommandMenu("View") {
            Button("Reload") { post(.hermesWebReload) }.keyboardShortcut("r")
            Button("Back") { post(.hermesWebBack) }.keyboardShortcut("[")
            Button("Forward") { post(.hermesWebForward) }.keyboardShortcut("]")
            Divider()
            Button("Actual Size") { post(.hermesWebActualSize) }.keyboardShortcut("0")
            Button("Zoom In") { post(.hermesWebZoomIn) }.keyboardShortcut("=")
            Button("Zoom Out") { post(.hermesWebZoomOut) }.keyboardShortcut("-")
        }
    }

    /// Every window's coordinator hears it; the front one acts.
    private func post(_ name: Notification.Name) {
        NotificationCenter.default.post(name: name, object: nil)
    }

    private func send(_ sel: Selector) {
        NSApp.sendAction(sel, to: nil, from: nil)
    }
}
