//
//  LearnModel.swift
//  Gnosia
//
//  The learning read model: the web app's knowledge base, learn index,
//  review queue and Home arithmetic ported to the mirrored catalog
//  snapshot. Pure value types plus CatalogStore lookups — the store reads
//  the rows, this file decides what they mean.
//
//  Kept in step with:
//    apps/web/src/lib/mastery-bucket.ts, learn-index.ts, concept-graph.ts,
//    concept-workspace-core.ts, course-path.ts, map-reading.ts,
//    review-queue.ts, review-core.ts, recent-core.ts, recent.ts,
//    home-core.ts, home.ts, playback.ts, concept-note-core.ts, days.ts
//    services/catalog/src/state/knowledge-base.ts, review.ts, snapshot.ts
//    scripts/learn/lib/bkt.mjs, graph.mjs, schedule.mjs
//
//  Where the mirror cannot follow the web it says so at the rule: an
//  `observation` event on the snapshot carries no `concept` column and no
//  `session_id`, so per-concept answer history is approximated by the
//  mastery row's own last_seen (which the pipeline replay stamps) and by
//  matching a check's question text against every observation (a question
//  is close enough to unique to cross concept boundaries).
//

import Foundation

// MARK: - Mastery (mastery-bucket.ts + scripts/learn/lib/bkt.mjs)

/// The BKT thresholds the learn pipeline writes with.
enum BKT {
    /// p(L) at or above which a concept is mastered.
    static let masteryThreshold = 0.95
    /// p(L) a prerequisite needs before a concept resting on it is teachable.
    static let readyThreshold = 0.75
    /// p(L) at or below which a concept is a gap.
    static let gapThreshold = 0.4
    /// Prior belief before the first observation, when `bktParams` has none.
    static let defaultPL0 = 0.25
}

/// The pipeline's five-way label on p(L) — `masteryLabel` in bkt.mjs.
enum MasteryLabel: String {
    case mastered, solid, shaky, weak, gap
}

func masteryLabel(_ pL: Double) -> MasteryLabel {
    if pL >= BKT.masteryThreshold { return .mastered }
    if pL >= BKT.readyThreshold { return .solid }
    if pL >= 0.55 { return .shaky }
    if pL > BKT.gapThreshold { return .weak }
    return .gap
}

/// The three colours the surfaces draw mastery in — `bucketOf` in
/// mastery-bucket.ts: mastered stays mastered whatever the count says, a
/// concept nobody has observed is untouched even when its prior p(L) earns
/// a label, and everything else is learning.
enum MasteryBucket: String, CaseIterable {
    case mastered, learning, untouched

    /// MASTERY_BUCKET_LABEL.
    var label: String {
        switch self {
        case .mastered: return "Mastered"
        case .learning: return "Learning"
        case .untouched: return "Not started"
        }
    }
}

func bucketOf(mastery: MasteryLabel, observations: Int) -> MasteryBucket {
    if mastery == .mastered { return .mastered }
    if observations <= 0 { return .untouched }
    return .learning
}

/// "Learning · p(L) 0.42", or the bare label for a concept with nothing to
//  show — `masteryCaption` in mastery-bucket.ts.
func masteryCaption(bucket: MasteryBucket, pL: Double?) -> String {
    guard let pL, pL.isFinite, bucket != .untouched else { return bucket.label }
    return "\(bucket.label) · p(L) \(String(format: "%.2f", pL))"
}

// MARK: - Day math (days.ts + the two label styles)

/// Whole calendar days from `from`'s day to `to`'s day in the app's time
/// zone. The web counts on `YYYY-MM-DD` keys in `appTimeZone`; the system's
/// calendar is the same statement made natively.
enum DayMath {
    static func diff(_ from: Date, _ to: Date, in calendar: Calendar = .current) -> Int {
        calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: from),
            to: calendar.startOfDay(for: to)
        ).day ?? 0
    }

    /// "Mon", "Tue" — short weekday of `day` (en-GB "Thu" on the web).
    static func weekday(_ day: Date, in calendar: Calendar = .current) -> String {
        let symbols = calendar.shortWeekdaySymbols
        return symbols[(calendar.component(.weekday, from: day) - 1 + symbols.count) % symbols.count]
    }

    /// "20 Aug"; the year appended when it is not today's ("20 Aug 2024").
    /// `shortDate` in home-core.ts.
    static func shortDate(_ day: Date, today: Date, in calendar: Calendar = .current) -> String {
        let d = calendar.component(.day, from: day)
        let month = calendar.shortMonthSymbols[calendar.component(.month, from: day) - 1]
        let base = "\(d) \(month)"
        let thisYear = calendar.component(.year, from: today)
        return calendar.component(.year, from: day) == thisYear ? base : "\(base) \(calendar.component(.year, from: day))"
    }
}

/// When a review falls due: "overdue" for a day gone by, "today",
/// "tomorrow", a weekday inside the week, then "20 Aug". `dueLabel` in
/// learn-index.ts, calendar days like it.
func dueLabel(_ due: Date?, now: Date = Date(), in calendar: Calendar = .current)
    -> (label: String, overdue: Bool) {
    guard let due else { return ("–", false) }
    let diff = DayMath.diff(now, due, in: calendar)
    if diff < 0 { return ("overdue", true) }
    if diff == 0 { return ("today", false) }
    if diff == 1 { return ("tomorrow", false) }
    if diff < 7 { return (DayMath.weekday(due, in: calendar), false) }
    return (DayMath.shortDate(due, today: now, in: calendar), false)
}

/// The index's "last seen" column: "never", "today", "yesterday", "N days",
/// "N weeks", then a date. `lastSeenLabel` in learn-index.ts.
func lastSeenLabel(_ lastSeen: Date?, now: Date = Date(), in calendar: Calendar = .current) -> String {
    guard let lastSeen else { return "never" }
    let diff = DayMath.diff(lastSeen, now, in: calendar)
    if diff <= 0 { return "today" }
    if diff == 1 { return "yesterday" }
    if diff < 28 { return "\(diff) days" }
    if diff < 120 { return "\(diff / 7) weeks" }
    return DayMath.shortDate(lastSeen, today: now, in: calendar)
}

/// A past day as a thread names it: "Today", "Yesterday", "Mon", "20 Aug".
/// `pastDayLabel` in home-core.ts.
func pastDayLabel(_ day: Date, today: Date, in calendar: Calendar = .current) -> String {
    let diff = DayMath.diff(day, today, in: calendar)
    if diff <= 0 { return "Today" }
    if diff == 1 { return "Yesterday" }
    if diff < 7 { return DayMath.weekday(day, in: calendar) }
    return DayMath.shortDate(day, today: today, in: calendar)
}

/// Home's own last-seen words: "today", "yesterday", "3 days ago",
/// "on 20 Aug", and nil for a concept never observed. The second
/// `lastSeenLabel`, home-core.ts this time — the two differ on purpose.
func homeLastSeenLabel(_ at: Date?, now: Date = Date(), in calendar: Calendar = .current) -> String? {
    guard let at else { return nil }
    let diff = DayMath.diff(at, now, in: calendar)
    if diff <= 0 { return "today" }
    if diff == 1 { return "yesterday" }
    if diff < 30 { return "\(diff) days ago" }
    return "on \(DayMath.shortDate(at, today: now, in: calendar))"
}

// MARK: - The knowledge base (services/catalog/src/state/knowledge-base.ts)

/// One concept as the learning surfaces read it — KbConcept on the web:
/// its own row plus the replayed mastery, the review card's headline
/// fields, and the curriculum links, all resolved. `requires`/`assumes`
/// hold only edges whose other end the graph knows, each list sorted, as
/// `readableEdges` + `edgeLists` produce them.
struct LearnConcept: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let title: String
    let summary: String
    let requires: [String]
    let assumes: [String]
    let pL: Double
    let mastery: MasteryLabel
    let observations: Int
    let correct: Int
    let lastSeen: Date?
    /// The review card's due instant, or nil when the concept is unscheduled.
    let due: Date?
    let lapses: Int
    let leech: Bool
    /// Curriculum item ids the concept supports, item id ascending —
    /// KbConcept.topics.
    let itemIds: [String]
    /// item id → 1-based place in the item's `concepts:` list —
    /// KbConcept.positions; a pre-positions link reads as 0.
    let positions: [String: Int]
    /// The folder the note lives in — domainOf(path), with the mirrored
    /// `domain` column (which is the same value) standing in when a
    /// snapshot predates `path`.
    let domain: String?
    /// concept.topic_slug — where the concept files itself in the vocabulary.
    let topicSlug: String
    let path: String?
    /// The course slugs the concept's items belong to, sorted —
    /// courseSlugsOf. Empty for a concept in no course.
    let courses: [String]

    var bucket: MasteryBucket { bucketOf(mastery: mastery, observations: observations) }
}

/// `learn / concepts / <domain> / <file>.md` — domainOf in knowledge-base.ts.
func domainOf(path: String?) -> String? {
    guard let path else { return nil }
    let parts = path.split(separator: "/", omittingEmptySubsequences: false)
    return parts.count >= 4 ? String(parts[2]) : nil
}

/// One directed edge of the concept graph: `from` is the prerequisite,
/// `to` the concept that needs it (the catalog's direction, kept).
enum LearnEdgeKind: String, Hashable {
    case requires, assumes
}

struct LearnEdge: Hashable {
    let from: String
    let to: String
    let kind: LearnEdgeKind
}

/// Where one curriculum item sits, resolved through the course tree — the
/// shape concept-workspace.ts's `placeOf` returns, held per item id so both
/// "the concept's place" and "the item's address" read the one lookup.
struct ConceptPlace: Hashable {
    let courseSlug: String
    let courseCode: String
    let courseTitle: String
    let moduleSlug: String
    let moduleOrder: Int
    let moduleTitle: String
    let topicId: String
    let topicTitle: String

    /// "CP4281 · Module 2 · Transformations" — placeLabel.
    var label: String { "\(courseCode) · Module \(moduleOrder) · \(topicTitle)" }
    /// "CP4281 M2" — the index row's courseLabel.
    var shortLabel: String { "\(courseCode) M\(moduleOrder)" }
}

/// A course as "Next from here" walks it — PathCourse in home-core.ts:
/// modules in order, each with its topics in order.
struct PathCourse: Hashable {
    struct Module: Hashable {
        let slug: String
        let order: Int
        /// The curriculum items; the path calls them topics.
        let topics: [Item]
    }
    struct Item: Hashable {
        let id: String
        let title: String
    }
    let slug: String
    let code: String
    let title: String
    let order: Int
    let modules: [Module]
}

// MARK: - Course path arithmetic (course-path.ts)

/// A concept as the path draws it — PathConcept.
struct PathConcept: Hashable {
    let slug: String
    let title: String
    let pL: Double
    let mastery: MasteryLabel
    let observations: Int
    let bucket: MasteryBucket
}

