//
//  StudioHome.swift
//  Gnosia
//
//  The studio's way in and the corpus under it: the native counterpart of
//  the web page's own half — `HomeComposer.tsx` (the composer) and
//  `StudioBrowse.tsx` (the toolbar and the artifact grid) — over the pure
//  rules of `studio-view.ts`, `studio-tile-jobs.ts` and `studio-video.ts`.
//
//  Those three libraries decide what the browser shows and are pure by
//  design; the ones the grid needs are ported here as free functions, kept
//  close to their sources so the two can be read side by side:
//
//  - `studio-view.ts`: the kind segments, the topic chips (NO_TOPIC last,
//    always present), the search and topic filters, the sorts, the groups.
//  - `studio-video.ts`: `filterVideos`, `sortVideos`, `gridSections`,
//    `sectionItems`, `videoShownOnGrid`, `newVideoJobs`, `videoJobForSlug`,
//    `videoHeadline`, `videoStepCount`, VIDEO_STEP_NAMES' doing words.
//  - `studio-tile-jobs.ts`: `shownOnGrid`, `jobForTarget`,
//    `newDiagramJobs`, `loaderHeadline`, `loaderStep`.
//
//  The composer is `useStartDraft`'s flow: `POST /api/drafts` with the
//  idempotency key and the picker's picks, the typed words parked as the
//  conversation's opener (`StudioManager.pendingOpeners`), then the new
//  draft pushed open — the draft view sends them as the first turn, the
//  way the web's conversation panel does once it has read its record.
//
//  What the web keeps in the URL (the filters, the grouping, the sort)
//  this keeps in the grid's own state: there is no address bar to hold
//  them, and the poll already hands the data down whole.
//

import SwiftUI

/* -------------------------------------------------------------------------- */
/* The view state — studio-view.ts' StudioView minus the panel parameters.    */
/* -------------------------------------------------------------------------- */

/// The kind filter's three segments: everything, diagrams only, videos only.
enum StudioKindFilter: String, CaseIterable {
    case all, diagram, video
    var title: String {
        switch self {
        case .all: return "All"
        case .diagram: return "Diagrams"
        case .video: return "Videos"
        }
    }
}

enum StudioGrouping: String {
    case none, topic, domain
}

enum StudioSort: String {
    case modified, title, created
}

enum StudioDirection {
    case asc, desc
    var sign: Int { self == .asc ? 1 : -1 }
}

enum StudioLayout: String {
    case grid, list
}

/// What Display and Sort decide, held as the grid's state where the web
/// holds a query string (`DEFAULT_VIEW`'s values are the defaults).
struct StudioBrowse: Equatable {
    /// Topic slugs, plus `none`. Multi-select, OR within itself.
    var topics: Set<String> = []
    var query = ""
    var group = StudioGrouping.none
    var sort = StudioSort.modified
    var direction = StudioDirection.desc
    /// Display's "show concept chips".
    var chips = false
    var layout = StudioLayout.grid
    var kind = StudioKindFilter.all
}

/// The chip that stands for "no topic at all". Always shown, always last.
private let NO_TOPIC = "none"

/* -------------------------------------------------------------------------- */
/* Filtering, sorting and grouping — studio-view.ts / studio-video.ts         */
/* -------------------------------------------------------------------------- */

/// One row the chips strip draws, `TopicChip` in studio-view.ts.
struct StudioTopicChip: Identifiable {
    let slug: String
    let label: String
    let domain: String?
    let count: Int
    var id: String { slug }
}

/// The chips: the topics that appear in this corpus, not the whole
/// vocabulary, diagrams and studio videos counted together (the web hands
/// `topicChips` the merged `topiced` list). `No topic` is always last and
/// always present, even at zero: its absence is the thing worth noticing.
func studioTopicChips(
    diagrams: [StudioClient.Diagram],
    videos: [StudioClient.StudioVideo],
    titles: [String: String],
    domains: [String: String]
) -> [StudioTopicChip] {
    var counts: [String: Int] = [:]
    var untopiced = 0
    for topic in diagrams.map(\.topic) + videos.map(\.topic) {
        if let topic { counts[topic, default: 0] += 1 } else { untopiced += 1 }
    }
    // Kept as plain loops: the chained map/sort one-liner timed the
    // type-checker out.
    var chips: [StudioTopicChip] = []
    for (slug, count) in counts {
        chips.append(StudioTopicChip(slug: slug, label: titles[slug] ?? slug, domain: domains[slug], count: count))
    }
    chips.sort { a, b in
        a.count > b.count || (a.count == b.count && a.label.localizedCompare(b.label) == .orderedAscending)
    }
    chips.append(StudioTopicChip(slug: NO_TOPIC, label: "No topic", domain: nil, count: untopiced))
    return chips
}

/// Whether the kind filter lets a diagram or a video through. Job cards
/// follow it too (`showsKind`).
func studioShowsKind(_ filter: StudioKindFilter, _ kind: StudioKindFilter) -> Bool {
    filter == .all || filter == kind
}

private func matchesQuery(_ fields: [String], _ query: String) -> Bool {
    let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
    if needle.isEmpty { return true }
    return fields.contains { $0.lowercased().contains(needle) }
}

/// `filterDiagrams`: the search across name/title/topic/concepts, the
/// topic chips as an OR (a nil topic matches the `none` chip only).
func studioFilterDiagrams(_ diagrams: [StudioClient.Diagram], _ view: StudioBrowse) -> [StudioClient.Diagram] {
    guard studioShowsKind(view.kind, .diagram) else { return [] }
    return diagrams.filter { diagram in
        guard matchesQuery(
            [diagram.name, diagram.title ?? "", diagram.topic ?? ""] + (diagram.concepts ?? []),
            view.query
        ) else { return false }
        if view.topics.isEmpty { return true }
        return diagram.topic == nil ? view.topics.contains(NO_TOPIC) : view.topics.contains(diagram.topic!)
    }
}

/// `filterVideos`: the same chips and search, and none when the kind
/// filter says diagrams.
func studioFilterVideos(_ videos: [StudioClient.StudioVideo], _ view: StudioBrowse) -> [StudioClient.StudioVideo] {
    guard studioShowsKind(view.kind, .video) else { return [] }
    return videos.filter { video in
        if !view.topics.isEmpty && !view.topics.contains(video.topic ?? NO_TOPIC) { return false }
        return matchesQuery([video.title ?? "", video.slug, video.topic ?? ""], view.query)
    }
}

/// Undated sorts last whichever way the arrow points (`timeCompare`):
/// negative means `a` sorts before `b` under `sign`.
private func timeCompare(_ a: String?, _ b: String?, sign: Int) -> Int {
    guard let at = a.flatMap(StudioTime.date) else { return b.flatMap(StudioTime.date) == nil ? 0 : 1 }
    guard let bt = b.flatMap(StudioTime.date) else { return -1 }
    return sign * (at == bt ? 0 : (at < bt ? -1 : 1))
}

