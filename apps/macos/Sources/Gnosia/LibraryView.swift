//
//  LibraryView.swift
//  Gnosia
//
//  The library surface: a split view with the asset list on the left and a
//  per-kind detail pane on the right. The kind strip is the web library's
//  own — All, then one tab per standalone kind in effort order, then Others
//  for the companion files — and the starred-only toggle, the sort and the
//  tool/topic groupings ride in the row under it. The web's day, course and
//  conversation groupings land later.
//

import AppKit
import SwiftUI

private enum Grouping: String, CaseIterable, Identifiable {
    case tool = "Tool"
    case topic = "Topic"
    var id: String { rawValue }
}

private enum SortOrder: String, CaseIterable, Identifiable {
    case newest = "Newest"
    case title = "Title"
    var id: String { rawValue }
}

/// One tab of the kind strip. `value` is the web's `?kind=`: "" is All,
/// "other" the companion-files tab.
private struct KindTab: Identifiable {
    var id: String { value }
    let value: String
    let label: String
}

/// The web's LIBRARY_TABS: All, then the standalone kinds in effort order.
/// Others is appended only while the catalog holds a companion file, so a
/// library of videos and notes alone shows no empty tab.
private let baseTabs: [KindTab] = [
    KindTab(value: "", label: "All"),
    KindTab(value: "video", label: "Videos"),
    KindTab(value: "diagram_svg", label: "Diagrams"),
    KindTab(value: "note", label: "Notes"),
    KindTab(value: "session", label: "Sessions"),
    KindTab(value: "link", label: "Links"),
]

private let othersTab = KindTab(value: "other", label: "Others")

/// One companion kind with its count, for the Kind menu inside Others.
private struct KindFacet {
    let kind: String
    let label: String
    let count: Int
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
    @State private var sort: SortOrder = .newest
    @State private var kind = ""
    /// The companion kind Others is narrowed to, or nil for all of them —
    /// the web's Kind menu inside the Others tab.
    @State private var othersKind: String?
    @State private var favoritesOnly = false
    @State private var search = ""

    private var tabs: [KindTab] {
        store.assets.contains { isCompanionKind($0.kind) } ? baseTabs + [othersTab] : baseTabs
    }

    /// The companion kinds present, with counts — ranked the web's way:
    /// standalone order first, then label.
    private var companionFacets: [KindFacet] {
        var counts: [String: Int] = [:]
        for asset in store.assets where isCompanionKind(asset.kind) {
            counts[asset.kind, default: 0] += 1
        }
        return counts.map { KindFacet(kind: $0.key, label: assetKindLabel($0.key), count: $0.value) }
            .sorted { kindRank($0.kind) != kindRank($1.kind) ? kindRank($0.kind) < kindRank($1.kind) : $0.label < $1.label }
    }

    /// The rows one filter state shows — `filterRows` in the web's
    /// apps/web/src/lib/library.ts: no kind is the standalone rows (when
    /// Favorites is on, starred companions ride along, because a star is a
    /// choice the owner made about that row); `other` is every companion
    /// file, narrowed by the Kind menu; a kind is itself. Then favorites,
    /// then every search term against title, filename, URL and id.
    private var filtered: [CatalogAsset] {
        var rows: [CatalogAsset]
        switch kind {
        case "":
            rows = favoritesOnly ? store.assets : store.assets.filter { !isCompanionKind($0.kind) }
        case "other":
            rows = store.assets.filter { isCompanionKind($0.kind) }
            if let othersKind { rows = rows.filter { $0.kind == othersKind } }
        default:
            rows = store.assets.filter { $0.kind == kind }
        }
        if favoritesOnly {
            rows = rows.filter { store.favorites.contains($0.id) }
        }
        let terms = search.split { $0.isWhitespace }.map { $0.lowercased() }
        if !terms.isEmpty {
            rows = rows.filter { asset in
                let haystack = [store.displayTitle(for: asset), asset.id, asset.path ?? "", asset.url ?? ""]
                    .joined(separator: "\n")
                    .lowercased()
                return terms.allSatisfy { haystack.contains($0) }
            }
        }
        return rows.sorted(by: inSortOrder)
    }

    /// Newest is when the row entered the catalog, latest first; title is
    /// the name on the card, A to Z. Both fall back to kind-then-id, the
    /// web's stable tiebreak, so two rows indexed in the same run do not
    /// reshuffle between renders.
    private func inSortOrder(_ a: CatalogAsset, _ b: CatalogAsset) -> Bool {
        switch sort {
        case .newest:
            let at = a.createdAt ?? .distantPast
            let bt = b.createdAt ?? .distantPast
            if at != bt { return at > bt }
        case .title:
            let order = store.displayTitle(for: a)
                .localizedCaseInsensitiveCompare(store.displayTitle(for: b))
            if order != .orderedSame { return order == .orderedAscending }
        }
        if kindRank(a.kind) != kindRank(b.kind) { return kindRank(a.kind) < kindRank(b.kind) }
        if a.kind != b.kind { return a.kind < b.kind }
        return a.id < b.id
    }