/// The concepts a course topic's `concepts:` list names, in that list's
/// order: placed links first by `position`, then the unplaced by the
/// module's authored concept order (which the snapshot does not carry — an
/// empty list), then title. `conceptsForTopic`.
func conceptsForTopic(_ concepts: [LearnConcept], topicId: String, authored: [String] = [])
    -> [PathConcept] {
    func rank(_ slug: String) -> Int { authored.firstIndex(of: slug) ?? authored.count }
    return concepts
        .filter { $0.itemIds.contains(topicId) }
        .map {
            PathConcept(
                slug: $0.slug, title: $0.title, pL: $0.pL,
                mastery: $0.mastery, observations: $0.observations, bucket: $0.bucket
            )
        }
        .sorted { a, b in
            let pa = a.position(topicId, in: concepts)
            let pb = b.position(topicId, in: concepts)
            if pa != pb { return pa < pb }
            if rank(a.slug) != rank(b.slug) { return rank(a.slug) < rank(b.slug) }
            return a.title.localizedCompare(b.title) == .orderedAscending
        }
}

private extension PathConcept {
    /// The concept's authored position in the topic, unplaced sorting last.
    func position(_ topicId: String, in concepts: [LearnConcept]) -> Int {
        concepts.first { $0.slug == slug }?.positions[topicId].flatMap { $0 > 0 ? $0 : nil }
            ?? Int.max
    }
}

/// A topic's standing, from the concepts mapped to it — TopicMastery.
struct TopicMastery {
    let bucket: MasteryBucket
    /// The weakest mapped concept's p(L): a topic is held only as well as
    /// its weakest part.
    let pL: Double
    /// The concept Continue opens.
    let next: String
    /// Every mapped concept, in authored order. Never empty.
    let concepts: [PathConcept]
}

/// A topic's bucket, p(L) and next concept, or nil when no concept maps to
/// it — `resolveTopicMastery`: mastered only when every concept is,
/// untouched only when none has been observed, learning otherwise; next is
/// the first unmastered concept on the frontier, else the weakest
/// unmastered, else the weakest.
func resolveTopicMastery(_ concepts: [PathConcept], frontier: [String]) -> TopicMastery? {
    guard !concepts.isEmpty else { return nil }
    let bucket: MasteryBucket =
        concepts.allSatisfy { $0.bucket == .mastered } ? .mastered
        : concepts.allSatisfy { $0.bucket == .untouched } ? .untouched
        : .learning
    func weakest(_ list: [PathConcept]) -> PathConcept { list.min { $0.pL < $1.pL } ?? list[0] }
    let open = concepts.filter { $0.bucket != .mastered }
    let onFrontier = frontier.lazy.compactMap { slug in open.first { $0.slug == slug } }.first
    let next = onFrontier ?? (open.isEmpty ? weakest(concepts) : weakest(open))
    return TopicMastery(bucket: bucket, pL: weakest(concepts).pL, next: next.slug, concepts: concepts)
}

/// Done, for the path's purposes, split into two id sets the way the web
/// ships it: a topic with concepts is done when mastered (a tick teaches
/// nothing), a topic with none goes by the tick. ItemStanding +
/// itemDoneWith.
struct ItemStanding {
    var mastered: Set<String> = []
    var withConcepts: Set<String> = []

    func isDone(_ itemId: String, completed: Set<String>) -> Bool {
        mastered.contains(itemId) || (!withConcepts.contains(itemId) && completed.contains(itemId))
    }
}

func itemStanding(_ concepts: [LearnConcept], itemIds: [String]) -> ItemStanding {
    var standing = ItemStanding()
    for id in itemIds {
        guard let mastery = resolveTopicMastery(conceptsForTopic(concepts, topicId: id), frontier: []) else { continue }
        standing.withConcepts.insert(id)
        if mastery.bucket == .mastered { standing.mastered.insert(id) }
    }
    return standing
}

// MARK: - Graph algorithms (concept-graph.ts + map-reading.ts)

/// Concepts that name `slug` as a prerequisite through the given kinds,
/// sorted — dependantsOf.
func dependantsOf(_ edges: [LearnEdge], slug: String, kinds: [LearnEdgeKind] = [.requires]) -> [String] {
    Array(Set(edges.filter { $0.from == slug && kinds.contains($0.kind) }.map(\.to))).sorted()
}

/// Every concept whose `requires` or `assumes` names `slug`, sorted —
/// backlinksOf, read off the concepts' own lists so an edge the catalog
/// dropped still counts as a backlink.
func backlinksOf(_ concepts: [LearnConcept], slug: String) -> [String] {
    concepts
        .filter { $0.slug != slug && ($0.requires.contains(slug) || $0.assumes.contains(slug)) }
        .map(\.slug)
        .sorted()
}

/// For each concept in no course, the courses whose concepts depend on it,
/// through either kind of edge, directly or through other course-less
/// concepts — servesCourses in map-reading.ts.
func servesCourses(_ concepts: [LearnConcept], edges: [LearnEdge]) -> [String: Set<String>] {
    var dependants: [String: [String]] = [:]
    for e in edges { dependants[e.from, default: []].append(e.to) }
    var out: [String: Set<String>] = [:]
    for c in concepts where c.courses.isEmpty {
        var courses = Set<String>()
        var seen: Set<String> = [c.slug]
        var stack = dependants[c.slug] ?? []
        while let id = stack.popLast() {
            guard !seen.contains(id), let d = concepts.first(where: { $0.slug == id }) else { continue }
            seen.insert(id)
            if !d.courses.isEmpty { courses.formUnion(d.courses) }
            else { stack.append(contentsOf: dependants[id] ?? []) }
        }
        out[c.slug] = courses
    }
    return out
}

/// The concepts ready to learn in the recent courses — readyConcepts (G5):
/// not mastered, every `requires` prerequisite mastered, and either in one
/// of those courses or in no course and serving one.
func readyConcepts(_ concepts: [LearnConcept], edges: [LearnEdge], recentCourses: [String])
    -> Set<String> {
    let recent = Set(recentCourses)
    guard !recent.isEmpty else { return [] }
    let byId = Dictionary(uniqueKeysWithValues: concepts.map { ($0.slug, $0) })
    let serves = servesCourses(concepts, edges: edges)
    var needs: [String: [String]] = [:]
    for e in edges where e.kind == .requires && byId[e.from] != nil {
        needs[e.to, default: []].append(e.from)
    }
    var ready = Set<String>()
    for c in concepts {
        if c.bucket == .mastered { continue }
        let courses = c.courses.isEmpty ? Array(serves[c.slug] ?? []) : c.courses
        if !courses.contains(where: { recent.contains($0) }) { continue }
        if (needs[c.slug] ?? []).allSatisfy({ byId[$0]?.bucket == .mastered }) { ready.insert(c.slug) }
    }
    return ready
}

// MARK: - The assembled knowledge base

/// The store's concept/mastery/review/link rows read as one knowledge
/// base, built once at load — what `readKnowledgeBase` answers on the web,
/// plus the course-side lookups the index and Home share.
struct LearnGraph {
    var concepts: [LearnConcept] = []
    var byId: [String: LearnConcept] = [:]
    var edges: [LearnEdge] = []
    /// The teachable edge of the graph, weakest first — frontier(graph, model).
    var frontier: [String] = []
    /// Curriculum item id → where it sits, across every course.
    var itemPlace: [String: ConceptPlace] = [:]
    /// Every course, as the path walks it.
    var allCourses: [PathCourse] = []
    /// The same minus the ones set aside (inactiveCourses) — what Home's
    /// progress and next-step arithmetic read.
    var activeCourses: [PathCourse] = []
    /// Curriculum items the learner ticked (progress.completed_at set).
    var completed: Set<String> = []
    var inactiveCourses: Set<String> = []
    /// The courses being worked through — recentCourseSlugs.
    var recentCourses: [String] = []
    /// Concepts ready to learn in those courses — readyConcepts.
    var ready: Set<String> = []
    /// The path's done rule over every live item.
    var standing = ItemStanding()
    /// The SM-2 card each concept holds, by slug.
    var cards: [String: CatalogReview] = [:]

    /// The empty graph — before the first load and after a failed one.
    init() {}

    /// The first of the concept's items that resolves — placeOf.
    func placeOf(_ itemIds: [String]) -> ConceptPlace? {
        for id in itemIds {
            if let found = itemPlace[id] { return found }
        }
        return nil
    }

    /// The course slugs a concept's items belong to, deduplicated and
    /// sorted — courseSlugsOf.
    func courseSlugsOf(_ itemIds: [String]) -> [String] {
        Array(Set(itemIds.compactMap { itemPlace[$0]?.courseSlug })).sorted()
    }

    /// A topic done, by the path's rule — itemDoneWith.
    func isDone(_ itemId: String) -> Bool { standing.isDone(itemId, completed: completed) }

    /// A topic's standing, or nil when no concept is mapped — the same
    /// resolveTopicMastery the web page runs, over this graph's frontier.
    func topicMastery(_ topicId: String, authored: [String] = []) -> TopicMastery? {
        resolveTopicMastery(conceptsForTopic(concepts, topicId: topicId, authored: authored), frontier: frontier)
    }

    /// The concept the index opens on when nothing is named: the most
    /// overdue due card, else the frontier's first, else the first row —
    /// defaultSelection in concept-graph.ts.
    func defaultSelection(now: Date = Date()) -> String? {
        let due = concepts
            .filter { $0.due != nil && $0.due! <= now }
            .sorted { $0.due! < $1.due! }
        if let first = due.first { return first.slug }
        if let onFrontier = frontier.first(where: { byId[$0] != nil }) { return onFrontier }
        return concepts.first?.slug
    }

