//
//  LibraryModel.swift
//  Gnosia
//
//  The Library's pure half, ported from the web page's helpers —
//  apps/web/src/lib/library.ts, library-source.ts, library-groups.ts and
//  day-groups.ts — so the macOS library filters, sorts and groups rows the
//  way /library does. LibraryView draws; this file decides which rows
//  show, in which order, under which heading.
//
//  The mirror carries no `draft`, `job`, `asset_job` or `session` table,
//  so the two web parents that need them — a studio conversation and a
//  tutor session — do not exist here: the source line names a place and a
//  concept or falls back to a topic, and the conversation grouping the
//  web's ViewOptions offers is left out.
//

import Foundation

// MARK: - The controls' state

/// One tab of the kind strip — LibraryTab on the web. `value` is the
/// web's `?kind=`: "" is All, "other" the companion-files tab, anything
/// else one kind.
struct LibraryTab: Identifiable {
    var id: String { value }
    let value: String
    let label: String
}

/// The web's LIBRARY_TABS: All, then the standalone kinds in effort
/// order. Others is appended only while the catalog holds a companion
/// file, so a library of videos and notes alone shows no empty tab.
private let libraryBaseTabs: [LibraryTab] = [
    LibraryTab(value: "", label: "All"),
    LibraryTab(value: "video", label: "Videos"),
    LibraryTab(value: "diagram_svg", label: "Diagrams"),
    LibraryTab(value: "note", label: "Notes"),
    LibraryTab(value: "session", label: "Sessions"),
    LibraryTab(value: "link", label: "Links"),
]

private let libraryOthersTab = LibraryTab(value: "other", label: "Others")

/// libraryTabs(counts): the six, and Others when any companion file exists.
func libraryTabs(assets: [CatalogAsset]) -> [LibraryTab] {
    assets.contains { isCompanionKind($0.kind) } ? libraryBaseTabs + [libraryOthersTab] : libraryBaseTabs
}

/// One companion kind with its count, for the Kind menu inside Others —
/// a facet of the web's `companion` rail.
struct CompanionFacet: Identifiable, Hashable {
    var id: String { kind }
    let kind: String
    let label: String
    let count: Int
}

/// The companion kinds present, with counts — ranked the web's way: kind
/// order first, then label.
func companionFacets(assets: [CatalogAsset]) -> [CompanionFacet] {
    var counts: [String: Int] = [:]
    for asset in assets where isCompanionKind(asset.kind) {
        counts[asset.kind, default: 0] += 1
    }
    return counts
        .map { CompanionFacet(kind: $0.key, label: assetKindLabel($0.key), count: $0.value) }
        .sorted {
            kindRank($0.kind) != kindRank($1.kind)
                ? kindRank($0.kind) < kindRank($1.kind)
                : $0.label < $1.label
        }
}

/// The sort orders the page offers — the web's `?sort=`: newest is when
/// the row entered the catalog, title the name on the card, A to Z.
enum LibrarySort: String, CaseIterable, Identifiable {
    case newest = "Newest"
    case title = "Title"
    var id: String { rawValue }
}

/// The layouts — the web's `?view=`: the card grid, the default, and a
/// dense list of rows.
enum LibraryLayout: String, CaseIterable, Identifiable {
    case grid = "Grid"
    case list = "List"
    var id: String { rawValue }
    var symbol: String { self == .grid ? "square.grid.2x2" : "list.bullet" }
}

/// The groupings — the web's `?group=` minus `conversation`, which the
/// mirror cannot answer (no draft, job or session rows cross it).
enum LibraryGrouping: String, CaseIterable, Identifiable {
    /// One heading per calendar day, newest first — the default.
    case day = "Day"
    /// A heading per course, its modules inside in course order.
    case course = "Course"
    /// A heading per topic.
    case topic = "Topic"
    var id: String { rawValue }
}

// MARK: - Search (library.ts)