/// `sortDiagrams`: title, or the tldr's modified/created stamp. The index
/// keeps ties in the order they arrived, as the browser's stable sort does.
func studioSortDiagrams(_ diagrams: [StudioClient.Diagram], _ view: StudioBrowse) -> [StudioClient.Diagram] {
    let sign = view.direction.sign
    return diagrams.enumerated().sorted { a, b in
        let order: Int
        switch view.sort {
        case .title:
            order = sign * (a.element.title ?? a.element.name).localizedCompare(b.element.title ?? b.element.name).rawValue
        case .created:
            order = timeCompare(a.element.created, b.element.created, sign: sign)
        default:
            order = timeCompare(a.element.tldr?.modified, b.element.tldr?.modified, sign: sign)
        }
        return order < 0 || (order == 0 && a.offset < b.offset)
    }.map(\.element)
}

/// `sortVideos`: title, or the last write for both Modified and Created
/// (a video row has no creation time). Undated last either way.
func studioSortVideos(_ videos: [StudioClient.StudioVideo], _ view: StudioBrowse) -> [StudioClient.StudioVideo] {
    let sign = view.direction.sign
    return videos.enumerated().sorted { a, b in
        let order: Int
        if view.sort == .title {
            order = sign * (a.element.title ?? a.element.slug).localizedCompare(b.element.title ?? b.element.slug).rawValue
        } else {
            order = timeCompare(a.element.updated, b.element.updated, sign: sign)
        }
        return order < 0 || (order == 0 && a.offset < b.offset)
    }.map(\.element)
}

/// One section of the grid: a group's diagrams and its studio videos
/// together (`GridSection` in studio-video.ts).
struct StudioGridSection: Identifiable {
    let key: String
    let label: String
    var diagrams: [StudioClient.Diagram]
    var videos: [StudioClient.StudioVideo]
    var id: String { key }
    var count: Int { diagrams.count + videos.count }
}

/// `groupDiagrams` + `gridSections`: key a diagram by its topic or its
/// topic's domain (`none` when it has neither), a video by `videoGroupKey`'s
/// same rule, then order by label with the no-topic section last.
func studioGridSections(
    diagrams: [StudioClient.Diagram],
    videos: [StudioClient.StudioVideo],
    view: StudioBrowse,
    titles: [String: String],
    domains: [String: String]
) -> [StudioGridSection] {
    func label(for key: String) -> String {
        if key == NO_TOPIC { return view.group == .topic ? "No topic" : "No domain" }
        return view.group == .topic ? (titles[key] ?? key) : key
    }
    var sections: [String: StudioGridSection] = [:]
    var order: [String] = []

    func keyFor(topic: String?) -> String {
        switch view.group {
        case .none: return "all"
        case .topic: return topic ?? NO_TOPIC
        case .domain: return topic.flatMap { domains[$0] } ?? NO_TOPIC
        }
    }

    for diagram in diagrams {
        let key = keyFor(topic: diagram.topic)
        if sections[key] == nil {
            sections[key] = StudioGridSection(key: key, label: key == "all" ? "" : label(for: key), diagrams: [], videos: [])
            order.append(key)
        }
        sections[key]?.diagrams.append(diagram)
    }
    for video in videos {
        let key = keyFor(topic: video.topic)
        if sections[key] == nil {
            sections[key] = StudioGridSection(key: key, label: key == "all" ? "" : label(for: key), diagrams: [], videos: [])
            order.append(key)
        }
        sections[key]?.videos.append(video)
    }
    var list = order.compactMap { sections[$0] }.filter { $0.count > 0 }
    if view.group != .none {
        // The exception sorts last, for the same reason its chip does.
        list.sort {
            if $0.key == NO_TOPIC { return false }
            if $1.key == NO_TOPIC { return true }
            return $0.label.localizedCompare($1.label) == .orderedAscending
        }
    }
    return list
}

/// One tile in a section: a diagram or a studio video (`SectionItem`).
enum StudioSectionItem: Identifiable {
    case diagram(StudioClient.Diagram)
    case video(StudioClient.StudioVideo)
    var id: String {
        switch self {
        case .diagram(let d): return "diagram:\(d.name)"
        case .video(let v): return "video:\(v.slug)"
        }
    }
}

/// `sectionItems`: the two kinds as one list, in the view's Sort — a
/// diagram's key is its title and the time Sort compares (modified or
/// created), a video's its title and its last write.
func studioSectionItems(_ section: StudioGridSection, _ view: StudioBrowse) -> [StudioSectionItem] {
    let sign = view.direction.sign
    struct Keyed {
        let entry: StudioSectionItem
        let title: String
        let time: Date?
        let arrived: Int
    }
    var keyed: [Keyed] = section.videos.enumerated().map {
        Keyed(entry: .video($0.element), title: $0.element.title ?? $0.element.slug, time: StudioTime.date($0.element.updated), arrived: $0.offset)
    }
    keyed += section.diagrams.enumerated().map {
        Keyed(
            entry: .diagram($0.element),
            title: $0.element.title ?? $0.element.name,
            time: StudioTime.date(view.sort == .created ? $0.element.created : $0.element.tldr?.modified),
            arrived: section.videos.count + $0.offset
        )
    }
    keyed.sort { a, b in
        let order: Int
        if view.sort == .title {
            order = sign * a.title.localizedCompare(b.title).rawValue
        } else {
            switch (a.time, b.time) {
            case (nil, nil): order = 0
            case (nil, _): order = 1    // undated last either way
            case (_, nil): order = -1
            case let (at?, bt?): order = sign * (at == bt ? 0 : (at < bt ? -1 : 1))
            }
        }
        return order < 0 || (order == 0 && a.arrived < b.arrived)
    }
    return keyed.map(\.entry)
}

/* -------------------------------------------------------------------------- */
/* Which job the grid shows where — studio-tile-jobs.ts / studio-video.ts     */
/* -------------------------------------------------------------------------- */

/// `JOB_ACTIVE_STATES`: the states still holding a lease.
func studioIsActive(_ state: String) -> Bool {
    ["queued", "running", "awaiting_review"].contains(state)
}

/// `isDiagramJob`: a row from a runner that predates `kind` is a diagram.
func studioIsDiagramJob(_ job: StudioClient.Job) -> Bool { job.jobKind == "diagram" }
func studioIsVideoJob(_ job: StudioClient.Job) -> Bool { job.jobKind == "video" }

/// `shownOnGrid` / `videoShownOnGrid`: live jobs always; a failure only in
/// the window that watched it end and until dismissed — the strip's rule.
func studioShownOnGrid(_ job: StudioClient.Job, ended: Set<String>, dismissed: Set<String>) -> Bool {
    if studioIsActive(job.state) { return true }
    if job.state == "failed" || job.state == "interrupted" {
        return ended.contains(job.jobId) && !dismissed.contains(job.jobId)
    }
    return false
}