    /// "42 files", or "12 of 42 files" when a filter narrows the tab — the
    /// web's header count.
    private var countLine: String {
        let universe: Int
        switch kind {
        case "":
            universe = store.assets.filter { !isCompanionKind($0.kind) }.count
        case "other":
            let companions = store.assets.filter { isCompanionKind($0.kind) }
            universe = othersKind == nil
                ? companions.count
                : companions.filter { $0.kind == othersKind }.count
        default:
            universe = store.assets.filter { $0.kind == kind }.count
        }
        // The kind pick — tab or the Kind menu inside Others — is the tab
        // itself, not a narrowing of it; favorites and the search are.
        let narrowed = favoritesOnly || !search.trimmingCharacters(in: .whitespaces).isEmpty
        // Starred companion files shown under All are counted on their own,
        // so the first figure stays within the standalone total beside it.
        let companionsShown = favoritesOnly && kind == ""
            ? filtered.filter { isCompanionKind($0.kind) }.count
            : 0
        let shown = filtered.count - companionsShown
        let count = narrowed
            ? "\(shown) of \(universe) \(filesNoun(universe))"
            : "\(universe) \(filesNoun(universe))"
        return companionsShown > 0
            ? "\(count) · \(companionsShown) starred companion \(companionsShown == 1 ? "file" : "files")"
            : count
    }

    /// Grouped by tool: the catalog's own four, then the studio's `video`
    /// namespace, then anything else, in that fixed order — a note, a link
    /// and a diagram all land in "other" by it.
    private static let toolOrder = ["manimkc", "remotionkc", "revideokc", "blenderkc", "video", "other"]

    private var sections: [SectionModel] {
        switch grouping {
        case .tool:
            let groups = Dictionary(grouping: filtered, by: { $0.generatedBy })
            var ordered: [SectionModel] = Self.toolOrder.compactMap { tool in
                guard let rows = groups[tool], !rows.isEmpty else { return nil }
                return SectionModel(title: tool, rows: rows)
            }
            // A tool the fixed order does not name still gets its section
            // rather than vanishing.
            ordered += groups.keys
                .filter { !Self.toolOrder.contains($0) }
                .sorted()
                .map { SectionModel(title: $0, rows: groups[$0] ?? []) }
            return ordered
        case .topic:
            // A row with several topics files under its first, the same rule
            // the web library's topic grouping applies to a row with no
            // concept; untopiced rows fall to the end. Sections run in the
            // Learn map's order (topic.position), not alphabetically.
            let groups = Dictionary(grouping: filtered, by: { $0.topics.first ?? "" })
            return groups.keys.sorted { lhs, rhs in
                if lhs.isEmpty != rhs.isEmpty { return rhs.isEmpty }
                let lt = store.topics[lhs]
                let rt = store.topics[rhs]
                let lp = lt.map { $0.position > 0 ? $0.position : Int.max } ?? Int.max
                let rp = rt.map { $0.position > 0 ? $0.position : Int.max } ?? Int.max
                if lp != rp { return lp < rp }
                return (lt?.title ?? lhs).localizedCaseInsensitiveCompare(rt?.title ?? rhs) == .orderedAscending
            }.map { slug in
                let title = slug.isEmpty ? "No topic" : (store.topics[slug]?.title ?? slug)
                return SectionModel(title: title, rows: groups[slug] ?? [])
            }
        }
    }

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                kindStrip
                controlsRow
                Text(countLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)