/// A query as the words every match must contain — the web's
/// `searchTerms`: lowercased, split on whitespace, deduplicated, capped
/// at 200 characters and 8 words. Empty for a blank query, which means
/// "no search" rather than "match nothing".
func librarySearchTerms(_ q: String) -> [String] {
    var seen = Set<String>()
    var terms: [String] = []
    for word in q.prefix(200).lowercased().split(whereSeparator: { $0.isWhitespace }) {
        let term = String(word)
        if seen.insert(term).inserted { terms.append(term) }
    }
    return Array(terms.prefix(8))
}

// MARK: - Concepts (library-source.ts)

/// Every concept's place in the prerequisite graph — `conceptOrder`: its
/// layer (a concept sits one below its deepest prerequisite, either edge
/// kind counting, cycles cut rather than recursed into), then its slug,
/// ranked to one number.
func conceptOrder(_ concepts: [LearnConcept], edges: [LearnEdge]) -> [String: Int] {
    var incoming: [String: [String]] = [:]
    for c in concepts { incoming[c.slug] = [] }
    for e in edges where incoming[e.to] != nil { incoming[e.to]?.append(e.from) }
    var layer: [String: Int] = [:]
    var visiting = Set<String>()
    func depth(_ slug: String) -> Int {
        if let cached = layer[slug] { return cached }
        if visiting.contains(slug) { return 0 }
        visiting.insert(slug)
        let parents = incoming[slug] ?? []
        let value = parents.isEmpty ? 0 : (parents.map(depth).max() ?? 0) + 1
        visiting.remove(slug)
        layer[slug] = value
        return value
    }
    for c in concepts { _ = depth(c.slug) }
    let ranked = concepts.sorted {
        let l = layer[$0.slug] ?? 0, r = layer[$1.slug] ?? 0
        return l != r ? l < r : $0.slug < $1.slug
    }
    return Dictionary(uniqueKeysWithValues: ranked.enumerated().map { ($0.element.slug, $0.offset) })
}

/// Concept slugs in the graph's order — `orderedConcepts`: a slug the
/// graph does not hold sorts last, by slug.
func orderedConcepts(_ slugs: [String], order: [String: Int]) -> [String] {
    slugs.sorted {
        let l = order[$0] ?? Int.max, r = order[$1] ?? Int.max
        return l != r ? l < r : $0 < $1
    }
}

/// The concept a card or a row names — the web's CardConcept: the first
/// one the asset explains in the graph's order, its mastery and how many
/// more there are.
struct CardConcept: Hashable {
    let slug: String
    let title: String
    let bucket: MasteryBucket
    /// Further concepts the asset explains beyond this one — the "+N".
    let more: Int
}

/// `explainedConcepts` for the first of `orderedConcepts`: the asset's
/// concepts in graph order, the first resolved against the knowledge
/// base. A slug the base does not hold keeps its slug and reads
/// untouched, as it does on the web.
func explainedConcept(
    of asset: CatalogAsset,
    order: [String: Int],
    kb: [String: LearnConcept]
) -> CardConcept? {
    let slugs = orderedConcepts(asset.concepts, order: order)
    guard let first = slugs.first else { return nil }
    let known = kb[first]
    return CardConcept(
        slug: first,
        title: known?.title ?? first,
        bucket: known?.bucket ?? .untouched,
        more: slugs.count - 1
    )
}

// MARK: - Places (asset-parents.ts + library-source.ts)

/// Where an asset sits in a course — AssetPlace on the web: the course
/// and the module inside it that holds the row, and whether the module
/// lists the asset by id (`item`) or only files it under its topic
/// (`topic`).
struct AssetPlace: Hashable {
    let courseSlug: String
    /// `metadata.code` — "CS3230"; "" when the course has none.
    let code: String
    let courseTitle: String
    let moduleSlug: String
    let moduleTitle: String
    /// The module's position in its course.
    let position: Int
    /// `item` when the module lists the asset by id, `topic` when the
    /// asset is filed under the module's topic.
    let viaItem: Bool

