//
//  LibraryView.swift
//  Gnosia
//
//  The library surface, at the web /library's contract: the kind strip
//  under the title (All, Videos, Diagrams, Notes, Sessions, Links, and
//  Others while the catalog holds a companion file, with its Kind menu),
//  the Course dropdown, the header count ("1112 files", "12 of 1112
//  files" when narrowed), the search in the toolbar where a Mac app keeps
//  it, the Newest/Title sort, the grid-or-list toggle, and the rows
//  grouped by day, course or topic — LibraryModel.swift holds the ported
//  rules.
//
//  A card is the web's AssetCard: a poster or drawing on top, the kind
//  chip with the tool·size line, the title, then the concept line — the
//  first concept the asset explains, its mastery dot and "+N" for the
//  rest, or the topic when it explains none. A list row is the web's
//  AssetRow: the family glyph, the title, where the asset came from
//  ("CS3230 · Week 3 · concept"), and the time it was made. The watch
//  marks that footer used to show moved off the card to match the web;
//  they are still on the asset's own page.
//
//  The mirror carries no draft, job or session table, so the web's
//  conversation grouping and the conversation/session source lines are
//  not offered (LibraryModel.swift says why at the rule).
//

import AppKit
import SwiftUI

struct LibraryView: View {
    @Environment(CatalogStore.self) private var store

    @State private var grouping: LibraryGrouping = .day
    @State private var sort: LibrarySort = .newest
    @State private var layout: LibraryLayout = .grid
    @State private var kind = ""
    /// The companion kind Others is narrowed to, or nil for all of them —
    /// the web's Kind menu inside the Others tab.
    @State private var othersKind: String?
    /// The `?course=` slug: the assets filed under any of its modules'
    /// topics.
    @State private var course: String?
    @State private var favoritesOnly = false
    @State private var search = ""
    /// asset id → its words, for the two kinds search reads — a note's
    /// body and a transcript's lines, filled by the first non-empty query
    /// (buildSearchIndex), like the web's readSearchText.
    @State private var searchTexts: [String: String] = [:]
    /// transcript asset id → the video it was derived from, so a line
    /// said in a video finds the video — the web's `sourcesOf` lift.
    @State private var searchLift: [String: String] = [:]
    @State private var searchIndexed = false

    private var tabs: [LibraryTab] { libraryTabs(assets: store.assets) }

    private var facets: [CompanionFacet] { companionFacets(assets: store.assets) }

    /// The course chips: every course with at least one standalone asset,
    /// in authored order — `courseFacets`.
    private var courses: [CourseFacet] { courseFacets(courses: store.courses, rows: store.assets) }

