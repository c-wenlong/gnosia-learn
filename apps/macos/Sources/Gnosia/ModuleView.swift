//
//  ModuleView.swift
//  Gnosia
//
//  One module of a course, as the web's course home draws it (ModuleMain +
//  ModulePath): the title and meta row, the topic's summary, the learning
//  objectives behind a toggle, then the module as one ordered path — Watch,
//  Read alongside, one lesson per checklist item with its videos, concept
//  steps and readings, Practice, and the module check — and the links to the
//  modules either side.
//
//  The placement rules are modulePath's (apps/web/src/lib/module-path.ts),
//  minus what needs the knowledge base: the course's own `videos:` lists
//  first, then each concept step's `asset_concept` links, then the module
//  topic's videos as the Watch fallback — and a video places once. Learner
//  state draws only what learner.db can write back: the tick on each topic
//  row, and in the open panel its "Mark done" and the "Your note" field —
//  the web TopicRow's scratch note, debounced the way the web saves it.
//  Mastery marks, locks and sessions stay off — the app cannot write them,
//  so it does not pretend.
//

import SwiftUI

/// The kinds a concept step can place: what a learner opens, not sidecars —
/// STEP_KINDS in apps/web/src/lib/course-assets.ts.
private let stepKinds: Set<String> = ["video", "diagram_svg"]