    /// readKnowledgeBase over the store's rows: the concepts with their
    /// replayed mastery and schedule, the edges whose ends are both
    /// concepts the catalog holds (readableEdges), the frontier, the
    /// course-side lookups and the preference-derived course state.
    init(concepts rawConcepts: [CatalogConcept],
         prerequisites: [CatalogPrerequisite],
         mastery: [String: CatalogMastery],
         reviews: [CatalogReview],
         conceptItems: [String: [(itemId: String, position: Int)]],
         courses: [CatalogCourse],
         progress: [String: CatalogProgress],
         preferences: [String: String],
         knownTopics: Set<String>) {
        let present = Set(rawConcepts.map(\.slug))

        // readableEdges + edgeLists: an edge whose other end is not indexed
        // counts for nothing here, and each kind's list reads sorted.
        var requiresMap: [String: [String]] = [:]
        var assumesMap: [String: [String]] = [:]
        var edges: [LearnEdge] = []
        for e in prerequisites where present.contains(e.conceptSlug) && present.contains(e.prerequisiteSlug) {
            let kind: LearnEdgeKind = e.kind == "assumes" ? .assumes : .requires
            edges.append(LearnEdge(from: e.prerequisiteSlug, to: e.conceptSlug, kind: kind))
            if kind == .assumes {
                assumesMap[e.conceptSlug, default: []].append(e.prerequisiteSlug)
            } else {
                requiresMap[e.conceptSlug, default: []].append(e.prerequisiteSlug)
            }
        }
        self.edges = edges

        // Every live curriculum item's place, walked once so placeOf and
        // courseSlugsOf are lookups — findTopicAcrossCourses materialised.
        var itemPlace: [String: ConceptPlace] = [:]
        var allCourses: [PathCourse] = []
        for course in courses {
            var modules: [PathCourse.Module] = []
            for m in course.modules {
                var topics: [PathCourse.Item] = []
                for item in m.items {
                    topics.append(PathCourse.Item(id: item.id, title: item.title))
                    itemPlace[item.id] = ConceptPlace(
                        courseSlug: course.slug, courseCode: course.code,
                        courseTitle: course.title, moduleSlug: m.slug,
                        moduleOrder: m.order, moduleTitle: m.title,
                        topicId: item.id, topicTitle: item.title
                    )
                }
                modules.append(PathCourse.Module(slug: m.slug, order: m.order, topics: topics))
            }
            allCourses.append(PathCourse(slug: course.slug, code: course.code,
                                         title: course.title, order: course.order, modules: modules))
        }
        self.itemPlace = itemPlace
        self.allCourses = allCourses

        let prior = LearnGraph.pL0(preferences: preferences)
        let cards = Dictionary(uniqueKeysWithValues: reviews.map { ($0.conceptSlug, $0) })
        self.cards = cards

        let learned: [LearnConcept] = rawConcepts.map { c in
            let entry = mastery[c.slug]
            let card = cards[c.slug]
            let links = conceptItems[c.slug] ?? []
            let itemIds = links.map(\.itemId)
            let positions = Dictionary(uniqueKeysWithValues: links.map { ($0.itemId, $0.position) })
            let pL = entry?.pL ?? prior
            let courses = Array(Set(itemIds.compactMap { itemPlace[$0]?.courseSlug })).sorted()
            return LearnConcept(
                slug: c.slug, title: c.title, summary: c.summary ?? "",
                requires: (requiresMap[c.slug] ?? []).sorted(),
                assumes: (assumesMap[c.slug] ?? []).sorted(),
                pL: pL, mastery: masteryLabel(pL),
                observations: Int(entry?.observations ?? 0),
                correct: Int(entry?.correct ?? 0),
                lastSeen: entry?.lastSeen,
                due: card?.due,
                lapses: Int(card?.lapses ?? 0),
                leech: card?.leech ?? false,
                itemIds: itemIds, positions: positions,
                domain: domainOf(path: c.path) ?? c.domain,
                topicSlug: knownTopics.contains(c.topicSlug) ? c.topicSlug : "",
                path: c.path,
                courses: courses
            )
        }
        // kb.concepts reads title-sorted.
        let sorted = learned.sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
        self.concepts = sorted
        self.byId = Dictionary(uniqueKeysWithValues: sorted.map { ($0.slug, $0) })

        // frontier(graph, model): not mastered, and every `requires`
        // prerequisite solid enough to support an explanation. Weakest first.
        self.frontier = sorted
            .filter { c in
                c.pL < BKT.masteryThreshold
                    && c.requires.allSatisfy { (byId[$0]?.pL ?? prior) >= BKT.readyThreshold }
            }
            .sorted { $0.pL != $1.pL ? $0.pL < $1.pL : $0.slug < $1.slug }
            .map(\.slug)

        self.completed = Set(progress.filter { $0.value.completedAt != nil }.map(\.key))
        self.inactiveCourses = LearnGraph.inactiveCourses(preferences: preferences)
        self.activeCourses = allCourses.filter { !inactiveCourses.contains($0.slug) }
        self.recentCourses = LearnGraph.recentCourseSlugs(preferences: preferences)
        self.ready = readyConcepts(sorted, edges: edges, recentCourses: recentCourses)
        self.standing = itemStanding(
            sorted,
            itemIds: activeCourses.flatMap { $0.modules.flatMap { $0.topics.map(\.id) } }
        )
    }
}

// MARK: - The learn index (learn-index.ts + the learn page's toRow)

/// The Status filter's values — IndexFilter.
enum IndexFilter: String, CaseIterable {
    case all, due, learning, mastered, untouched, leeches, ready, nocourse

    var label: String {
        switch self {
        case .all: return "All"
        case .due: return "Due"
        case .learning: return "Learning"
        case .mastered: return "Mastered"
        // The bucket's own name, so the menu says what the chips say.
        case .untouched: return MasteryBucket.untouched.label
        // "Leech" stays the key; the reader sees what it means.
        case .leeches: return "Keeps slipping"
        case .ready: return "Ready to learn"
        case .nocourse: return "Not in a course"
        }
    }
}

/// One index row with every label worked out — IndexRow, minus the href
/// (a navigation value here, not a URL).
struct IndexRow: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let title: String
    let summary: String
    let bucket: MasteryBucket
    let pL: Double
    let due: Date?
    /// True when the review is due now or earlier.
    let isDue: Bool
    let dueLabel: String
    let overdue: Bool
    let lastSeenLabel: String
    let leech: Bool
    /// "CP4281 M2", or nil when the concept is in no course.
    let courseLabel: String?
    let courses: [String]
    let domain: String?
    let ready: Bool
}

func matchesFilter(_ row: IndexRow, _ filter: IndexFilter) -> Bool {
    switch filter {
    case .all: return true
    case .due: return row.isDue
    case .leeches: return row.leech
    case .ready: return row.ready
    case .nocourse: return row.courses.isEmpty
    case .learning: return row.bucket == .learning
    case .mastered: return row.bucket == .mastered
    case .untouched: return row.bucket == .untouched
    }
}

/// Case-insensitive; every word somewhere in the title, the summary or the
/// slug — matchesQuery.
func matchesQuery(_ row: IndexRow, _ query: String) -> Bool {
    let words = query.lowercased().split(whereSeparator: \.isWhitespace).filter { !$0.isEmpty }
    guard !words.isEmpty else { return true }
    let hay = "\(row.title) \(row.summary) \(row.slug)".lowercased()
    return words.allSatisfy { hay.contains($0) }
}

extension LearnGraph {
    /// The index's rows, studied concepts first then the untouched tail,
    /// alphabetical within each — the learn page's toRow + sort.
    func indexRows(now: Date = Date(), in calendar: Calendar = .current) -> [IndexRow] {
        concepts.map { c in
            let due = dueLabel(c.due, now: now, in: calendar)
            return IndexRow(
                slug: c.slug,
                title: c.title,
                summary: c.summary,
                bucket: c.bucket,
                pL: c.pL,
                due: c.due,
                isDue: c.due != nil && c.due! <= now,
                dueLabel: due.label,
                overdue: due.overdue,
                lastSeenLabel: lastSeenLabel(c.lastSeen, now: now, in: calendar),
                leech: c.leech,
                courseLabel: placeOf(c.itemIds)?.shortLabel,
                courses: c.courses,
                domain: c.domain,
                ready: ready.contains(c.slug)
            )
        }
        .sorted { a, b in
            if (a.bucket == .untouched) != (b.bucket == .untouched) { return a.bucket != .untouched }
            return a.title.localizedCompare(b.title) == .orderedAscending
        }
    }

    /// Every filter with how many rows it shows, counted over all rows (not
    /// the search) so a number does not move as the learner types —
    /// statusFilterOptions.
    struct FilterOption: Identifiable {
        var id: IndexFilter { filter }
        let filter: IndexFilter
        let label: String
        let count: Int
    }

    func statusFilterOptions(_ rows: [IndexRow]) -> [FilterOption] {
        IndexFilter.allCases.map { f in
            FilterOption(filter: f, label: f.label, count: rows.filter { matchesFilter($0, f) }.count)
        }
    }

    /// mastered / learning / untouched over the rows — bucketCounts.
    func bucketCounts(_ rows: [IndexRow]) -> [MasteryBucket: Int] {
        var out: [MasteryBucket: Int] = [.mastered: 0, .learning: 0, .untouched: 0]
        for row in rows { out[row.bucket, default: 0] += 1 }
        return out
    }
}

// MARK: - Check blocks (concept-note-core.ts)

/// One ```check block of a note, in note order — `review due --json`
/// prints the same shape. `id` is c1, c2, … counting only blocks with a
/// question.
struct ConceptCheck: Hashable {
    let id: String
    let question: String
    let answer: String
    let why: String
    let source: String
}

/// The ```check fences of a note body, in order. The web walks the parsed
/// block tree so a check inside a list or a quote still counts; a line scan
/// for the fence finds the same blocks either way.
private func checkBlockTexts(_ source: String) -> [String] {
    var texts: [String] = []
    var open: [String]? = nil
    for line in source.components(separatedBy: "\n") {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if open == nil {
            if trimmed.hasPrefix("```") {
                let info = trimmed.dropFirst(3).trimmingCharacters(in: .whitespaces)
                    .components(separatedBy: .whitespaces).first?.lowercased() ?? ""
                if info == "check" { open = [] }
            }
        } else if trimmed.hasPrefix("```") {
            texts.append(open!.joined(separator: "\n"))
            open = nil
        } else {
            open!.append(line)
        }
    }
    return texts
}

/// One check block's text to a check — `q:`/`a:`/`why:`/`source:` fields,
/// continuation lines folding into the current field; nil with no
/// question. readCheck in concept-note-core.ts.
private func readCheck(_ text: String) -> (question: String, answer: String, why: String, source: String)? {
    var fields: [String: String] = [:]
    var field: String? = nil
    for line in text.components(separatedBy: "\n") {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        // `q`/`a`/`why`/`source` followed by a colon, case-insensitive.
        if let split = trimmed.range(of: ":"),
           ["q", "a", "why", "source"].contains(trimmed[..<split.lowerBound].lowercased()),
           !trimmed[..<split.lowerBound].contains(" ") {
            field = String(trimmed[..<split.lowerBound]).lowercased()
            fields[field!] = String(trimmed[split.upperBound...]).trimmingCharacters(in: .whitespaces)
        } else if let field, !trimmed.isEmpty {
            fields[field] = "\(fields[field] ?? "") \(trimmed)".trimmingCharacters(in: .whitespaces)
        }
    }
    guard let q = fields["q"], !q.isEmpty else { return nil }
    return (q, fields["a"] ?? "", fields["why"] ?? "", fields["source"] ?? "")
}

