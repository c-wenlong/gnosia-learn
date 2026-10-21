//
//  WorkspacePanels.swift
//  Gnosia
//
//  The workspace's three panels — apps/web/src/components/workspace/
//  WorkspacePanels.tsx, drawn natively. Note & sources, Tutor, Studio.
//
//  Where the panels fit they sit side by side, each filling the window's
//  height so it scrolls on its own, and either side panel folds to a
//  48pt rail to give the tutor the room. The web decides "fit" by the
//  room beside the app sidebar — 1160px of window with it open, 960px
//  folded; here the same question is asked of the workspace itself, so
//  a window that leaves less than 960pt for the panels gets the tabbed
//  layout whatever the sidebar is doing. Below that the panels become
//  tabs — the web's kit TabList as a row that names the one panel on
//  show.
//
//  The open widths are the web's two tiers: 250/270 where the panels
//  only just fit (the web's `ws:`), 290/310 at 1280 and up (its `xl:`).
//  Folded both take the rail's 48.
//
//  The fold is the web's move: the panel keeps its open width inside a
//  column that shrinks and clips it, so its text slides away whole
//  instead of re-wrapping at every frame, fading out while the rail
//  fades in over the column's edge. Both stay mounted — a folded
//  note keeps its scroll and its webview, a folded studio its graph.
//  200ms, ease in-out, as the web's ease-soft.
//

import SwiftUI

/// The panels the workspace can show — the tab row's ids and labels, in
/// the web's order.
enum WorkspacePanelKey: String, CaseIterable, Identifiable {
    case note = "Note & sources"
    case tutor = "Tutor"
    case studio = "Studio"
    var id: String { rawValue }
}

/// The web's folded-sidebar breakpoint: below it the panels become tabs.
private let workspaceWideAt: CGFloat = 960
/// The web's `xl:` tier: at this width the open panels take their larger
/// sizes.
private let workspaceXlAt: CGFloat = 1280
/// The gap between panels — the web's 16px.
private let workspaceGutter: CGFloat = 16
/// The folded rail's width — the web's w-12.
private let workspaceRailWidth: CGFloat = 48

struct WorkspacePanels<Note: View, Tutor: View, Studio: View>: View {
    /// The tab the narrow layout shows; the wide layout shows all three
    /// and ignores it except when an action (Teach me, Quiz me) asks to
    /// bring the tutor forward.
    @Binding var active: WorkspacePanelKey
    @ViewBuilder var note: () -> Note
    @ViewBuilder var tutor: () -> Tutor
    @ViewBuilder var studio: () -> Studio

    @State private var noteOpen = true
    @State private var studioOpen = true

    var body: some View {
        GeometryReader { geo in
            if geo.size.width >= workspaceWideAt {
                wideLayout(xl: geo.size.width >= workspaceXlAt)
            } else {
                narrowLayout
            }
        }
    }

    /// Side by side: note, tutor, studio, each a full-height column.
    private func wideLayout(xl: Bool) -> some View {
        HStack(alignment: .top, spacing: workspaceGutter) {
            SidePanel(
                title: WorkspacePanelKey.note.rawValue, edge: .left,
                open: noteOpen, openWidth: xl ? 290 : 250,
                onCollapse: { noteOpen = false }, onExpand: { noteOpen = true },
                content: note
            )
            PanelCard(title: WorkspacePanelKey.tutor.rawValue, scrolls: false, content: tutor)
                .frame(maxWidth: .infinity)
            SidePanel(
                title: WorkspacePanelKey.studio.rawValue, edge: .right,
                open: studioOpen, openWidth: xl ? 310 : 270,
                onCollapse: { studioOpen = false }, onExpand: { studioOpen = true },
                content: studio
            )
        }
    }

    /// One at a time: the tab row names the panels, the chosen one shows.
    /// All three stay mounted — a session mid-walk, a note mid-scroll
    /// and the studio's graph keep their state across a tab switch.
    private var narrowLayout: some View {
        VStack(spacing: 10) {
            tabRow
            ZStack {
                panel(WorkspacePanelKey.note) { PanelCard(title: nil, scrolls: true, content: note) }
                panel(WorkspacePanelKey.tutor) { PanelCard(title: nil, scrolls: false, content: tutor) }
                panel(WorkspacePanelKey.studio) { PanelCard(title: nil, scrolls: true, content: studio) }
            }
        }
    }

    /// A narrow-mode panel, visible and touchable only while chosen —
    /// the web's `hidden` wrapper: mounted either way, out of the show
    /// when its tab is not the one.
    private func panel<Content: View>(_ key: WorkspacePanelKey, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .opacity(active == key ? 1 : 0)
            .allowsHitTesting(active == key)
            .accessibilityHidden(active != key)
    }

