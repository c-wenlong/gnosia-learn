//
//  WebView.swift
//  HermesWeb
//
//  The whole product surface: a WKWebView pointed at the local Next server.
//  Two policies keep the window self-contained. The window shows only the
//  app server's own origin (`navigationVerdict`): any other http(s) page
//  goes to the real browser, and any other scheme (file:, a custom app
//  scheme) is dropped, never handed to NSWorkspace, which would launch
//  whatever app claims it. A new-window request (target=_blank, the context
//  menu's "Open Link in New Window", a Cmd- or Shift-click) for the app's
//  own origin opens a second shell window on the same data store, so it is
//  signed in; a foreign one goes to the browser (`newWindowVerdict`). And
//  the app's cookies live in the default persistent data store so sign-in
//  survives relaunches. The menus' commands (Reload, Back, Forward, the
//  zoom steps, Print, Find) post notifications that only the front
//  window's coordinator acts on; a two-finger swipe goes back and forward.
//
//  A response the server sends as an attachment (Settings' Export, the
//  Library's Download) or one the view cannot show is saved, not shown
//  (S9-10): WebKit's default renders an attachment it can display, which
//  replaced the whole app with raw JSON or a full-window video.
//

import AppKit
import SwiftUI
import WebKit

extension Notification.Name {
    static let hermesWebReload = Notification.Name("hermesWebReload")
    static let hermesWebBack = Notification.Name("hermesWebBack")
    static let hermesWebForward = Notification.Name("hermesWebForward")
    static let hermesWebZoomIn = Notification.Name("hermesWebZoomIn")
    static let hermesWebZoomOut = Notification.Name("hermesWebZoomOut")
    static let hermesWebActualSize = Notification.Name("hermesWebActualSize")
    static let hermesWebPrint = Notification.Name("hermesWebPrint")
    static let hermesWebFind = Notification.Name("hermesWebFind")
    static let hermesWebFindNext = Notification.Name("hermesWebFindNext")
    static let hermesWebFindPrevious = Notification.Name("hermesWebFindPrevious")
}

/// Whether a response is saved rather than shown: one the server marks
/// `Content-Disposition: attachment`, or one the view has no way to show.
func shouldDownload(disposition: String?, canShowMIMEType: Bool) -> Bool {
    if let disposition, disposition.split(separator: ";").first?
        .trimmingCharacters(in: .whitespaces).lowercased() == "attachment" { return true }
    return !canShowMIMEType
}

/// What the window does with a navigation.
enum NavigationVerdict: Equatable {
    /// Load it here.
    case allow
    /// Hand it to the real browser (http and https only).
    case openInBrowser
    /// Drop it.
    case cancel
}

private let loopbackHosts: Set<String> = ["127.0.0.1", "localhost", "::1", "[::1]"]

/// The URL's host is this machine's loopback.
func isLoopback(_ url: URL) -> Bool {
    url.host.map { loopbackHosts.contains($0.lowercased()) } ?? false
}

/// Same scheme and port, and the same host, where the loopback names
/// (127.0.0.1, localhost, ::1) count as one host: an adopted dev server
/// can name itself `localhost` while the spawned one is `127.0.0.1`.
/// The port is what tells the app server from anything else on the machine.
func sameOrigin(_ a: URL, _ b: URL) -> Bool {
    guard let scheme = a.scheme?.lowercased(), scheme == b.scheme?.lowercased(),
          let hostA = a.host?.lowercased(), let hostB = b.host?.lowercased()
    else { return false }
    let defaultPort = scheme == "https" ? 443 : 80
    guard (a.port ?? defaultPort) == (b.port ?? defaultPort) else { return false }
    return hostA == hostB || (loopbackHosts.contains(hostA) && loopbackHosts.contains(hostB))
}