/// `jobForTarget`: the newest job drawing onto this diagram's tldr path,
/// when the grid shows it. Newest first, then the rule — a retry accepted
/// after a failure clears the old failure off the tile.
func studioJobForTarget(
    _ jobs: [StudioClient.Job], target: String?,
    ended: Set<String>, dismissed: Set<String>
) -> StudioClient.Job? {
    guard let target else { return nil }
    guard let newest = jobs.first(where: { studioIsDiagramJob($0) && $0.target == target }) else { return nil }
    return studioShownOnGrid(newest, ended: ended, dismissed: dismissed) ? newest : nil
}

/// `newDiagramJobs`: the jobs drawing a diagram the listing has no tile
/// for, one per target — a retry replaces its failed card.
func studioNewDiagramJobs(
    _ jobs: [StudioClient.Job], existingTargets: Set<String>,
    ended: Set<String>, dismissed: Set<String>
) -> [StudioClient.Job] {
    var seen = Set<String>()
    var out: [StudioClient.Job] = []
    for job in jobs {
        guard studioIsDiagramJob(job), let target = job.target else { continue }
        if existingTargets.contains(target) || seen.contains(target) { continue }
        seen.insert(target)
        if studioShownOnGrid(job, ended: ended, dismissed: dismissed) { out.append(job) }
    }
    return out
}

/// `videoJobForSlug`: the newest video job on a landed video's slug (a
/// change), when the grid shows it.
func studioVideoJobForSlug(
    _ jobs: [StudioClient.Job], slug: String,
    ended: Set<String>, dismissed: Set<String>
) -> StudioClient.Job? {
    guard let newest = jobs.first(where: { studioIsVideoJob($0) && $0.slug == slug }) else { return nil }
    return studioShownOnGrid(newest, ended: ended, dismissed: dismissed) ? newest : nil
}

/// `newVideoJobs`: the video jobs making a video the grid has no tile for.
func studioNewVideoJobs(
    _ jobs: [StudioClient.Job], existingSlugs: Set<String>,
    ended: Set<String>, dismissed: Set<String>
) -> [StudioClient.Job] {
    var seen = Set<String>()
    var out: [StudioClient.Job] = []
    for job in jobs {
        guard studioIsVideoJob(job) else { continue }
        let slug = job.slug ?? job.target ?? job.jobId
        if existingSlugs.contains(job.slug ?? "") || seen.contains(job.target ?? slug) { continue }
        seen.insert(job.target ?? slug)
        if studioShownOnGrid(job, ended: ended, dismissed: dismissed) { out.append(job) }
    }
    return out
}

/* -------------------------------------------------------------------------- */
/* What a job's card says — loaderHeadline / videoHeadline / elapsed          */
/* -------------------------------------------------------------------------- */

/// The loader's words, `DOING` in studio-tile-jobs.ts: something happening
/// now, the same seven phases in sentence case.
private let STUDIO_DOING: [String: String] = [
    "reading": "Reading the brief",
    "planning": "Planning the drawing",
    "drawing": "Drawing",
    "linting": "Checking the layout",
    "exporting": "Exporting the SVG",
    "verifying": "Verifying the export",
    "ready": "Ready to review",
]

private let STUDIO_PHASES = ["reading", "planning", "drawing", "linting", "exporting", "verifying", "ready"]

/// `loaderHeadline` for a diagram job.
func studioLoaderHeadline(_ job: StudioClient.Job) -> String {
    if job.state == "queued" { return "Waiting to start" }
    if job.state == "awaiting_review" { return STUDIO_DOING["ready"]! }
    if let phase = job.phase, let words = STUDIO_DOING[phase] { return words }
    return job.state == "running" ? "Starting" : job.state.replacingOccurrences(of: "_", with: " ").capitalized
}

/// `loaderStep`: `Step 3 of 7`, or nil while nothing has started.
/// Never a percentage (D23).
func studioLoaderStep(_ job: StudioClient.Job) -> String? {
    guard job.state == "running", let phase = job.phase,
          let at = STUDIO_PHASES.firstIndex(of: phase) else { return nil }
    return "Step \(at + 1) of \(STUDIO_PHASES.count)"
}

/// The video pipeline's step names, `VIDEO_STEP_NAMES`.
private let VIDEO_STEP_NAMES = ["storyboard", "narration", "setup", "scene-code", "lint", "preview", "look", "build", "check", "poster", "ready"]

/// The video loader's words, `DOING` in studio-video.ts.
private let VIDEO_DOING: [String: String] = [
    "storyboard": "Reading the storyboard",
    "narration": "Voicing the lines",
    "setup": "Setting up",
    "scene-code": "Writing the scenes",
    "lint": "Linting the scenes",
    "preview": "Previewing",
    "look": "Looking at the sheets",
    "build": "Building the video",
    "check": "Checking the video",
    "poster": "Cutting the poster",
    "ready": "Ready to review",
]

/// The steps that repeat in the skill's loop, whose round count is news.
private let VIDEO_REPEATS: Set<String> = ["narration", "scene-code", "lint", "preview", "look", "build"]

/// `currentStep`: the furthest step the runner reports running, else the
/// record's phase when no steps have landed yet (the checkout is still
/// being built and the phase is the step under way).
private func studioVideoCurrentStep(_ job: StudioClient.Job) -> String? {
    guard job.state == "running" else { return nil }
    var at = -1
    for step in job.steps ?? [] where step.state == "running" {
        if let name = step.name, let index = VIDEO_STEP_NAMES.firstIndex(of: name) {
            at = max(at, index)
        }
    }
    if at >= 0 { return VIDEO_STEP_NAMES[at] }
    if let phase = job.phase, VIDEO_STEP_NAMES.contains(phase) { return phase }
    return nil
}

/// `videoHeadline`: what the video job is doing, in sentence case.
func studioVideoHeadline(_ job: StudioClient.Job) -> String {
    if job.state == "queued" { return "Waiting to start" }
    if job.state == "awaiting_review" { return VIDEO_DOING["ready"]! }
    if job.state == "running" && job.cancelRequestedAt != nil { return "Stopping" }
    guard let step = studioVideoCurrentStep(job) else {
        return job.state == "running" ? "Starting" : job.state.replacingOccurrences(of: "_", with: " ").capitalized
    }
    let rounds = (job.steps ?? []).first(where: { $0.name == step })?.rounds ?? 0
    if step == "preview" && rounds > 1 { return "Previewing, round \(rounds)" }
    if VIDEO_REPEATS.contains(step), rounds > 1, let words = VIDEO_DOING[step] {
        return "\(words), round \(rounds)"
    }
    return VIDEO_DOING[step] ?? step.replacingOccurrences(of: "-", with: " ").capitalized
}

