//
//  WebView.swift
//  GnosiaWeb
//
//  The whole product surface: a WKWebView pointed at the local Next server.
//  Two policies keep the window self-contained — any navigation off
//  127.0.0.1 (external links, target=_blank) is handed to the real browser,
//  and the app's cookies live in the default persistent data store so
//  sign-in survives relaunches. The View > Reload menu posts
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

struct WebView: NSViewRepresentable {
    let url: URL
    /// The launch token for the first request's header, or nil.
    var token: String?

    func makeCoordinator() -> Coordinator { Coordinator() }

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

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        weak var webView: WKWebView?
        var titleObservation: NSKeyValueObservation?

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
            // <a download> asks for a download outright.
            if action.shouldPerformDownload { return .download }
            guard
                let url = action.request.url,
                url.scheme == "http" || url.scheme == "https"
            else { return .allow }  // about:blank, data:, blob: — the app's own business
            if url.host == "127.0.0.1" || url.host == "localhost" { return .allow }
            NSWorkspace.shared.open(url)
            return .cancel
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

        /// target=_blank gets no second window: the link opens in the real
        /// browser where external pages belong.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for action: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = action.request.url { NSWorkspace.shared.open(url) }
            return nil
        }
    }
}
