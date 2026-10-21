//
//  NoteBodyView.swift
//  Gnosia
//
//  A note's body typeset the way the web page typesets it: the same block
//  split MarkdownText runs, then an offscreen-shaped WKWebView renders the
//  inline half — emphasis, links, wikilinks, code — and the maths with the
//  bundled KaTeX, the renderer lib/math.ts runs on the same content. Raw
//  `$\operatorname{FFN}(x)…$` was readable to nobody; this is why the web
//  switched to KaTeX too (the unicode-macro table failed on \frac, \sum,
//  \begin — exactly what these notes are full of).
//
//  The view sizes itself: note.html reports its laid-out height over the
//  "gnosia" message handler and the frame follows, so it sits inside a
//  ScrollView like any other block. Links open in the browser; wikilinks
//  and embeds render as muted text for now — resolving them is native
//  routing work, not renderer work.
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

    @Environment(\.colorScheme) private var scheme
    @State private var height: CGFloat = 60

    var body: some View {
        NoteWeb(
            payload: Self.payload(source: source, stripTitle: stripTitle, dark: scheme == .dark),
            onHeight: { height = max(20, $0) }
        )
        .frame(maxWidth: .infinity)
        .frame(height: height)
    }

    // MARK: - payload

    private struct JBlock: Encodable {
        let t: String
        var l: Int = 0
        var s: String = ""
    }

    /// `{"theme":…, "blocks":…}` as a JS literal for `gnosia(payload)`.
    private static func payload(source: String, stripTitle: String?, dark: Bool) -> String {
        var blocks = MarkdownText.parse(source)
        if let title = stripTitle, case .heading(1, let text)? = blocks.first,
           text.trimmingCharacters(in: .whitespaces).caseInsensitiveCompare(title) == .orderedSame {
            blocks.removeFirst()
        }
        let jblocks: [JBlock] = blocks.map {
            switch $0 {
            case .heading(let l, let s): return JBlock(t: "h", l: l, s: s)
            case .para(let s): return JBlock(t: "p", s: s)
            case .bullet(let s): return JBlock(t: "b", s: s)
            case .code(let s): return JBlock(t: "c", s: s)
            case .rule: return JBlock(t: "r")
            }
        }
        // The G palette, one CSS var per token the page uses.
        let theme: [String: String] = dark ? [
            "fg": "#eee8dc", "muted": "#a3b2bf", "faint": "#74828f",
            "border": "#3d4c5b", "codebg": "#1b2c3c", "bg": "#0a1621",
            "accent": "#5cbab3", "danger": "#ff8585", "sel": "rgba(92,186,179,.3)",
        ] : [
            "fg": "#15283a", "muted": "#605b54", "faint": "#878276",
            "border": "#e6dfd0", "codebg": "#f3eee1", "bg": "#faf6ec",
            "accent": "#0f5f61", "danger": "#c43939", "sel": "rgba(20,130,133,.25)",
        ]
        guard
            let blocksData = try? JSONEncoder().encode(jblocks),
            let themeData = try? JSONEncoder().encode(theme),
            let bj = String(data: blocksData, encoding: .utf8),
            let tj = String(data: themeData, encoding: .utf8)
        else { return #"{"theme":{},"blocks":[]}"# }
        return #"{"theme":\#(tj),"blocks":\#(bj)}"#
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