/// `videoStepCount`: `Step 6 of 11`, or nil when nothing is running.
func studioVideoStepCount(_ job: StudioClient.Job) -> String? {
    guard let step = studioVideoCurrentStep(job) else { return nil }
    let narrated = (job.steps ?? []).contains { $0.name == "narration" }
    let names = VIDEO_STEP_NAMES.filter { $0 != "narration" || narrated || (job.steps ?? []).isEmpty }
    guard let at = names.firstIndex(of: step) else { return nil }
    return "Step \(at + 1) of \(names.count)"
}

/// `elapsedMs`: how long the job has been going, counting up, stopping
/// when it stops.
func studioElapsedMs(_ job: StudioClient.Job, now: Date = .now) -> Int {
    guard let from = StudioTime.date(job.started ?? job.requested) else { return 0 }
    let to = StudioTime.date(job.finished) ?? now
    return max(0, Int(to.timeIntervalSince(from) * 1000))
}

/// `formatDuration`: `9s`, `1:04`, `12:30`. Coarse below a minute.
func studioFormatDuration(_ ms: Int) -> String {
    let seconds = ms / 1000
    if seconds < 60 { return "\(seconds)s" }
    return "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
}

/// The words a job card's status line leads with: the loader headline by
/// kind, or the failure in one sentence (`rowWords`/`failureLine` — the
/// first clause, capitalised; the panel has the rest).
func studioJobHeadline(_ job: StudioClient.Job) -> String {
    if job.state == "failed" || job.state == "interrupted" {
        let words = (job.error ?? job.note ?? "it \(job.state == "failed" ? "failed" : "was interrupted")")
            .components(separatedBy: ". ").first ?? ""
        return words.isEmpty ? job.state.capitalized : words.prefix(1).uppercased() + String(words.dropFirst())
    }
    return studioIsVideoJob(job) ? studioVideoHeadline(job) : studioLoaderHeadline(job)
}

/// The step line under the headline, by kind, or nil.
func studioJobStep(_ job: StudioClient.Job) -> String? {
    studioIsVideoJob(job) ? studioVideoStepCount(job) : studioLoaderStep(job)
}

/* -------------------------------------------------------------------------- */
/* The composer — HomeComposer.tsx + useStartDraft                            */
/* -------------------------------------------------------------------------- */

/// `isBareTag` for the send block (T15): the text with every tag taken out
/// has no words, in a conversation with no turn yet — a bare tag gives the
/// planner nothing to go on.
func studioSendBlock(_ text: String, emptyConversation: Bool = true) -> String? {
    guard emptyConversation else { return nil }
    let mentions = draftMentions(text)
    guard !mentions.isEmpty else { return nil }
    var chars = Array(text.utf16)
    for mention in mentions.sorted(by: { ($0["start"] as? Int ?? 0) > ($1["start"] as? Int ?? 0) }) {
        if let start = mention["start"] as? Int, let end = mention["end"] as? Int,
           start >= 0, end <= chars.count, start <= end {
            chars.replaceSubrange(start ..< end, with: [])
        }
    }
    let rest = String(decoding: chars, as: UTF16.self).trimmingCharacters(in: .whitespacesAndNewlines)
    return rest.isEmpty ? "Say what it should show" : nil
}

/// The studio's way in (docs/STUDIO-CHAT-FIRST.md, "Home and the
/// full-screen conversation"): the hero line, the box, the kind toggles
/// and the harness/model pickers. Send starts a conversation with these
/// words as its first turn — the draft opens at once and sends them once
/// it has read its record; a refusal keeps the words and says why.
struct StudioHomeComposer: View {
    @Environment(StudioManager.self) private var studio
    @Environment(\.studioPush) private var push

    @State private var text = ""
    @State private var busy = false
    @State private var refusal: String?
    @FocusState private var focused: Bool

    /// The tag tokens the box knows, `DRAFT_KINDS`: a new conversation has
    /// the current runner's kinds — both.
    private let kinds = ["diagram", "video"]

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// `valueSendBlock(value, true)`: empty or a bare tag keeps Send off,
    /// plus the cap (`capFrom` disabling every paid verb).
    private var sendBlock: String? { studioSendBlock(trimmed) }

    private var capped: Bool { studio.health?.dailyCap?.exceeded == true }
    private var sendDisabled: Bool { busy || capped || trimmed.isEmpty || sendBlock != nil }

    /// The reason Send is off, for its help line — busy and the cap say
    /// why; a bare tag's "Say what it should show" reads as one too.
    private var sendReason: String {
        if capped { return "The daily spend cap is reached." }
        if busy { return "Opening the conversation." }
        return sendBlock ?? "Start the conversation"
    }

    /// The video toggle's reason when it cannot be pressed
    /// (`kindUnavailable` over `videoAvailability`): an unavailable kind
    /// can still be taken out, never put in.
    private var videoReason: String? {
        guard let video = studio.health?.video else {
            // A runner that sends no video block predates studio videos
            // (`videoAvailability(undefined)` is not ok, reason null).
            return studio.health == nil ? nil : "Videos are not available on this machine"
        }
        guard !video.ok else { return nil }
        guard let note = video.note else { return "Videos are not available on this machine" }
        return "Videos are unavailable: \(note)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(spacing: 6) {
                Text("What shall we make?")
                    .font(.system(.title, design: .serif, weight: .bold))
                    .foregroundStyle(G.text)
                Text("Talk an idea through, then make it a diagram or a video.")
                    .font(.callout)
                    .foregroundStyle(G.text3)
            }
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .padding(.bottom, 10)

