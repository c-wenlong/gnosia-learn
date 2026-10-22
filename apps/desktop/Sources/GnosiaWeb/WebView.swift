//
//  WebView.swift
//  GnosiaWeb
//
//  The whole product surface: a WKWebView pointed at the local Next server.
//  Two policies keep the window self-contained — any navigation off
//  127.0.0.1 (external links, target=_blank) is handed to the real browser,
//  and the app's cookies live in the default persistent data store so
//  sign-in survives relaunches. The View > Reload menu posts
//  .gnosiaWebReload, which the coordinator wires to webView.reload().
//

import AppKit
import SwiftUI
import WebKit

extension Notification.Name {
    static let gnosiaWebReload = Notification.Name("gnosiaWebReload")
}

struct WebView: NSViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        // The page's <title> becomes the window title — the web app sets
        // meaningful ones ("Review · Gnosia"), and a bare "Gnosia" window
        // loses them.
        context.coordinator.titleObservation = view.observe(\.title) { view, _ in
            view.window?.title = view.title?.isEmpty == false ? view.title! : "Gnosia"
        }
        context.coordinator.webView = view
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.reloadPage),
            name: .gnosiaWebReload,
            object: nil
        )
        view.load(URLRequest(url: url))
        return view
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        weak var webView: WKWebView?
        var titleObservation: NSKeyValueObservation?

        @objc func reloadPage() {
            webView?.reload()
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction
        ) async -> WKNavigationActionPolicy {
            guard
                let url = action.request.url,
                url.scheme == "http" || url.scheme == "https"
            else { return .allow }  // about:blank, data:, blob: — the app's own business
            if url.host == "127.0.0.1" || url.host == "localhost" { return .allow }
            NSWorkspace.shared.open(url)
            return .cancel
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