    /// "CS3230 · Week 3: Proof of correctness" — `placeLabel`, the code
    /// standing for the course and the title only when there is no code.
    var label: String {
        let course = code.trimmingCharacters(in: .whitespaces).isEmpty ? courseTitle : code
        let module = moduleTitle.trimmingCharacters(in: .whitespaces)
        return module.isEmpty ? course : "\(course) · \(module)"
    }
}

/// Every place every asset sits, keyed by asset id — the mirror's part of
/// `assetParents`' two course branches. A module's resources are its
/// by-id listings (the web's `item` branch, `collection_item.asset_id`,
/// which the course tree keeps for the curated links), and an asset filed
/// under the module's topic is its `topic` place. A module doing both is
/// one place, not two — the `item` one, added first.
func placesIndex(courses: [CatalogCourse], assets: [CatalogAsset]) -> [String: [AssetPlace]] {
    var places: [String: [AssetPlace]] = [:]
    var seen = Set<String>()
    func add(_ assetID: String, _ place: AssetPlace) {
        let key = "\(assetID)\u{0}\(place.courseSlug)\u{0}\(place.moduleSlug)"
        if seen.insert(key).inserted { places[assetID, default: []].append(place) }
    }
    for course in courses {
        for module in course.modules {
            let base = AssetPlace(
                courseSlug: course.slug,
                code: course.code,
                courseTitle: course.title,
                moduleSlug: module.slug,
                moduleTitle: module.title,
                position: module.order,
                viaItem: true
            )
            for resource in module.resources { add(resource.id, base) }
            if module.topic.isEmpty { continue }
            let viaTopic = AssetPlace(
                courseSlug: course.slug,
                code: course.code,
                courseTitle: course.title,
                moduleSlug: module.slug,
                moduleTitle: module.title,
                position: module.order,
                viaItem: false
            )
            for asset in assets where asset.topics.contains(module.topic) {
                add(asset.id, viaTopic)
            }
        }
    }
    return places
}

/// The one place a row names — `pickPlace`: the filter's course wins
/// wherever it is found, since the reader is looking at that course;
/// otherwise the module listings (`item`), and only without one the
/// topic matches, each first by code then module position.
func pickPlace(_ places: [AssetPlace], course: String?) -> AssetPlace? {
    let ordered = places.sorted { a, b in
        if a.viaItem != b.viaItem { return a.viaItem }
        let ac = a.code.isEmpty ? a.courseTitle : a.code
        let bc = b.code.isEmpty ? b.courseTitle : b.code
        if ac != bc { return ac < bc }
        return a.position < b.position
    }
    if let course, let chosen = ordered.first(where: { $0.courseSlug == course }) {
        return chosen
    }
    return ordered.first
}

// MARK: - Courses (library.ts)

/// A course the filter can name — the web's CourseFacet: a code for the
/// chip, the title and how many standalone assets it reaches.
struct CourseFacet: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let code: String
    let title: String
    let count: Int
}

/// The topic slugs a course's modules are filed under — `courseTopics` in
/// the web's `filterRows`, the set `?course=` matches `asset.topics` against.
func courseTopics(_ course: CatalogCourse) -> Set<String> {
    Set(course.modules.map(\.topic).filter { !$0.isEmpty })
}

/// `courseFacets`: every course with at least one standalone asset, in
/// the courses' own (authored) order. An asset filed under any of the
/// course's modules' topics belongs to it; companion kinds count out, so
/// a chip's number is the number of cards picking it shows.
func courseFacets(courses: [CatalogCourse], rows: [CatalogAsset]) -> [CourseFacet] {
    courses.compactMap { course in
        let topics = courseTopics(course)
        guard !topics.isEmpty else { return nil }
        let count = rows.filter {
            !isCompanionKind($0.kind) && $0.topics.contains(where: topics.contains)
        }.count
        return count > 0
            ? CourseFacet(slug: course.slug, code: course.code, title: course.title, count: count)
            : nil
    }
}

// MARK: - Groups (day-groups.ts + library-groups.ts)