    /// The rows one filter state shows — `filterRows` in the web's
    /// apps/web/src/lib/library.ts: no kind is the standalone rows (when
    /// Favorites is on, starred companions ride along, because a star is a
    /// choice the owner made about that row); `other` is every companion
    /// file, narrowed by the Kind menu; a kind is itself. Then the course
    /// (the module-topics rule), then favorites, then every search term
    /// against title, filename, URL and the note/transcript words the
    /// index holds — a transcript's hit lifting the video it belongs to.
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
        if let course {
            // An unknown slug matches nothing rather than being ignored —
            // the web's own call about a `?course=` nobody has.
            let topics = store.course(course).map { courseTopics($0) } ?? []
            rows = rows.filter { $0.topics.contains(where: topics.contains) }
        }
        if favoritesOnly {
            rows = rows.filter { store.favorites.contains($0.id) }
        }
        let terms = librarySearchTerms(search)
        if !terms.isEmpty {
            // `searchHits` runs over every row, not the tab the reader is
            // in: a line said in a video lives in its transcript, a
            // companion All and Videos exclude — the lift is what makes
            // searching spoken words find the video at all. The filters
            // apply after it, so a video lifted in does not appear under
            // Notes either.
            var hits = Set<String>()
            for asset in store.assets {
                // `searchableName`: the title, the filename and the URL —
                // not the displayTitle fallbacks, so "untitled" is not a
                // word the search claims a row has.
                let filename = asset.path?.split(separator: "/").filter({ !$0.isEmpty }).last
                let haystack = [
                    asset.title ?? "", filename.map(String.init) ?? "",
                    asset.url ?? "", searchTexts[asset.id] ?? "",
                ]
                .joined(separator: "\n")
                .lowercased()
                if terms.allSatisfy({ haystack.contains($0) }) { hits.insert(asset.id) }
            }
            for (transcript, video) in searchLift where hits.contains(transcript) {
                hits.insert(video)
            }
            rows = rows.filter { hits.contains($0.id) }
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
        // itself, not a narrowing of it; the course, favorites and the
        // search are.
        let narrowed = course != nil || favoritesOnly || !search.trimmingCharacters(in: .whitespaces).isEmpty
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

    private func sections(order: [String: Int], places: [String: [AssetPlace]]) -> [LibrarySection] {
        switch grouping {
        case .day:
            return daySections(filtered)
        case .course:
            return courseSections(filtered, placesIndex: places, course: course)
        case .topic:
            return topicSections(
                filtered,
                order: order,
                kb: store.learn.byId,
                edges: store.learn.edges,
                vocabulary: Array(store.topics.values)
            )
        }
    }

    /// The concept line a card or a list row draws — `describe`: the
    /// first concept the asset explains, else its first topic's title.
    private func describe(
        _ asset: CatalogAsset,
        order: [String: Int]
    ) -> (concept: CardConcept?, topic: String?) {
        let concept = explainedConcept(of: asset, order: order, kb: store.learn.byId)
        let topicSlug = grouping == .topic ? nil : asset.topics.first
        let topic = topicSlug.map { store.topics[$0]?.title ?? $0 }
        return (concept, topic)
    }

    /// The row's second line — `rowSource`: the place `pickPlace` picks,
    /// then the concept after it when there is one too. Grouped by course
    /// the heading and the section already say the place (`placeInHeading`),
    /// so the line leaves it out and says what else it knows, the concept
    /// first. The conversation and session branches have no mirrored rows
    /// to read, so a parentless row names its topic.
    private func source(
        of asset: CatalogAsset,
        order: [String: Int],
        places: [String: [AssetPlace]]
    ) -> (place: String?, concept: CardConcept?) {
        let place = grouping == .course
            ? nil
            : pickPlace(places[asset.id] ?? [], course: course)?.label
        let concept = explainedConcept(of: asset, order: order, kb: store.learn.byId)
        return (place, concept)
    }

    var body: some View {
        // Built once per body evaluation rather than per row: every
        // concept's place in the prerequisite graph (`conceptOrder`, for
        // the "+N" and the first concept the groupings name), and every
        // asset's course/module places (`assetParents`' course branches
        // over the mirrored collection tree).
        let order = conceptOrder(store.learn.concepts, edges: store.learn.edges)
        let places = placesIndex(courses: store.courses, assets: store.assets)

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
                        LazyVStack(alignment: .leading, spacing: 40, pinnedViews: .sectionHeaders) {
                            ForEach(sections(order: order, places: places)) { section in
                                Section {
                                    if section.subs.isEmpty {
                                        rowsView(section.rows, order: order, places: places)
                                    } else {
                                        VStack(alignment: .leading, spacing: 24) {
                                            ForEach(section.subs) { sub in
                                                VStack(alignment: .leading, spacing: 8) {
                                                    Text("\(sub.label) (\(sub.rows.count))")
                                                        .font(.callout)
                                                        .foregroundStyle(G.text2)
                                                    rowsView(sub.rows, order: order, places: places)
                                                }
                                            }
                                        }
                                    }
                                } header: {
                                    HStack(spacing: 6) {
                                        if let bucket = section.bucket {
                                            BucketDot(bucket: bucket)
                                        }
                                        Text(section.label)
                                        if let detail = section.detail {
                                            Text(detail).fontWeight(.regular)
                                        }
                                        Text("(\(section.subs.isEmpty ? section.rows.count : section.subs.reduce(0) { $0 + $1.rows.count }))")
                                            .foregroundStyle(G.text2)
                                    }
                                    .font(.callout.weight(.medium))
                                    .foregroundStyle(G.text)
                                    .padding(.bottom, 2)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(G.page)
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
            .task(id: wantsTextIndex) { indexSearchText() }
            // A reload replaces the rows and the note bodies behind them;
            // the index built for the old snapshot goes with it.
            .onChange(of: store.assets) {
                searchTexts = [:]
                searchLift = [:]
                searchIndexed = false
            }
            .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Text(countLine)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize()

                // The sort, as the web's bare menu — the trigger reads
                // "Newest", the options name an order on their own.
                Menu {
                    ForEach(LibrarySort.allCases) { option in
                        Button { sort = option } label: {
                            if option == sort {
                                Label(option.rawValue, systemImage: "checkmark")
                            } else {
                                Text(option.rawValue)
                            }
                        }
                    }
                } label: {
                    Text(sort.rawValue)
                }
                .font(.callout)
                .fixedSize()
                .help("Sort")

                // ViewOptions on the web: Group by, and the Favorites-only
                // toggle the chip once carried.
                Menu {
                    Section("Group by") {
                        ForEach(LibraryGrouping.allCases) { option in
                            Button { grouping = option } label: {
                                if option == grouping {
                                    Label(option.rawValue, systemImage: "checkmark")
                                } else {
                                    Text(option.rawValue)
                                }
                            }
                        }
                    }
                    Section("Show") {
                        Button { favoritesOnly = false } label: {
                            if favoritesOnly {
                                Text("All")
                            } else {
                                Label("All", systemImage: "checkmark")
                            }
                        }
                        Button { favoritesOnly = true } label: {
                            if favoritesOnly {
                                Label("Favorites only", systemImage: "checkmark")
                            } else {
                                Text("Favorites only")
                            }
                        }
                    }
                } label: {
                    Image(systemName: "slider.horizontal.3")
                }
                .menuIndicator(.hidden)
                .help("View options")

                // The grid-or-list switch, icon-only like the web's.
                HStack(spacing: 2) {
                    ForEach(LibraryLayout.allCases) { option in
                        Button { layout = option } label: {
                            Image(systemName: option.symbol)
                                .font(.callout)
                                .frame(width: 26, height: 22)
                                .foregroundStyle(layout == option ? G.btnText : G.text2)
                                .background(
                                    layout == option ? G.btnFace : .clear,
                                    in: RoundedRectangle(cornerRadius: 6)
                                )
                        }
                        .buttonStyle(.plain)
                        .help(option.rawValue)
                    }
                }
                .padding(2)
                .background(G.surface2, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        }
    }

    /// The grid or the list, from the toggle — one shape of rows per section.
    @ViewBuilder
    private func rowsView(
        _ rows: [CatalogAsset],
        order: [String: Int],
        places: [String: [AssetPlace]]
    ) -> some View {
        switch layout {
        case .grid:
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 190, maximum: 230), spacing: 18)],
                spacing: 18
            ) {
                ForEach(rows) { asset in
                    NavigationLink(value: AppDestination.asset(asset.id)) {
                        AssetCard(asset: asset, describe: describe(asset, order: order))
                    }
                    .buttonStyle(.plain)
                }
            }
        case .list:
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, asset in
                    NavigationLink(value: AppDestination.asset(asset.id)) {
                        AssetListRow(
                            asset: asset,
                            source: source(of: asset, order: order, places: places),
                            topic: describe(asset, order: order).topic,
                            conceptFirst: grouping == .topic
                        )
                    }
                    .buttonStyle(.plain)
                    if index < rows.count - 1 {
                        Divider().overlay(G.hair).padding(.leading, 46)
                    }
                }
            }
        }
    }

    /// Whether the query asks for what only the note and transcript words
    /// can answer — the first non-empty search builds the index.
    private var wantsTextIndex: Bool {
        !librarySearchTerms(search).isEmpty && !searchIndexed
    }

    /// The searchable words of every note and transcript — `readSearchText`
    /// in apps/web/src/lib/asset-library.ts: a note's body and a
    /// transcript's lines, plus `asset_derivation` read upward so a line
    /// said in a video finds the video. Built once, on the first query;
    /// before it lands, a search matches names only, as the web's does
    /// when nothing has a stored copy.
    private func indexSearchText() {
        guard wantsTextIndex else { return }
        var texts: [String: String] = [:]
        var lift: [String: String] = [:]
        // Transcript blob key → its video, so a matching transcript lifts
        // the video it was derived from (the web's `sourcesOf`).
        var transcriptIDs: [String: String] = [:]
        for asset in store.assets where asset.kind == "transcript" {
            if let key = asset.blobKey { transcriptIDs[key] = asset.id }
        }
        for asset in store.assets where asset.kind == "video" {
            if let key = store.companions(for: asset.id).transcriptKey,
               let id = transcriptIDs[key] {
                lift[id] = asset.id
            }
        }
        for asset in store.assets {
            switch asset.kind {
            case "note":
                if let body = store.noteBody(for: asset) { texts[asset.id] = body }
            case "transcript":
                guard let key = asset.blobKey else { continue }
                // `searchableText`: the chapter (here the scene) titles
                // and what was said, or the file as written when it does
                // not parse.
                let segments = store.transcript(blobKey: key)
                let text = segments.isEmpty
                    ? (store.blobText(for: key) ?? "")
                    : segments.flatMap { [$0.scene, $0.text].compactMap { $0 } }
                        .joined(separator: "\n")
                if !text.isEmpty { texts[asset.id] = text }
            default:
                continue
            }
        }
        searchTexts = texts
        searchLift = lift
        searchIndexed = true
    }

    /// The kind strip: tabs in a scroll row (a narrow window scrolls them
    /// rather than clipping them); then the web's filter menus — the Kind
    /// menu inside Others, and the Course dropdown. The count, sort, view
    /// options and the layout switch live in the window toolbar.
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
                            .foregroundStyle(kind == tab.value ? G.btnText : G.text2)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 5)
                            .background(
                                kind == tab.value ? G.btnFace : .clear,
                                in: Capsule()
                            )
                    }
                    .buttonStyle(.plain)
                }

                if kind == "other" {
                    // "Kind: All", "Kind: Transcript" — the web's
                    // label-prefixed trigger inside the Others tab.
                    Menu("Kind: \(othersKind.map { assetKindLabel($0) } ?? "All")") {
                        Button { othersKind = nil } label: {
                            if othersKind == nil {
                                Label("All companion files", systemImage: "checkmark")
                            } else {
                                Text("All companion files")
                            }
                        }
                        ForEach(facets) { facet in
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

                Menu {
                    Button { course = nil } label: {
                        if course == nil {
                            Label("All courses", systemImage: "checkmark")
                        } else {
                            Text("All courses")
                        }
                    }
                    Divider()
                    ForEach(courses) { facet in
                        Button { course = facet.slug } label: {
                            if course == facet.slug {
                                Label("\(facet.code) · \(facet.title) (\(facet.count))", systemImage: "checkmark")
                            } else {
                                Text("\(facet.code) · \(facet.title) (\(facet.count))")
                            }
                        }
                    }
                    // A chosen slug no course has still shows as the checked
                    // row, so the menu agrees with its trigger, as the web's does.
                    if let course, !courses.contains(where: { $0.slug == course }) {
                        Divider()
                        Button { self.course = course } label: {
                            Label(
                                "\(store.course(course)?.code ?? course) (\(0))",
                                systemImage: "checkmark"
                            )
                        }
                    }
                } label: {
                    // "Course: All", "Course: CS3230" — a slug no course
                    // has still prints as itself, as the web's does.
                    Text("Course: \(course.flatMap { store.course($0)?.code ?? $0 } ?? "All")")
                }
                .font(.callout)
                .fixedSize()
            }
        }
        .scrollIndicators(.never)
        .padding(.horizontal, 24)
        .padding(.vertical, 10)
    }
}

