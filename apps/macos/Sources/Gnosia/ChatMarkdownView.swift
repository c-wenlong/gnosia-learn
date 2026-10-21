//
//  ChatMarkdownView.swift
//  Gnosia
//
//  One chat turn rendered the way the web renders it: a WKWebView over
//  chat.html with the bundled KaTeX, replacing MathText's unicode
//  fallback in the bubbles. The web splits the two voices — the
//  learner's turn is MathText inside UserMessage (maths typeset, the
//  rest literal) while the tutor's is NoteProse inside TutorMessage
//  (full markdown) — so the view takes a Role and does the same: `.user`
//  renders chat.html's math mode, `.assistant` its markdown mode on the
//  same MarkdownText block split the note uses.
//
//  The bubble chrome — fill, border, radius, padding, font size — is
//  drawn inside the page from per-turn CSS vars, so the frame the page
//  reports is the bubble itself and nothing is drawn twice. Height comes
//  back over the "gnosia" handler exactly as note.html does, capped at
//  --max-h with the overflow scrolling inside the bubble. Until the
//  first height lands a plain-text bubble stands in, so a turn is never
//  blank while the page spins up.
//
//  Drop-in for any turn-shaped content:
//  `ChatMarkdownView(text: turn.content, role: .assistant)`.
//

import SwiftUI
import WebKit

struct ChatMarkdownView: View {
    /// Whose turn it is: the bubble's tint and the renderer's mode.
    /// `.user` keeps prose literal with maths typeset (the web's
    /// MathText); `.assistant` runs the full markdown pass (the web's
    /// NoteProse). A third state (a tinted tutor notice, say) is a new
    /// case plus a row in `themeVars`.
    enum Role { case user, assistant }

    /// The turn's text: markdown for `.assistant`, literal prose with
    /// $…$ spans for `.user`.
    let text: String
    var role: Role = .assistant
    /// The bubble's shape — AskView's defaults, the inspector panel's
    /// smaller set as arguments.
    var fontSize: CGFloat = 13
    var cornerRadius: CGFloat = 14
    var horizontalPadding: CGFloat = 14
    var verticalPadding: CGFloat = 10

    @Environment(\.colorScheme) private var scheme
    @State private var height: CGFloat = 30
    @State private var loaded = false

    var body: some View {
        VStack(spacing: 0) {
            if !loaded { fallback }
            ChatWeb(
                payload: payload,
                onHeight: { h in
                    height = max(18, min(h, 1000))
                    loaded = true
                }
            )
            .frame(maxWidth: .infinity)
            .frame(height: loaded ? height : 1)
            .opacity(loaded ? 1 : 0)
        }
    }

