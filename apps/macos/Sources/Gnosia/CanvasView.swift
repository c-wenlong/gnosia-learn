//
//  CanvasView.swift
//  Gnosia
//
//  The canvas: one studio diagram on its live tldraw surface, in a window
//  of its own. The native counterpart of the web's `/studio/d/<name>`.
//
//  The canvas itself is `canvas serve`'s page, the same build the web
//  screen iframes; nothing of the document is drawn natively, and D13's
//  boundary holds: the app reads nothing out of the page and writes
//  nothing into it. The mirror page renders, autosaves to the diagram's
//  checkout and reports its own save state in its own overlay; Commit
//  here is still how the checkout reaches the catalog.
//
//  The lifecycle is the runner's, mirrored from the web screen:
//
//  - `POST /api/mirrors` refreshes the checkout and starts (or reuses)
//    the serve process; the reply's `healthy` is the runner's own poll of
//    the port, which is all it can say about a canvas (U10).
//  - While the window is up a `GET /api/mirrors?file=…` heartbeat fires
//    every idleMs/3 with a 30s floor, MirrorKeepAlive's exact rule:
//    editing reaches only the serve port, so without it the idle sweep
//    would close a canvas somebody is drawing on.
//  - Closing the window stops the heartbeat and the sweep does the rest,
//    the same end a closed browser tab gets; no DELETE is sent.
//  - A heartbeat that finds no mirror means the sweep won while the
//    machine slept, so the canvas is re-POSTed and reloaded rather than
//    left showing a dead page. The page reloads from the checkout, so
//    only edits still in flight are lost, as on a browser reload.
//

import AppKit
import SwiftUI
import WebKit

/// A canvas window's content, keyed by diagram name. Everything is one
/// `StudioClient` away: the window is outside StudioView's environment
/// and needs nothing from it. The runner is the source of truth either
/// way, and the client's default base URL reads the same STUDIO_PORT.
struct CanvasView: View {
    let name: String

    private let client = StudioClient()
    private var file: String { "learn/assets/\(name).tldr" }

    private enum Phase: Equatable {
        case starting
        case ready
        /// The POST or the serve's own health check failed: the web's
        /// MirrorProblem, with the runner's words.
        case blocked(String, String?)
    }

    @State private var phase: Phase = .starting
    @State private var mirror: StudioClient.Mirror?
    @State private var diagram: StudioClient.Diagram?
    @State private var commitReason = ""
    @State private var outcome: String?
    @State private var outcomeBad = false
    @State private var busy = false
    /// Bump to push the webview through a fresh load (restart, reopen).
    @State private var reloadToken = 0

    /// MirrorKeepAlive's FALLBACK_IDLE_MS, in seconds, for a runner old
    /// enough not to send `idleMs`.
    private static let fallbackIdleSeconds: Double = 15 * 60

