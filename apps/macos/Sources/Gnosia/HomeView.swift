//
//  HomeView.swift
//  Gnosia
//
//  The learning dashboard, in the shape of the web app's /: "Pick up where
//  you left off" (the first rows of Recent), "Next from here" (what each
//  thread opens up), "Worth a quick recall" (due cards near the threads)
//  and "Courses in progress" — over a header that says what the queue
//  owes. home-core.ts/home.ts supply the arithmetic; the mirrored rows it
//  runs on are module visits (`visit` events plus the `recentModules` and
//  `lastVisited` preferences), video positions (`playback:*` preferences)
//  and concept touches (the mastery row's own `last_seen` plus session
//  events, the mirror having no per-observation concept column).
//

import SwiftUI

struct HomeView: View {
    @Environment(CatalogStore.self) private var store

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let error = store.error {
                        ContentUnavailableView {
                            Label("No catalog", systemImage: "cylinder.split.1x2")
                        } description: {
                            Text(error).font(.caption)
                        }
                    } else {
                        content(store.home())
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Home")
            .appDestinations()
        }
    }

    @ViewBuilder
    private func content(_ model: HomeModel) -> some View {
        dueBanner(model)
        if model.conceptCount == 0 && model.threads.isEmpty {
            ContentUnavailableView(
                "Nothing to learn from yet",
                systemImage: "sparkles",
                description: Text("The catalog holds no concepts. Index your notes and snapshot again.")
            )
        }

        if !model.threads.isEmpty {
            section("Pick up where you left off") {
                ForEach(model.threads) { thread in
                    ThreadRow(thread: thread)
                }
            }
        }

        if !model.next.isEmpty {
            section("Next from here") {
                ForEach(model.next) { group in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(group.heading)
                            .font(.callout).bold()
                        ForEach(group.steps) { step in
                            StepRow(step: step)
                        }
                    }
                }
            }
        } else if let nextUp = model.nextUp {
            section(nil) {
                NextUpRow(nextUp: nextUp)
            }
        }

        if !model.recall.isEmpty {
            section("Worth a quick recall") {
                ForEach(model.recall) { pick in
                    RecallRow(pick: pick)
                }
            }
        }

        if !model.courses.rows.isEmpty {
            section("Courses in progress") {
                ForEach(model.courses.rows) { course in
                    CourseRow(course: course)
                }
            }
        }
    }

    /// The queue's headline: what is due now and what comes due next.
    @ViewBuilder
    private func dueBanner(_ model: HomeModel) -> some View {
        if model.dueCount > 0 {
            HStack(spacing: 8) {
                Image(systemName: "rectangle.stack.badge.clock")
                    .foregroundStyle(.orange)
                Text("\(model.dueCount) \(model.dueCount == 1 ? "card is" : "cards are") due for review")
                    .font(.callout)
                Spacer()
            }
            .padding(10)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private func section(_ title: String?, @ViewBuilder _ rows: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title {
                Text(title).font(.headline)
            }
            VStack(spacing: 0) { rows() }
        }
    }
}

/// One thread row — a Recent row with the day it was touched and a mark
/// for its kind; a concept shows its mastery instead of a detail line.
private struct ThreadRow: View {
    let thread: HomeThread

    var body: some View {
        NavigationLink(value: thread.item.destination) {
            HStack(spacing: 10) {
                Image(systemName: symbol)
                    .foregroundStyle(.secondary)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text(thread.item.title).lineLimit(1)
                    if let detail = thread.item.detail {
                        Text(detail).font(.caption).foregroundStyle(.secondary)
                    } else if let bucket = thread.item.bucket {
                        Text(masteryCaption(bucket: bucket, pL: thread.item.pL))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if let percent = thread.item.percent {
                    Text("\(percent)%").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                }
                Text(thread.day)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var symbol: String {
        switch thread.item.kind {
        case .module: return "graduationcap"
        case .video: return "play.rectangle"
        case .concept: return "brain"
        case .draft: return "square.and.pencil"
        case .session: return "bubble.left.and.bubble.right"
        }
    }
}

/// A step a thread opens up — a concept (mastery dot) or a course topic.
private struct StepRow: View {
    let step: NextStep

    var body: some View {
        NavigationLink(value: step.destination) {
            HStack(spacing: 10) {
                if let bucket = step.bucket {
                    BucketDot(bucket: bucket)
                } else {
                    Image(systemName: "circle").font(.caption2).foregroundStyle(.secondary)
                }
                Text(step.title).lineLimit(1)
                Spacer()
                if let detail = step.detail {
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The frontier's first concept, when the threads open nothing.
private struct NextUpRow: View {
    let nextUp: NextUp

    var body: some View {
        NavigationLink(value: AppDestination.concept(nextUp.slug)) {
            VStack(alignment: .leading, spacing: 4) {
                Text(nextUp.eyebrow)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack {
                    BucketDot(bucket: nextUp.bucket)
                    Text(nextUp.title).font(.callout).bold()
                    Spacer()
                    if let seen = nextUp.lastSeen {
                        Text(seen).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .padding(10)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A due card worth a quick recall — its concept's workspace is where
/// recalling happens.
private struct RecallRow: View {
    let pick: RecallPick

    var body: some View {
        NavigationLink(value: AppDestination.concept(pick.conceptId)) {
            HStack(spacing: 10) {
                Image(systemName: "arrow.counterclockwise")
                    .foregroundStyle(.secondary)
                    .frame(width: 18)
                Text(pick.title).lineLimit(1)
                Spacer()
                if let seen = pick.lastSeen {
                    Text(seen).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A course in progress: code and title, the count and the bar.
private struct CourseRow: View {
    let course: CourseInProgress

    var body: some View {
        NavigationLink(value: AppDestination.course(course.slug)) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(course.code).font(.callout).bold()
                    Text(course.title).font(.callout).lineLimit(1)
                    Spacer()
                    Text("\(course.completed) of \(course.total)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                ProgressView(value: Double(course.percent), total: 100)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The three-colour mastery dot the surfaces share: green mastered, amber
/// learning, grey not started — the map's own palette in one small shape.
struct BucketDot: View {
    let bucket: MasteryBucket

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
    }

    private var color: Color {
        switch bucket {
        case .mastered: return .green
        case .learning: return .orange
        case .untouched: return Color.secondary.opacity(0.5)
        }
    }
}