/// The check blocks of a note body — parseChecks. The catalog stores the
/// body after the frontmatter, which is where checks live anyway.
func parseChecks(_ body: String?) -> [ConceptCheck] {
    guard let body else { return [] }
    var checks: [ConceptCheck] = []
    for text in checkBlockTexts(body) {
        if let check = readCheck(text) {
            checks.append(ConceptCheck(
                id: "c\(checks.count + 1)",
                question: check.question, answer: check.answer,
                why: check.why, source: check.source
            ))
        }
    }
    return checks
}

/// passed / missed / untried — CheckStatus in concept-workspace-core.ts.
enum CheckStatus: String {
    case passed, missed, untried
}

struct WorkspaceCheck: Hashable {
    let check: ConceptCheck
    let status: CheckStatus
}

/// normaliseQuestion in session-core.ts.
func normaliseQuestion(_ text: String) -> String {
    text.lowercased()
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
}

/// Each check with what the latest matching observation said —
/// checkStatuses. The mirror's `observation` rows carry no concept, so the
/// match runs over every observation rather than the concept's own
/// history; a question text is close to unique, and a reworded check reads
/// as untried either way.
func checkStatuses(_ checks: [ConceptCheck], events: [CatalogEvent]) -> [WorkspaceCheck] {
    let observations = events.filter { $0.type == "observation" }.reversed()
    return checks.map { check in
        let question = normaliseQuestion(check.question)
        let latest = observations.first(where: {
            normaliseQuestion(($0.payload["question"] as? String) ?? "") == question
        })
        let status: CheckStatus =
            latest == nil ? .untried : (latest!.payload["correct"] as? Bool == true ? .passed : .missed)
        return WorkspaceCheck(check: check, status: status)
    }
}

// MARK: - SM-2 (scripts/learn/lib/schedule.mjs + state/review.ts)

enum SM2 {
    static let minEase = 1.3
    static let defaultEase = 2.5
    static let passGrade = 3
    /// Consecutive lapses before a card is flagged for reformulation.
    static let leechThreshold = 4
    /// Interval ceiling in days (~100 years).
    static let maxIntervalDays = 36500
}

/// The four ratings in button order and the SM-2 grades the catalog maps
/// them to — REVIEW_RATINGS: Again 1, Hard 3, Good 4, Easy 5.
enum ReviewRating: Int, CaseIterable {
    case again = 0, hard, good, easy
    var grade: Int {
        switch self {
        case .again: return 1
        case .hard: return 3
        case .good: return 4
        case .easy: return 5
        }
    }
    var label: String {
        switch self {
        case .again: return "Again"
        case .hard: return "Hard"
        case .good: return "Good"
        case .easy: return "Easy"
        }
    }
}

/// SM-2 ease update: EF' = EF + (0.1 - (5-q)(0.08 + (5-q)0.02)) — nextEase.
func nextEase(_ ease: Double, grade: Int) -> Double {
    let q = Double(max(0, min(5, grade)))
    let delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
    return max(SM2.minEase, ease + delta)
}

/// The schedule one review would write — `review` in schedule.mjs, fuzz
/// included (it is deterministic in interval and lapses, so the preview is
/// exact, not estimated). Failing a card keeps its ease: the lapse already
/// restarts the interval, and penalising both would punish it twice.
func sm2Review(card: CatalogReview?, grade: Int, now: Date = Date())
    -> (repetitions: Int, ease: Double, intervalDays: Int, lapses: Int, leech: Bool, due: Date) {
    let q = max(0, min(5, grade))
    let passed = q >= SM2.passGrade
    let priorEase = card?.ease ?? SM2.defaultEase
    let ease = passed ? nextEase(priorEase, grade: q) : priorEase
    var repetitions = Int(card?.repetitions ?? 0)
    var intervalDays = 0
    var lapses = Int(card?.lapses ?? 0)

    if passed {
        repetitions += 1
        if repetitions == 1 { intervalDays = 1 }
        else if repetitions == 2 { intervalDays = 6 }
        else { intervalDays = Int((Double(card?.intervalDays ?? 1) * ease).rounded()) }
    } else {
        repetitions = 0
        lapses += 1
        intervalDays = 1
    }

    if intervalDays >= 7 {
        let spread = max(1, Int((Double(intervalDays) * 0.05).rounded()))
        let offset = ((intervalDays + lapses) % (spread * 2 + 1)) - spread
        intervalDays = max(1, intervalDays + offset)
    }
    intervalDays = min(intervalDays, SM2.maxIntervalDays)

    return (
        repetitions, ease, intervalDays, lapses,
        lapses >= SM2.leechThreshold,
        now.addingTimeInterval(Double(intervalDays) * 86400)
    )
}

/// The interval each of the four ratings would give, index = rating —
/// previewIntervals: same call a grade makes, so the number under "Good"
/// is the one pressing it would write.
func previewIntervals(_ card: CatalogReview?, now: Date = Date()) -> [Int] {
    ReviewRating.allCases.map { sm2Review(card: card, grade: $0.grade, now: now).intervalDays }
}

/// Compact "4d" or words "4 days" / "2 months" / "1.5 years" —
/// formatInterval in review-core.ts.
func formatInterval(_ days: Int, compact: Bool = false) -> String {
    let d = max(0, days)
    if d < 31 { return compact ? "\(d)d" : "\(d) \(d == 1 ? "day" : "days")" }
    if d < 365 {
        let m = Int((Double(d) / 30).rounded())
        return compact ? "\(m)mo" : "\(m) \(m == 1 ? "month" : "months")"
    }
    let y = (Double(d) / 365 * 10).rounded() / 10
    return compact ? "\(y)y" : "\(y) \(y == 1 ? "year" : "years")"
}

// MARK: - The review queue (review-queue.ts + review-core.ts)

/// A due card with what the concept is called — ReviewQueueItem.
struct ReviewQueueItem: Identifiable, Hashable {
    var id: String { conceptId }
    let conceptId: String
    let title: String
    let summary: String
    let domain: String?
    let card: CatalogReview?
    /// The interval each rating would give, index = rating.
    let intervals: [Int]
}

struct ReviewQueue {
    /// Due cards, most overdue first.
    var items: [ReviewQueueItem] = []
    /// The soonest due instant after now across every card, or nil.
    var nextDue: Date? = nil
}

extension LearnGraph {
    /// The cards due at `now`, most overdue first, each with its concept's
    /// name and the four intervals — reviewQueue, minus `focus` (nothing
    /// names one natively yet). A card on a concept the catalog no longer
    /// holds is dropped, as it is there.
    func reviewQueue(now: Date = Date()) -> ReviewQueue {
        var queue = ReviewQueue()
        queue.items = cards.values
            .filter { $0.due <= now }
            .sorted { $0.due < $1.due }
            .compactMap { card in
                guard let c = byId[card.conceptSlug] else { return nil }
                return ReviewQueueItem(
                    conceptId: c.slug, title: c.title, summary: c.summary,
                    domain: c.domain, card: card,
                    intervals: previewIntervals(card, now: now)
                )
            }
        queue.nextDue = cards.values.filter { $0.due > now }.map(\.due).min()
        return queue
    }
}

/// FNV-1a over the UTF-16 code units — seedOf. A seed, not a hash: it
/// makes one card's options the same on every render and different from
/// the next card's.
func seedOf(_ text: String) -> UInt32 {
    var h: UInt32 = 0x811c9dc5
    for u in text.utf16 {
        h ^= UInt32(u)
        h = h &* 0x01000193
    }
    return h
}

/// mulberry32 — the small deterministic PRNG the shuffle repeats.
private func mulberry32(_ seed: UInt32) -> () -> Double {
    var a = seed
    return {
        a = a &+ 0x6d2b79f5
        var t = (a ^ (a >> 15)) &* (a | 1)
        t = (t &+ ((t ^ (t >> 7)) &* (t | 61))) ^ t
        return Double((t ^ (t >> 14))) / 4294967296
    }
}

private func shuffled<T>(_ list: [T], seed: UInt32) -> [T] {
    var out = list
    let next = mulberry32(seed)
    guard out.count > 1 else { return out }
    for i in stride(from: out.count - 1, through: 1, by: -1) {
        let j = Int((next() * Double(i + 1)).rounded(.down))
        out.swapAt(i, j)
    }
    return out
}

private let minDistractors = 2
private let maxChoices = 4

/// trim + collapse whitespace + lowercase — norm in review-core.ts.
private func normChoice(_ text: String) -> String {
    text.components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
        .lowercased()
}

/// The options for a check card: its own answer and up to three wrong ones
/// from `pool`, in an order fixed by the concept id — buildChoices. Nil
/// when the pool cannot supply two clean distractors, in which case the
/// card asks as recall instead. The wrong ones are other notes' answers
/// and summaries — real statements, never invented ones.
func buildChoices(conceptId: String, answer: String, pool: [String]) -> (choices: [String], correct: Int)? {
    guard !answer.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
    var seen = Set([normChoice(answer)])
    var candidates: [String] = []
    for text in pool {
        let key = normChoice(text)
        if key.isEmpty || seen.contains(key) { continue }
        seen.insert(key)
        candidates.append(text.trimmingCharacters(in: .whitespaces))
    }
    guard candidates.count >= minDistractors else { return nil }

    let seed = seedOf(conceptId)
    let wrong = Array(shuffled(Array(candidates.prefix((maxChoices - 1) * 2)), seed: seed).prefix(maxChoices - 1))
    let trimmedAnswer = answer.trimmingCharacters(in: .whitespaces)
    let choices = shuffled([trimmedAnswer] + wrong, seed: seed ^ 0x9e3779b9)
    return (choices, choices.firstIndex(of: trimmedAnswer) ?? 0)
}

/// One card as the session draws it — ReviewItem in review-core.ts: a
/// check card is the note's first check as multiple choice, a recall card
/// the "Recall: <title>" prompt with the summary behind it.
struct ReviewCardModel: Hashable {
    enum Kind: String, Hashable { case check, recall }
    let conceptId: String
    let title: String
    let summary: String
    let domain: String?
    let kind: Kind
    let prompt: String
    let answer: String
    let why: String?
    let source: String?
    let choices: [String]?
    let correct: Int?
    /// How many check blocks the note holds.
    let checks: Int
    let intervals: [Int]
    let ease: Double?
    let repetitions: Int
    let lapses: Int
    let leech: Bool
    let lastReviewed: Date?
    let due: Date?
}

/// "Recall: <title>" — recallPrompt.
func recallPrompt(_ title: String) -> String { "Recall: \(title)" }