/// One card of the grid, in the web card's shape: a white tile on the
/// cream page, a 16:9 poster (a video's derived poster blob, a diagram's
/// own drawing, a poster's own jpg, a kind tile otherwise), a kind chip,
/// the tool·size line, the title, and the concept line — the first
/// concept the asset explains with its mastery dot and "+N", the topic
/// when it explains none, the owner's star on the right.
struct AssetCard: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    /// `describe`'s answer for this row: the concept, or the topic label.
    let describe: (concept: CardConcept?, topic: String?)

    /// The web card's middle line — `assetMetaLine` in LibraryModel.swift:
    /// the generating tool's short name, then the blob's size ("manim ·
    /// 20 MB"), "SVG · …" for a diagram, a link's host or "external".
    private var metaLine: String { libraryMetaLine(asset) }

    /// The title's face — the web card's `nameClass`: a real title in
    /// semibold, an untitled row semibold but grey, a filename or a host
    /// in mono, so a filename is not dressed as a title.
    private var titleStyle: (font: Font, color: Color) {
        switch nameSource(of: asset) {
        case .title: return (.callout.weight(.semibold), G.text)
        case .none: return (.callout.weight(.semibold), G.text2)
        case .filename, .host: return (.footnote.monospaced().weight(.medium), G.text2)
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

    /// True when the concept names what the title already says — a note
    /// explains its own concept, so the title is not printed again and
    /// the dot carries the mastery on its own label ("Not started"), as
    /// the web card's `conceptIsTitle` does.
    private var conceptIsTitle: Bool {
        guard let concept = describe.concept else { return false }
        return concept.title.trimmingCharacters(in: .whitespaces).lowercased()
            == store.displayTitle(for: asset).trimmingCharacters(in: .whitespaces).lowercased()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let url = posterURL {
                PosterThumbnail(url: url, maxPixel: 480, cornerRadius: 8)
                    .frame(maxWidth: .infinity)
            } else if asset.kind == "diagram_svg" {
                DiagramThumbnail(asset: asset)
                    .frame(maxWidth: .infinity)
            } else {
                Image(systemName: assetKindSymbol(asset.kind))
                    .font(.title2)
                    .foregroundStyle(kindTint(asset.kind).opacity(0.9))
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .background(kindTint(asset.kind).opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(assetKindLabel(asset.kind))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(G.text2)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(G.surface2, in: Capsule())
                    if !metaLine.isEmpty {
                        Text(metaLine)
                            .font(.caption)
                            .foregroundStyle(G.text3)
                            .lineLimit(1)
                    }
                }

                Text(store.displayTitle(for: asset))
                    .font(titleStyle.font)
                    .foregroundStyle(titleStyle.color)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 4) {
                    if let concept = describe.concept {
                        BucketDot(bucket: concept.bucket)
                        if conceptIsTitle {
                            Text(concept.bucket.label)
                        } else {
                            Text(concept.title).lineLimit(1)
                        }
                        if concept.more > 0 {
                            Text("+\(concept.more)").foregroundStyle(G.text3)
                        }
                    } else if let topic = describe.topic {
                        Text(topic).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    FavoriteButton(assetID: asset.id, showsLabel: false)
                        .buttonStyle(.plain)
                        .foregroundStyle(G.text3)
                }
                .font(.caption)
                .foregroundStyle(G.text2)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
        }
        .padding(8)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(G.border, lineWidth: 1)
        )
        .contentShape(Rectangle())
    }
}