            VStack(spacing: 0) {
                ZStack(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("Describe an idea to draw or animate…")
                            .font(.body)
                            .foregroundStyle(G.text3)
                            .padding(.horizontal, 15)
                            .padding(.vertical, 12)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $text)
                        .font(.body)
                        .foregroundStyle(G.text)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 66, maxHeight: 140)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .focused($focused)
                }

                Divider().overlay(G.border)

                HStack(spacing: 8) {
                    ForEach(kinds, id: \.self) { kind in
                        KindToggle(kind: kind, on: hasTag(kind), reason: kind == "video" ? videoReason : nil) {
                            toggleTag(kind)
                        }
                    }

                    HarnessMenu()
                    ModelMenu()

                    Spacer()

                    if busy {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Button { submit() } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(sendDisabled ? G.text3 : G.btnFace)
                    .disabled(sendDisabled)
                    .help(sendReason)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
            .background(G.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(focused ? G.accent : G.border))

            if let refusal {
                Text("The conversation could not start: \(refusal)")
                    .font(.callout)
                    .foregroundStyle(G.danger)
                    .padding(.horizontal, 4)
            }
        }
        .frame(maxWidth: 640, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .center)
        // Pinned from the top, not centred — the web's own rule, so the
        // composer's spot does not move when the corpus under it changes.
        .padding(.top, 40)
    }

    /// Whether the kind's chip is in the message, `@` included — pressed
    /// state follows the text, so the buttons always say what Send asks for.
    private func hasTag(_ kind: String) -> Bool {
        draftMentions(text).contains { ($0["kind"] as? String) == kind }
    }

    /// `toggleMentionEdit`: a press puts the kind's chip at the start of
    /// the message, or takes its tagged occurrence out (with one following
    /// space). It never sends.
    private func toggleTag(_ kind: String) {
        let token = "@\(kind)"
        if let mention = draftMentions(text).first(where: { ($0["kind"] as? String) == kind }),
           let start = mention["start"] as? Int, let end = mention["end"] as? Int {
            var chars = Array(text.utf16)
            guard start >= 0, end <= chars.count else { return }
            var drop = start ..< end
            if end < chars.count, chars[end] == 0x20 { drop = start ..< end + 1 }
            chars.replaceSubrange(drop, with: [])
            text = String(decoding: chars, as: UTF16.self)
        } else {
            text = text.isEmpty ? "\(token) " : "\(token) \(text)"
        }
        focused = true
    }

    /// `useStartDraft.start(first, model)` + `harness`: create the draft,
    /// park the words as its opener, open it at once — the refresh trails
    /// behind so the list is fresh when a person comes back. A refusal
    /// keeps the text and says why.
    private func submit() {
        let body = trimmed
        guard !busy, !body.isEmpty, sendBlock == nil, !capped else { return }
        busy = true
        refusal = nil
        Task {
            do {
                let id = try await studio.client.createDraft(model: studio.model, harness: studio.harness)
                studio.stashOpener(body, for: id)
                text = ""
                push(.draft(id))
                await studio.refresh()
            } catch let failure as StudioError {
                refusal = failure.errorDescription
            } catch {
                refusal = "The studio did not answer."
            }
            busy = false
        }
    }

    /// A kind's toggle in the box's bottom row: a pill tinted while its
    /// chip is in the message; an unavailable kind dims and keeps its
    /// reason, and a pressed one stays pressable so the chip can come out.
    private struct KindToggle: View {
        let kind: String
        let on: Bool
        let reason: String?
        let action: () -> Void

        private var blocked: Bool { !on && reason != nil }

        var body: some View {
            Button(action: action) {
                Label(kind.capitalized, systemImage: kind == "video" ? "play.rectangle" : "square.on.square")
                    .font(.caption)
                    .foregroundStyle(on ? G.btnText : (blocked ? G.text3 : G.text2))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(on ? G.btnFace : G.surface2, in: Capsule())
            }
            .buttonStyle(.plain)
            .opacity(blocked ? 0.55 : 1)
            .help(reason ?? (kind == "video"
                ? "A narrated animation, one to ten minutes"
                : "Shapes and arrows that show how it fits together"))
        }
    }

    /// The harness picker (`HARNESSES`): remembered for the next
    /// conversation, sent on the draft when it is not the Claude default.
    private struct HarnessMenu: View {
        @Environment(StudioManager.self) private var studio

        private let options: [(value: String, label: String, detail: String)] = [
            ("claude", "Claude", "Anthropic's agent harness. The default."),
            ("codex", "Codex", "OpenAI's agent harness, on your codex login."),
            ("byok", "BYOK", "Your own provider key, run through Qwen Code."),
        ]

        var body: some View {
            Menu {
                ForEach(options, id: \.value) { option in
                    Button {
                        studio.harness = option.value
                    } label: {
                        if studio.harness == option.value {
                            Label(option.label, systemImage: "checkmark")
                        } else {
                            Text(option.label)
                        }
                    }
                    .help(option.detail)
                }
            } label: {
                composerPill(label: options.first(where: { $0.value == studio.harness })?.label ?? studio.harness)
            }
            .menuStyle(.button)
            .buttonStyle(.plain)
            .menuIndicator(.hidden)
            .fixedSize()
        }
    }

    /// The model picker (`harnessModelOptions`): the picked harness's
    /// Lite / Default / Max tiers; BYOK's tiers are the active provider's
    /// configured models, an unconfigured one greyed out, never pickable.
    private struct ModelMenu: View {
        @Environment(StudioManager.self) private var studio

        private struct Tier {
            let value: String
            let label: String
            let detail: String
            let enabled: Bool
        }

        private var tiers: [Tier] {
            switch studio.harness {
            case "byok":
                let configured = studio.health?.agent?.byokTiers
                return [
                    Tier(value: "default", label: "Default", detail: configured?.`default` ?? "not configured", enabled: configured?.`default` != nil),
                    Tier(value: "lite", label: "Lite", detail: configured?.lite ?? "not configured", enabled: configured?.lite != nil),
                    Tier(value: "max", label: "Max", detail: configured?.max ?? "not configured", enabled: configured?.max != nil),
                ]
            case "codex":
                return [
                    Tier(value: "default", label: "Default", detail: "the model your codex login runs", enabled: true),
                    Tier(value: "gpt-6-luna", label: "Lite", detail: "GPT-6 Luna: fast, for everyday asks", enabled: true),
                    Tier(value: "gpt-6-astra", label: "Max", detail: "GPT-6 Astra: frontier, for the hard ones", enabled: true),
                ]
            default:
                return [
                    Tier(value: "default", label: "Default", detail: defaultDetail, enabled: true),
                    Tier(value: "sonnet", label: "Lite", detail: "Sonnet: fast, for everyday asks", enabled: true),
                    Tier(value: "fable", label: "Max", detail: "Fable: the strongest, for hard ones", enabled: true),
                ]
            }
        }

        /// `runnerDefaultOption`'s detail: what each part runs on with no
        /// pick, as far as the runner's `agent` block said.
        private var defaultDetail: String {
            let agent = studio.health?.agent
            let parts = [
                agent?.resolvedTurns.map { "turns: \($0)" },
                agent?.resolvedVideo.map { "video: \($0)" },
                agent?.resolvedDiagram.map { "diagram: \($0)" },
            ].compactMap { $0 }
            return parts.isEmpty ? "each part keeps its own setting" : parts.joined(separator: " · ")
        }

        private var currentLabel: String {
            tiers.first(where: { $0.value == studio.model })?.label ?? studio.model
        }

        var body: some View {
            Menu {
                ForEach(tiers, id: \.value) { tier in
                    Button {
                        studio.model = tier.value
                    } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 6) {
                                Text(tier.label)
                                if studio.model == tier.value { Image(systemName: "checkmark") }
                            }
                            Text(tier.detail)
                                .font(.caption)
                                .foregroundStyle(G.text3)
                        }
                    }
                    .disabled(!tier.enabled)
                }
            } label: {
                composerPill(label: currentLabel)
            }
            .menuStyle(.button)
            .buttonStyle(.plain)
            .menuIndicator(.hidden)
            .fixedSize()
        }
    }

    /// The pickers' shared face: a quiet capsule like the kind pills.
    private static func composerPill(label: String) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(G.text2)
            Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 8, weight: .medium))
                .foregroundStyle(G.text3)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(G.surface2, in: Capsule())
    }
}