extension LearnGraph {
    /// A due item into a card face — toReviewItem. `checks` come from the
    /// concept's note body; `pool` is the distractor list distractorPool
    /// built (same-domain check answers first, then the rest, then
    /// same-domain summaries, then the rest).
    func reviewCard(
        for item: ReviewQueueItem,
        checks: [ConceptCheck],
        pool: [String]
    ) -> ReviewCardModel {
        let check = checks.first { !$0.question.trimmingCharacters(in: .whitespaces).isEmpty }
        let base = (
            intervals: item.intervals,
            ease: item.card?.ease,
            repetitions: Int(item.card?.repetitions ?? 0),
            lapses: Int(item.card?.lapses ?? 0),
            leech: item.card?.leech ?? false,
            lastReviewed: item.card?.lastReviewed,
            due: item.card?.due
        )
        guard let check else {
            return ReviewCardModel(
                conceptId: item.conceptId, title: item.title, summary: item.summary,
                domain: item.domain, kind: .recall, prompt: recallPrompt(item.title),
                answer: item.summary, why: nil, source: nil, choices: nil, correct: nil,
                checks: checks.count, intervals: base.intervals, ease: base.ease,
                repetitions: base.repetitions, lapses: base.lapses, leech: base.leech,
                lastReviewed: base.lastReviewed, due: base.due
            )
        }
        let hasAnswer = !check.answer.trimmingCharacters(in: .whitespaces).isEmpty
        let answer = hasAnswer ? check.answer : item.summary
        let mc = hasAnswer ? buildChoices(conceptId: item.conceptId, answer: check.answer, pool: pool) : nil
        return ReviewCardModel(
            conceptId: item.conceptId, title: item.title, summary: item.summary,
            domain: item.domain, kind: mc == nil ? .recall : .check, prompt: check.question,
            answer: answer,
            why: check.why.trimmingCharacters(in: .whitespaces).isEmpty ? nil : check.why,
            source: check.source.trimmingCharacters(in: .whitespaces).isEmpty ? nil : check.source,
            choices: mc?.choices, correct: mc?.correct,
            checks: checks.count, intervals: base.intervals, ease: base.ease,
            repetitions: base.repetitions, lapses: base.lapses, leech: base.leech,
            lastReviewed: base.lastReviewed, due: base.due
        )
    }

    /// Wrong options for one card, best first — distractorPool: other due
    /// notes' check answers in the same domain, then in any domain, then
    /// same-domain summaries, then the rest.
    func distractorPool(
        for item: ReviewQueueItem,
        answers: [(conceptId: String, domain: String?, answer: String)]
    ) -> [String] {
        let same = { (d: String?) in d != nil && d == item.domain }
        let others = answers.filter { $0.conceptId != item.conceptId && !$0.answer.isEmpty }
        let notes = concepts.filter { $0.slug != item.conceptId && !$0.summary.isEmpty }
        return
            others.filter { same($0.domain) }.map(\.answer)
            + others.filter { !same($0.domain) }.map(\.answer)
            + notes.filter { same($0.domain) }.map(\.summary)
            + notes.filter { !same($0.domain) }.map(\.summary)
    }
}

// MARK: - Preferences (state/snapshot.ts + playback.ts)

/// A stored `lastVisited` / one `recentModules` entry — the shape
/// asLastVisited reads: a course, an optional module, and when.
struct StoredVisit {
    let courseSlug: String
    let moduleSlug: String?
    let at: Date
}

private func asLastVisited(_ value: Any?) -> StoredVisit? {
    guard let raw = value as? [String: Any],
          let course = raw["courseSlug"] as? String, !course.isEmpty else { return nil }
    let module = (raw["moduleSlug"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    let at: Date
    if let s = raw["at"] as? String, let parsed = ISO8601DateFormatter().date(from: s) {
        at = parsed
    } else if let s = raw["at"] as? String {
        // Fractional seconds, which ISO8601DateFormatter's default options skip.
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        at = f.date(from: s) ?? Date(timeIntervalSince1970: 0)
    } else {
        at = Date(timeIntervalSince1970: 0)
    }
    return StoredVisit(courseSlug: course, moduleSlug: module, at: at)
}

private func parsePreferenceJSON(_ raw: String?) -> Any? {
    guard let raw, let data = raw.data(using: .utf8) else { return nil }
    return try? JSONSerialization.jsonObject(with: data)
}

extension LearnGraph {
    /// The module visits the preferences hold: `recentModules` when it is a
    /// list, else the one `lastVisited` — storedVisits in recent.ts.
    static func storedVisits(preferences: [String: String]) -> [StoredVisit] {
        if let list = parsePreferenceJSON(preferences["recentModules"]) as? [Any] {
            return list.compactMap { asLastVisited($0) }
        }
        guard let last = asLastVisited(parsePreferenceJSON(preferences["lastVisited"])) else { return [] }
        return [last]
    }

    /// The courses being worked through — recentCourseSlugs: the
    /// `recentModules` courses, each once, or `lastVisited`'s one when the
    /// list is absent.
    static func recentCourseSlugs(preferences: [String: String]) -> [String] {
        var seen = Set<String>()
        return storedVisits(preferences: preferences).compactMap { v in
            seen.insert(v.courseSlug).inserted ? v.courseSlug : nil
        }
    }

    /// `inactiveCourses` — asCourseSlugs: distinct non-empty slugs.
    static func inactiveCourses(preferences: [String: String]) -> Set<String> {
        guard let list = parsePreferenceJSON(preferences["inactiveCourses"]) as? [Any] else { return [] }
        return Set(list.compactMap { $0 as? String }.filter { !$0.isEmpty })
    }

    /// The prior belief `bktParams` stores, or the default — the pL0 half
    /// of masteryOf.
    static func pL0(preferences: [String: String]) -> Double {
        guard let raw = parsePreferenceJSON(preferences["bktParams"]) as? [String: Any],
              let v = raw["pL0"] as? Double, v.isFinite else { return BKT.defaultPL0 }
        return v
    }
}

/// A `playback:<asset>` preference read back — parsePlayback: position at
/// least 0, duration positive, `watchedAt` the user's own "done" mark.
struct Playback {
    let position: Double
    let duration: Double
    let watchedAt: String?
    let updatedAt: String
}

func parsePlayback(_ raw: String?) -> Playback? {
    guard let raw, let json = parsePreferenceJSON(raw) as? [String: Any],
          let position = (json["position"] as? NSNumber)?.doubleValue,
          position.isFinite, position >= 0,
          let duration = (json["duration"] as? NSNumber)?.doubleValue,
          duration.isFinite, duration > 0 else { return nil }
    return Playback(
        position: position, duration: duration,
        watchedAt: json["watchedAt"] as? String,
        updatedAt: json["updatedAt"] as? String ?? ""
    )
}

/// Where a stopped video resumes, or 0 for "start it over" — resumeAt:
/// past the first five seconds and not inside the last ten of the file.
func resumeAt(_ playback: Playback?) -> Double {
    guard let playback else { return 0 }
    if playback.position < 5 { return 0 }
    if playback.duration > 0 && playback.position >= playback.duration - 10 { return 0 }
    return playback.position
}

/// "2:17", "1:02:03" — clock in recent-core.ts.
func clock(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.rounded(.down)))
    let h = s / 3600, m = (s % 3600) / 60, rest = s % 60
    return h > 0
        ? "\(h):\(String(format: "%02d", m)):\(String(format: "%02d", rest))"
        : "\(m):\(String(format: "%02d", rest))"
}

// MARK: - Recent (recent-core.ts + recent.ts)

/// A module page the owner opened — ModuleVisit: a `visit` event or a
/// `recentModules`/`lastVisited` entry.
struct ModuleVisit: Hashable {
    let courseSlug: String
    let moduleSlug: String?
    let at: Date
}

/// Where a visit points — ModulePlace. Nil when the course or module is gone.
struct ModulePlace {
    let courseCode: String
    let courseTitle: String
    let moduleTitle: String?
    let moduleOrder: Int?
}

/// A library video with a saved position — VideoProgress.
struct VideoProgress {
    let assetId: String
    /// Nil when the asset row is gone, which leaves nothing to open.
    let title: String?
    let position: Double
    let duration: Double
    let watchedAt: String?
    let updatedAt: String
}

/// A concept the owner answered questions on, and when — ConceptTouch.
struct ConceptTouch {
    let id: String
    let title: String
    let bucket: MasteryBucket
    let pL: Double
    let at: Date
}

/// Where a Recent row opens — the native href: a concept's workspace, a
/// course page (or one module of it), or an asset in the Library. The same
/// `AppDestination` every surface navigates by.
typealias RecentDestination = AppDestination

/// One row of Recent — RecentItem. `key` is `<kind>:<id>` as on the web.
struct RecentItem: Identifiable, Hashable {
    var id: String { key }
    /// RECENT_KINDS in recent-core.ts. `draft` rows still have no local
    /// source — the runner's conversation list lives inside StudioView.
    enum Kind: String, Hashable { case module, video, draft, concept, session }
    let key: String
    let kind: Kind
    let title: String
    /// "CS3230 · Module 6", "2:17 of 11:36"; nil for a concept, which
    /// shows its mastery instead.
    let detail: String?
    let destination: RecentDestination
    /// `var` for the session fold: a session that opens a concept's page the
    /// list already holds moves that row's `at` to the later of the two.
    var at: Date
    /// How far into a video, 0 to 100.
    var percent: Int? = nil
    var bucket: MasteryBucket? = nil
    var pL: Double? = nil
    var courseSlug: String? = nil
    var moduleSlug: String? = nil
    var conceptId: String? = nil
}