                if let error = store.error {
                    ContentUnavailableView {
                        Label("No catalog", systemImage: "cylinder.split.1x2")
                    } description: {
                        Text(error).font(.caption)
                    }
                } else if filtered.isEmpty {
                    ContentUnavailableView(
                        store.assets.isEmpty ? "Nothing indexed yet" : "No assets match",
                        systemImage: "line.3.horizontal.decrease.circle",
                        description: Text(store.assets.isEmpty
                            ? "The catalog is reachable and holds no assets."
                            : "Nothing here is in this tab under these filters.")
                    )
                } else {
                    List(selection: $selection) {
                        ForEach(sections) { section in
                            Section(section.title) {
                                ForEach(section.rows) { asset in
                                    AssetRow(asset: asset)
                                        .tag(asset.id)
                                }
                            }
                        }
                    }
                    .listStyle(.sidebar)
                }
            }
            .navigationSplitViewColumnWidth(min: 300, ideal: 360)
            .searchable(text: $search, placement: .sidebar, prompt: "Search the library")
        } detail: {
            if let id = selection, let asset = store.asset(id) {
                AssetDetailView(asset: asset)
            } else {
                ContentUnavailableView(
                    "Select an asset",
                    systemImage: "books.vertical",
                    description: Text("\(store.assets.count) assets in the catalog")
                )
            }
        }
        // learner.db can change while the app is open — it is written beside
        // the catalog, not into the snapshot — so reread it on appear and
        // whenever the app comes back to the front.
        .onAppear { store.refreshLearner() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            store.refreshLearner()
        }
    }

    /// The kind tabs, the web's strip as chips: All, the standalone kinds in
    /// effort order, Others while a companion file exists.
    private var kindStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(tabs) { tab in
                    Button {
                        kind = tab.value
                        if tab.value != "other" { othersKind = nil }
                    } label: {
                        Text(tab.label)
                            .font(.callout)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(
                                kind == tab.value ? Color.accentColor.opacity(0.18) : Color.clear,
                                in: Capsule()
                            )
                            .overlay {
                                Capsule().stroke(
                                    kind == tab.value ? Color.accentColor : Color.secondary.opacity(0.3)
                                )
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 8)
            .padding(.bottom, 6)
        }
    }

    /// Grouping, the Kind menu inside Others, Favorites and the sort, at a
    /// chip's height like the web's toolbar.
    private var controlsRow: some View {
        HStack(spacing: 8) {
            Picker("Group by", selection: $grouping) {
                ForEach(Grouping.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .frame(width: 130)

            if kind == "other" {
                Menu(othersKind.map { assetKindLabel($0) } ?? "Kind") {
                    Button { othersKind = nil } label: {
                        if othersKind == nil {
                            Label("All companion files", systemImage: "checkmark")
                        } else {
                            Text("All companion files")
                        }
                    }
                    ForEach(companionFacets, id: \.kind) { facet in
                        Button { othersKind = facet.kind } label: {
                            if othersKind == facet.kind {
                                Label("\(facet.label) (\(facet.count))", systemImage: "checkmark")
                            } else {
                                Text("\(facet.label) (\(facet.count))")
                            }
                        }
                    }
                }
                .font(.callout)
                .fixedSize()
            }

            Spacer()

            Button {
                favoritesOnly.toggle()
            } label: {
                Image(systemName: favoritesOnly ? "star.fill" : "star")
                    .foregroundStyle(favoritesOnly ? .yellow : .secondary)
            }
            .buttonStyle(.plain)
            .help("Starred only")

            Menu(sort.rawValue) {
                ForEach(SortOrder.allCases) { order in
                    Button { sort = order } label: {
                        if order == sort {
                            Label(order.rawValue, systemImage: "checkmark")
                        } else {
                            Text(order.rawValue)
                        }
                    }
                }
            }
            .font(.callout)
            .fixedSize()
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 6)
    }
}

/// One row of the list: the thumbnail when the blob made one (a video's
/// poster, or the poster itself), then the title, the kind line, and the
/// owner's marks — a star for a favorite, a mark for watched or in progress.
private struct AssetRow: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset

    /// The kind's label, plus which tool made it when a tool did — "other"
    /// and the studio's own "video" namespace say nothing, so they stay off.
    private var metaLine: String {
        switch asset.generatedBy {
        case "other", "video": return assetKindLabel(asset.kind)
        default: return "\(assetKindLabel(asset.kind)) · \(asset.generatedBy)"
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Group {
                switch asset.kind {
                case "video":
                    PosterThumbnail(
                        url: store.companions(for: asset.id).posterKey.map { store.blobURL(for: $0) },
                        maxPixel: 40
                    )
                case "poster":
                    PosterThumbnail(
                        url: asset.blobKey.map { store.blobURL(for: $0) },
                        maxPixel: 40
                    )
                default:
                    Image(systemName: assetKindSymbol(asset.kind))
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .frame(width: 71, height: 40)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(store.displayTitle(for: asset))
                    .lineLimit(2)
                HStack(spacing: 4) {
                    Text(metaLine)
                    if let mark = store.watchMark(asset.id) {
                        Image(systemName: mark.done ? "checkmark.circle" : "circle.lefthalf.filled")
                            .help(mark.done ? "Watched" : "Watching")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }

            Spacer(minLength: 0)

            FavoriteButton(assetID: asset.id, showsLabel: false)
                .buttonStyle(.plain)
                .font(.caption)
        }
        .padding(.vertical, 2)
    }
}
