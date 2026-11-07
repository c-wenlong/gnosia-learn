//
//  WebView.swift
//  GnosiaWeb
//
//  The whole product surface: a WKWebView pointed at the local Next server.
//  Two policies keep the window self-contained. The window shows only the
//  app server's own origin (`navigationVerdict`): any other http(s) page,
//  and every target=_blank link, goes to the real browser, and any other
//  scheme (file:, a custom app scheme) is dropped, never handed to
//  NSWorkspace, which would launch whatever app claims it. And the app's
//  cookies live in the default persistent data store so sign-in survives
//  relaunches. The View > Reload menu posts
//  .gnosiaWebReload, which the coordinator wires to webView.reload(), and
//  Back and Forward post their own; a two-finger swipe does the same.
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
    static let gnosiaWebReload = Notification.Name("gnosiaWebReload")
    static let gnosiaWebBack = Notification.Name("gnosiaWebBack")
    static let gnosiaWebForward = Notification.Name("gnosiaWebForward")
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

/// Whether a new-window request (target=_blank, window.open) goes to the
/// browser: http and https only. Anything else is dropped, since
/// NSWorkspace opens a file: URL or a custom scheme with whatever local
/// app claims it.
func opensInBrowser(_ url: URL?) -> Bool {
    guard let scheme = url?.scheme?.lowercased() else { return false }
    return scheme == "http" || scheme == "https"
}

struct WebView: NSViewRepresentable {
    let url: URL
    /// The launch token for the first request's header, or nil.
    var token: String?

    func makeCoordinator() -> Coordinator { Coordinator(origin: url) }

    func makeNSView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.allowsBackForwardNavigationGestures = true
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        // The page's <title> becomes the window title — the web app sets
        // meaningful ones ("Review · Gnosia"), and a bare "Gnosia" window
        // loses them.
        context.coordinator.titleObservation = view.observe(\.title) { view, _ in
            view.window?.title = view.title?.isEmpty == false ? view.title! : "Gnosia"
        }
        context.coordinator.webView = view
        for (name, selector) in [
            (Notification.Name.gnosiaWebReload, #selector(Coordinator.reloadPage)),
            (.gnosiaWebBack, #selector(Coordinator.goBack)),
            (.gnosiaWebForward, #selector(Coordinator.goForward)),
        ] {
            NotificationCenter.default.addObserver(context.coordinator, selector: selector, name: name, object: nil)
        }
        var request = URLRequest(url: url)
        if let token { request.setValue(token, forHTTPHeaderField: "x-gnosia-local-token") }
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

        @objc func reloadPage() {
            webView?.reload()
        }

        /// Back and Forward move the front window only: every window's
        /// coordinator hears the menu's notification.
        @objc func goBack() {
            guard webView?.window?.isKeyWindow == true else { return }
            webView?.goBack()
        }

        @objc func goForward() {
            guard webView?.window?.isKeyWindow == true else { return }
            webView?.goForward()
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

        /// target=_blank gets no second window: an http(s) link opens in the
        /// real browser where external pages belong, and anything else is
        /// dropped.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for action: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = action.request.url, opensInBrowser(url) { NSWorkspace.shared.open(url) }
            return nil
        }
    }
}