/// The window's navigation policy, as a pure rule. The main frame shows the
/// app server's origin, `about:blank`, and a `blob:` the app itself made;
/// any other http(s) page goes to the browser, and every other scheme is
/// dropped. A subframe may also load loopback on another port, which is the
/// studio's live canvas (`tldrawkc serve`, the CSP's `frame-src`), but never
/// sends anything to the browser: a frame on a page must not open windows
/// by loading.
func navigationVerdict(for url: URL?, appOrigin: URL, mainFrame: Bool) -> NavigationVerdict {
    guard let url, let scheme = url.scheme?.lowercased() else { return .cancel }
    switch scheme {
    case "about":
        let rest = url.absoluteString.dropFirst("about:".count)
        return rest == "blank" || rest == "srcdoc" ? .allow : .cancel
    case "blob":
        // blob:http://127.0.0.1:port/<uuid>: the origin that made it.
        // Foundation percent-encodes the opaque part when it holds an IPv6
        // literal (`blob:http%3A//%5B::1%5D:port/…`), so decode it first or
        // an app served from [::1] could never load its own blobs.
        let opaque = String(url.absoluteString.dropFirst("blob:".count))
        guard let inner = URL(string: opaque.removingPercentEncoding ?? opaque) else { return .cancel }
        return sameOrigin(inner, appOrigin) ? .allow : .cancel
    case "http", "https":
        if sameOrigin(url, appOrigin) { return .allow }
        if !mainFrame { return isLoopback(url) ? .allow : .cancel }
        return .openInBrowser
    default:
        return .cancel
    }
}

/// What a new-window request does.
enum NewWindowVerdict: Equatable {
    /// Open a second shell window: the app's own page, signed in.
    case openInShell
    /// Hand it to the real browser (http and https only).
    case openInBrowser
    /// Drop it.
    case cancel
}

/// The new-window policy (target=_blank, the context menu's "Open Link in
/// New Window", a modifier click), as a pure rule. The app's own origin, as
/// http(s) or a blob it made, stays in the shell, where the window has the
/// session cookie: the browser would open it signed out, on the sign-in
/// page or a 401. A foreign http(s) page goes to the browser. Everything
/// else is dropped, `about:blank` included (an empty window), and above all
/// file: and custom schemes, which NSWorkspace would open with whatever
/// local app claims them.
func newWindowVerdict(for url: URL?, appOrigin: URL) -> NewWindowVerdict {
    guard let url, let scheme = url.scheme?.lowercased() else { return .cancel }
    switch navigationVerdict(for: url, appOrigin: appOrigin, mainFrame: true) {
    case .allow:
        return scheme == "http" || scheme == "https" || scheme == "blob" ? .openInShell : .cancel
    case .openInBrowser:
        return .openInBrowser
    case .cancel:
        return .cancel
    }
}

/// Whether a navigation the main frame would load opens a new shell window
/// instead: a link Cmd- or Shift-clicked, as a browser opens it in a new tab
/// or window. Only a link click, only in the main frame, and only one the
/// window would load; a foreign link already goes to the browser.
func opensInNewWindow(
    navigationType: WKNavigationType, modifiers: NSEvent.ModifierFlags,
    mainFrame: Bool, verdict: NavigationVerdict
) -> Bool {
    guard navigationType == .linkActivated, mainFrame, verdict == .allow else { return false }
    return !modifiers.intersection([.command, .shift]).isEmpty
}

/// The page zoom steps View > Zoom In and Zoom Out move through, Safari's.
let zoomSteps: [CGFloat] = [0.5, 0.75, 0.85, 1, 1.15, 1.25, 1.5, 1.75, 2, 2.5, 3]

/// The next zoom step from `current`, up or down; the end step stays put.
/// A zoom between steps (a pinch never sets `pageZoom`, but be safe) moves
/// to the nearest step in that direction.
func nextZoom(from current: CGFloat, zoomingIn: Bool) -> CGFloat {
    let epsilon: CGFloat = 0.001
    if zoomingIn { return zoomSteps.first { $0 > current + epsilon } ?? zoomSteps.last! }
    return zoomSteps.last { $0 < current - epsilon } ?? zoomSteps.first!
}