/// One module's rows under its course's heading — GroupSection on the web.
struct LibrarySub: Identifiable {
    var id: String { key }
    /// The module's slug, or "" for the rows held by the course itself.
    let key: String
    let label: String
    let rows: [CatalogAsset]
}

/// One rung of the page: a heading and the rows under it, as the web's
/// RowGroup hands them over.
struct LibrarySection: Identifiable {
    var id: String { key }
    /// Unique among the sections: `day:<key>`, `course:<slug>`,
    /// `topic:<slug>` or `none`.
    let key: String
    /// "20 Oct", "CS3230", "No date".
    let label: String
    /// Grey words after the label — the course's title beside its code.
    var detail: String? = nil
    /// A topic heading's mastery, for its dot.
    var bucket: MasteryBucket? = nil
    /// The rows, when the grouping has no sections.
    var rows: [CatalogAsset] = []
    /// A course's modules, in course order.
    var subs: [LibrarySub] = []
}

/// `rows` under a heading per calendar day of `createdAt`, newest first —
/// `dayGroups`, one rung per day with the whole count in the heading the
/// web's "(7)" way. Rows without a date sink to "No date" at the end.
func daySections(_ rows: [CatalogAsset], today: Date = Date(), calendar: Calendar = .current)
    -> [LibrarySection] {
    let groups = Dictionary(grouping: rows) { asset in
        asset.createdAt.map { calendar.startOfDay(for: $0) }
    }
    let keys = groups.keys.sorted { lhs, rhs in
        switch (lhs, rhs) {
        case let (l?, r?): return l > r
        case (nil, _?): return false
        case (_?, nil): return true
        case (nil, nil): return false
        }
    }
    return keys.map { day in
        let rows = groups[day] ?? []
        let label = day.map { DayMath.shortDate($0, today: today, in: calendar) } ?? "No date"
        return LibrarySection(key: "day:\(day.map { String($0.timeIntervalSince1970) } ?? "")",
                              label: label, rows: rows)
    }
}

/// `rows` grouped by the course (and inside it the module) each sits in —
/// `courseGroups`: courses by code then slug, modules by their position
/// in the course, a row landing in the one place `pickPlace` picks so it
/// is never shown twice, and "No course" last for what no course holds.
func courseSections(_ rows: [CatalogAsset], placesIndex: [String: [AssetPlace]], course: String?)
    -> [LibrarySection] {
    struct Held { var place: AssetPlace; var rows: [CatalogAsset] = [] }
    var order: [String] = []
    var courses: [String: (place: AssetPlace, modules: [String: Held], moduleOrder: [String])] = [:]
    var loose: [CatalogAsset] = []
    for row in rows {
        guard let place = pickPlace(placesIndex[row.id] ?? [], course: course) else {
            loose.append(row)
            continue
        }
        if courses[place.courseSlug] == nil {
            order.append(place.courseSlug)
            courses[place.courseSlug] = (place: place, modules: [:], moduleOrder: [])
        }
        if courses[place.courseSlug]!.modules[place.moduleSlug] == nil {
            courses[place.courseSlug]!.moduleOrder.append(place.moduleSlug)
            courses[place.courseSlug]!.modules[place.moduleSlug] = Held(place: place)
        }
        courses[place.courseSlug]!.modules[place.moduleSlug]!.rows.append(row)
    }

    var sections: [LibrarySection] = order
        .sorted { a, b in
            let pa = courses[a]!.place, pb = courses[b]!.place
            let ac = pa.code.trimmingCharacters(in: .whitespaces).isEmpty ? pa.courseTitle : pa.code
            let bc = pb.code.trimmingCharacters(in: .whitespaces).isEmpty ? pb.courseTitle : pb.code
            return ac != bc ? ac < bc : a < b
        }
        .map { slug in
            let held = courses[slug]!
            let subs = held.moduleOrder
                .sorted { a, b in
                    // The course's own rows (no module) come first.
                    if a.isEmpty != b.isEmpty { return a.isEmpty }
                    let pa = held.modules[a]!.place.position, pb = held.modules[b]!.place.position
                    return pa != pb ? pa < pb : a < b
                }
                .map { key in
                    let module = held.modules[key]!
                    let title = module.place.moduleTitle.trimmingCharacters(in: .whitespaces)
                    return LibrarySub(
                        key: key,
                        // "Whole course" for the course's own rows, the
                        // slug when a module's title did not read.
                        label: key.isEmpty ? "Whole course" : (title.isEmpty ? key : title),
                        rows: module.rows
                    )
                }
            let code = held.place.code.trimmingCharacters(in: .whitespaces)
            return LibrarySection(
                key: "course:\(slug)",
                label: code.isEmpty ? held.place.courseTitle : code,
                detail: code.isEmpty ? nil : held.place.courseTitle,
                subs: subs
            )
        }
    if !loose.isEmpty {
        sections.append(LibrarySection(key: "none", label: "No course", rows: loose))
    }
    return sections
}