    /// The narrow layout's tab row — the web's kit TabList: medium
    /// labels, a 2pt accent line under the chosen one.
    private var tabRow: some View {
        HStack(spacing: 18) {
            ForEach(WorkspacePanelKey.allCases) { key in
                Button { active = key } label: {
                    VStack(spacing: 4) {
                        Text(key.rawValue)
                            .font(.callout.weight(.medium))
                            .foregroundStyle(active == key ? G.text : G.text2)
                        Rectangle()
                            .fill(active == key ? G.accent : Color.clear)
                            .frame(height: 2)
                    }
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
    }
}

/// One panel's card — the web's kit Panel: the surface colour at radius
/// 16 with no border, a 48px header with a hairline under it when it has
/// a title. `scrolls` wraps the body in the column's own ScrollView; the
/// tutor manages its own scroll, so its caller passes false.
struct PanelCard<Content: View, Actions: View>: View {
    var title: String? = nil
    var scrolls = false
    let content: () -> Content
    let actions: () -> Actions

    init(
        title: String? = nil, scrolls: Bool = false,
        @ViewBuilder content: @escaping () -> Content,
        @ViewBuilder actions: @escaping () -> Actions
    ) {
        self.title = title
        self.scrolls = scrolls
        self.content = content
        self.actions = actions
    }

    var body: some View {
        VStack(spacing: 0) {
            if let title {
                HStack(spacing: 8) {
                    Text(title)
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(G.text)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    actions()
                }
                .padding(.horizontal, 14)
                .frame(height: 44)
                .overlay(alignment: .bottom) { G.hair.frame(height: 1) }
            }
            Group {
                if scrolls {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            content()
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                } else {
                    content()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
        }
        .frame(maxHeight: .infinity)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 16))
    }
}

/// The no-actions form: a card with only its title in the header.
extension PanelCard where Actions == EmptyView {
    init(
        title: String? = nil, scrolls: Bool = false,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.init(title: title, scrolls: scrolls, content: content) { EmptyView() }
    }
}

/// A side panel's place in the row: open, a panel card of `openWidth`;
/// folded, a 48pt rail down the column's edge the whole height of which
/// expands it again. The panel keeps its open width inside the shrinking
/// column — the web's `justify-end`/`justify-start` pin — so each folds
/// out toward the window edge it sits on.
private struct SidePanel<Content: View>: View {
    enum FoldEdge { case left, right }

    let title: String
    let edge: FoldEdge
    let open: Bool
    let openWidth: CGFloat
    let onCollapse: () -> Void
    let onExpand: () -> Void
    @ViewBuilder var content: () -> Content

    private var columnWidth: CGFloat { open ? openWidth : workspaceRailWidth }

    var body: some View {
        ZStack(alignment: .topLeading) {
            PanelCard(title: title, scrolls: true) {
                content()
            } actions: {
                Button("Collapse", action: onCollapse)
                    .buttonStyle(.plain)
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
            .frame(width: openWidth)
            // The web's justify-end/justify-start pin: the left panel is
            // pinned to the column's right edge so folding slides it out
            // by the window's left; the right panel pins to the left and
            // the clip eats it from the window's right.
            .offset(x: edge == .left ? columnWidth - openWidth : 0)
            .opacity(open ? 1 : 0)
            .allowsHitTesting(open)
            .accessibilityHidden(!open)

            FoldRail(title: title, onExpand: onExpand)
                .opacity(open ? 0 : 1)
                .allowsHitTesting(!open)
                .accessibilityHidden(open)
        }
        .frame(width: columnWidth)
        .frame(maxHeight: .infinity)
        .clipped()
        .animation(.easeInOut(duration: 0.2), value: open)
    }
}

/// A folded side panel: a "+" and the panel's name on its side, the
/// whole rail a button that opens it again — the web's Rail.
private struct FoldRail: View {
    let title: String
    let onExpand: () -> Void

    var body: some View {
        Button(action: onExpand) {
            VStack(spacing: 14) {
                Text("+")
                    .font(.system(size: 16, weight: .semibold))
                Text(title)
                    .font(.callout.weight(.semibold))
                    .lineLimit(1)
                    .fixedSize()
                    // On its side, the web's vertical-rl. The rotated
                    // text keeps its own measured box, so the frame sets
                    // the slot the label stands in rather than guessing
                    // its length.
                    .rotationEffect(.degrees(90))
                    .frame(width: 20, height: 160)
                Spacer(minLength: 0)
            }
            .foregroundStyle(G.text2)
            .padding(.top, 14)
            .frame(width: workspaceRailWidth)
            .frame(maxHeight: .infinity)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 16))
            .contentShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Expand \(title)")
    }
}

/// Chips laid out left to right, wrapping — the one layout SwiftUI does
/// not give a FlowLayout-shaped thing itself. The backlink list and any
/// wrapping row in the panels share it.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 {
                x = 0
                y += row + spacing
                row = 0
            }
            row = max(row, size.height)
            x += size.width + spacing
        }
        return CGSize(width: width, height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += row + spacing
                row = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            row = max(row, size.height)
            x += size.width + spacing
        }
    }
}