struct ModuleView: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner: LearnerStore?
    let course: CatalogCourse
    let module: CourseModule
    /// The module's place in `course.modules`.
    let index: Int
    let onNavigate: (Int) -> Void

    /// The module's path, resolved against the catalog the way modulePath
    /// does it: listed videos where they are listed, concept assets on the
    /// first step naming them, the topic's videos last and only while the
    /// fallback's rule holds.
    private var path: ModulePathModel {
        var placed = Set<String>()
        func resolve(_ ids: [String]) -> [CatalogAsset] {
            ids.compactMap { id in
                guard let asset = store.listedVideo(id), !placed.contains(asset.id) else { return nil }
                placed.insert(asset.id)
                return asset
            }
        }

        var watch = resolve(module.videos)
        let lessonVideos = module.items.map { resolve($0.videos) }
        let listsOne = !placed.isEmpty

        // Readings: module material, a lesson's, or practice. A lesson id the
        // module does not hold is ignored — placed as though it named none.
        let position = Dictionary(uniqueKeysWithValues: module.items.enumerated().map { ($0.element.id, $0.offset) })
        var readAlongside: [CourseResource] = []
        var practice: [CourseResource] = []
        var lessonReadings = module.items.map { _ in [CourseResource]() }
        var closing = module.items.map { _ in [CourseResource]() }
        for resource in module.resources {
            let at = resource.lessons.compactMap { position[$0] }
            if resource.type == "practice" {
                if let last = at.max() { closing[last].append(resource) } else { practice.append(resource) }
            } else if at.isEmpty {
                readAlongside.append(resource)
            } else {
                for i in Set(at) { lessonReadings[i].append(resource) }
            }
        }

        let lessons = module.items.enumerated().map { i, item in
            ModulePathModel.Lesson(
                item: item,
                videos: lessonVideos[i],
                steps: item.concepts.map { slug in
                    var own: [CatalogAsset] = []
                    for asset in store.assetsLinked(concept: slug) where stepKinds.contains(asset.kind) {
                        guard !placed.contains(asset.id) else { continue }
                        placed.insert(asset.id)
                        own.append(asset)
                    }
                    return ModulePathModel.Step(
                        slug: slug,
                        title: store.conceptTitle(slug) ?? slug,
                        assets: own
                    )
                },
                readings: lessonReadings[i] + closing[i]
            )
        }

        // The topic's videos last, as the fallback: never on a shared topic
        // once the module's own lists resolved a video.
        if !(store.topicShared(byModule: module.id) && listsOne) {
            for asset in store.assetsTagged(module.topic) where asset.kind == "video" {
                if !placed.contains(asset.id) {
                    placed.insert(asset.id)
                    watch.append(asset)
                }
            }
        }

        // The week check asks the module's concepts the catalog holds, as the
        // web page counts them.
        var taught = Set<String>()
        for item in module.items { taught.formUnion(item.concepts) }
        let checked = taught.filter { store.conceptTitle($0) != nil }.count
        return ModulePathModel(
            watch: watch,
            readAlongside: readAlongside,
            lessons: lessons,
            practice: practice,
            checkConcepts: checked
        )
    }

    private var conceptCount: Int {
        Set(module.items.flatMap(\.concepts)).count
    }

    /// "5 topics · 12 concepts · 3 assets · 2 of 5 done" — moduleMeta in
    /// course-path.ts, with the done count now that ticks are writable. The
    /// word is "done" not "mastered": these are the learner's own ticks,
    /// and doneWord's "mastered" is for marks mastery sets.
    private var metaLine: [String] {
        var parts = ["\(module.items.count) \(module.items.count == 1 ? "topic" : "topics")"]
        if conceptCount > 0 {
            parts.append("\(conceptCount) \(conceptCount == 1 ? "concept" : "concepts")")
        }
        let assets = store.moduleAssetCount(topicSlug: module.topic)
        if assets > 0 {
            parts.append("\(assets) \(assets == 1 ? "asset" : "assets")")
        }
        if !module.items.isEmpty {
            parts.append("\(store.itemsDone(in: module)) of \(module.items.count) done")
        }
        return parts
    }

    /// "Show learning objectives": every item's subtopics in order, each once
    /// (moduleObjectives in course-path.ts).
    private var objectives: [String] {
        var seen = Set<String>()
        return module.items.flatMap(\.subtopics).map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                if !module.topic.isEmpty, let description = store.topicSummary(module.topic), !description.isEmpty {
                    Text(description).font(.body)
                }

                if !objectives.isEmpty {
                    DisclosureGroup("Learning objectives") {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(objectives.enumerated()), id: \.offset) { i, item in
                                Text("\(i + 1). \(item)").font(.callout)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 6)
                    }
                }

                modulePath

                neighbours
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle(module.title)
        .onAppear {
            // The web's VisitTracker: opening a module page is a `visit`
            // event, the row Recent's module rows and the Courses
            // section's resume lines fold from. learner.db keeps it; the
            // catalog re-read picks it up.
            learner?.recordVisit(courseSlug: course.slug, moduleSlug: module.slug)
            store.refreshLearner()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Module \(module.order) of \(course.modules.count)")
                .font(.callout)
                .foregroundStyle(.secondary)
            Text(module.title)
                .font(.title2).bold()
            HStack(spacing: 14) {
                ForEach(metaLine, id: \.self) { part in
                    Text(part).font(.callout).foregroundStyle(.secondary)
                }
            }
        }
    }

    /// The ordered path: the groups the web draws, in its order. Empty groups
    /// leave no heading, as ItemGroup does.
    @ViewBuilder
    private var modulePath: some View {
        let path = self.path
        if !path.watch.isEmpty {
            ItemGroup(title: "Watch") {
                ForEach(path.watch) { AssetRow(asset: $0) }
            }
        }
        if !path.readAlongside.isEmpty {
            ItemGroup(title: "Read alongside") {
                ForEach(path.readAlongside) { ResourceRow(resource: $0) }
            }
        }
        if module.items.isEmpty {
            Text("This module has no topics yet.")
                .font(.callout)
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(path.lessons, id: \.item.id) { lesson in
                    LessonRow(lesson: lesson, subtopics: lesson.item.subtopics)
                }
            }
        }
        if !path.practice.isEmpty {
            ItemGroup(title: "Practice") {
                ForEach(path.practice) { ResourceRow(resource: $0) }
            }
        }
        if path.checkConcepts > 0 {
            // The web row links to the module's check session; the session
            // surfaces are learner-side, so here it is a line, not a link.
            HStack(spacing: 10) {
                Image(systemName: "checkmark.circle")
                    .foregroundStyle(.secondary)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Module check").font(.callout.bold())
                    Text("\(path.checkConcepts) concepts · up to \(min(24, 3 * path.checkConcepts)) questions")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.top, 4)
        }
    }

    /// The modules either side, after the web page's "Other modules" nav.
    private var neighbours: some View {
        HStack {
            if index > 0 {
                let previous = course.modules[index - 1]
                Button { onNavigate(index - 1) } label: {
                    Label("Previous module", systemImage: "chevron.left")
                    Text("\(previous.order). \(previous.title)").lineLimit(1)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
            Spacer()
            if index + 1 < course.modules.count {
                let next = course.modules[index + 1]
                Button { onNavigate(index + 1) } label: {
                    Text("\(next.order). \(next.title)").lineLimit(1)
                    Label("Next module", systemImage: "chevron.right")
                        .labelStyle(.titleAndIcon)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        }
        .font(.callout)
    }
}

/// One lesson of the path: the item's row (status mark, title, "N
/// concepts"), the open panel with Covers and the tick — the web TopicRow's
/// "Mark done" checkbox — and under it the lesson's videos, its concept
/// steps and its readings.
private struct LessonRow: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner: LearnerStore?
    let lesson: ModulePathModel.Lesson
    let subtopics: [String]

    @State private var open = false

    /// Ticked, on the merged read — snapshot rows plus this app's own.
    private var done: Bool { store.isDone(lesson.item.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { open.toggle() }
            } label: {
                HStack(spacing: 10) {
                    // The web's TopicMarkIcon: a filled disc with a tick when
                    // done, an empty ring when not. (It would also show
                    // mastery's "learning" dot; mastery is read-only here
                    // and the mark stays the tick's.)
                    Image(systemName: done ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(done ? Color.accentColor : Color(.tertiaryLabelColor))
                        .frame(width: 18)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(lesson.item.title).font(.callout.bold())
                        Text(meta)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: open ? "chevron.down" : "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if open {
                VStack(alignment: .leading, spacing: 8) {
                    if !subtopics.isEmpty {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Covers")
                                .font(.caption.bold())
                                .foregroundStyle(.secondary)
                            ForEach(subtopics, id: \.self) { s in
                                Text("· \(s)").font(.callout).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Toggle(isOn: Binding(
                        get: { done },
                        set: { tick in
                            learner?.setProgress(lesson.item.id, completed: tick)
                            store.refreshLearner()
                        }
                    )) {
                        Text("Mark done").font(.callout)
                    }
                    .toggleStyle(.checkbox)

                    // The web TopicRow panel's "Your note" field: a textarea
                    // that saves 400ms after the last keystroke, and at once
                    // on blur — here when the field loses focus or the panel
                    // folds away with an edit pending.
                    ItemNoteField(
                        itemID: lesson.item.id,
                        saved: store.progressMark(for: lesson.item.id)?.note ?? ""
                    )
                }
                .padding(.leading, 28)
                .padding(.top, 4)
            }

            // The lesson's steps sit under the row, indented as the web nests
            // them: its videos, a step per concept, then its readings.
            VStack(alignment: .leading, spacing: 2) {
                ForEach(lesson.videos) { AssetRow(asset: $0) }
                ForEach(lesson.steps, id: \.slug) { step in
                    ConceptStepRow(step: step)
                }
                ForEach(lesson.readings) { ResourceRow(resource: $0) }
            }
            .padding(.leading, 28)
        }
        .padding(.vertical, 4)
    }

    /// "3 concepts", "3 concepts · Done" — topicMeta in course-path.ts for a
    /// row whose standing is the tick's (the web's "Learning" word is
    /// mastery's, which stays off here).
    private var meta: String {
        let base = "\(lesson.item.concepts.count) \(lesson.item.concepts.count == 1 ? "concept" : "concepts")"
        return done ? "\(base) · Done" : base
    }
}

/// The scratch note on one checklist item — the "Your note" textarea in the
/// web TopicRow's panel (TopicRow.tsx in course-home). Saved like the web
/// field is: 400ms after the last keystroke, and at once when the field
/// loses focus or the panel folds away, so a close inside the debounce never
/// drops the last edit. The write is setNote's (`learner.setNote` into
/// learner.db, then the merged progress re-read); an emptied note clears the
/// column, as the web's does.
private struct ItemNoteField: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner: LearnerStore?
    let itemID: String
    /// The merged note the store held when the field mounted — the draft's
    /// seed and the line a change is measured against, so a save only ever
    /// fires on a real edit.
    let saved: String

    @State private var draft: String
    @State private var pendingSave: Task<Void, Never>?
    @FocusState private var focused: Bool

    init(itemID: String, saved: String) {
        self.itemID = itemID
        self.saved = saved
        _draft = State(initialValue: saved)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Your note")
                .font(.caption.bold())
                .foregroundStyle(.secondary)
            ZStack(alignment: .topLeading) {
                if draft.isEmpty {
                    Text("Personal notes for this topic")
                        .font(.callout)
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 14)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $draft)
                    .font(.callout)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 8)
                    .frame(minHeight: 64)
                    .focused($focused)
            }
            .background(G.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border, lineWidth: 1))
        }
        .onChange(of: draft) { _, text in
            pendingSave?.cancel()
            guard text != saved else { return }
            pendingSave = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                flush(text)
            }
        }
        // The web field's blur flush: leaving the field or folding the row
        // writes whatever the debounce had not yet.
        .onChange(of: focused) { _, on in
            if !on { pendingSave?.cancel(); flush(draft) }
        }
        .onDisappear {
            pendingSave?.cancel()
            flush(draft)
        }
    }

    /// The one write — a no-op when the draft is what the store already
    /// holds, so the blur and fold flushes do not write twice.
    private func flush(_ text: String) {
        guard text != saved else { return }
        learner?.setNote(itemID, note: text)
        store.refreshLearner()
    }
}

