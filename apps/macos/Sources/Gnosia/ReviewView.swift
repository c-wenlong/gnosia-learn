//
//  ReviewView.swift
//  Gnosia
//
//  The review queue, read-only: the cards due now, most overdue first —
//  the web's /review list — each opening its card face. A check card is
//  the note's first ```check block asked as multiple choice (its wrong
//  options are other notes' answers and summaries, picked by the same
//  seeded shuffle, so the web and this draw the same ones); a card with no
//  check asks as recall — "Recall: <title>" with the summary behind it.
//
//  Tapping an option or revealing the answer writes nothing: grading stays
//  in the web app and the CLI, and the four ratings are shown only as the
//  interval each would give — the same scheduleCard preview the web draws
//  under its buttons.
//

import SwiftUI

struct ReviewView: View {
    @Environment(CatalogStore.self) private var store
    @State private var selection: String?

    private var queue: ReviewQueue { store.reviewQueue() }

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                if let error = store.error {
                    ContentUnavailableView {
                        Label("No catalog", systemImage: "cylinder.split.1x2")
                    } description: {
                        Text(error).font(.caption)
                    }
                } else if queue.items.isEmpty {
                    ContentUnavailableView(
                        store.learn.concepts.isEmpty ? "No concepts" : "Nothing due",
                        systemImage: "checkmark.circle",
                        description: Text(
                            store.learn.concepts.isEmpty
                                ? "The catalog is reachable and holds no concepts."
                                : queue.nextDue.map { "The next card is due \(dueLabel($0).label)." }
                                    ?? "No card is scheduled."
                        )
                    )
                } else {
                    Text("\(queue.items.count) due")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                    List(selection: $selection) {
                        ForEach(queue.items) { item in
                            DueRow(item: item).tag(item.conceptId)
                        }
                    }
                    .listStyle(.sidebar)
                }
            }
            .navigationSplitViewColumnWidth(min: 300, ideal: 360)
        } detail: {
            NavigationStack {
                Group {
                    if let id = selection, let item = queue.items.first(where: { $0.conceptId == id }) {
                        ReviewCardView(card: store.reviewCard(for: item, in: queue))
                            .id(id)
                    } else {
                        ContentUnavailableView(
                            "Select a card",
                            systemImage: "rectangle.stack",
                            description: Text("\(queue.items.count) cards are due")
                        )
                    }
                }
                .appDestinations()
            }
        }
        .onAppear {
            if selection == nil { selection = queue.items.first?.conceptId }
        }
    }
}

/// One due row: the title and domain, the due words, and the card's
/// counts — the queue the web's /review lists.
private struct DueRow: View {
    let item: ReviewQueueItem

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).lineLimit(1)
                HStack(spacing: 6) {
                    if let domain = item.domain { Text(domain) }
                    if let card = item.card {
                        let due = dueLabel(card.due)
                        Text(due.label)
                            .foregroundStyle(due.overdue ? .red : .primary)
                        Text("· \(formatInterval(Int(card.intervalDays))) interval")
                        if card.leech { Text("· keeps slipping").foregroundStyle(.red) }
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }
}

/// One card face: the prompt, the choices or the hidden answer, then the
/// schedule — what it is now and what each rating would give.
private struct ReviewCardView: View {
    @Environment(CatalogStore.self) private var store
    let card: ReviewCardModel

