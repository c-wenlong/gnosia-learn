//
//  LibraryView.swift
//  Gnosia
//
//  The library surface: a split view with the video list on the left and the
//  player on the right. v1 groups by tool (generated_by) or by the topic
//  vocabulary; the web app's day/course/conversation groupings and its
//  filters land later.
//

import SwiftUI

private enum Grouping: String, CaseIterable, Identifiable {
    case tool = "Tool"
    case topic = "Topic"
    var id: String { rawValue }
}

/// One collapsible rung of the list.
private struct SectionModel: Identifiable {
    var id: String { title }
    let title: String
    let rows: [CatalogAsset]
}

struct LibraryView: View {
    @Environment(CatalogStore.self) private var store
    @State private var selection: String?
    @State private var grouping: Grouping = .tool
    @State private var search = ""

    private var filtered: [CatalogAsset] {
        let query = search.trimmingCharacters(in: .whitespaces)
        let videos = store.videos
        guard !query.isEmpty else { return videos }
        return videos.filter {
            $0.displayTitle.localizedCaseInsensitiveContains(query)
                || $0.id.localizedCaseInsensitiveContains(query)
        }
    }

    /// Grouped by tool: the catalog's own four, then the studio's `video`
    /// namespace, then anything else, in that fixed order.
    private static let toolOrder = ["manimkc", "remotionkc", "revideokc", "blenderkc", "video", "other"]

    private var sections: [SectionModel] {
        switch grouping {
        case .tool:
            let groups = Dictionary(grouping: filtered, by: { $0.generatedBy })
            return Self.toolOrder.compactMap { tool in
                guard let rows = groups[tool], !rows.isEmpty else { return nil }
                return SectionModel(title: tool, rows: rows)
            }
        case .topic:
            // A video with several topics files under its first, the same
            // rule the web library's topic grouping applies to a row with no
            // concept; untopiced rows fall to the end.
            let groups = Dictionary(grouping: filtered, by: { $0.topics.first ?? "" })
            return groups.keys.sorted { lhs, rhs in
                (store.topics[lhs]?.title ?? lhs) < (store.topics[rhs]?.title ?? rhs)
            }.map { slug in
                let title = slug.isEmpty ? "No topic" : (store.topics[slug]?.title ?? slug)
                return SectionModel(title: title, rows: groups[slug] ?? [])
            }
        }
    }

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                Picker("Group by", selection: $grouping) {
                    ForEach(Grouping.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(8)

                if let error = store.error {
                    ContentUnavailableView {
                        Label("No catalog", systemImage: "cylinder.split.1x2")
                    } description: {
                        Text(error).font(.caption)
                    }
                } else {
                    List(selection: $selection) {
                        ForEach(sections) { section in
                            Section(section.title) {
                                ForEach(section.rows) { asset in
                                    VideoRow(asset: asset)
                                        .tag(asset.id)
                                }
                            }
                        }
                    }
                    .listStyle(.sidebar)
                }
            }
            .navigationSplitViewColumnWidth(min: 280, ideal: 340)
            .searchable(text: $search, placement: .sidebar, prompt: "Search videos")
        } detail: {
            if let id = selection, let asset = store.asset(id) {
                VideoDetailView(asset: asset)
            } else {
                ContentUnavailableView(
                    "Select a video",
                    systemImage: "play.rectangle",
                    description: Text("\(store.videos.count) videos in the catalog")
                )
            }
        }
    }
}

/// One row of the list: the poster when the blob made one, then the title and
/// the second line's provenance.
private struct VideoRow: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset

    private var posterURL: URL? {
        store.companions(for: asset.id).posterKey.map { store.blobURL(for: $0) }
    }

    var body: some View {
        HStack(spacing: 10) {
            PosterThumbnail(url: posterURL, maxPixel: 40)
                .frame(width: 71, height: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(asset.displayTitle)
                    .lineLimit(2)
                Text(asset.generatedBy)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