/// A concept's step: the note's title over its slug, and under it the
/// diagrams and videos its `asset_concept` rows placed — the note link and
/// Quiz me are learner-side surfaces, so the row goes nowhere yet.
private struct ConceptStepRow: View {
    let step: ModulePathModel.Step

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 10) {
                Image(systemName: "doc.text")
                    .foregroundStyle(.secondary)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text(step.title).font(.callout)
                    Text("Note · \(step.slug)")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
            }
            ForEach(step.assets) { AssetRow(asset: $0) }
        }
        .padding(.vertical, 2)
    }
}

/// One linked path row for an asset: the kind's icon, the title, the kind
/// label — the web's StepRow. A video pushes VideoDetailView; anything else
/// lists without a destination (the library surface owns diagrams and the
/// rest).
private struct AssetRow: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset

    var body: some View {
        if asset.kind == "video" {
            NavigationLink(value: asset) {
                rowLabel
            }
            .buttonStyle(.plain)
        } else {
            rowLabel
        }
    }

    private var rowLabel: some View {
        HStack(spacing: 10) {
            Image(systemName: kindIcon)
                .foregroundStyle(.secondary)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 1) {
                Text(store.displayTitle(for: asset)).font(.callout).multilineTextAlignment(.leading)
                Text(assetKindLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
    }

    /// familyOf in apps/web/src/components/asset-meta.ts, as SF Symbols.
    private var kindIcon: String {
        switch asset.kind {
        case "video", "pdf": return "play.rectangle"
        case "diagram_svg", "poster": return "photo"
        case "link": return "link"
        default: return "doc.text"
        }
    }

    /// assetKindLabel in asset-meta.ts: a word for the kind, the row's meta.
    private var assetKindLabel: String {
        switch asset.kind {
        case "video": return "Video"
        case "diagram_svg": return "Diagram"
        case "diagram_source": return "Diagram source"
        case "transcript": return "Transcript"
        case "captions": return "Captions"
        case "chapters": return "Chapters"
        case "note": return "Note"
        case "session": return "Session log"
        case "link": return "Link"
        case "poster": return "Poster"
        case "pdf": return "PDF"
        default:
            let words = asset.kind.replacingOccurrences(of: "_", with: " ")
            return words.isEmpty ? "Asset" : words.prefix(1).uppercased() + words.dropFirst()
        }
    }
}

/// A curated reading row: the type's icon, the title, "Paper · arxiv.org" —
/// resourceLink's `where`. An http(s) link opens the browser; a site-relative
/// one ("/library/…") has no native destination and shows its place only.
private struct ResourceRow: View {
    let resource: CourseResource

    private static let typeIcon: [String: String] = [
        "paper": "doc.text", "docs": "book", "video": "play.rectangle",
        "book": "book.closed", "practice": "pencil.and.list.clipboard",
        "other": "link",
    ]
    private static let typeLabel: [String: String] = [
        "paper": "Paper", "docs": "Docs", "video": "Video",
        "book": "Book", "practice": "Practice", "other": "Link",
    ]

    /// Where the link goes, as the meta line names it — resourceLink() in
    /// apps/web/src/components/course-home/resource-link.ts.
    private var link: (where: String, url: URL?) {
        if resource.url.hasPrefix("/") && !resource.url.hasPrefix("//") && !resource.url.hasPrefix("/\\") {
            return (resource.url.hasPrefix("/library/") ? "Library" : "This site", nil)
        }
        if let url = URL(string: resource.url), url.scheme == "http" || url.scheme == "https" {
            let host = url.host?.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)
            return (host ?? url.absoluteString, url)
        }
        return (resource.url, nil)
    }

    var body: some View {
        let link = self.link
        if let url = link.url {
            Link(destination: url) { label(where: link.where) }
                .buttonStyle(.plain)
        } else {
            label(where: link.where)
        }
    }

    private func label(where place: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: Self.typeIcon[resource.type] ?? "link")
                .foregroundStyle(.secondary)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 1) {
                Text(resource.title).font(.callout).multilineTextAlignment(.leading)
                Text("\(Self.typeLabel[resource.type] ?? "Link") · \(place)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
        .contentShape(Rectangle())
    }
}

/// A path group: the heading and its rows, after Coursera's item groups.
private struct ItemGroup<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.headline)
            VStack(alignment: .leading, spacing: 2) { content() }
        }
    }
}

/// A module's path resolved for display: what modulePath produces, minus the
/// fields that need the knowledge base (before-you-start prerequisites and
/// per-step mastery buckets).
struct ModulePathModel {
    var watch: [CatalogAsset]
    var readAlongside: [CourseResource]
    var lessons: [Lesson]
    var practice: [CourseResource]
    /// The concepts the week check would ask about; 0 draws no check row.
    var checkConcepts: Int

    struct Lesson {
        let item: CourseItem
        var videos: [CatalogAsset]
        var steps: [Step]
        var readings: [CourseResource]
    }

    struct Step {
        let slug: String
        let title: String
        /// The diagrams and videos `asset_concept` placed on this step.
        var assets: [CatalogAsset]
    }
}
