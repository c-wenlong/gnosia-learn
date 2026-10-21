//
//  MentionPicker.swift
//  Gnosia
//
//  The @ menu over the ask composers — AskView's open tutor and the
//  library asset's Ask panel. Typing `@` at the start of the draft or
//  after whitespace opens a filtered list of the catalog's concepts and
//  standalone assets; a pick writes `@<slug>` / `@<asset id>` into the
//  text where the query was, followed by a space. That is the token
//  shape the web's mention chips serialise to (mention-text.ts's
//  `mentionToken`, `@<kind>`) carried as plain text, since these
//  composers send `{role, content}` turns and the tokens ride inside
//  the content — the web's chips are exactly how that same text gets
//  its `@<kind>` runs.
//
//  The mechanics are the web's mention-text.ts and MentionComposer.tsx:
//  the trigger rule (`mentionQuery`), a case-insensitive prefix filter
//  (`filterMentionOptions`), wrapping arrow keys (`moveActive`), Enter
//  and Tab picking the active row, Escape closing and leaving the typed
//  query as text, blur closing, "Nothing matches", and one tag per
//  thing — picking an entity the draft already mentions removes the
//  query and adds nothing.
//
//  Two places the platform bends the shape. A SwiftUI TextField reports
//  whole-text edits rather than a caret, so the query is read at the
//  draft's end — where the caret sits whenever `@` opens in practice.
//  And the menu's keys come from an NSEvent monitor installed only
//  while it is open: Return and Cmd+Return then never reach the field's
//  own submit or the send button's ⌘↩ shortcut — the web's "Enter does
//  not send while the menu is open" and "Cmd+Enter is ignored". A
//  marked (IME-composing) run passes every key through, the web's
//  `isImeKey`.
//

import AppKit
import SwiftUI

// MARK: - The rules, as data

/// One entry in the @ menu: a catalog thing the token names.
struct MentionOption: Identifiable, Hashable {
    /// Which half of the catalog the entry came from; two groups get
    /// short headings, one gets none (the web's heading rule).
    enum Group: String, CaseIterable {
        case concept, asset

        var label: String {
            switch self {
            case .concept: return "Concepts"
            case .asset: return "Assets"
            }
        }
    }

    /// What lands in the draft after `@` — the concept's slug or the
    /// asset's id.
    let token: String
    /// The row's label: the concept's title, the asset's display title.
    let name: String
    /// The row's quiet second half: the concept's topic, the asset's kind.
    let detail: String
    /// The row's leading SF symbol.
    let symbol: String
    let group: Group

    var id: String { "\(group.rawValue):\(token)" }
}

/// The open @-query at the end of `text`.
struct MentionQuery: Equatable {
    /// The `@query` span in `text`, `@` included — a pick replaces it.
    var range: Range<String.Index>
    /// What was typed after the `@`.
    var text: String
}

/// The web's `mentionQuery`: `@` at the start of the text or after
/// whitespace, then no whitespace and no second `@` up to the end — so
/// `a@b` is text, not a query, and a space typed after the query ends
/// it. The whole string stands in for the web's "text before the
/// caret": the field's caret is at the end whenever `@` opens.
func mentionQuery(in text: String) -> MentionQuery? {
    var i = text.endIndex
    while i > text.startIndex {
        let j = text.index(before: i)
        let ch = text[j]
        if ch.isWhitespace { return nil }
        if ch == "@" {
            guard j == text.startIndex || text[text.index(before: j)].isWhitespace else { return nil }
            return MentionQuery(
                range: j ..< text.endIndex,
                text: String(text[text.index(after: j) ..< text.endIndex])
            )
        }
        i = j
    }
    return nil
}

/// The web's `filterMentionOptions`: a case-insensitive prefix match on
/// the row's name and token, keeping catalog order — concepts first.
func filterMentions(_ options: [MentionOption], query: String) -> [MentionOption] {
    let q = query.trimmingCharacters(in: .whitespaces).lowercased()
    guard !q.isEmpty else { return options }
    return options.filter {
        $0.name.lowercased().hasPrefix(q) || $0.token.lowercased().hasPrefix(q)
    }
}

/// The web's `moveActive`, all rows usable: the next row in `direction`,
/// wrapping at both ends.
func moveActive(count: Int, active: Int, direction: Int) -> Int {
    guard count > 0 else { return -1 }
    return ((active + direction) % count + count) % count
}