/* -------------------------------------------------------------------------- */
/* The grid — StudioBrowse.tsx: the toolbar, the sections, the tiles          */
/* -------------------------------------------------------------------------- */

/// The toolbar and the corpus grid, drawn from what the poll holds. The
/// jobs making something new lead the first section; a job drawing on a
/// tile it has rides that tile; and a landed artifact opens the surface's
/// own detail (the diagram view's canvas included).
struct StudioArtifactGrid: View {
    @Environment(StudioManager.self) private var studio
    @State private var browse = StudioBrowse()

    private var diagrams: [StudioClient.Diagram] { studio.listing?.diagrams ?? [] }
    private var videos: [StudioClient.StudioVideo] { studio.videos }

    private var sections: [StudioGridSection] {
        studioGridSections(
            diagrams: studioSortDiagrams(studioFilterDiagrams(diagrams, browse), browse),
            videos: studioSortVideos(studioFilterVideos(videos, browse), browse),
            view: browse,
            titles: studio.topics,
            domains: studio.topicDomains
        )
    }

    /// Every diagram's tldr path and every landed slug, filtered or not:
    /// a job drawing onto one of these rides its tile; any other target is
    /// a new artifact's lead card (`newDiagramJobs`/`newVideoJobs`).
    private var existingTargets: Set<String> { Set(diagrams.compactMap(\.tldr?.path)) }
    private var existingSlugs: Set<String> { Set(videos.map(\.slug)) }

    private var leadDiagramJobs: [StudioClient.Job] {
        studioShowsKind(browse.kind, .diagram)
            ? studioNewDiagramJobs(studio.jobs, existingTargets: existingTargets, ended: studio.endedJobs, dismissed: studio.dismissedJobs)
            : []
    }
    private var leadVideoJobs: [StudioClient.Job] {
        studioShowsKind(browse.kind, .video)
            ? studioNewVideoJobs(studio.jobs, existingSlugs: existingSlugs, ended: studio.endedJobs, dismissed: studio.dismissedJobs)
            : []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            toolbar
            chipsRow
            grid
        }
    }

    /// The first control row, `StudioToolbar`'s left half: the kind
    /// segments and the search.
    private var toolbar: some View {
        HStack(alignment: .center, spacing: 12) {
            Picker("Kind", selection: $browse.kind) {
                ForEach(StudioKindFilter.allCases, id: \.self) { kind in
                    Text(kind.title).tag(kind)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 220)

            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.caption)
                    .foregroundStyle(G.text3)
                TextField("Search", text: $browse.query)
                    .textFieldStyle(.plain)
                    .font(.callout)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border))
            .frame(width: 220)

            Spacer()
            SectionHead(
                title: "Artifacts",
                count: sections.reduce(0) { $0 + $1.count },
                tail: browse == StudioBrowse() ? nil : "filtered"
            )
        }
    }

    /// `TopicChips` plus the two menus, the toolbar's right half: named
    /// chips most-used first, an overflow "+N" menu past five, `No topic`
    /// always last, then Display and Sort.
    private var chipsRow: some View {
        let chips = studioTopicChips(diagrams: diagrams, videos: videos, titles: studio.topics, domains: studio.topicDomains)
        let named = chips.filter { $0.slug != NO_TOPIC }
        let none = chips.first(where: { $0.slug == NO_TOPIC })!
        return HStack(alignment: .center, spacing: 8) {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ForEach(named.prefix(5)) { chip in
                        chipButton(chip)
                    }
                    if named.count > 5 {
                        Menu {
                            ForEach(named.dropFirst(5)) { chip in
                                Button {
                                    toggleTopic(chip.slug)
                                } label: {
                                    if browse.topics.contains(chip.slug) {
                                        Label("\(chip.label) (\(chip.count))", systemImage: "checkmark")
                                    } else {
                                        Text("\(chip.label) (\(chip.count))")
                                    }
                                }
                            }
                        } label: {
                            Text("+\(named.count - 5)")
                                .font(.caption)
                                .foregroundStyle(G.text2)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(G.surface2, in: Capsule())
                        }
                        .menuStyle(.borderlessButton)
                        .fixedSize()
                    }
                    chipButton(none)
                }
            }
            .scrollIndicators(.never)

            Spacer()
            DisplayMenu(browse: $browse)
            SortMenu(browse: $browse)
        }
    }

    private func chipButton(_ chip: StudioTopicChip) -> some View {
        Chip(
            label: "\(chip.label) (\(chip.count))",
            on: browse.topics.contains(chip.slug)
        ) { toggleTopic(chip.slug) }
    }

    /// `toggleTopic`: clicking a chip adds or removes it.
    private func toggleTopic(_ slug: String) {
        if browse.topics.contains(slug) { browse.topics.remove(slug) } else { browse.topics.insert(slug) }
    }

    @ViewBuilder
    private var grid: some View {
        if studio.listing == nil && studio.listingError == nil {
            // The first read is still in flight: an empty directory claim
            // this early would be a lie, so the grid waits for it.
            ProgressView()
                .controlSize(.small)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 30)
        } else if sections.isEmpty {
            // Empty, with no job making anything: no frame at all.
            leadJobs
            if diagrams.isEmpty, (studio.listing?.errors ?? []).isEmpty, videos.isEmpty {
                // U1: the directory exists and has nothing in it.
                VStack(alignment: .leading, spacing: 6) {
                    Text("No diagrams yet")
                        .font(.callout.weight(.medium))
                        .foregroundStyle(G.text)
                    if let dir = studio.listing?.dir {
                        Text(dir)
                            .font(.caption.monospaced())
                            .foregroundStyle(G.text3)
                            .textSelection(.enabled)
                    }
                    Text("Start a job to draw one. A diagram needs a topic from the vocabulary before the catalog will take it, so give it one when you make it.")
                        .font(.callout)
                        .foregroundStyle(G.text3)
                }
                .padding(16)
                .frame(maxWidth: 420, alignment: .leading)
                .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
            } else {
                HStack(spacing: 6) {
                    Text(browse.kind == .video
                        ? "No video matches this filter."
                        : browse.kind == .diagram || videos.isEmpty
                            ? "No diagram matches this filter."
                            : "No diagram or video matches this filter.")
                        .font(.callout)
                        .foregroundStyle(G.text2)
                    Button("Clear it") { browse = StudioBrowse() }
                        .buttonStyle(.plain)
                        .font(.callout)
                        .foregroundStyle(G.accentText)
                }
            }
        } else {
            ForEach(Array(sections.enumerated()), id: \.element.id) { index, section in
                VStack(alignment: .leading, spacing: 8) {
                    if !section.label.isEmpty {
                        Text("\(section.label) · \(section.count)")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(G.text3)
                    }
                    if browse.layout == .grid {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200, maximum: 260), spacing: 14)], spacing: 14) {
                            if index == 0 { leadJobs }
                            ForEach(studioSectionItems(section, browse)) { item in
                                artifactTile(item)
                            }
                        }
                    } else {
                        let items = studioSectionItems(section, browse)
                        let hasLead = index == 0 && !(leadDiagramJobs.isEmpty && leadVideoJobs.isEmpty)
                        VStack(spacing: 0) {
                            if index == 0 { leadJobs }
                            ForEach(Array(items.enumerated()), id: \.element.id) { at, entry in
                                if at > 0 || hasLead {
                                    Divider().overlay(G.hair).padding(.leading, 12)
                                }
                                artifactRow(entry)
                            }
                        }
                        .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                    }
                }
            }
        }
    }

    /// The jobs making something new, leading the first section — the way
    /// in is the composer above the grid (D81). They follow the kind
    /// filter: a new diagram's job is a diagram.
    @ViewBuilder
    private var leadJobs: some View {
        ForEach(leadDiagramJobs) { job in
            NewJobCard(job: job, list: browse.layout == .list)
        }
        ForEach(leadVideoJobs) { job in
            NewJobCard(job: job, list: browse.layout == .list)
        }
    }

    @ViewBuilder
    private func artifactTile(_ item: StudioSectionItem) -> some View {
        switch item {
        case .diagram(let diagram):
            StudioDiagramTile(
                diagram: diagram,
                job: studioJobForTarget(
                    studio.jobs, target: diagram.tldr?.path,
                    ended: studio.endedJobs, dismissed: studio.dismissedJobs
                ),
                showConcepts: browse.chips
            )
        case .video(let video):
            StudioVideoTile(
                video: video,
                job: studioVideoJobForSlug(
                    studio.jobs, slug: video.slug,
                    ended: studio.endedJobs, dismissed: studio.dismissedJobs
                ),
                showConcepts: browse.chips
            )
        }
    }

    @ViewBuilder
    private func artifactRow(_ item: StudioSectionItem) -> some View {
        switch item {
        case .diagram(let diagram):
            StudioDiagramRow(diagram: diagram, showConcepts: browse.chips)
        case .video(let video):
            NavigationLink(value: AppDestination.asset(video.assetId ?? "video:\(video.slug)")) {
                VideoRow(video: video)
            }
            .buttonStyle(.plain)
        }
    }
}