/// The module visits, newest first, each course/module once — the `visit`
/// events merged with the stored list at the later of the two times —
/// moduleVisits.
func moduleVisits(events: [CatalogEvent], stored: [StoredVisit]) -> [ModuleVisit] {
    var latest: [String: ModuleVisit] = [:]
    func put(_ visit: ModuleVisit) {
        let key = "\(visit.courseSlug)/\(visit.moduleSlug ?? "")"
        if let seen = latest[key], seen.at >= visit.at { return }
        latest[key] = visit
    }
    for v in stored { put(ModuleVisit(courseSlug: v.courseSlug, moduleSlug: v.moduleSlug, at: v.at)) }
    for e in events {
        guard e.type == "visit", let course = e.payload["course"] as? String, !course.isEmpty else { continue }
        let module = (e.payload["module"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        put(ModuleVisit(courseSlug: course, moduleSlug: module, at: e.at))
    }
    return latest.values.sorted { $0.at > $1.at }
}

/// Where a visit points, or nil when the course (or the module it named)
/// is gone — modulePlace. Titles and codes come off the catalog rows; the
/// PathCourse shape only carries what the path needs.
@MainActor
func modulePlace(_ visit: ModuleVisit, store: CatalogStore) -> ModulePlace? {
    guard let course = store.course(visit.courseSlug) else { return nil }
    let found = visit.moduleSlug.flatMap { slug in course.modules.first { $0.slug == slug } }
    if visit.moduleSlug != nil && found == nil { return nil }
    return ModulePlace(
        courseCode: course.code, courseTitle: course.title,
        moduleTitle: found?.title, moduleOrder: found?.order
    )
}

/// The latest answer per concept — conceptTouches. The web folds
/// `observation` events by their `concept` column, which the mirror does
/// not ship; the mastery row's `last_seen` is the same instant, stamped by
/// the pipeline's own replay, and `session-start`'s `goal` /
/// `session-close`'s `concepts` name a concept a session touched even when
/// it recorded no observation. Latest wins.
func conceptTouches(events: [CatalogEvent], graph: LearnGraph) -> [ConceptTouch] {
    var latest: [String: Date] = [:]
    for c in graph.concepts {
        if let seen = c.lastSeen { latest[c.slug] = seen }
    }
    for e in events {
        switch e.type {
        case "session-start":
            if let goal = e.payload["goal"] as? String, !goal.isEmpty {
                if latest[goal].map({ $0 < e.at }) ?? true { latest[goal] = e.at }
            }
        case "session-close":
            for slug in (e.payload["concepts"] as? [Any])?.compactMap({ $0 as? String }) ?? [] {
                if latest[slug].map({ $0 < e.at }) ?? true { latest[slug] = e.at }
            }
        default: continue
        }
    }
    return latest.compactMap { slug, at in
        guard let c = graph.byId[slug] else { return nil }
        return ConceptTouch(id: slug, title: c.title, bucket: c.bucket, pL: c.pL, at: at)
    }
}

/// Every row, newest first — recentItems: module pages, videos stopped
/// partway, and concepts answered on. Drafts and tutor sessions have no
/// mirrored rows to read, so no rows of theirs are folded in.
func recentItems(
    visits: [ModuleVisit],
    place: (ModuleVisit) -> ModulePlace?,
    videos: [VideoProgress],
    concepts: [ConceptTouch]
) -> [RecentItem] {
    var out: [RecentItem] = []
    for visit in visits {
        guard let place = place(visit) else { continue }
        let inModule = visit.moduleSlug != nil && place.moduleTitle != nil
        out.append(RecentItem(
            key: "module:\(visit.courseSlug)/\(visit.moduleSlug ?? "")",
            kind: .module,
            title: inModule ? place.moduleTitle! : place.courseTitle,
            detail: inModule && place.moduleOrder != nil
                ? "\(place.courseCode) · Module \(place.moduleOrder!)"
                : place.courseCode,
            destination: inModule
                ? .module(course: visit.courseSlug, module: visit.moduleSlug!)
                : .course(visit.courseSlug),
            at: visit.at,
            courseSlug: visit.courseSlug,
            moduleSlug: inModule ? visit.moduleSlug : nil
        ))
    }
    for video in videos {
        guard video.title != nil, video.watchedAt == nil, resumeAt(Playback(
            position: video.position, duration: video.duration,
            watchedAt: video.watchedAt, updatedAt: video.updatedAt
        )) != 0 else { continue }
        out.append(RecentItem(
            key: "video:\(video.assetId)",
            kind: .video,
            title: video.title!,
            // A local watch row can predate the duration column — the
            // position alone still names where it stopped.
            detail: video.duration > 0
                ? "\(clock(video.position)) of \(clock(video.duration))"
                : clock(video.position),
            destination: .asset(video.assetId),
            at: isoDate(video.updatedAt) ?? .distantPast,
            percent: video.duration > 0
                ? min(100, Int((video.position / video.duration * 100).rounded()))
                : nil
        ))
    }
    for c in concepts {
        out.append(RecentItem(
            key: "concept:\(c.id)",
            kind: .concept,
            title: c.title,
            detail: nil,
            destination: .concept(c.id),
            at: c.at,
            bucket: c.bucket, pL: c.pL,
            conceptId: c.id
        ))
    }
    // Newest first; the web's sort is stable, so rows touched in the same
    // instant keep the source order above — the offset tiebreak repeats it.
    return out.enumerated()
        .sorted { a, b in a.element.at != b.element.at ? a.element.at > b.element.at : a.offset < b.offset }
        .map(\.element)
}

private func isoDate(_ s: String) -> Date? {
    if let d = ISO8601DateFormatter().date(from: s) { return d }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.date(from: s)
}

/// `at` in the shape the `/api/learner/*` bodies carry — ISO 8601 with fractional seconds.
private func isoString(_ date: Date) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: date)
}

// MARK: - The sidebar (Sections.tsx over recent-core.ts)

/// One row of the sidebar's Courses section — SidebarCourse in
/// recent-core.ts: the course and where its row opens.
struct SidebarCourse: Identifiable {
    var id: String { slug }
    let slug: String
    let code: String
    let title: String
    /// The module visited last, else the course page — the web's `open`.
    let destination: RecentDestination
    /// The module visited last, when one is recorded — the web's `resume`,
    /// drawn as "<order>. <title>" under the course's name.
    let resume: (order: Int, title: String)?
}

/// A stored pin — PinnedRow, with the web href already read into the
/// destination it names. `opensStudio` marks the one link no destination
/// expresses (`/studio…`), which the sidebar opens as a section instead.
struct SidebarPinned: Identifiable, Hashable {
    var id: String { key }
    let key: String
    let kind: RecentItem.Kind
    let title: String
    let destination: RecentDestination?
    let opensStudio: Bool
    let at: Date?
}

/// The rows under one day heading — RecentGroup.
struct RecentGroup: Identifiable, Hashable {
    var id: String { label }
    let label: String
    let rows: [RecentItem]
}

/// What the sidebar's sections draw — the pieces of RecentModel Sections.tsx
/// reads (its `reachable`/`more` stay on the web's paged API; the whole
/// local list is already here).
struct SidebarModel {
    var courses: [SidebarCourse] = []
    var pinned: [SidebarPinned] = []
    var groups: [RecentGroup] = []
}

/// The AppDestination a web href names, or nil outside the pushable pages —
/// `/studio`, `/home`, `/settings` and anything else the shell opens as a
/// section rather than a pushed page. Unknown and unsafe hrefs drop the
/// same way (isAppPath still gates what reaches this far).
func appDestination(forHref href: String) -> RecentDestination? {
    var path = href
    if let i = path.firstIndex(of: "?") { path = String(path[..<i]) }
    if let i = path.firstIndex(of: "#") { path = String(path[..<i]) }
    let parts = path.split(separator: "/", omittingEmptySubsequences: true)
        .map { $0.removingPercentEncoding ?? String($0) }
    switch parts.count {
    case 2 where parts[0] == "courses": return .course(parts[1])
    case 3 where parts[0] == "courses": return .module(course: parts[1], module: parts[2])
    case 2 where parts[0] == "learn": return .concept(parts[1])
    case 2 where parts[0] == "library": return .asset(parts[1])
    default: return nil
    }
}