/// `rows` grouped by topic — `topicGroups`' membership rule: the topic of
/// the first concept the row explains in the graph's order, so the row
/// line and the heading agree, else the first topic the row is filed
/// under, and only a row with neither under "No topic", last. Sections
/// come in `topicRanks`' order, a topic it does not hold after those, by
/// slug.
func topicSections(
    _ rows: [CatalogAsset],
    order: [String: Int],
    kb: [String: LearnConcept],
    edges: [LearnEdge],
    vocabulary: [CatalogTopic]
) -> [LibrarySection] {
    var held: [String: [CatalogAsset]] = [:]
    var loose: [CatalogAsset] = []
    for row in rows {
        let first = orderedConcepts(row.concepts, order: order).first
        let slug = first.flatMap { kb[$0]?.topicSlug }.flatMap { $0.isEmpty ? nil : $0 }
            ?? row.topics.first
        if let slug { held[slug, default: []].append(row) } else { loose.append(row) }
    }
    let titles = Dictionary(uniqueKeysWithValues: vocabulary.map { ($0.slug, $0.title) })
    let conceptTopic = Dictionary(
        uniqueKeysWithValues: kb.values.compactMap { c in c.topicSlug.isEmpty ? nil : (c.slug, c.topicSlug) }
    )
    let rank = topicRanks(vocabulary: vocabulary, conceptTopic: conceptTopic, edges: edges)
    let slugs = held.keys.sorted {
        let l = rank[$0] ?? Int.max, r = rank[$1] ?? Int.max
        return l != r ? l < r : $0 < $1
    }
    var sections = slugs.map { slug in
        LibrarySection(
            key: "topic:\(slug)",
            label: titles[slug] ?? slug,
            bucket: topicBucket(slug, kb: kb),
            rows: held[slug] ?? []
        )
    }
    if !loose.isEmpty {
        sections.append(LibrarySection(key: "none", label: "No topic", rows: loose))
    }
    return sections
}

// MARK: - Topic ranks (domain-map.ts + domain-view.ts)

/// A domain slug as words: `classical-ai` reads "Classical AI", `hci`
/// reads "HCI" — `domainTitle`.
private let domainAcronyms: Set<String> = [
    "ai", "hci", "llm", "llms", "ml", "ui", "ux", "gpu", "cpu", "os", "nlp", "rl",
]

func domainTitle(_ slug: String) -> String {
    let words = slug.split(whereSeparator: { "-_ \t".contains($0) }).filter { !$0.isEmpty }
    guard !words.isEmpty else { return "Other" }
    return words.enumerated().map { i, w in
        let word = String(w)
        return domainAcronyms.contains(word.lowercased())
            ? word.uppercased()
            : (i == 0 ? word.prefix(1).uppercased() + word.dropFirst() : word)
    }.joined(separator: " ")
}