    /// The loading stand-in: the same chrome the page draws, around the
    /// turn as plain text, so the bubble is readable before — and while —
    /// the webview loads. One point of it stays mounted underneath at
    /// full width so chat.html lays out at the right measure and the
    /// first reported height is already correct.
    private var fallback: some View {
        Text(text)
            .font(.system(size: fontSize))
            .foregroundStyle(role == .user ? G.btnText : G.text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
            .background(
                role == .user ? G.btnFace : G.surface,
                in: RoundedRectangle(cornerRadius: cornerRadius)
            )
            .overlay {
                if role != .user {
                    RoundedRectangle(cornerRadius: cornerRadius).stroke(G.border)
                }
            }
    }

    private var payload: String {
        Self.payload(
            text: text, role: role, dark: scheme == .dark,
            fontSize: fontSize, radius: cornerRadius,
            padX: horizontalPadding, padY: verticalPadding
        )
    }

    // MARK: - payload

    private struct JBlock: Encodable {
        let t: String
        var l = 0
        var s = ""
    }

    /// A CGFloat as a CSS length, without the trailing ".0".
    private static func px(_ v: CGFloat) -> String {
        v == v.rounded() ? "\(Int(v))px" : String(format: "%.2fpx", v)
    }

    /// The palette and shape for one role in one appearance, as CSS var
    /// values (the page sets each key as `--key`). The user bubble is the
    /// brand button's — deep teal with cream ink — so its code chips,
    /// links and selection invert rather than reuse the page palette.
    private static func themeVars(role: Role, dark: Bool) -> [String: String] {
        switch (role, dark) {
        case (.user, false):
            return [
                "bg": "#0f5f61", "stroke": "#0f5f61", "line": "0px",
                "fg": "#faf6ec", "muted": "rgba(250,246,236,.75)", "faint": "rgba(250,246,236,.55)",
                "border": "rgba(255,255,255,.3)", "codebg": "rgba(255,255,255,.16)",
                "accent": "#faf6ec", "danger": "#ffb3b3", "sel": "rgba(250,246,236,.3)",
            ]
        case (.user, true):
            return [
                "bg": "#5cbab3", "stroke": "#5cbab3", "line": "0px",
                "fg": "#0a1621", "muted": "rgba(10,22,33,.72)", "faint": "rgba(10,22,33,.5)",
                "border": "rgba(10,22,33,.3)", "codebg": "rgba(10,22,33,.14)",
                "accent": "#0a1621", "danger": "#8f1d1d", "sel": "rgba(10,22,33,.28)",
            ]
        case (.assistant, false):
            return [
                "bg": "#fffdf8", "stroke": "#e6dfd0", "line": "1px",
                "fg": "#15283a", "muted": "#605b54", "faint": "#878276",
                "border": "#e6dfd0", "codebg": "#f3eee1",
                "accent": "#0f5f61", "danger": "#c43939", "sel": "rgba(20,130,133,.25)",
            ]
        case (.assistant, true):
            return [
                "bg": "#102131", "stroke": "#3d4c5b", "line": "1px",
                "fg": "#eee8dc", "muted": "#a3b2bf", "faint": "#74828f",
                "border": "#3d4c5b", "codebg": "#1b2c3c",
                "accent": "#5cbab3", "danger": "#ff8585", "sel": "rgba(92,186,179,.3)",
            ]
        }
    }

    /// `{"theme":…, "mode":…, "blocks"|"text":…}` as a JS literal for
    /// `gnosia(payload)` — the same one-call-carries-all shape
    /// NoteBodyView sends to note.html.
    private static func payload(
        text: String, role: Role, dark: Bool,
        fontSize: CGFloat, radius: CGFloat, padX: CGFloat, padY: CGFloat
    ) -> String {
        var vars = themeVars(role: role, dark: dark)
        vars["fs"] = px(fontSize)
        vars["radius"] = px(radius)
        vars["pad-x"] = px(padX)
        vars["pad-y"] = px(padY)
        vars["max-h"] = "900px"

        guard
            let themeData = try? JSONEncoder().encode(vars),
            let tj = String(data: themeData, encoding: .utf8)
        else { return #"{"theme":{},"mode":"math","text":""}"# }

        let content: String
        if role == .assistant {
            let jblocks: [JBlock] = MarkdownText.parse(text).map {
                switch $0 {
                case .heading(let l, let s): return JBlock(t: "h", l: l, s: s)
                case .para(let s): return JBlock(t: "p", s: s)
                case .bullet(let s): return JBlock(t: "b", s: s)
                case .code(let s): return JBlock(t: "c", s: s)
                case .rule: return JBlock(t: "r")
                }
            }
            guard
                let blocksData = try? JSONEncoder().encode(jblocks),
                let bj = String(data: blocksData, encoding: .utf8)
            else { return #"{"theme":\#(tj),"mode":"md","blocks":[]}"# }
            content = #""mode":"md","blocks":\#(bj)"#
        } else {
            guard
                let textData = try? JSONEncoder().encode(text),
                let xj = String(data: textData, encoding: .utf8)
            else { return #"{"theme":\#(tj),"mode":"math","text":""}"# }
            content = #""mode":"math","text":\#(xj)"#
        }
        return #"{"theme":\#(tj),\#(content)}"#
    }
}

/// The WKWebView half: loads chat.html once, then replays the payload on
/// every change — ready or not, the last update wins once the page is.
/// NoteWeb's pattern, one level down.
private struct ChatWeb: NSViewRepresentable {
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

        /// The page is a local document: every navigation other than its
        /// own load is a click that belongs in the browser, not in here.
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
        if let page = Bundle.module.url(forResource: "chat", withExtension: "html"),
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