/* -------------------------------------------------------------------------- */
/* The controls' menus — DisplayMenu / SortMenu in StudioControls.tsx         */
/* -------------------------------------------------------------------------- */

/// `DisplayMenu`: the grouping, the layout, and the concept-chips flag.
private struct DisplayMenu: View {
    @Binding var browse: StudioBrowse

    var body: some View {
        Menu {
            Section("Group by") {
                menuItem("No grouping", on: browse.group == .none) { browse.group = .none }
                menuItem("Topic", on: browse.group == .topic) { browse.group = .topic }
                menuItem("Domain", on: browse.group == .domain) { browse.group = .domain }
            }
            Section("Layout") {
                menuItem("Grid", on: browse.layout == .grid) { browse.layout = .grid }
                menuItem("List", on: browse.layout == .list) { browse.layout = .list }
            }
            Section("Fields") {
                menuItem("Concept chips", on: browse.chips) { browse.chips.toggle() }
            }
        } label: {
            menuPill("Display")
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
    }

    private func menuItem(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            if on { Label(label, systemImage: "checkmark") } else { Text(label) }
        }
    }
}

/// `SortMenu`: what orders the tiles, and which way the arrow points.
private struct SortMenu: View {
    @Binding var browse: StudioBrowse

    var body: some View {
        Menu {
            Section("Sort by") {
                menuItem("Last modified", on: browse.sort == .modified) { browse.sort = .modified }
                menuItem("Created", on: browse.sort == .created) { browse.sort = .created }
                menuItem("Title", on: browse.sort == .title) { browse.sort = .title }
            }
            Section("Order") {
                menuItem(
                    browse.sort == .title ? "A to Z" : "Newest first",
                    on: browse.direction == .desc
                ) { browse.direction = .desc }
                menuItem(
                    browse.sort == .title ? "Z to A" : "Oldest first",
                    on: browse.direction == .asc
                ) { browse.direction = .asc }
            }
        } label: {
            menuPill("Sort")
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
    }

    private func menuItem(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            if on { Label(label, systemImage: "checkmark") } else { Text(label) }
        }
    }
}

/// The Display/Sort triggers' shared face, matching the chips.
private func menuPill(_ label: String) -> some View {
    HStack(spacing: 4) {
        Text(label)
            .font(.caption)
            .foregroundStyle(G.text2)
        Image(systemName: "chevron.up.chevron.down")
            .font(.system(size: 8, weight: .medium))
            .foregroundStyle(G.text3)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 4)
    .background(G.surface, in: Capsule())
    .overlay(Capsule().stroke(G.border))
}

/* -------------------------------------------------------------------------- */
/* The tiles                                                                  */
/* -------------------------------------------------------------------------- */

/// The status strip a job draws under its tile: the state dot, the
/// headline, the step count and the clock — the web tile's loader strip,
/// as a separate press that opens the job while the tile still opens the
/// artifact.
private struct TileJobStrip: View {
    @Environment(\.studioPush) private var push
    let job: StudioClient.Job

    private var tint: Color {
        switch job.state {
        case "awaiting_review": return G.streak
        case "failed": return G.danger
        case "interrupted": return G.warnText
        default: return G.accent
        }
    }

    var body: some View {
        Button { push(.job(job.jobId)) } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(tint)
                    .frame(width: 6, height: 6)
                Text(studioJobHeadline(job))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(G.text)
                    .lineLimit(1)
                if let step = studioJobStep(job) {
                    Text(step)
                        .font(.caption2)
                        .foregroundStyle(G.text3)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                TimelineView(.periodic(from: .now, by: 5)) { context in
                    Text(studioFormatDuration(studioElapsedMs(job, now: context.date)))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(G.text3)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(G.surface2, in: Capsule())
        }
        .buttonStyle(.plain)
        .help("\(job.state.replacingOccurrences(of: "_", with: " ")). Open the job")
    }
}

/// A diagram tile plus the job strip its drawing job puts under it — the
/// tile stays the diagram's link; the strip is the job's.
private struct StudioDiagramTile: View {
    let diagram: StudioClient.Diagram
    let job: StudioClient.Job?
    let showConcepts: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            DiagramTile(diagram: diagram)
            if let job {
                TileJobStrip(job: job)
            }
            if showConcepts, let concepts = diagram.concepts, !concepts.isEmpty {
                Text(concepts.prefix(3).joined(separator: " · "))
                    .font(.caption2)
                    .foregroundStyle(G.text3)
                    .lineLimit(1)
            }
        }
    }
}