    var body: some View {
        VStack(spacing: 0) {
            strip
            Divider().overlay(G.hair)
            content
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(G.page)
        .navigationTitle(diagram?.title ?? name)
        .task { await open() }
        .task { await heartbeat() }
    }

    /* ------------------------------------------------------------------ */
    /* The strip                                                           */
    /* ------------------------------------------------------------------ */

    /// The web canvas's own chrome, compressed to one row: which document,
    /// whether the checkout holds edits nobody committed, and Commit, the
    /// one verb that belongs beside the canvas. The rest (export, verify,
    /// inspect, restart) sit in the menu, and an external-open stays as
    /// the escape hatch a browser tab is on the web screen.
    private var strip: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text(diagram?.tldr?.path ?? file)
                    .font(.callout.monospaced())
                    .foregroundStyle(G.text3)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if diagram?.checkout?.dirty == true {
                    Text("uncommitted edits")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(G.warnText)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2.5)
                        .background(G.streak.opacity(0.14), in: Capsule())
                }
                Spacer()
                if diagram?.checkout?.dirty == true {
                    TextField("Why this change", text: $commitReason)
                        .textFieldStyle(.plain)
                        .font(.callout)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .frame(width: 200)
                        .background(G.surface, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border))
                        .onSubmit(commit)
                    Button("Commit", action: commit)
                        .disabled(busy || commitReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                Menu {
                    Button("Export SVG") { verb("export") }
                    Button("Verify") { verb("verify") }
                    Button("Inspect") { verb("inspect") }
                    Divider()
                    Button("Restart canvas") { Task { await restart() } }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .help("Canvas actions")
                if let url = mirror?.url {
                    Button { NSWorkspace.shared.open(url) } label: {
                        Image(systemName: "arrow.up.forward.square")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(G.accentText)
                    .help("Open this canvas in the browser")
                }
                if busy { ProgressView().controlSize(.small) }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            if let outcome {
                StudioBanner(text: outcome, tone: outcomeBad ? .danger : .quiet)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* The canvas itself                                                   */
    /* ------------------------------------------------------------------ */

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .starting:
            VStack(spacing: 12) {
                ProgressView()
                Text("Starting the canvas…")
                    .font(.callout)
                    .foregroundStyle(G.text2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .ready:
            if let url = mirror?.url {
                CanvasWebView(url: url, token: reloadToken) {
                    // The serve died between the POST and the page load:
                    // the same dead-iframe case the web shows through
                    // MirrorProblem.
                    phase = .blocked(
                        "The canvas page did not load",
                        "\(url.absoluteString) refused the connection. The serve process may have exited."
                    )
                }
            }
        case .blocked(let title, let detail):
            StudioBlockedCard(
                title: title,
                lead: detail ?? "",
                lines: [],
                commands: [],
                // No mirror means the POST itself was refused, so retry is
                // a plain open; a live-but-unhealthy serve gets the web's
                // restart (close, then a fresh serve on the next render).
                retry: { Task { if mirror == nil { await open() } else { await restart() } } }
            )
        }
    }

    /* ------------------------------------------------------------------ */
    /* Mirror lifecycle                                                    */
    /* ------------------------------------------------------------------ */

    /// `POST /api/mirrors { file }`: idempotent, so a retry, a reopen after
    /// the sweep and a second window on the same diagram all land on the
    /// one serve process. `healthy` is the runner's server-side poll of
    /// the port, and `false` is the web's MirrorProblem, not a dead iframe.
    private func open() async {
        phase = .starting
        do {
            let m = try await client.openMirror(file: file)
            mirror = m
            if m.healthy == false {
                phase = .blocked(
                    "The canvas server is not answering",
                    "serve is on port \(m.port.map(String.init) ?? "?") and its own health check failed. " +
                        "The studio cannot see inside the page, so this is everything it knows."
                )
            } else if m.url != nil {
                phase = .ready
            } else {
                phase = .blocked("The mirror started without a URL", m.note)
            }
        } catch let failure as StudioError {
            phase = .blocked("The studio refused the canvas", failure.errorDescription)
        } catch {
            phase = .blocked("The studio did not answer", "Is `npm run studio` running from the repository root?")
        }
        diagram = try? await client.diagram(name)
    }

    /// The web's "Restart canvas": close the mirror, then a fresh `serve`
    /// on the next render (`restartMirror` in the web's actions). No-ops
    /// politely when nothing is open.
    private func restart() async {
        busy = true
        if mirror != nil { _ = try? await client.closeMirror(file: file) }
        mirror = nil
        await open()
        reloadToken += 1
        busy = false
    }

    /// MirrorKeepAlive as a view task: beat every idleMs/3, floored at 30s,
    /// from the runner's own number while it sends one. A touch that finds
    /// no mirror means the sweep won (a sleep longer than the idle window
    /// stops heartbeats with everything else), so the canvas is reopened
    /// and the page reloaded rather than left dead. A failed touch stays
    /// silent; the next one is a third of the window away.
    private func heartbeat() async {
        while !Task.isCancelled {
            let idle = mirror?.idleMs.map { Double($0) / 1000 } ?? Self.fallbackIdleSeconds
            try? await Task.sleep(for: .seconds(max(30, idle / 3)))
            guard !Task.isCancelled, mirror != nil, phase == .ready else { continue }
            do {
                if let live = try await client.touchMirror(file: file) {
                    let moved = live.url != mirror?.url
                    mirror = live
                    if moved { reloadToken += 1 }
                } else {
                    await open()
                    reloadToken += 1
                }
            } catch { /* the next touch retries */ }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Verbs, the detail screen's own three plus commit                    */
    /* ------------------------------------------------------------------ */

    private func verb(_ action: String) {
        busy = true
        outcome = nil
        Task {
            do {
                let result = try await client.diagramVerb(name, action)
                outcome = [result.note, result.detail.joined(separator: "\n")].compactMap { $0 }.joined(separator: "\n")
                outcomeBad = !result.ok
            } catch let failure as StudioError {
                outcome = failure.errorDescription
                outcomeBad = true
            } catch {
                outcome = "The studio did not answer."
                outcomeBad = true
            }
            busy = false
            diagram = try? await client.diagram(name)
        }
    }

    /// `POST /api/diagrams/{name}/commit`: the checkout's edits reaching
    /// the database, with the reason field the way a commit message was.
    private func commit() {
        let reason = commitReason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !reason.isEmpty else { return }
        busy = true
        outcome = nil
        Task {
            do {
                let result = try await client.commitDiagram(name, reason: reason)
                outcome = result.note
                outcomeBad = !result.ok
                if result.ok { commitReason = "" }
            } catch let failure as StudioError {
                outcome = failure.errorDescription
                outcomeBad = true
            } catch {
                outcome = "The studio did not answer."
                outcomeBad = true
            }
            busy = false
            diagram = try? await client.diagram(name)
        }
    }
}

/// The serve page itself: a WKWebView on `http://127.0.0.1:<port>/?mirror=1`.
///
/// Unlike ChatWeb/NoteWeb this is a remote page, not a bundled document,
/// so navigations that stay on the serve origin are allowed (the page is
/// the editor) and a click anywhere else opens in the real browser, where
/// the link was meant to go. `token` forces a reload for restart and a
/// swept mirror reopened on another port.
private struct CanvasWebView: NSViewRepresentable {
    let url: URL
    let token: Int
    let onGone: () -> Void

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loaded: URL?
        var loadedToken = -1
        let onGone: () -> Void

        init(onGone: @escaping () -> Void) { self.onGone = onGone }

        /// Off-origin clicks and target=_blank belong in the browser.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard action.navigationType == .linkActivated,
                  let target = action.request.url,
                  let loaded,
                  target.host != loaded.host || target.port != loaded.port
            else { return .allow }
            NSWorkspace.shared.open(target)
            return .cancel
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let target = action.request.url { NSWorkspace.shared.open(target) }
            return nil
        }

        /// A real refusal means the serve is gone. `NSURLErrorCancelled` is
        /// excluded: it is what a reload superseding an in-flight load
        /// looks like, not a death.
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code == NSURLErrorCancelled { return }
            DispatchQueue.main.async { self.onGone() }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onGone: onGone) }

    func makeNSView(context: Context) -> WKWebView {
        let web = WKWebView()
        web.navigationDelegate = context.coordinator
        web.load(URLRequest(url: url))
        context.coordinator.loaded = url
        context.coordinator.loadedToken = token
        return web
    }

    func updateNSView(_ web: WKWebView, context: Context) {
        let c = context.coordinator
        guard c.loaded != url || c.loadedToken != token else { return }
        c.loaded = url
        c.loadedToken = token
        web.load(URLRequest(url: url))
    }
}