/// isAppPath: one leading slash, never two, no backslash, no control
/// characters — the stored value goes back into a link, so that is the
/// line between a pin and a stored link to anywhere.
private func isAppPath(_ href: Any?) -> Bool {
    guard let href = href as? String, href.count <= 1000,
          href.hasPrefix("/"), !href.hasPrefix("//"), !href.contains("\\"),
          href.range(of: #"[\u{0}-\u{1f}\u{7f}]"#, options: .regularExpression) == nil
    else { return false }
    return true
}

/// asPinnedRow + asPinned over the mirrored `pinned` preference: each entry
/// read defensively, a non-pin dropped, each key once, capped at 50.
func asPinnedRows(_ preferences: [String: String]) -> [SidebarPinned] {
    guard let list = parsePreferenceJSON(preferences["pinned"]) as? [Any] else { return [] }
    var seen = Set<String>()
    var out: [SidebarPinned] = []
    for entry in list {
        guard let raw = entry as? [String: Any],
              let kindName = raw["kind"] as? String,
              let kind = RecentItem.Kind(rawValue: kindName),
              let key = raw["key"] as? String,
              let colon = key.firstIndex(of: ":"),
              colon > key.startIndex, colon < key.index(before: key.endIndex),
              key.prefix(upTo: colon) == kindName, key.count <= 600,
              let title = (raw["title"] as? String)
                    .map({ $0.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                            .trimmingCharacters(in: .whitespaces).prefix(200) }),
              !title.isEmpty,
              isAppPath(raw["href"]), let href = raw["href"] as? String,
              let atString = raw["at"] as? String, let at = isoDate(atString),
              seen.insert(key).inserted
        else { continue }
        out.append(SidebarPinned(
            key: key, kind: kind, title: String(title),
            destination: appDestination(forHref: href),
            opensStudio: href.hasPrefix("/studio"),
            at: at
        ))
        if out.count >= 50 { break }
    }
    return out
}

/// The day headings of recent-core.ts — DAY_GROUPS, by the local calendar
/// day of `at` against `now`; empty groups stay out, rows keep their order.
func recentGroups(_ rows: [RecentItem], now: Date = Date(), in calendar: Calendar = .current) -> [RecentGroup] {
    let order = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"]
    var byLabel: [String: [RecentItem]] = [:]
    for row in rows {
        let ago = DayMath.diff(row.at, now, in: calendar)
        let label = ago <= 0 ? order[0] : ago == 1 ? order[1] : ago <= 7 ? order[2] : ago <= 30 ? order[3] : order[4]
        byLabel[label, default: []].append(row)
    }
    return order.compactMap { label in
        byLabel[label].map { RecentGroup(label: label, rows: $0) }
    }
}

extension LearnGraph {
    /// The sidebar's Courses section — sidebarCourses in recent.ts: the
    /// courses of the module visits, each once in visit order; for an owner
    /// with no visit yet, the active courses with a tick, in authored order.
    /// Each opens at the module visited last in it — the second line —
    /// or the course page when none is.
    @MainActor
    func sidebarCourses(store: CatalogStore, visits: [ModuleVisit], limit: Int = 12) -> [SidebarCourse] {
        let live = store.courses.filter { !inactiveCourses.contains($0.slug) }
        let bySlug = Dictionary(uniqueKeysWithValues: live.map { ($0.slug, $0) })
        var seen = Set<String>()
        var picked = visits.compactMap { v in
            seen.insert(v.courseSlug).inserted ? bySlug[v.courseSlug] : nil
        }
        if picked.isEmpty {
            picked = live.sorted { $0.order < $1.order }
                .filter { c in c.modules.contains { m in m.items.contains { isDone($0.id) } } }
        }
        return picked.prefix(limit).map { c in
            // Visits are newest first, so the first in this course whose
            // module still exists is where the row opens.
            let last = visits.lazy
                .filter { $0.courseSlug == c.slug && $0.moduleSlug != nil }
                .compactMap { v in c.modules.first { $0.slug == v.moduleSlug } }
                .first
            return SidebarCourse(
                slug: c.slug, code: c.code, title: c.title,
                destination: last.map { .module(course: c.slug, module: $0.slug) } ?? .course(c.slug),
                resume: last.map { (order: $0.order, title: $0.title) }
            )
        }
    }
}

extension CatalogStore {
    /// The playback rows the preferences hold, merged with learner.db's own
    /// watch marks — a video this app played is recent even before the
    /// catalog row it mirrored comes back in a snapshot. The newer of the
    /// two is the truth, the merge clock the progress rows already use; a
    /// watched verdict either file holds still counts (a position saved
    /// after it is a second watch, as the web's second `watched` event is).
    private var sidebarVideoProgress: [VideoProgress] {
        var rows: [String: VideoProgress] = [:]
        for v in videoProgress { rows[v.assetId] = v }
        for (id, mark) in watch {
            let markAt = mark.updatedAt ?? .distantPast
            let current = rows[id]
            if let current, (isoDate(current.updatedAt) ?? .distantPast) > markAt { continue }
            let duration = mark.duration ?? current?.duration ?? 0
            rows[id] = VideoProgress(
                assetId: id,
                title: asset(id).map { displayTitle(for: $0) },
                position: mark.seconds,
                duration: duration,
                watchedAt: mark.done ? (current?.watchedAt ?? isoString(markAt)) : current?.watchedAt,
                updatedAt: isoString(markAt)
            )
        }
        return Array(rows.values)
    }

    /// sessionTouches in recent.ts over learner.db's session rows: titled by
    /// the session, else its log asset, else the concept it set out to
    /// learn; opening the log in the Library when there is one, else the
    /// concept's page. A session with neither is left out, as a video whose
    /// asset is gone is.
    private var sessionTouches: [RecentItem] {
        sessions.compactMap { s in
            let logID = "session:learn/sessions/\(s.id).md"
            let log = asset(logID)
            let goal = s.goal.flatMap { learn.byId[$0] }
            let title = [s.title, log.map { displayTitle(for: $0) }, goal?.title]
                .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
                .first { !$0.isEmpty }
            let destination: RecentDestination?
            if log != nil {
                destination = .asset(logID)
            } else if let goalSlug = s.goal, goal != nil {
                destination = .concept(goalSlug)
            } else {
                destination = nil
            }
            guard let title, let destination else { return nil }
            return RecentItem(
                key: "session:\(s.id)",
                kind: .session,
                title: title,
                detail: "Tutor session",
                destination: destination,
                at: s.updatedAt ?? .distantPast
            )
        }
    }

    /// What the sidebar's sections draw — Sections.tsx's read over
    /// readRecent: module visits from the events and preferences, videos
    /// stopped partway (the preferences' and learner.db's own), concepts
    /// answered on, and tutor sessions, with the stored pins moved out and
    /// the rest under its day headings. Studio drafts have no local read —
    /// the runner's list lives inside StudioView — so they stay a gap the
    /// Recent section does not pretend to fill.
    func sidebarRecent(now: Date = Date(), in calendar: Calendar = .current) -> SidebarModel {
        let visits = moduleVisits(
            events: events,
            stored: LearnGraph.storedVisits(preferences: preferences)
        )
        var items = recentItems(
            visits: visits,
            place: { modulePlace($0, store: self) },
            videos: sidebarVideoProgress,
            concepts: conceptTouches(events: events, graph: learn)
        )
        // The session fold of recentItems: a session that opens a concept's
        // page the list already holds is that row, dated by the later of the
        // two; a session with a log, or none the list holds, is its own row.
        var byDestination: [RecentDestination: Int] = [:]
        for (i, item) in items.enumerated() where item.kind == .concept {
            byDestination[item.destination] = i
        }
        for row in sessionTouches.sorted(by: { $0.at > $1.at }) {
            if let i = byDestination[row.destination] {
                items[i].at = max(items[i].at, row.at)
                continue
            }
            byDestination[row.destination] = items.count
            items.append(row)
        }
        items.sort { $0.at > $1.at }

        // splitPinned: a pinned row leaves Recent and shows in pin order
        // under Pinned, titled as the live row is now when the list holds it.
        let live = Dictionary(uniqueKeysWithValues: items.map { ($0.key, $0) })
        let pinned = asPinnedRows(preferences).map { pin in
            live[pin.key].map {
                SidebarPinned(key: pin.key, kind: pin.kind, title: $0.title,
                              destination: pin.destination, opensStudio: pin.opensStudio, at: pin.at)
            } ?? pin
        }
        let pinKeys = Set(pinned.map(\.key))
        let unpinned = items.filter { !pinKeys.contains($0.key) }

        return SidebarModel(
            courses: learn.sidebarCourses(store: self, visits: visits),
            pinned: pinned,
            groups: recentGroups(unpinned, now: now, in: calendar)
        )
    }
}

// MARK: - Home (home-core.ts + home.ts)

/// A thread row — RecentItem plus the day it was touched.
struct HomeThread: Identifiable, Hashable {
    var id: String { item.key }
    let item: RecentItem
    /// "Today", "Yesterday", "Mon", "20 Aug".
    let day: String
}

/// One step on from a thread — NextStep with a native destination.
struct NextStep: Identifiable, Hashable {
    var id: String { key }
    let key: String
    let title: String
    /// "CS3230 · Module 6", or nil for a concept, which shows its mastery.
    let detail: String?
    let destination: RecentDestination
    var bucket: MasteryBucket? = nil
    var pL: Double? = nil
}

/// The steps one thread opens up — NextGroup.
struct NextGroup: Identifiable, Hashable {
    var id: String { key }
    let key: String
    /// "After Randomized algorithms", "Start here".
    let heading: String
    let steps: [NextStep]
}

/// A due card Home suggests recalling — RecallPick.
struct RecallPick: Identifiable, Hashable {
    var id: String { conceptId }
    let conceptId: String
    let title: String
    let bucket: MasteryBucket
    /// "3 days ago", "on 20 Aug", or nil when never observed.
    let lastSeen: String?
}

/// A course with something done or opened — CourseInProgress.
struct CourseInProgress: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let code: String
    let title: String
    let completed: Int
    let total: Int
    let percent: Int
}

/// The frontier's first concept, shown only when `next` is empty — NextUp.
struct NextUp: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let title: String
    let bucket: MasteryBucket
    let pL: Double
    let lastSeen: String?
    /// "Next on your path · CP4281 · Module 2".
    let eyebrow: String
    /// "Next up · CP4281 M2".
    let eyebrowShort: String
}

/// What the Home page draws — HomeModel, minus `reachable`/`asOf` (the
/// store's own error state answers those) and with `due` carried so the
/// page's header line can say what is owed.
struct HomeModel {
    var conceptCount = 0
    var threads: [HomeThread] = []
    var next: [NextGroup] = []
    var nextUp: NextUp? = nil
    var recall: [RecallPick] = []
    var courses: (rows: [CourseInProgress], total: Int) = ([], 0)
    /// Due now, and the soonest due after — the queue's headline numbers.
    var dueCount = 0
    var nextDue: Date? = nil
}

extension LearnGraph {
    /// The threads under "Pick up where you left off" — homeThreads: the
    /// first rows of Recent, each with the day it was touched.
    @MainActor
    func homeThreads(sources: (visits: [ModuleVisit], videos: [VideoProgress]),
                     store: CatalogStore,
                     limit: Int = 5, now: Date = Date()) -> [HomeThread] {
        let items = recentItems(
            visits: sources.visits,
            place: { modulePlace($0, store: store) },
            videos: sources.videos,
            concepts: conceptTouches(events: store.events, graph: self)
        )
        return items.prefix(limit).map {
            HomeThread(item: $0, day: pastDayLabel($0.at, today: now))
        }
    }

    /// What the threads open up — nextFromHere: after a concept, the
    /// frontier concepts that require it; after a module or course, the
    /// first topic not yet done of the visited module and of each after
    /// it; at most `perGroup` steps a thread and `groups` threads. With no
    /// threads at all, the first active course's first open topic is
    /// "Start here".
    func nextFromHere(_ threads: [HomeThread], groups maxGroups: Int = 2, perGroup: Int = 3)
        -> [NextGroup] {
        let onThreads = Set(threads.compactMap(\.item.conceptId))
        var shown = Set<String>()
        var out: [NextGroup] = []

        func conceptStep(_ c: LearnConcept) -> NextStep {
            NextStep(
                key: "concept:\(c.slug)", title: c.title, detail: nil,
                destination: .concept(c.slug), bucket: c.bucket, pL: c.pL
            )
        }

        /// The first open topic of the visited module, then of each after
        /// it — the web sends each to its Continue link; natively that is
        /// the topic's next concept when it has one (continueHref's own
        /// rule), else the module page.
        func topicSteps(_ course: PathCourse, fromModule: String?) -> [NextStep] {
            let start = fromModule == nil ? 0 : (course.modules.firstIndex { $0.slug == fromModule! } ?? -1)
            if start < 0 { return [] }
            var steps: [NextStep] = []
            for mod in course.modules.dropFirst(start) {
                guard let topic = mod.topics.first(where: { !isDone($0.id) }) else { continue }
                let destination: RecentDestination =
                    if let mastery = topicMastery(topic.id) { .concept(mastery.next) }
                    else { .module(course: course.slug, module: mod.slug) }
                steps.append(NextStep(
                    key: "topic:\(topic.id)", title: topic.title,
                    detail: "\(course.code) · Module \(mod.order)",
                    destination: destination
                ))
            }
            return steps
        }

        for thread in threads {
            if out.count == maxGroups { break }
            var steps: [NextStep] = []
            if let conceptId = thread.item.conceptId {
                steps = frontier
                    .compactMap { byId[$0] }
                    .filter { $0.requires.contains(conceptId) && !onThreads.contains($0.slug) }
                    .map(conceptStep)
            } else if let courseSlug = thread.item.courseSlug,
                      let course = activeCourses.first(where: { $0.slug == courseSlug }) {
                steps = topicSteps(course, fromModule: thread.item.moduleSlug)
            }
            steps = steps.filter { !shown.contains($0.key) }
            steps = Array(steps.prefix(perGroup))
            if steps.isEmpty { continue }
            for step in steps { shown.insert(step.key) }
            out.append(NextGroup(key: thread.id, heading: "After \(thread.item.title)", steps: steps))
        }

        if out.isEmpty && threads.isEmpty,
           let first = activeCourses.first(where: { !topicSteps($0, fromModule: nil).isEmpty }) {
            out.append(NextGroup(key: "start", heading: "Start here",
                                 steps: Array(topicSteps(first, fromModule: nil).prefix(1))))
        }
        return out
    }

