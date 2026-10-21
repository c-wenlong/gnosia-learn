//
//  NoteBodyView.swift
//  Gnosia
//
//  A note's body typeset the way the web page typesets it. The whole parse
//  now lives in the bundled note.html — its block and inline parsers are a
//  port of the web's packages/tutor/src/markdown.ts plus GFM tables,
//  ~~strikethrough~~ and <autolinks> — and the maths go through the bundled
//  KaTeX, the same renderer lib/math.ts runs on this content. Splitting in
//  the page means the port is near-verbatim rather than a second
//  translation in Swift that would drift: a note gets tables, nested
//  lists, blockquotes and [!kind] callouts the web draws, for free the day
//  the shared parser learns them.
//
//  `![[name]]` embeds resolve through the catalog the way the web's
//  embedAssetId does — the `diagram:learn/assets/<name>` row's blob,
//  carried into the page as a data URI so the webview needs no extra file
//  access. An embed that resolves to nothing renders the named gap the
//  web draws for an unavailable asset. Wikilinks stay muted text —
//  resolving them is native routing work, not renderer work.
//
//  The view sizes itself: note.html reports its laid-out height over the
//  "gnosia" message handler and the frame follows, so it sits inside a
//  ScrollView like any other block.
//

import SwiftUI
import WebKit

struct NoteBodyView: View {
    /// The note's markdown, frontmatter already stripped by the index.
    let source: String
    /// When the body's first heading restates the page's own title, drop
    /// it — the web workspace shows the note inside a card where the
    /// repeat reads as a heading; in the single column it reads as a bug.
    var stripTitle: String? = nil

    /// Where `![[name]]` resolves: the same store every pane reads.
    @Environment(CatalogStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    @State private var height: CGFloat = 60

    var body: some View {
        NoteWeb(
            payload: payload(source: source, stripTitle: stripTitle, dark: scheme == .dark),
            onHeight: { height = max(20, $0) }
        )
        .frame(maxWidth: .infinity)
        .frame(height: height)
    }

    // MARK: - payload

    private struct JPayload: Encodable {
        let theme: [String: String]
        let source: String
        let stripTitle: String?
        let embeds: [String: String]
    }

    /// `{"theme":…,"source":…,"stripTitle":…,"embeds":…}` as a JS literal
    /// for `gnosia(payload)`. Sorted keys keep identical payloads
    /// byte-identical, so the webview's pending-compare stays a dedupe.
    private func payload(source: String, stripTitle: String?, dark: Bool) -> String {
        // The G palette, one CSS var per token the page uses.
        let theme: [String: String] = dark ? [
            "fg": "#eee8dc", "muted": "#a3b2bf", "faint": "#74828f",
            "border": "#3d4c5b", "codebg": "#1b2c3c", "bg": "#0a1621",
            "accent": "#5cbab3", "ok": "#5ed981", "warn": "#f9d25c",
            "violet": "#8b5cf6", "danger": "#ff8585", "sel": "rgba(92,186,179,.3)",
        ] : [
            "fg": "#15283a", "muted": "#605b54", "faint": "#878276",
            "border": "#e6dfd0", "codebg": "#f3eee1", "bg": "#faf6ec",
            "accent": "#0f5f61", "ok": "#008024", "warn": "#8c6800",
            "violet": "#8b5cf6", "danger": "#c43939", "sel": "rgba(20,130,133,.25)",
        ]
        let body = JPayload(
            theme: theme,
            source: source,
            stripTitle: stripTitle,
            embeds: embedSources(in: source)
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard
            let data = try? encoder.encode(body),
            let js = String(data: data, encoding: .utf8)
        else { return #"{"theme":{},"source":"","stripTitle":null,"embeds":{}}"# }
        return js
    }

    // MARK: - embed resolution

    /// Every `![[name]]` in the source to the blob its diagram row names,
    /// as a `data:` URI — the web's embedAssetId (`diagram:learn/assets/<name>`)
    /// over the local blob store. An embed that resolves to nothing stays
    /// out of the map and the page draws its named gap. Matches inside
    /// code spans still resolve; the page just never looks them up.
    private func embedSources(in source: String) -> [String: String] {
        guard let re = try? NSRegularExpression(pattern: #"!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]"#)
        else { return [:] }
        var out: [String: String] = [:]
        for match in re.matches(in: source, range: NSRange(source.startIndex..., in: source)) {
            guard let range = Range(match.range(at: 1), in: source) else { continue }
            let name = source[range].trimmingCharacters(in: .whitespaces)
            guard out[name] == nil, let uri = embedDataURI(name: name) else { continue }
            out[name] = uri
        }
        return out
    }

    /// One embed name to `data:<mime>;base64,…`, or nil when the row or the
    /// blob is missing or the file is not an image — the cases the web's
    /// figure answers with a panel naming the file. Capped so a stray
    /// multi-megabyte blob never lands in the JS payload.
    private func embedDataURI(name: String) -> String? {
        guard
            let mime = Self.embedMime(name),
            let asset = store.asset("diagram:learn/assets/\(name)"),
            let key = asset.blobKey,
            let data = try? Data(contentsOf: store.blobURL(for: key)),
            !data.isEmpty, data.count <= 8_000_000
        else { return nil }
        return "data:\(mime);base64,\(data.base64EncodedString())"
    }

    /// The types an `<img>` draws. Anything else in the slot — a video, a
    /// document — is the named gap, which is the answer the web's
    /// EmbedImage gives for a file that cannot load.
    private static func embedMime(_ name: String) -> String? {
        switch (name as NSString).pathExtension.lowercased() {
        case "svg", "svgz": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "avif": return "image/avif"
        default: return nil
        }
    }
}

/// The WKWebView half: loads note.html once, then replays the payload on
/// every change — ready or not, the last update wins once the page is.
private struct NoteWeb: NSViewRepresentable {
    let payload: String
    let onHeight: (CGFloat) -> Void

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var ready = false
        var pending: String?
        weak var web: WKWebView?
        let onHeight: (CGFloat) -> Void

        init(onHeight: @escaping (CGFloat) -> Void) { self.onHeight = onHeight }

        func send() {
            guard ready, let pending, let web else { return }
            web.evaluateJavaScript("gnosia(\(pending))")
        }

        func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            if body["ready"] != nil {
                ready = true
                send()
            } else if let h = (body["h"] as? NSNumber)?.doubleValue {
                DispatchQueue.main.async { self.onHeight(CGFloat(h)) }
            } else if let nav = body["nav"] as? String, let url = URL(string: nav) {
                NSWorkspace.shared.open(url)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            ready = true
            send()
        }

        /// The page is a local document: every navigation other than its own
        /// load is a click that belongs in the browser, not in here.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            action.navigationType == .linkActivated ? .cancel : .allow
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onHeight: onHeight) }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "gnosia")
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        context.coordinator.web = web
        web.setValue(false, forKey: "drawsBackground")
        if let page = Bundle.module.url(forResource: "note", withExtension: "html"),
           let root = Bundle.module.resourceURL {
            web.loadFileURL(page, allowingReadAccessTo: root)
        }
        return web
    }

    func updateNSView(_ web: WKWebView, context: Context) {
        let c = context.coordinator
        guard c.pending != payload else { return }
        c.pending = payload
        c.send()
    }
}