/// The topic grouping's section order — `topicRanks`: domain by domain,
/// the domains by title A to Z, and inside a domain `topicOrder`, the
/// map's own (prerequisite topics first, then the vocabulary's order).
func topicRanks(
    vocabulary: [CatalogTopic],
    conceptTopic: [String: String],
    edges: [LearnEdge]
) -> [String: Int] {
    // `topicOrder`'s last tiebreak is the vocabulary's own order — the
    // `position` the snapshot carries (0 when it predates the column),
    // then the slug, so the headings do not move between launches.
    let vocabulary = vocabulary.sorted { lhs, rhs in
        let lp = lhs.position > 0 ? lhs.position : Int.max
        let rp = rhs.position > 0 ? rhs.position : Int.max
        return lp != rp ? lp < rp : lhs.slug < rhs.slug
    }
    let domainOf = Dictionary(uniqueKeysWithValues: vocabulary.map { ($0.slug, $0.domain) })
    var domains: [String: [String]] = [:]
    for t in vocabulary { domains[t.domain, default: []].append(t.slug) }
    let ordered = domains
        .sorted { a, b in
            let at = domainTitle(a.key).lowercased(), bt = domainTitle(b.key).lowercased()
            return at != bt ? at < bt : a.key < b.key
        }
        .flatMap { domain, topics -> [String] in
            // The domain's own edges only, as the map orders a domain's
            // topics (`domainLayout`): a prerequisite in another domain
            // does not move a topic here.
            let inside = { (concept: String) in
                conceptTopic[concept].flatMap { domainOf[$0] } == domain
            }
            return topicOrder(topics, topicOf: conceptTopic, edges: edges.filter { inside($0.from) && inside($0.to) })
        }
    return Dictionary(uniqueKeysWithValues: ordered.enumerated().map { ($0.element, $0.offset) })
}

/// One domain's topics in the map's order — `topicOrder`: the longest
/// chain of others a topic needs first, the ones more others need next,
/// the vocabulary's own order last.
private func topicOrder(_ slugs: [String], topicOf: [String: String], edges: [LearnEdge]) -> [String] {
    var needs: [String: Set<String>] = Dictionary(uniqueKeysWithValues: slugs.map { ($0, []) })
    for e in edges {
        if let a = topicOf[e.from], let b = topicOf[e.to], a != b, needs[b] != nil {
            needs[b]?.insert(a)
        }
    }
    var dependants: [String: Int] = Dictionary(uniqueKeysWithValues: slugs.map { ($0, 0) })
    for set in needs.values { for t in set { dependants[t, default: 0] += 1 } }
    let level = levels(slugs, needs: needs)
    let rank = Dictionary(uniqueKeysWithValues: slugs.enumerated().map { ($0.element, $0.offset) })
    return slugs.sorted { a, b in
        let la = level[a] ?? 0, lb = level[b] ?? 0
        if la != lb { return la < lb }
        let da = dependants[a] ?? 0, db = dependants[b] ?? 0
        if da != db { return da > db }
        return (rank[a] ?? 0) < (rank[b] ?? 0)
    }
}

/// Each of `slugs` with its level: the longest chain of others it needs,
/// where the ones that need each other (a strongly connected component)
/// count as one and share a level — `levels` in domain-map.ts, Tarjan's
/// algorithm over `needs`, visiting in the order `slugs` come in.
private func levels(_ slugs: [String], needs: [String: Set<String>]) -> [String: Int] {
    let order = Dictionary(uniqueKeysWithValues: slugs.enumerated().map { ($0.element, $0.offset) })
    var component: [String: Int] = [:]
    var index: [String: Int] = [:]
    var low: [String: Int] = [:]
    var stack: [String] = []
    var onStack = Set<String>()
    var counter = 0
    var components = 0
    func visit(_ v: String) {
        index[v] = counter
        low[v] = counter
        counter += 1
        stack.append(v)
        onStack.insert(v)
        for w in (needs[v] ?? []).sorted(by: { (order[$0] ?? 0) < (order[$1] ?? 0) }) {
            if index[w] == nil {
                visit(w)
                low[v] = min(low[v] ?? 0, low[w] ?? 0)
            } else if onStack.contains(w) {
                low[v] = min(low[v] ?? 0, index[w] ?? 0)
            }
        }
        if low[v] == index[v] {
            var w = ""
            repeat {
                w = stack.removeLast()
                onStack.remove(w)
                component[w] = components
            } while w != v
            components += 1
        }
    }
    for slug in slugs where index[slug] == nil { visit(slug) }

    var level = [Int](repeating: 0, count: components)
    var members: [Int: [String]] = [:]
    for slug in slugs { members[component[slug] ?? 0, default: []].append(slug) }
    for c in 0..<components {
        for slug in members[c] ?? [] {
            for n in needs[slug] ?? [] {
                let d = component[n] ?? 0
                if d != c { level[c] = max(level[c], level[d] + 1) }
            }
        }
    }
    return Dictionary(uniqueKeysWithValues: slugs.map { ($0, level[component[$0] ?? 0]) })
}