    /// The concepts the threads are about, or one step from — nearThreads.
    func nearThreads(_ threads: [HomeThread], next: [NextGroup]) -> Set<String> {
        var near = Set<String>()
        var topicIds = Set<String>()
        for t in threads {
            if let conceptId = t.item.conceptId {
                near.insert(conceptId)
                for c in concepts {
                    if c.slug == conceptId { c.requires.forEach { near.insert($0) } }
                    if c.requires.contains(conceptId) { near.insert(c.slug) }
                }
            } else if let courseSlug = t.item.courseSlug,
                      let course = activeCourses.first(where: { $0.slug == courseSlug }) {
                for m in course.modules where t.item.moduleSlug == nil || m.slug == t.item.moduleSlug {
                    for topic in m.topics { topicIds.insert(topic.id) }
                }
            }
        }
        for group in next {
            for step in group.steps {
                if step.key.hasPrefix("concept:") { near.insert(String(step.key.dropFirst(8))) }
                if step.key.hasPrefix("topic:") { topicIds.insert(String(step.key.dropFirst(6))) }
            }
        }
        for c in concepts where c.itemIds.contains(where: { topicIds.contains($0) }) {
            near.insert(c.slug)
        }
        return near
    }

    /// At most `limit` due cards worth a quick recall — recallPicks: those
    /// near the threads first, then the rest, each lot by how long since
    /// its concept was last seen, longest first.
    func recallPicks(now: Date = Date(), threads: [HomeThread], next: [NextGroup], limit: Int = 3)
        -> [RecallPick] {
        let near = nearThreads(threads, next: next)
        let due = reviewQueue(now: now).items
        func seenAt(_ id: String) -> TimeInterval { byId[id]?.lastSeen?.timeIntervalSince1970 ?? -.infinity }
        return due
            .filter { byId[$0.conceptId] != nil }
            .enumerated()
            .sorted { a, b in
                let an = near.contains(a.element.conceptId), bn = near.contains(b.element.conceptId)
                if an != bn { return an }
                if seenAt(a.element.conceptId) != seenAt(b.element.conceptId) {
                    return seenAt(a.element.conceptId) < seenAt(b.element.conceptId)
                }
                return a.offset < b.offset
            }
            .prefix(limit)
            .compactMap { _, item in
                guard let c = byId[item.conceptId] else { return nil }
                return RecallPick(
                    conceptId: c.slug, title: c.title, bucket: c.bucket,
                    lastSeen: homeLastSeenLabel(c.lastSeen, now: now)
                )
            }
    }

    /// Every active course with at least one topic done or a visit on it —
    /// coursesInProgress: furthest along first, ties by authored order.
    func coursesInProgress(opened: Set<String>) -> [CourseInProgress] {
        var rows: [(row: CourseInProgress, order: Int)] = []
        for c in activeCourses {
            let ids = c.modules.flatMap { $0.topics.map(\.id) }
            let done = ids.filter { isDone($0) }.count
            let percent = ids.isEmpty ? 0 : Int((Double(done) / Double(ids.count) * 100).rounded())
            let row = CourseInProgress(
                slug: c.slug, code: c.code, title: c.title,
                completed: done, total: ids.count, percent: percent
            )
            if row.completed > 0 || opened.contains(c.slug) { rows.append((row, c.order)) }
        }
        return rows
            .sorted { $0.row.percent != $1.row.percent ? $0.row.percent > $1.row.percent : $0.order < $1.order }
            .map(\.row)
    }

    /// The frontier's first concept as "Next up" — toNextUp + the eyebrow
    /// that names where it sits (nextUpEyebrows).
    func nextUp(now: Date = Date()) -> NextUp? {
        guard let first = frontier.compactMap({ byId[$0] }).first else { return nil }
        let place = placeOf(first.itemIds)
        let eyebrow: String
        let short: String
        if let code = place?.courseCode {
            let unit = place?.moduleOrder
            eyebrow = ["Next on your path", code, unit.map { "Module \($0)" }]
                .compactMap { $0 }.joined(separator: " · ")
            short = "Next up · \(code)\(unit.map { " M\($0)" } ?? "")"
        } else if let domain = first.domain {
            eyebrow = "Next on your path · \(domain)"
            short = "Next up · \(domain)"
        } else {
            eyebrow = "Next on your path"
            short = "Next up"
        }
        return NextUp(
            slug: first.slug, title: first.title, bucket: first.bucket, pL: first.pL,
            lastSeen: homeLastSeenLabel(first.lastSeen, now: now),
            eyebrow: eyebrow, eyebrowShort: short
        )
    }
}

// MARK: - The concept workspace (concept-workspace-core.ts)

/// A neighbour row's worth of a concept — NeighbourRef.
struct NeighbourRef: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let title: String
    let bucket: MasteryBucket
    let pL: Double
}

/// Everything the concept workspace shows about one concept —
/// ConceptWorkspace. `history` has no honest port (the mirror's
/// observations carry no concept), so the surfaces show the mastery row's
/// own aggregate — the pipeline's replay of that same history — and each
/// check's status from question-text matching instead.
struct ConceptWorkspace {
    let slug: String
    let title: String
    let summary: String
    let domain: String?
    let bucket: MasteryBucket
    let pL: Double
    let mastery: MasteryLabel
    let observations: Int
    let correct: Int
    let lastSeen: Date?
    let place: ConceptPlace?
    /// The note body as the catalog holds it, and the note's logical path.
    let body: String?
    let notePath: String?
    let sources: [String]
    let tags: [String]
    let requires: [NeighbourRef]
    let assumes: [NeighbourRef]
    /// Concepts that require this one.
    let dependants: [NeighbourRef]
    /// Concepts whose `requires` or `assumes` names this one.
    let backlinks: [NeighbourRef]
    let checks: [WorkspaceCheck]
    let review: (due: Date, intervalDays: Int64, ease: Double,
                 repetitions: Int64, lapses: Int64, leech: Bool)?
    /// Assets linked to this concept, its own note left out.
    let assets: [CatalogAsset]
    /// True when on the frontier: every prerequisite met, itself not yet held.
    let frontier: Bool
    /// The interval each rating would give the card now — the review
    /// preview, nil when the concept is unscheduled and nobody asked for one.
    let intervals: [Int]
}

extension CatalogStore {
    /// The workspace for `slug`, or nil when the knowledge base has no such
    /// concept — buildConceptWorkspace over the native rows.
    func workspace(for slug: String, now: Date = Date()) -> ConceptWorkspace? {
        guard let concept = learn.byId[slug], let stored = self.concept(slug) else { return nil }
        func ref(_ id: String) -> NeighbourRef? {
            learn.byId[id].map { NeighbourRef(slug: $0.slug, title: $0.title, bucket: $0.bucket, pL: $0.pL) }
        }
        let ownNote = stored.path
        let assets = assetsLinked(concept: slug)
            .filter { !($0.kind == "note" && $0.path != nil && $0.path == ownNote) }
        let card = learn.cards[slug]
        return ConceptWorkspace(
            slug: concept.slug,
            title: concept.title,
            summary: concept.summary,
            domain: concept.domain,
            bucket: concept.bucket,
            pL: concept.pL,
            mastery: concept.mastery,
            observations: concept.observations,
            correct: concept.correct,
            lastSeen: concept.lastSeen,
            place: learn.placeOf(concept.itemIds),
            body: stored.body,
            notePath: ownNote,
            sources: stored.sources,
            tags: stored.tags,
            requires: concept.requires.compactMap(ref),
            assumes: concept.assumes.compactMap(ref),
            dependants: dependantsOf(learn.edges, slug: slug).compactMap(ref),
            backlinks: backlinksOf(learn.concepts, slug: slug).compactMap(ref),
            checks: checkStatuses(parseChecks(stored.body), events: events),
            review: card.map {
                (due: $0.due, intervalDays: $0.intervalDays, ease: $0.ease,
                 repetitions: $0.repetitions, lapses: $0.lapses, leech: $0.leech)
            },
            assets: assets,
            frontier: learn.frontier.contains(slug),
            intervals: previewIntervals(card, now: now)
        )
    }

    /// The review queue as cards a page can render — readReviewSession's
    /// shape: due cards most overdue first, each concept's note read for
    /// check blocks, and the soonest due after now.
    func reviewQueue(now: Date = Date()) -> ReviewQueue {
        learn.reviewQueue(now: now)
    }

    /// One due item into its card face — toReviewItem with this queue's
    /// distractor pool.
    func reviewCard(for item: ReviewQueueItem, in queue: ReviewQueue) -> ReviewCardModel {
        let checks = parseChecks(conceptBody(item.conceptId))
        let answers: [(conceptId: String, domain: String?, answer: String)] = queue.items.map { other in
            let answer = parseChecks(conceptBody(other.conceptId))
                .first { !$0.question.trimmingCharacters(in: .whitespaces).isEmpty }?
                .answer.trimmingCharacters(in: .whitespaces) ?? ""
            return (other.conceptId, other.domain, answer)
        }
        return learn.reviewCard(for: item, checks: checks, pool: learn.distractorPool(for: item, answers: answers))
    }

    /// The playback rows the preferences hold — videoProgress' first half:
    /// `playback:<asset>` keys with a usable payload, the asset's title
    /// resolved (a missing asset leaves the title nil, and the row out).
    var videoProgress: [VideoProgress] {
        preferences.compactMap { key, value in
            guard key.hasPrefix("playback:") else { return nil }
            let assetId = String(key.dropFirst("playback:".count))
            guard let parsed = parsePlayback(value) else { return nil }
            return VideoProgress(
                assetId: assetId,
                title: asset(assetId).map { displayTitle(for: $0) },
                position: parsed.position,
                duration: parsed.duration,
                watchedAt: parsed.watchedAt,
                updatedAt: parsed.updatedAt
            )
        }
    }

    /// The Home page's model — loadHome in home.ts, over the rows the
    /// mirror holds: module visits from events and preferences, videos
    /// from playback rows, concept touches from last_seen and session
    /// events. Drafts and tutor sessions have no mirrored table.
    func home(now: Date = Date(), in calendar: Calendar = .current) -> HomeModel {
        let visits = moduleVisits(
            events: events,
            stored: LearnGraph.storedVisits(preferences: preferences)
        )
        let threads = learn.homeThreads(
            sources: (visits: visits, videos: videoProgress),
            store: self, now: now
        )
        let next = learn.nextFromHere(threads)
        let queue = learn.reviewQueue(now: now)
        let courses = learn.coursesInProgress(opened: Set(visits.map(\.courseSlug)))
        return HomeModel(
            conceptCount: learn.concepts.count,
            threads: threads,
            next: next,
            nextUp: next.isEmpty ? learn.nextUp(now: now) : nil,
            recall: learn.recallPicks(now: now, threads: threads, next: next),
            courses: (Array(courses.prefix(4)), courses.count),
            dueCount: queue.items.count,
            nextDue: queue.nextDue
        )
    }
}