/// A studio video's tile: a dark frame with the play glyph and the
/// duration, the title and the topic under it, the library asset page
/// behind it — and the same job strip when a change is on it.
private struct StudioVideoTile: View {
    @Environment(StudioManager.self) private var studio
    let video: StudioClient.StudioVideo
    let job: StudioClient.Job?
    let showConcepts: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            NavigationLink(value: AppDestination.asset(video.assetId ?? "video:\(video.slug)")) {
                VStack(alignment: .leading, spacing: 8) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(G.surface2)
                        Image(systemName: "play.circle")
                            .font(.title)
                            .foregroundStyle(G.text3)
                        if let seconds = video.durationSeconds {
                            VStack {
                                Spacer()
                                HStack {
                                    Spacer()
                                    Text(String(format: "%d:%02d", Int(seconds) / 60, Int(seconds) % 60))
                                        .font(.caption2.monospacedDigit())
                                        .foregroundStyle(G.text2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(.regularMaterial, in: Capsule())
                                        .padding(6)
                                }
                            }
                        }
                    }
                    .aspectRatio(480.0 / 340.0, contentMode: .fit)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border))

                    Text(video.title ?? video.slug)
                        .font(.callout.weight(.medium))
                        .foregroundStyle(G.text)
                        .lineLimit(2)

                    HStack(spacing: 6) {
                        if let topic = video.topic {
                            Text(studio.topics[topic] ?? topic)
                                .font(.caption2)
                                .foregroundStyle(G.text2)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(G.surface2, in: Capsule())
                        }
                        Text("video")
                            .font(.caption2)
                            .foregroundStyle(G.text3)
                        Spacer()
                        Text(StudioTime.ago(video.updated))
                            .font(.caption2)
                            .foregroundStyle(G.text3)
                    }
                }
            }
            .buttonStyle(.plain)
            if let job {
                TileJobStrip(job: job)
            }
            if showConcepts, let concepts = video.concepts, !concepts.isEmpty {
                Text(concepts.prefix(3).joined(separator: " · "))
                    .font(.caption2)
                    .foregroundStyle(G.text3)
                    .lineLimit(1)
            }
        }
    }
}

/// A diagram as a list row — the list layout's counterpart of the tile.
private struct StudioDiagramRow: View {
    @Environment(StudioManager.self) private var studio
    let diagram: StudioClient.Diagram
    let showConcepts: Bool

    var body: some View {
        NavigationLink(value: StudioPick.diagram(diagram.name)) {
            HStack(spacing: 10) {
                Image(systemName: "square.on.square")
                    .font(.callout)
                    .foregroundStyle(G.accentText)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(diagram.title ?? diagram.name)
                        .font(.callout.weight(.medium))
                        .foregroundStyle(G.text)
                        .lineLimit(1)
                    if showConcepts, let concepts = diagram.concepts, !concepts.isEmpty {
                        Text(concepts.prefix(3).joined(separator: " · "))
                            .font(.caption2)
                            .foregroundStyle(G.text3)
                            .lineLimit(1)
                    }
                }
                if let topic = diagram.topic {
                    Text(studio.topics[topic] ?? topic)
                        .font(.caption2)
                        .foregroundStyle(G.text2)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(G.surface2, in: Capsule())
                }
                Spacer()
                if diagram.svgState == "stale" {
                    Text("stale svg")
                        .font(.caption2)
                        .foregroundStyle(G.warnText)
                } else if diagram.svgState == "missing" {
                    Text("no svg")
                        .font(.caption2)
                        .foregroundStyle(G.text3)
                }
                Text(StudioTime.ago(diagram.tldr?.modified))
                    .font(.caption)
                    .foregroundStyle(G.text3)
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(G.text3)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A lead job's card: something the corpus does not have yet, being made.
/// `NewDiagramJobs`/`NewVideoJobs` in the web: the kind badge, the title
/// it will land as, the loader headline and the clock, pressing through
/// to the job. A failed one waits for its dismiss.
private struct NewJobCard: View {
    @Environment(StudioManager.self) private var studio
    @Environment(\.studioPush) private var push
    let job: StudioClient.Job
    let list: Bool

    private var failed: Bool { job.state == "failed" || job.state == "interrupted" }

    var body: some View {
        if list {
            row
        } else {
            card
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            Button { push(.job(job.jobId)) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(job.title ?? job.targetSlug ?? "a new \(job.jobKind)")
                        .font(.callout.weight(.medium))
                        .foregroundStyle(G.text)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text(studioJobHeadline(job))
                        .font(.caption)
                        .foregroundStyle(failed ? G.danger : G.accentText)
                        .lineLimit(2)
                    if let note = studio.latestNote(job.jobId) {
                        Text(note)
                            .font(.caption2)
                            .foregroundStyle(G.text3)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(failed ? G.danger.opacity(0.4) : G.border))
    }

    private var row: some View {
        HStack(spacing: 10) {
            Button { push(.job(job.jobId)) } label: {
                HStack(spacing: 10) {
                    StatePill(state: job.state)
                    Text(job.jobKind)
                        .font(.caption)
                        .foregroundStyle(G.text3)
                    Text(job.title ?? job.targetSlug ?? job.jobId)
                        .font(.callout)
                        .foregroundStyle(G.text)
                        .lineLimit(1)
                    Text(studioJobHeadline(job))
                        .font(.caption)
                        .foregroundStyle(failed ? G.danger : G.accentText)
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(G.text3)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            dismissButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
    }

    private var header: some View {
        HStack(spacing: 6) {
            StatePill(state: job.state)
            Text(job.jobKind)
                .font(.caption2.weight(.medium))
                .foregroundStyle(G.text2)
                .padding(.horizontal, 7)
                .padding(.vertical, 2.5)
                .background(G.surface2, in: Capsule())
            Spacer()
            dismissButton
            TimelineView(.periodic(from: .now, by: 5)) { context in
                Text(studioFormatDuration(studioElapsedMs(job, now: context.date)))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(G.text3)
            }
        }
    }

    /// The dismiss the web's failed card carries: the card stays on the
    /// grid until a person takes it off (`dismissed`).
    @ViewBuilder
    private var dismissButton: some View {
        if failed {
            Button {
                studio.dismiss(jobId: job.jobId)
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(G.text3)
            }
            .buttonStyle(.plain)
            .help("Take it off the grid")
        }
    }
}