// MARK: - Meta and name (asset-meta.ts)

/// The tool that made a row, as the card's meta line names it —
/// `SOURCE_LABEL`.
private let sourceLabels: [String: String] = [
    "manimkc": "manim",
    "remotionkc": "remotion",
    "revideokc": "revideo",
    "blenderkc": "blender",
    "tldrawkc": "tldraw",
]

/// `298 kB`, SI units, because that is what the file managers say —
/// `formatBytes`.
func libraryBytes(_ bytes: Int64?) -> String? {
    guard let bytes, bytes >= 0 else { return nil }
    if bytes < 1000 { return "\(bytes) B" }
    let units = ["kB", "MB", "GB", "TB"]
    var value = Double(bytes) / 1000
    var unit = 0
    while value >= 1000 && unit < units.count - 1 {
        value /= 1000
        unit += 1
    }
    let number = value < 10 ? String(format: "%.1f", value) : "\(Int(value.rounded()))"
    return "\(number) \(units[unit])"
}

/// The short line beside a card's kind chip ("manim · 20 MB", "SVG ·
/// tldraw", "external") — `assetMetaLine`: what made it and how big it
/// is, from what the row actually carries. A link names its host instead.
func libraryMetaLine(_ asset: CatalogAsset) -> String {
    let size = libraryBytes(asset.bytes)
    let tool = sourceLabels[asset.sourceRepo]
    switch asset.kind {
    case "video":
        return [tool, size].compactMap { $0 }.joined(separator: " · ")
    case "diagram_svg":
        return ["SVG", tool, size].compactMap { $0 }.joined(separator: " · ")
    case "link":
        let host = asset.url.flatMap { URLComponents(string: $0)?.host }
        return host?.isEmpty == false ? host! : "external"
    default:
        return [tool, size].compactMap { $0 }.joined(separator: " · ")
    }
}

/// How honest the name on the card is — `assetDisplayTitle`'s `source`:
/// an authored title, the filename it fell back to, a link's host, or no
/// name at all. The caller styles the three differently, because a
/// filename is not a title and should not be dressed as one.
enum NameSource {
    case title, filename, host, none
}

func nameSource(of asset: CatalogAsset) -> NameSource {
    if let title = asset.title?.trimmingCharacters(in: .whitespaces), !title.isEmpty { return .title }
    if let path = asset.path?.trimmingCharacters(in: .whitespaces),
       path.split(separator: "/").filter({ !$0.isEmpty }).last != nil { return .filename }
    if let url = asset.url?.trimmingCharacters(in: .whitespaces), !url.isEmpty {
        return URLComponents(string: url)?.host != nil ? .host : .filename
    }
    return .none
}

/// A topic heading's mastery from its concepts' buckets — `topicBucket`
/// on the web: mastered only when every concept is, untouched only when
/// none has been started, learning otherwise, and nil (no dot) for a
/// topic with no concepts.
private func topicBucket(_ slug: String, kb: [String: LearnConcept]) -> MasteryBucket? {
    let buckets = kb.values.filter { $0.topicSlug == slug }.map(\.bucket)
    guard !buckets.isEmpty else { return nil }
    if buckets.allSatisfy({ $0 == .mastered }) { return .mastered }
    if buckets.allSatisfy({ $0 == .untouched }) { return .untouched }
    return .learning
}