/// One row of the list view — the web's AssetRow: the family's glyph on
/// a filled tile, the title, and under it in grey where the asset came
/// from (the course and module, then the concept with its mastery dot;
/// the topic when it has no parent); at the right, the time it was made.
/// The day itself is the heading above, so the row never repeats it.
private struct AssetListRow: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    /// `rowSource`'s answer for this row: the place and the concept.
    let source: (place: String?, concept: CardConcept?)
    /// The topic label the line falls back to with no parent.
    let topic: String?
    /// Grouped by topic (or conversation, which the mirror cannot make)
    /// the concept leads the line and keeps the room.
    let conceptFirst: Bool

    /// The glyph's kind: the web's four families, so a note and a session
    /// log share a tile.
    private var familySymbol: String {
        switch asset.kind {
        case "video", "pdf": return "play.rectangle"
        case "diagram_svg", "poster": return "square.on.square"
        case "link": return "link"
        default: return "note.text"
        }
    }

    /// The title's face: a real title in medium, a filename or a host in
    /// mono, an untitled row medium but grey — the web's `nameClass`, so
    /// a filename is not dressed as a title.
    private var titleStyle: (font: Font, color: Color) {
        switch nameSource(of: asset) {
        case .title: return (.callout.weight(.medium), G.text)
        case .none: return (.callout.weight(.medium), G.text2)
        case .filename, .host: return (.callout.monospaced(), G.text2)
        }
    }

    private var conceptIsTitle: Bool {
        guard let concept = source.concept else { return false }
        return concept.title.trimmingCharacters(in: .whitespaces).lowercased()
            == store.displayTitle(for: asset).trimmingCharacters(in: .whitespaces).lowercased()
    }

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: familySymbol)
                .font(.callout)
                .foregroundStyle(G.text2)
                .frame(width: 32, height: 32)
                .background(G.surface2, in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(store.displayTitle(for: asset))
                    .font(titleStyle.font)
                    .foregroundStyle(titleStyle.color)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if conceptFirst, let concept = source.concept {
                        // Under a topic heading the concept is what tells
                        // the rows apart, so it leads and the place follows.
                        conceptLine(concept)
                        if let place = source.place {
                            Text("·")
                            Text(place).lineLimit(1)
                        }
                    } else {
                        if let place = source.place {
                            Text(place).lineLimit(1)
                            if source.concept != nil { Text("·") }
                        }
                        if let concept = source.concept {
                            conceptLine(concept)
                        } else if source.place == nil, let topic {
                            Text(topic).lineLimit(1)
                        }
                    }
                }
                .font(.caption)
                .foregroundStyle(G.text2)
            }

            Spacer(minLength: 0)

            if let at = asset.createdAt {
                Text(Self.clock.string(from: at))
                    .font(.caption)
                    .foregroundStyle(G.text2)
                    .monospacedDigit()
            }
            FavoriteButton(assetID: asset.id, showsLabel: false)
                .buttonStyle(.plain)
                .foregroundStyle(G.text3)
                .font(.caption)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }

    /// The concept as the line prints it: its mastery dot, the title — or,
    /// when the title is the row's own, the mastery's label on the dot —
    /// and "+N" for the rest it explains.
    @ViewBuilder
    private func conceptLine(_ concept: CardConcept) -> some View {
        BucketDot(bucket: concept.bucket)
        if conceptIsTitle {
            Text(concept.bucket.label)
        } else {
            Text(concept.title).lineLimit(1)
        }
        if concept.more > 0 {
            Text("+\(concept.more)").foregroundStyle(G.text3)
        }
    }
}

/// A diagram's own drawing as its thumbnail, as the web card inlines the
/// SVG: the blob's text rasterized once (SvgRasterizer's queue and cache
/// keep a grid of them cheap), fitted inside the 16:9 box on a light
/// mat, and the kind tile when there is nothing to draw.
private struct DiagramThumbnail: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    @State private var image: NSImage?

    var body: some View {
        ZStack {
            Color(light: 0xfdfcf8, dark: 0x1b2c3c)
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .padding(6)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(16.0 / 9.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .task(id: asset.id) {
            guard let key = asset.blobKey,
                  let svg = store.blobText(for: key) else { return }
            image = await SvgRasterizer.shared.image(for: svg, size: .tile)
        }
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
