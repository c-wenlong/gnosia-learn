//
//  LibraryView.swift
//  Gnosia
//
//  The library surface: a poster grid in the window's content column,
//  under a real toolbar — kind chips, group and sort menus, the starred
//  toggle — with the search field in the toolbar where a Mac app keeps
//  it. Rows live behind the kind chips that want them (Others) rather
//  than cramming every control into a sidebar, which is what the old
//  split did.
//
//  The kind strip, starred toggle, sort and tool/topic groupings are the
//  web library's own; its day, course and conversation groupings land
//  later.
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

/// One rung of the grid: a section header and the cards under it.
private struct SectionModel: Identifiable {
    var id: String { title }
    let title: String
    let rows: [CatalogAsset]
}

struct LibraryView: View {
    @Environment(CatalogStore.self) private var store

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
        NavigationStack {
            VStack(spacing: 0) {
                controls

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
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 28, pinnedViews: .sectionHeaders) {
                            ForEach(sections) { section in
                                Section {
                                    LazyVGrid(
                                        columns: [GridItem(.adaptive(minimum: 190, maximum: 230), spacing: 18)],
                                        spacing: 18
                                    ) {
                                        ForEach(section.rows) { asset in
                                            NavigationLink(value: AppDestination.asset(asset.id)) {
                                                AssetCard(asset: asset)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                } header: {
                                    Text(section.title)
                                        .font(.title3).bold()
                                        .padding(.bottom, 2)
                                }
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 18)
                    }
                }
            }
            .navigationTitle("Library")
            .appDestinations()
        .searchable(text: $search, placement: .toolbar, prompt: "Search the library")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Text(countLine)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize()

                Toggle(isOn: $favoritesOnly) {
                    Image(systemName: favoritesOnly ? "star.fill" : "star")
                }
                .toggleStyle(.button)
                .help("Starred only")

                Menu {
                    Picker("Sort", selection: $sort) {
                        ForEach(SortOrder.allCases) { Text($0.rawValue).tag($0) }
                    }
                    Picker("Group", selection: $grouping) {
                        ForEach(Grouping.allCases) { Text($0.rawValue).tag($0) }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                }
                .help("Sort and group")
            }
        }
        }
    }

    /// The kind strip: tabs in a scroll row (a narrow window scrolls them
    /// rather than clipping them), the Kind menu inside Others; the count,
    /// starred toggle and sort live in the window toolbar.
    private var controls: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach(tabs) { tab in
                    Button {
                        kind = tab.value
                        if tab.value != "other" { othersKind = nil }
                    } label: {
                        Text(tab.label)
                            .font(.callout)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 5)
                            .background(
                                kind == tab.value ? Color.accentColor : Color.clear,
                                in: Capsule()
                            )
                            .foregroundStyle(kind == tab.value ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                }

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
            }
        }
        .scrollIndicators(.never)
        .padding(.horizontal, 24)
        .padding(.vertical, 10)
    }
}

/// One card of the grid: the poster frame at 16:9 (a video's poster blob,
/// a poster's own jpg, a tinted tile with the kind's symbol otherwise),
/// then the title, the kind line and the owner's marks. Internal, not
/// private: Home's rail draws the same card.
struct AssetCard: View {
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

    /// The thumbnail's URL: a video reads its derived poster's blob, a
    /// poster reads its own.
    private var posterURL: URL? {
        switch asset.kind {
        case "video":
            return store.companions(for: asset.id).posterKey.map { store.blobURL(for: $0) }
        case "poster":
            return asset.blobKey.map { store.blobURL(for: $0) }
        default:
            return nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            ZStack(alignment: .topTrailing) {
                if let url = posterURL {
                    PosterThumbnail(url: url, maxPixel: 480)
                        .frame(maxWidth: .infinity)
                } else {
                    Image(systemName: assetKindSymbol(asset.kind))
                        .font(.title2)
                        .foregroundStyle(kindTint(asset.kind).opacity(0.85))
                        .frame(maxWidth: .infinity)
                        .aspectRatio(16.0 / 9.0, contentMode: .fit)
                        .background(kindTint(asset.kind).opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(store.displayTitle(for: asset))
                    .font(.callout)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 4) {
                    Text(metaLine)
                    if let mark = store.watchMark(asset.id) {
                        Image(systemName: mark.done ? "checkmark.circle.fill" : "circle.lefthalf.filled")
                            .foregroundStyle(mark.done ? .green : .secondary)
                    }
                    Spacer(minLength: 0)
                    FavoriteButton(assetID: asset.id, showsLabel: false)
                        .buttonStyle(.plain)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
        }
        .padding(8)
        .contentShape(Rectangle())
    }
}

/// The tile color a non-visual kind gets: quiet tints so a grid of notes,
/// links and sessions does not read as a wall of identical gray.
private func kindTint(_ kind: String) -> Color {
    switch kind {
    case "note": return .orange
    case "link": return .blue
    case "diagram_svg", "diagram_source": return .teal
    case "session": return .purple
    case "transcript", "chapters", "captions": return .mint
    case "pdf": return .red
    default: return .secondary
    }
}
