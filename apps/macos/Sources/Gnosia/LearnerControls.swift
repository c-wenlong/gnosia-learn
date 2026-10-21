//
//  LearnerControls.swift
//  Gnosia
//
//  The write affordances the web app puts on an asset's page — the star
//  (FavoriteButton in AssetActions.tsx), the "Mark watched"/"Mark read"
//  press (MarkWatched.tsx) and the rename pencil beside the title
//  (AssetTitle.tsx) — and the checklist tick the course path gives each
//  topic (the "Mark done" checkbox in TopicRow.tsx).
//
//  Every control is the same move: write through LearnerStore (the owner of
//  learner.db), then store.refreshLearner() so the read model re-reads the
//  file and every row drawing from it updates. The learner environment may
//  be absent in a surface mounted without it, so writes are optional
//  chaining — a control with no writer draws its state and does nothing.
//

import SwiftUI

/// The star. Filled and yellow when the asset is starred; pressing writes
/// `favorite` through LearnerStore and the refresh makes the flip visible.
struct FavoriteButton: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner: LearnerStore?
    let assetID: String
    /// The word "Favorite" beside the star on detail headers; list rows
    /// take the icon alone.
    var showsLabel = true

    var body: some View {
        let on = store.isFavorite(assetID)
        Button {
            learner?.toggleFavorite(assetID)
            store.refreshLearner()
        } label: {
            if showsLabel {
                Label("Favorite", systemImage: on ? "star.fill" : "star")
            } else {
                Image(systemName: on ? "star.fill" : "star")
            }
        }
        .foregroundStyle(on ? .yellow : .secondary)
        .help(on ? "Remove from favorites" : "Add to favorites")
    }
}

/// "Mark watched" on a video, "Mark read" on anything else — the web's
/// MarkWatched button. A press writes the `watch` row's `done`, keeping the
/// furthest position the mark already carried. Always enabled: a second
/// viewing is a second mark, as the web's append of a second event is.
struct MarkDoneButton: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner: LearnerStore?
    let asset: CatalogAsset
    /// The playhead a video passes; a page kind marks at what was stored.
    var seconds: Double = 0

    private var verb: String { asset.kind == "video" ? "watched" : "read" }

    var body: some View {
        let done = store.watchMark(asset.id)?.done ?? false
        Button {
            learner?.setWatch(
                asset.id,
                seconds: max(seconds, store.watchMark(asset.id)?.seconds ?? 0),
                done: true,
                mirror: .marked
            )
            store.refreshLearner()
        } label: {
            Label(done ? "Marked \(verb)" : "Mark \(verb)",
                  systemImage: done ? "checkmark.circle.fill" : "checkmark.circle")
                .font(.callout)
        }
        .help(done ? "Marked \(verb) — pressing again updates the time" : "Mark \(verb)")
    }
}

/// The detail heading and its rename field — AssetTitle.tsx's part. The
/// heading stays where it is; the pencil opens a field under it, Enter or
/// Save writes through LearnerStore.rename, Escape or Cancel puts the field
/// away, and a blank field clears the name back to the source's title (the
/// web's cleanAssetName null rule — LearnerStore.rename treats a blank the
/// same way). While the file names the asset, "Original: … · Use it" offers
/// the clear.
struct RenameTitle: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner: LearnerStore?
    let asset: CatalogAsset
    var font: Font = .title2

    @State private var editing = false
    @State private var draft = ""

    /// The web route refuses a name past assetNameMax; the field does the
    /// same check before it ever reaches the store.
    private var tooLong: Bool { draft.count > assetNameMax }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(store.displayTitle(for: asset)).font(font).bold()
                Button {
                    if editing {
                        editing = false
                    } else {
                        draft = store.displayTitle(for: asset)
                        editing = true
                    }
                } label: {
                    Image(systemName: "pencil").font(.callout)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Rename")
                .help("Rename")
            }

            if editing {
                HStack(spacing: 8) {
                    TextField("Name", text: $draft)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 380)
                        .onSubmit(save)
                        .onExitCommand { editing = false }
                    Button("Save", action: save)
                        .disabled(tooLong)
                    Button("Cancel") { editing = false }
                }
                if tooLong {
                    Text("At most \(assetNameMax) characters.")
                        .font(.caption)
                        .foregroundStyle(.red)
                } else if store.names[asset.id] != nil {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("Original: \(asset.displayTitle)")
                        Button("Use it") { clear() }
                            .buttonStyle(.plain)
                            .foregroundStyle(.tint)
                    }
                    .font(.callout)
                    .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func save() {
        guard !tooLong else { return }
        learner?.rename(asset.id, to: draft)
        store.refreshLearner()
        editing = false
    }

    /// The web's "Use it": clears the learner's own name so the source's
    /// title shows again.
    private func clear() {
        learner?.clearName(asset.id)
        store.refreshLearner()
        editing = false
    }
}