/// Whether `text` already carries `@token` as a whole token — the web's
/// "one chip per kind". A token is `@` plus a maximal run of non-space,
/// non-`@` characters, so `@backprop` inside `@backpropagation` or
/// mid-word (`x@backprop`) does not count.
func alreadyMentioned(_ text: String, token: String) -> Bool {
    let needle = "@\(token)"
    var search = text.startIndex
    while let found = text.range(of: needle, range: search ..< text.endIndex) {
        let leftOK = found.lowerBound == text.startIndex
            || text[text.index(before: found.lowerBound)].isWhitespace
        let rightOK = found.upperBound == text.endIndex
            || text[found.upperBound].isWhitespace
            || text[found.upperBound] == "@"
        if leftOK, rightOK { return true }
        search = found.upperBound
    }
    return false
}

// MARK: - The field with its menu

/// A composer TextField that opens the @ menu above itself while the
/// draft ends in an open query. `options` is a provider rather than a
/// snapshot, so a catalog still loading when the menu first opens fills
/// it as rows arrive. The key monitor lives only while the menu shows.
struct MentionField: View {
    @Binding var text: String
    /// The parent's focus binding — the same one the field takes, so a
    /// panel that asks for focus on open keeps working.
    var focused: FocusState<Bool>.Binding
    var prompt: String
    var lineLimit: ClosedRange<Int>
    var horizontalPadding: CGFloat
    var verticalPadding: CGFloat
    var options: () -> [MentionOption]
    var onSubmit: () -> Void

    /// The highlighted row, as `menu.active` is on the web.
    @State private var active = 0
    /// An Escape or blur's memory: the menu stays shut until the next
    /// edit, since every update reopens it in the web too.
    @State private var dismissed = false
    @State private var keyMonitor: Any?

    private var query: MentionQuery? { mentionQuery(in: text) }

    private var matches: [MentionOption] {
        guard let query else { return [] }
        return filterMentions(options(), query: query.text)
    }

    /// The menu shows while a query is open, the catalog has anything at
    /// all to offer, and the last Escape or blur has not dismissed it.
    private var open: Bool { query != nil && !dismissed && !options().isEmpty }

    private var activeIndex: Int { min(active, max(matches.count - 1, 0)) }

    var body: some View {
        TextField(prompt, text: $text, axis: .vertical)
            .textFieldStyle(.plain)
            .lineLimit(lineLimit)
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
            .focused(focused)
            .onSubmit(onSubmit)
            // The menu floats over the field's top edge — the composer
            // sits at the panel's foot, as the web's opens upward.
            .overlay(alignment: .topLeading) {
                if open {
                    MentionMenu(matches: matches, active: activeIndex) { index in
                        active = index
                    } onPick: { option in
                        pick(option)
                    }
                    .frame(maxWidth: 360)
                    .fixedSize(horizontal: false, vertical: true)
                    .alignmentGuide(.top) { d in d[.bottom] + 6 }
                }
            }
            .onChange(of: open) { _, isOpen in
                if isOpen { active = 0 }
                watchKeys(isOpen)
            }
            .onChange(of: text) { dismissed = false }
            .onChange(of: focused.wrappedValue) { _, has in
                // Blur closes and stays closed, the web's BLUR_COMMAND;
                // coming back reopens a query still open, as the web's
                // update-driven menu does.
                dismissed = !has
            }
            .onDisappear { watchKeys(false) }
    }

    /// A menu pick: the `@query` span is replaced by the token and one
    /// space, in place — the chip plus its following space on the web.
    /// The query is always the draft's tail, so the space is
    /// unconditional. One token per thing: when the draft already
    /// mentions it the query goes and nothing is added.
    private func pick(_ option: MentionOption) {
        guard let query = mentionQuery(in: text) else { return }
        // The query being typed is not a mention: the duplicate check
        // runs on the text beside it, as the web checks chips and never
        // the `@query` the pick replaces.
        let rest = String(text[..<query.range.lowerBound]) + String(text[query.range.upperBound...])
        if alreadyMentioned(rest, token: option.token) {
            text.removeSubrange(query.range)
        } else {
            text.replaceSubrange(query.range, with: "@\(option.token) ")
        }
        active = 0
        focused.wrappedValue = true
    }

