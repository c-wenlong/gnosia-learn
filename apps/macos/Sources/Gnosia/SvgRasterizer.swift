//
//  SvgRasterizer.swift
//  Gnosia
//
//  SVG markup to NSImage, so the studio's diagram tiles and preview can
//  draw what the runner serves. `NSImage` has no SVG decoding and the
//  markup comes over HTTP, so the honest rasterizer is one offscreen
//  WKWebView: load the markup as a page the size of a tile, wait for the
//  load, take the snapshot.
//
//  One webview, serially: a grid asks for every tile at once, and a
//  WKWebView is a real web process, forty tiles each owning one would be
//  forty of them. Rasterizations queue instead, and answers cache by the
//  markup's hash (plus the render size), so a re-read of the same list
//  costs nothing.
//

import AppKit
import Foundation
import WebKit

@MainActor
final class SvgRasterizer {
    static let shared = SvgRasterizer()

    /// The tile size the grid asks for; the inspector asks for `preview`.
    enum Size {
        case tile
        case preview

        var points: CGSize {
            switch self {
            case .tile: return CGSize(width: 480, height: 340)
            case .preview: return CGSize(width: 1200, height: 850)
            }
        }
        var key: String { self == .tile ? "t" : "p" }
    }

    private struct Job {
        let key: String
        let svg: String
        let size: Size
        let done: (NSImage?) -> Void
    }

    private let cache = NSCache<NSString, NSImage>()
    private var webview: WKWebView?
    private var queue: [Job] = []
    private var busy = false

    private init() { cache.countLimit = 300 }

    /// The raster for this markup, or nil when the webview could not make
    /// one. Completion comes back on the main actor.
    func image(for svg: String, size: Size) async -> NSImage? {
        let key = "\(size.key):\(svg.hashValue)" as NSString
        if let hit = cache.object(forKey: key) { return hit }
        return await withCheckedContinuation { wait in
            queue.append(Job(key: key as String, svg: svg, size: size) { [weak self] image in
                if let image { self?.cache.setObject(image, forKey: key) }
                wait.resume(returning: image)
            })
            drain()
        }
    }

    private func drain() {
        guard !busy, let job = queue.first else { return }
        queue.removeFirst()
        busy = true
        let view = prepared()
        let box = job.size.points
        view.frame = NSRect(origin: .zero, size: box)
        let delegate = LoadDelegate { [weak self] _ in
            guard let self else { return }
            // The snapshot configuration's rect is in view points.
            let config = WKSnapshotConfiguration()
            config.rect = NSRect(origin: .zero, size: box)
            view.takeSnapshot(with: config) { image, _ in
                self.busy = false
                job.done(image)
                self.drain()
            }
        }
        keepDelegate = delegate
        view.navigationDelegate = delegate
        delegate.arm(view)
        view.loadHTMLString(Self.page(for: job.svg), baseURL: nil)
    }

    /// The webview, made once. It is hosted in a borderless window parked
    /// off-screen, because a view with no window reports itself hidden and
    /// the web process declines to paint, snapshots come back blank.
    private func prepared() -> WKWebView {
        if let webview { return webview }
        let config = WKWebViewConfiguration()
        // The markup is data: a runner export, or a planner's picture, which
        // is model output (D105). No script runs, and the page's CSP below
        // lets nothing load from anywhere, so a snapshot is all it can be.
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: NSRect(origin: .zero, size: CGSize(width: 480, height: 340)), configuration: config)
        view.setValue(false, forKey: "drawsBackground")
        let host = NSWindow(
            contentRect: NSRect(x: -20_000, y: -20_000, width: 480, height: 340),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
        host.contentView = view
        host.orderFrontRegardless()
        self.host = host
        webview = view
        return view
    }

    /// The window that keeps the webview painting, parked off-screen.
    private var host: NSWindow?

    /// The delegate survives the call: WKWebView holds its delegate weakly,
    /// so the rasterizer keeps the in-flight one until the snapshot lands.
    private var keepDelegate: LoadDelegate?

    /// The markup as a full page, on the tldraw canvas's own white, a
    /// diagram is drawn dark-on-light, and a transparent snapshot in the
    /// app's dark navy would read as ink on ink. `contain` so whatever the
    /// export's pixel size is, it fits the tile.
    private static func page(for svg: String) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">
        <style>
        html,body{margin:0;height:100%;background:#fdfcf8;display:flex;
                  align-items:center;justify-content:center}
        svg{max-width:96vw;max-height:96vh}
        </style></head><body>\(svg)</body></html>
        """
    }

    /// Finishes one load: didFinish, or a fallback after a second so a wedged
    /// markup cannot hold the queue forever.
    /// Only the page `loadHTMLString` makes (`about:blank`) may load.
    nonisolated static func allowsLoad(of url: URL?) -> Bool {
        guard let url else { return true }
        return url.absoluteString == "about:blank"
    }

    private final class LoadDelegate: NSObject, WKNavigationDelegate {
        private let done: (Bool) -> Void
        private var fired = false
        init(done: @escaping (Bool) -> Void) { self.done = done }

        /// The page loads its own markup and goes nowhere else: a `<meta
        /// http-equiv="refresh">` or any other navigation in model-written
        /// markup is cancelled before it can reach a host.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            decisionHandler(SvgRasterizer.allowsLoad(of: action.request.url) ? .allow : .cancel)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { fire(true) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fire(false) }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fire(false) }

        func arm(_ webView: WKWebView) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.fire(false) }
        }

        private func fire(_ ok: Bool) {
            guard !fired else { return }
            fired = true
            done(ok)
        }
    }
}