    @State private var picked: Int?
    @State private var shown = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                prompt
                if card.kind == .check, let choices = card.choices {
                    choiceList(choices)
                } else {
                    recallAnswer
                }
                if shown || picked != nil { explanation }
                schedule
                readOnlyNote
            }
            .padding(24)
            .frame(maxWidth: 640, alignment: .leading)
        }
        .navigationTitle(card.title)
    }

    @ViewBuilder
    private var header: some View {
        HStack(spacing: 8) {
            Text(card.kind == .check ? "Check" : "Recall")
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(.quaternary, in: Capsule())
            if let domain = card.domain {
                Text(domain).font(.caption).foregroundStyle(.secondary)
            }
            if card.leech {
                Text("Keeps slipping").font(.caption).foregroundStyle(.red)
            }
            Spacer()
            NavigationLink(value: AppDestination.concept(card.conceptId)) {
                Text("Open concept")
                    .font(.caption)
            }
        }
    }

    private var prompt: some View {
        Text(card.prompt)
            .font(.title3)
            .textSelection(.enabled)
    }

    /// The check's options: tap one to grade yourself in your head — the
    /// right pick fills green, a wrong one marks itself and reveals the
    /// answer. Nothing is recorded.
    @ViewBuilder
    private func choiceList(_ choices: [String]) -> some View {
        VStack(spacing: 6) {
            ForEach(Array(choices.enumerated()), id: \.offset) { index, choice in
                Button {
                    picked = index
                    shown = true
                } label: {
                    HStack {
                        Text(choice)
                            .font(.callout)
                            .multilineTextAlignment(.leading)
                        Spacer()
                        if picked == index {
                            Image(systemName: index == card.correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundStyle(index == card.correct ? .green : .red)
                        } else if picked != nil, index == card.correct {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(choiceBackground(index), in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func choiceBackground(_ index: Int) -> Color {
        guard picked != nil else { return .secondary.opacity(0.12) }
        if index == card.correct { return .green.opacity(0.15) }
        if index == picked { return .red.opacity(0.15) }
        return .secondary.opacity(0.12)
    }

    /// A recall card's answer behind a button — Show answer on the web.
    @ViewBuilder
    private var recallAnswer: some View {
        if shown {
            Text(card.answer.isEmpty ? "The note holds no summary to check against." : card.answer)
                .font(.body)
                .foregroundStyle(.secondary)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
        } else {
            Button("Show answer") { shown = true }
                .buttonStyle(.bordered)
        }
    }

    @ViewBuilder
    private var explanation: some View {
        if let why = card.why {
            VStack(alignment: .leading, spacing: 3) {
                Text("Why").font(.caption).foregroundStyle(.secondary)
                Text(why).font(.callout)
            }
        }
        if let source = card.source {
            Text(source).font(.caption).foregroundStyle(.tertiary)
        }
    }

    /// The card's schedule, then what each rating would give — the same
    /// scheduleCard the buttons run, so the number under "Good" is the
    /// one it would write.
    @ViewBuilder
    private var schedule: some View {
        GroupBox("Schedule") {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 16) {
                    field("Due", card.due.map { dueLabel($0).label } ?? "–")
                    field("Interval", card.intervals.isEmpty ? "–" : formatInterval(currentInterval))
                    field("Ease", card.ease.map { String(format: "%.2f", $0) } ?? "–")
                    field("Reps", "\(card.repetitions)")
                    field("Lapses", "\(card.lapses)")
                    if let reviewed = card.lastReviewed {
                        field("Last reviewed", lastSeenLabel(reviewed))
                    }
                }
                Divider()
                HStack(spacing: 8) {
                    ForEach(Array(ReviewRating.allCases.enumerated()), id: \.offset) { index, rating in
                        VStack(spacing: 2) {
                            Text(rating.label).font(.caption).foregroundStyle(.secondary)
                            Text(index < card.intervals.count ? formatInterval(card.intervals[index]) : "–")
                                .font(.callout)
                                .monospacedDigit()
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
            .padding(8)
        }
    }

    /// The interval the card currently sits on: shown beside the previews.
    private var currentInterval: Int {
        store.learn.cards[card.conceptId].map { Int($0.intervalDays) } ?? 0
    }

    private func field(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.callout).monospacedDigit()
        }
    }

    private var readOnlyNote: some View {
        Text("Grading writes happen in the web app and the CLI; these buttons preview the schedule only.")
            .font(.caption2)
            .foregroundStyle(.tertiary)
    }
}