    /// The menu's keyboard half, installed only while it is open, so the
    /// arrows, Enter, Tab and Escape it eats never leak into the field
    /// or the send button's shortcut.
    private func watchKeys(_ on: Bool) {
        if on {
            guard keyMonitor == nil else { return }
            keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
                menuKey(event)
            }
        } else if let monitor = keyMonitor {
            NSEvent.removeMonitor(monitor)
            keyMonitor = nil
        }
    }

    /// The web's key table, one event at a time. Returning nil swallows
    /// the key; returning it hands it to the field for its normal work.
    private func menuKey(_ event: NSEvent) -> NSEvent? {
        // Only this field's keys, while its caret is the window's and
        // the menu is really up — the live check, not the install-time
        // one, so a menu that just closed hands the key back.
        guard focused.wrappedValue, !dismissed, query != nil,
              event.window?.firstResponder is NSTextView else { return event }
        // A marked run belongs to the input method (the web's isImeKey):
        // its Enter confirms a word, never picks a row.
        if (event.window?.firstResponder as? NSTextView)?.hasMarkedText() == true { return event }
        let matches = self.matches
        switch event.keyCode {
        case MenuKey.down:
            active = moveActive(count: matches.count, active: activeIndex, direction: 1)
            return nil
        case MenuKey.up:
            active = moveActive(count: matches.count, active: activeIndex, direction: -1)
            return nil
        case MenuKey.return, MenuKey.keypadEnter, MenuKey.tab:
            // Shift+Return is the field's newline and passes through.
            if event.modifierFlags.contains(.shift) { return event }
            // With nothing to pick the menu closes and the key does
            // what it would have done without it — Return submits.
            guard !matches.isEmpty else {
                dismissed = true
                return event
            }
            // Cmd or Ctrl+Return is ignored: a key meant for the menu
            // never sends and never presses a card.
            if event.modifierFlags.intersection([.command, .control]).isEmpty == false { return nil }
            if activeIndex < matches.count { pick(matches[activeIndex]) }
            return nil
        case MenuKey.escape:
            dismissed = true
            return nil
        default:
            return event
        }
    }

    /// Hardware key codes for the keys the menu owns.
    private enum MenuKey {
        static let escape: UInt16 = 53
        static let `return`: UInt16 = 36
        static let keypadEnter: UInt16 = 76
        static let tab: UInt16 = 48
        static let up: UInt16 = 126
        static let down: UInt16 = 125
    }
}

// MARK: - The floating list

/// The menu, in the web's look: a `--surface` panel with a `--border`
/// stroke and radius 12 and no shadow, rows of symbol + name + detail
/// with the active row on `--tint` and its glyph in `--accent-text`,
/// "Nothing matches" when the query filters to empty, and a foot line
/// saying the one thing the rows cannot — what a pick inserts.
private struct MentionMenu: View {
    let matches: [MentionOption]
    let active: Int
    let onHover: (Int) -> Void
    let onPick: (MentionOption) -> Void

    /// The matches split back into their catalog groups, in group order.
    private var sections: [(MentionOption.Group, [(offset: Int, element: MentionOption)])] {
        MentionOption.Group.allCases.compactMap { group in
            let rows = matches.enumerated().filter { $0.element.group == group }
            return rows.isEmpty ? nil : (group, rows)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if matches.isEmpty {
                Text("Nothing matches")
                    .font(.callout)
                    .foregroundStyle(G.text2)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(sections, id: \.0) { group, rows in
                                if sections.count > 1 {
                                    Text(group.label)
                                        .font(.caption)
                                        .foregroundStyle(G.text3)
                                        .padding(.horizontal, 12)
                                        .padding(.top, 6)
                                        .padding(.bottom, 2)
                                }
                                ForEach(rows, id: \.element.id) { index, option in
                                    row(option, at: index)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .frame(maxHeight: 252)
                    .onChange(of: active) { _, i in
                        // The highlighted row stays in view as the
                        // arrows move it, the web's scrollIntoView.
                        if i < matches.count { proxy.scrollTo(matches[i].id, anchor: .center) }
                    }
                }
            }
            Divider().overlay(G.hair)
            Text("Inserts @name in the message")
                .font(.caption)
                .foregroundStyle(G.text3)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
        }
        .background(G.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(G.border))
    }

    /// One row: the web's glyph + name + description, highlighted on
    /// `--tint` when active, hover moving the highlight as the web's
    /// pointer does.
    private func row(_ option: MentionOption, at index: Int) -> some View {
        let on = index == active
        return Button { onPick(option) } label: {
            HStack(spacing: 9) {
                Image(systemName: option.symbol)
                    .font(.callout)
                    .frame(width: 20, alignment: .center)
                    .foregroundStyle(on ? G.accentText : G.text2)
                Text(option.name)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.text)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(option.detail)
                    .font(.caption)
                    .foregroundStyle(G.text2)
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(on ? G.tint : .clear, in: RoundedRectangle(cornerRadius: 6))
        .padding(.horizontal, 4)
        .onHover { inside in
            if inside { onHover(index) }
        }
        .id(option.id)
    }
}
