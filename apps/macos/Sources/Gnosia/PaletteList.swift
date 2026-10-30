//
//  PaletteList.swift
//  Gnosia
//
//  A selectable list drawn in the Gnosia palette, after the web's list
//  links: rows on the column's own ground, the selected one on a rounded
//  fill in semibold, the same fill under the pointer. SwiftUI's
//  `List(selection:)` draws the system's grey sidebar material and its
//  accent or grey selection whatever the background says, so the Learn
//  rail and the course page's module list use this instead.
//
//  The arrow keys move the selection through `order` once the list has
//  focus (a click on a row gives it), as they did in the system list.
//

import SwiftUI

/// The id `step` rows from `current` in `order`, held at the ends; the
/// first (or last) row when nothing in `order` is selected.
func paletteStep<ID: Equatable>(_ order: [ID], from current: ID?, by step: Int) -> ID? {
    guard !order.isEmpty else { return nil }
    guard let current, let at = order.firstIndex(of: current) else {
        return step < 0 ? order.last : order.first
    }
    return order[min(max(at + step, 0), order.count - 1)]
}

/// The scrolling column: `content` stacked, the arrow keys stepping
/// `selection` through `order`, and the selected row kept in view.
struct PaletteList<ID: Hashable, Content: View>: View {
    @Binding var selection: ID?
    /// Every selectable id, in the order the rows draw.
    let order: [ID]
    @ViewBuilder let content: Content

    @FocusState private var focused: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    content
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
            }
            .focusable()
            .focused($focused)
            .focusEffectDisabled()
            .onMoveCommand { direction in
                let step: Int
                switch direction {
                case .up: step = -1
                case .down: step = 1
                default: return
                }
                if let next = paletteStep(order, from: selection, by: step) {
                    selection = next
                }
            }
            .onChange(of: selection) { _, id in
                guard let id, order.contains(id) else { return }
                withAnimation(.easeOut(duration: 0.15)) { proxy.scrollTo(id) }
            }
            .simultaneousGesture(TapGesture().onEnded { focused = true })
        }
    }
}

/// One row of a palette list: `label` on a rounded `fill` when selected
/// (semibold, as the web's `font-semibold`) or hovered, bare otherwise.
/// The row's `.id` is `id`, so the list can scroll to it.
struct PaletteRow<ID: Hashable, Label: View>: View {
    let id: ID
    @Binding var selection: ID?
    /// The selected and hovered row's fill: `tint` in the course
    /// sidebar, `surface` on the Learn rail's `surface2` ground.
    let fill: Color
    @ViewBuilder let label: Label

    @State private var hovering = false

    private var selected: Bool { selection == id }

    var body: some View {
        Button { selection = id } label: {
            label
                .fontWeight(selected ? .semibold : nil)
                .foregroundStyle(G.text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(selected || hovering ? fill : .clear)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityAddTraits(selected ? .isSelected : [])
        .id(id)
    }
}
