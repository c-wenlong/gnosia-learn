//
//  FindBar.swift
//  HermesWeb
//
//  Cmd+F, as a browser's: a bar under the title bar that finds the typed
//  text in the page. The search itself is the page's own `window.find`,
//  which selects the match and scrolls it into view the way Safari's find
//  does; this file is the bar around it — the field, the ‹ › walk, and
//  closing. Esc or Done puts it away and drops the page's selection, so no
//  highlight stays once the bar is gone.
//
//  `window.find` answers only whether it found the term, not where or how
//  many, so there is no match count: a miss turns the field's text red
//  instead, the way a browser counts zero.
//

import AppKit
import WebKit

/// The JavaScript that finds `term` in the page. `window.find` takes the
/// term, case-insensitive, forward or back, and always wraps, as a
/// browser's find does; the JSON encoding of the term is already a valid
/// JavaScript string literal, quotes and all. `anchored` is for a search
/// typed in the field: it first collapses the selection to where the
/// current match starts, so extending the term refines the same match
/// instead of walking on to the next occurrence the way the walk keys do.
func findJavaScript(term: String, backwards: Bool, anchored: Bool = false) -> String {
    let encoded = (try? JSONEncoder().encode(term)).flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
    let anchor = anchored ? "var s=getSelection();if(s.rangeCount)s.collapseToStart();" : ""
    return "\(anchor)window.find(\(encoded), false, \(backwards ? "true" : "false"), true)"
}

/// What putting the bar away runs: drop the match's selection, which is
/// the highlight `window.find` leaves. It is not a search, so it never
/// scrolls.
let clearFindJavaScript = "getSelection().empty()"

/// The bar shown under a window's title bar for Cmd+F: a field that finds
/// as it types (Enter forward, Shift-Enter back), ‹ › for the same walks,
/// and Done. It asks `run` to do the finding in the page and hears back
/// through `found`, which is what turns the field's text red on a miss.
@MainActor
final class FindBarController: NSTitlebarAccessoryViewController, NSTextFieldDelegate {
    /// Runs `window.find` in the window's page: (term, backwards, anchored).
    var run: (String, Bool, Bool) -> Void = { _, _, _ in }
    /// The bar is going away; the page's selection should go with it.
    var clear: () -> Void = {}

    private let field = NSTextField()

    /// What the field holds: Find Next walks this when the bar stayed open.
    var term: String { field.stringValue }

    /// What the last search answered; the field's text goes red on a miss.
    var found = true {
        didSet { field.textColor = found ? .labelColor : .systemRed }
    }

    override init(nibName: NSNib.Name?, bundle: Bundle?) {
        super.init(nibName: nibName, bundle: bundle)
        layoutAttribute = .bottom
        fullScreenMinHeight = 34
        field.placeholderString = "Find"
        field.font = .systemFont(ofSize: NSFont.systemFontSize)
        field.delegate = self
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let previous = FindBarController.button("chevron.up", "Find Previous", self, #selector(goPrevious))
        let next = FindBarController.button("chevron.down", "Find Next", self, #selector(goNext))
        let done = FindBarController.button("xmark", "Done", self, #selector(closeBar))
        let row = NSStackView(views: [field, previous, next, done])
        row.orientation = .horizontal
        row.spacing = 6
        row.edgeInsets = NSEdgeInsets(top: 6, left: 10, bottom: 6, right: 10)
        view = row
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    private static func button(_ symbol: String, _ label: String, _ target: AnyObject, _ action: Selector) -> NSButton {
        let button = NSButton(
            image: NSImage(systemSymbolName: symbol, accessibilityDescription: label)!,
            target: target, action: action
        )
        button.bezelStyle = .accessoryBarAction
        button.toolTip = label
        return button
    }

    /// Show the bar on the window and put the cursor in the field, with
    /// what was searched before still selected, so typing replaces it.
    func open(in window: NSWindow) {
        if !window.titlebarAccessoryViewControllers.contains(self) {
            window.addTitlebarAccessoryViewController(self)
        }
        isHidden = false
        window.makeFirstResponder(field)
        field.selectText(nil)
    }

    /// Put the bar away and drop the page's highlight.
    @objc func closeBar() {
        guard let window = view.window,
              let index = window.titlebarAccessoryViewControllers.firstIndex(of: self) else { return }
        window.removeTitlebarAccessoryViewController(at: index)
        clear()
    }

    /// Find as the field is typed, forward and anchored at the match so
    /// refining the term cannot walk past it. An emptied field finds
    /// nothing, and the page's selection goes.
    func controlTextDidChange(_ notification: Notification) {
        found = true
        run(field.stringValue, false, true)
    }

    /// Enter walks forward, Shift-Enter back, and Esc closes the bar.
    func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
        switch selector {
        case #selector(NSResponder.insertNewline):
            run(field.stringValue, NSApp.currentEvent?.modifierFlags.contains(.shift) == true, false)
            return true
        case #selector(NSResponder.cancelOperation):
            closeBar()
            return true
        default:
            return false
        }
    }

    @objc private func goPrevious() { run(field.stringValue, true, false) }
    @objc private func goNext() { run(field.stringValue, false, false) }
}