/// The web view's configuration, shared by every shell window.
///
/// Tab reaches links as well as form controls, as it does in Chrome and
/// Firefox: WebKit's default (Safari's "Press Tab to highlight each item"
/// off) skips every link, so a keyboard user of the window could not reach
/// the sidebar, a card's "All reviews" or a row link with Tab at all, only
/// with Option-Tab.
///
/// Element fullscreen is on, so the video player's Full screen works: off,
/// WebKit's default, `requestFullscreen` does nothing and
/// `document.fullscreenEnabled` is false.
///
/// Script cannot open a window without a click, as a browser's popup
/// blocker has it: every new window is one the person asked for.
///
/// With `notifications`, the page gets a `Notification` that posts through
/// `NotificationBridge` (the app bundle only: an unbundled `swift run`
/// cannot use the notification center).
@MainActor
func webViewConfiguration(notifications: Bool = NotificationBridge.isAvailable) -> WKWebViewConfiguration {
    let configuration = WKWebViewConfiguration()
    configuration.preferences.tabFocusesLinks = true
    configuration.preferences.isElementFullscreenEnabled = true
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    if notifications { NotificationBridge.install(in: configuration.userContentController) }
    return configuration
}

/// What every shell window's web view sets on itself.
@MainActor
func configureWebView(_ view: WKWebView) {
    view.allowsBackForwardNavigationGestures = true
    // Pinch to zoom, as in Safari.
    view.allowsMagnification = true
    #if DEBUG
    // Safari's Web Inspector reaches a debug build only.
    view.isInspectable = true
    #endif
}

struct WebView: NSViewRepresentable {
    let url: URL
    /// The launch token for the first request's header, or nil.
    var token: String?

    func makeCoordinator() -> Coordinator { Coordinator(origin: url) }

    func makeNSView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: webViewConfiguration())
        context.coordinator.attach(to: view)
        var request = URLRequest(url: url)
        if let token { request.setValue(token, forHTTPHeaderField: "x-hermes-local-token") }
        view.load(request)
        return view
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        context.coordinator.origin = url
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        weak var webView: WKWebView?
        var titleObservation: NSKeyValueObservation?
        /// The app server's URL; its origin is the only one the main frame shows.
        var origin: URL

        init(origin: URL) {
            self.origin = origin
        }

        /// Become `view`'s delegates, title its window, and listen for the
        /// menu's commands.
        func attach(to view: WKWebView) {
            configureWebView(view)
            view.navigationDelegate = self
            view.uiDelegate = self
            // A bundled app's notification bridge pushes permission changes
            // into every window's page, this one included.
            NotificationBridge.track(view)
            // The page's <title> becomes the window title — the web app sets
            // meaningful ones ("Review · Hermes"), and a bare "Hermes" window
            // loses them.
            titleObservation = view.observe(\.title) { view, _ in
                // The handler is Sendable but always fires on the main
                // thread, which is where the window may be titled.
                MainActor.assumeIsolated {
                    view.window?.title = view.title?.isEmpty == false ? view.title! : "Hermes"
                }
            }
            webView = view
            for (name, selector) in [
                (Notification.Name.hermesWebReload, #selector(reloadPage)),
                (.hermesWebBack, #selector(goBack)),
                (.hermesWebForward, #selector(goForward)),
                (.hermesWebZoomIn, #selector(zoomIn)),
                (.hermesWebZoomOut, #selector(zoomOut)),
                (.hermesWebActualSize, #selector(actualSize)),
                (.hermesWebPrint, #selector(printPage)),
                (.hermesWebFind, #selector(find)),
                (.hermesWebFindNext, #selector(findNext)),
                (.hermesWebFindPrevious, #selector(findPrevious)),
            ] {
                NotificationCenter.default.addObserver(self, selector: selector, name: name, object: nil)
            }
        }

        /// The menu's commands act on the front window only: every window's
        /// coordinator hears the notification.
        private var front: WKWebView? {
            guard let webView, webView.window?.isKeyWindow == true else { return nil }
            return webView
        }

        @objc func reloadPage() {
            front?.reload()
        }

        @objc func goBack() {
            front?.goBack()
        }

        @objc func goForward() {
            front?.goForward()
        }

        @objc func zoomIn() {
            guard let view = front else { return }
            view.pageZoom = nextZoom(from: view.pageZoom, zoomingIn: true)
        }

        @objc func zoomOut() {
            guard let view = front else { return }
            view.pageZoom = nextZoom(from: view.pageZoom, zoomingIn: false)
        }

        @objc func actualSize() {
            guard let view = front else { return }
            view.pageZoom = 1
            view.magnification = 1
        }

        /// File > Print: WebKit's own print operation, as a sheet on the
        /// window. Its view needs the web view's frame, or the pages print
        /// blank.
        @objc func printPage() {
            guard let view = front, let window = view.window else { return }
            let operation = view.printOperation(with: NSPrintInfo.shared)
            operation.view?.frame = view.bounds
            operation.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
        }

        /// The front window's find bar, kept open or not so Find Next can
        /// walk the term the field still holds.
        private var findBar: FindBarController?

        /// Edit > Find…: open the window's bar (or refocus it) and put the
        /// cursor in the field.
        @objc func find() {
            guard let view = front, let window = view.window else { return }
            if findBar == nil {
                let bar = FindBarController()
                bar.run = { [weak self, weak view] term, backwards, anchored in
                    self?.runFind(term: term, backwards: backwards, anchored: anchored, in: view)
                }
                bar.clear = { [weak view, weak window] in
                    view?.evaluateJavaScript(clearFindJavaScript, completionHandler: nil)
                    window?.makeFirstResponder(view)
                }
                findBar = bar
            }
            findBar?.open(in: window)
        }

        /// Edit > Find Next and Find Previous walk the field's term again;
        /// with nothing searched yet they open the bar, as a browser's
        /// Cmd+G does before a first Find.
        @objc func findNext() { findAgain(backwards: false) }
        @objc func findPrevious() { findAgain(backwards: true) }

        private func findAgain(backwards: Bool) {
            guard let view = front else { return }
            guard let bar = findBar, !bar.term.isEmpty else { find(); return }
            runFind(term: bar.term, backwards: backwards, anchored: false, in: view)
        }

        /// `window.find` in the page, with the answer going to the bar so a
        /// miss turns its field's text red. `anchored` keeps a typed search
        /// at the match it is refining.
        private func runFind(term: String, backwards: Bool, anchored: Bool, in view: WKWebView?) {
            guard let view else { return }
            if term.isEmpty {
                view.evaluateJavaScript(clearFindJavaScript, completionHandler: nil)
                return
            }
            view.evaluateJavaScript(findJavaScript(term: term, backwards: backwards, anchored: anchored)) { [weak findBar] result, _ in
                findBar?.found = result as? Bool ?? false
            }
        }

        /// Each download's chosen file, while its bytes land in a sibling
        /// beside it: the chosen file is replaced only once the download
        /// finishes, so a failed or cancelled one leaves an old file whole.
        private var destinations: [ObjectIdentifier: (temporary: URL, chosen: URL)] = [:]

        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction
        ) async -> WKNavigationActionPolicy {
            // No target frame is a new window, which shows nothing here.
            let mainFrame = action.targetFrame?.isMainFrame ?? true
            let verdict = navigationVerdict(for: action.request.url, appOrigin: origin, mainFrame: mainFrame)
            // <a download> asks for a download outright, for any URL the
            // window does not drop. The app's own downloads are responses
            // marked `attachment`, decided below.
            if action.shouldPerformDownload, verdict != .cancel { return .download }
            if opensInNewWindow(
                navigationType: action.navigationType, modifiers: action.modifierFlags,
                mainFrame: mainFrame, verdict: verdict
            ) {
                ShellWindows.shared.open(request: action.request, origin: origin)
                return .cancel
            }
            switch verdict {
            case .allow:
                return .allow
            case .openInBrowser:
                if let url = action.request.url { NSWorkspace.shared.open(url) }
                return .cancel
            case .cancel:
                return .cancel
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor response: WKNavigationResponse
        ) async -> WKNavigationResponsePolicy {
            let disposition = (response.response as? HTTPURLResponse)?
                .value(forHTTPHeaderField: "Content-Disposition")
            return shouldDownload(disposition: disposition, canShowMIMEType: response.canShowMIMEType) ? .download : .allow
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        /// Where the file goes: a save panel on the window, starting in
        /// Downloads with the server's own file name. Cancel cancels the
        /// download; the page stays where it was.
        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String
        ) async -> URL? {
            let panel = NSSavePanel()
            panel.nameFieldStringValue = suggestedFilename
            panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            panel.canCreateDirectories = true
            let answer: NSApplication.ModalResponse
            if let window = webView?.window {
                answer = await panel.beginSheetModal(for: window)
            } else {
                answer = panel.runModal()
            }
            guard answer == .OK, let url = panel.url else { return nil }
            let temporary = url.deletingLastPathComponent()
                .appending(path: ".\(url.lastPathComponent).\(UUID().uuidString).download")
            destinations[ObjectIdentifier(download)] = (temporary, url)
            return temporary
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let target = destinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
            let files = FileManager.default
            do {
                if files.fileExists(atPath: target.chosen.path) {
                    _ = try files.replaceItemAt(target.chosen, withItemAt: target.temporary)
                } else {
                    try files.moveItem(at: target.temporary, to: target.chosen)
                }
            } catch {
                try? files.removeItem(at: target.temporary)
                report(error)
            }
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            if let target = destinations.removeValue(forKey: ObjectIdentifier(download)) {
                try? FileManager.default.removeItem(at: target.temporary)
            }
            report(error)
        }

        private func report(_ error: Error) {
            let alert = NSAlert()
            alert.messageText = "The download did not finish"
            alert.informativeText = error.localizedDescription
            if let window = webView?.window { alert.beginSheetModal(for: window) } else { alert.runModal() }
        }

        /// A new-window request: the app's own page opens a second shell
        /// window, built on the configuration WebKit hands over (the same
        /// data store, so the same session), and WebKit loads the request
        /// into it. A foreign http(s) page goes to the browser; anything
        /// else is dropped.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for action: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            switch newWindowVerdict(for: action.request.url, appOrigin: origin) {
            case .openInShell:
                return ShellWindows.shared.open(configuration: configuration, origin: origin)
            case .openInBrowser:
                if let url = action.request.url { NSWorkspace.shared.open(url) }
                return nil
            case .cancel:
                return nil
            }
        }

        /// `window.close()` from a page: honoured for a window the shell
        /// opened, never for the main one.
        func webViewDidClose(_ webView: WKWebView) {
            ShellWindows.shared.close(webView)
        }
    }
}

/// The shell windows opened for a new-window request, each an AppKit window
/// holding a web view with its own coordinator. The main window stays
/// SwiftUI's; these are kept here until they close.
@MainActor
final class ShellWindows: NSObject, NSWindowDelegate {
    static let shared = ShellWindows()

    private var open: [ObjectIdentifier: (window: NSWindow, coordinator: WebView.Coordinator)] = [:]

    /// A window for a request the shell loads itself (a modifier click).
    func open(request: URLRequest, origin: URL) {
        open(configuration: webViewConfiguration(), origin: origin).load(request)
    }

    /// A window whose web view WebKit loads (`createWebViewWith`), which
    /// must be built on the configuration WebKit passed.
    @discardableResult
    func open(configuration: WKWebViewConfiguration, origin: URL) -> WKWebView {
        let parent = NSApp.keyWindow
        let size = parent?.frame.size ?? NSSize(width: 1240, height: 800)
        let window = NSWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false
        )
        window.isReleasedWhenClosed = false
        window.title = "Hermes"
        window.contentMinSize = shellWindowMinimumSize
        window.delegate = self
        let view = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: configuration)
        let coordinator = WebView.Coordinator(origin: origin)
        coordinator.attach(to: view)
        window.contentView = view
        if let parent {
            // Cascaded from the window it came from, as a browser's is.
            window.setFrameTopLeftPoint(NSPoint(x: parent.frame.minX + 22, y: parent.frame.maxY - 22))
        } else {
            window.center()
        }
        open[ObjectIdentifier(window)] = (window, coordinator)
        window.makeKeyAndOrderFront(nil)
        return view
    }

    /// Close the shell-opened window holding `view`; the main window is
    /// not in the list, so a page cannot close it.
    func close(_ view: WKWebView) {
        guard let window = view.window, open[ObjectIdentifier(window)] != nil else { return }
        window.close()
    }

    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        open.removeValue(forKey: ObjectIdentifier(window))
    }
}

/// The smallest a shell window gets: narrow enough for the web app's phone
/// and tablet layouts, which a browser window reaches by being resized.
let shellWindowMinimumSize = NSSize(width: 480, height: 600)
