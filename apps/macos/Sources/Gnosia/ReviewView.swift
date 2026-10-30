//
//  ReviewView.swift
//  Gnosia
//
//  The review session — the web's /review in focus mode: one due card at
//  a time on a 720pt column under a progress bar, the four Anki ratings
//  below, and a close screen at the end of the queue. The surface owns
//  the whole detail area: the shell hides its sidebar while the session
//  is up (RootView keeps the column at .detailOnly), and "Exit to Home"
//  is the way out — no due-list rail like the page has none.
//
//  A check card is the note's first ```check block asked as multiple
//  choice — its wrong options are other notes' answers and summaries,
//  drawn by the same seeded shuffle, so the web and this show the same
//  ones — and it grades itself: a right pick suggests Good and a wrong
//  one Again, drawn on the rating row and committed by Continue, while
//  any of the four buttons overrides it. A card with no usable check
//  asks as recall — the "Recall: <title>" prompt with the summary behind
//  Show answer. Keys 1 to 4 pick an option before the verdict and rate
//  after it; Space or Enter reveals a recall card, and on an answered
//  check commits the suggested rating.
//
//  Each rating is one gradeReview — recordReviewGrade, the local
//  `POST /api/review/grade` — and the card advances only once it is
//  recorded: a grade that did not save stays on screen with its error,
//  since a review silently lost is worse than one retried. A retry
//  replays the card's requestId, so a write the answer was lost for is
//  found rather than counted twice.
//
//  Kept in step with:
//    apps/web/src/app/(app)/review/page.tsx,
//    apps/web/src/components/review/ReviewSession.tsx,
//    apps/web/src/lib/review-core.ts, quiz-keys.ts, review-queue.ts,
//    services/catalog/src/state/review.ts (gradeReview),
//    apps/web/src/app/api/review/grade/route.ts
//
//  Deliberate differences: the web's `?concept=` focus and `?only=` set
//  have no native callers, so the queue is always the due list; and "Open
//  concept" pushes the workspace onto this stack instead of leaving for
//  /learn/<slug>, so the session under it keeps its place.
//

import SwiftUI

/// One review grade as `gradeReview` writes it — what the `review` event
/// records plus the rows the transaction upserts: the concept's mastery
/// entry as BKT moved it and its card as SM-2 left it. `grade` is the
/// SM-2 grade the rating maps to (1, 3, 4, 5); `rating` is the button
/// itself, 0 to 3 — the field `/api/review/grade` calls `grade`.
struct ReviewGradeWrite {
    var conceptId: String
    var grade: Int
    var rating: Int
    var requestId: String
    var at: Date
    var pLBefore: Double
    var pLAfter: Double
    var mastery: CatalogMastery
    var card: CatalogReview
}

/// The rating a recorded SM-2 grade reads as — ratingForGrade: the button
/// with that grade, or for a grade no button sends (the CLI's 0 and 2)
/// the failed or passed button nearest it.
func ratingForGrade(_ grade: Int) -> ReviewRating {
    if let exact = ReviewRating.allCases.first(where: { $0.grade == grade }) { return exact }
    if grade < SM2.passGrade { return .again }
    if grade >= 5 { return .easy }
    return grade >= 4 ? .good : .hard
}

struct ReviewView: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner

    /// What "Exit to Home" runs — the shell's section swap, passed in
    /// since the surface owns none of the chrome around it.
    var onExit: () -> Void = {}

    /// The web's Phase: the prompt alone, a recall card's answer open,
    /// or a check's pick graded.
    private enum Phase: String { case ask, shown, answered }

    /// One grade on record — the close screen counts the Agains.
    private struct Outcome: Hashable {
        let conceptId: String
        let rating: ReviewRating
        let requestId: String
    }

    /// Each rating as the catalog recorded it once the grade's reply is in
    /// (on a replay that is the first write's), the local record before.
    private var shownOutcomes: [Outcome] {
        outcomes.map { o in
            Outcome(conceptId: o.conceptId, rating: learner.recordedRating(o.requestId) ?? o.rating, requestId: o.requestId)
        }
    }

    // The queue is fixed when the surface opens — the web's initial.items.
    @State private var items: [ReviewCardModel] = []
    /// The empty screen's "next due" — the queue's own, read with it.
    @State private var firstNextDue: Date? = nil
    @State private var index = 0
    @State private var phase: Phase = .ask
    /// The option picked on a check card; nil under `.answered` is
    /// "I don't know".
    @State private var picked: Int? = nil
    @State private var whyOpen = false
    @State private var pending = false
    @State private var error: String? = nil
    @State private var outcomes: [Outcome] = []
    /// A requestId per queue slot — a retry's replay key, so a write the
    /// first send lost is answered rather than recorded twice.
    @State private var attempts: [Int: String] = [:]
    @State private var loaded = false

    private var item: ReviewCardModel? { items[safe: index] }
    /// The web's `done`: unreachable does not read as finished either.
    private var done: Bool { store.error == nil && loaded && index >= items.count }

    /// What Continue commits — RATING_IF_CORRECT and RATING_IF_WRONG: a
    /// check's own verdict, Good on a right pick, Again on a wrong or an
    /// "I don't know" one.
    private var suggested: ReviewRating? {
        guard let item, item.kind == .check, phase == .answered else { return nil }
        return picked != nil && picked == item.correct ? .good : .again
    }

    var body: some View {
        NavigationStack {
            frame
                .appDestinations()
        }
        .background(G.page)
        .task { prepare() }
        .onChange(of: store.loaded) { _, _ in prepare() }
    }

    /// The queue read once — readReviewSession's shape: the due list,
    /// then each item's note turned into its card. Nothing watches the
    /// store afterwards: a learner refresh mid-session would move the
    /// cards under the learner, so `items` holds the copy built here.
    private func prepare() {
        guard !loaded, store.loaded else { return }
        let queue = store.reviewQueue()
        firstNextDue = queue.nextDue
        items = queue.items.map { store.reviewCard(for: $0, in: queue) }
        loaded = true
    }

    // MARK: - The frame

    /// The web's Frame: the progress bar, the label and exit row, then
    /// the centered 720pt column the card or the closing screen sits on.
    /// The column is keyed on the step so each card mounts afresh.
    private var frame: some View {
        VStack(spacing: 0) {
            progressBar

            HStack {
                Text(frameLabel)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(G.text2)
                Spacer()
                Button("Exit to Home") { onExit() }
                    .buttonStyle(.plain)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(G.text2)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)

            ScrollView {
                column
                    .id(stepKey)
                    .transition(.opacity)
                    .frame(maxWidth: 720, alignment: .leading)
                    .padding(.horizontal, 28)
                    .padding(.top, 4)
                    .padding(.bottom, 40)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .animation(.easeOut(duration: 0.2), value: stepKey)
            // The answer panel, verdict and rating row rise in when the
            // phase turns — the web's `animate-enter` on the same mounts.
            .animation(.easeOut(duration: 0.15), value: phase)
        }
    }

    /// What the column is keyed on — the queue slot, or which closing
    /// screen is up, as the web's `stepKey` does it.
    private var stepKey: String {
        if store.error != nil || !loaded || items.isEmpty { return "empty" }
        return done ? "done" : "card-\(index)"
    }

    /// "Review · n of N" over a card, "Review · N of N" at the close,
    /// bare "Review" before any card can be counted — the empty and
    /// unreachable queues take the bare label ahead of `done`, which is
    /// vacuously true there.
    private var frameLabel: String {
        if store.error != nil || !loaded || items.isEmpty { return "Review" }
        if done { return "Review · \(items.count) of \(items.count)" }
        return "Review · \(index + 1) of \(items.count)"
    }

    /// The thin progress track — position of total while a card is up,
    /// full at the close, empty on the other closing screens, and the
    /// fill's right end rounded as the web's is.
    private var progressBar: some View {
        let percent: Double =
            store.error != nil || !loaded || items.isEmpty ? 0
            : done ? 100 : Double(index + 1) / Double(items.count) * 100
        let clamped = max(0, min(100, percent))
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                G.track
                G.accent
                    .frame(width: geo.size.width * clamped / 100)
                    .clipShape(UnevenRoundedRectangle(bottomTrailingRadius: 6, topTrailingRadius: 6))
            }
        }
        .frame(height: 12)
    }

    @ViewBuilder
    private var column: some View {
        if let storeError = store.error {
            closing(
                "Reviews are unavailable",
                "The catalog could not be read, so there is no queue to show and nothing could be graded. \(storeError)")
        } else if !loaded {
            VStack(spacing: 10) {
                ProgressView().controlSize(.small)
                Text("Preparing the session…")
                    .font(.callout)
                    .foregroundStyle(G.text3)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 180)
        } else if items.isEmpty {
            closing("Nothing due", emptyLead)
        } else if done {
            closeScreen
        } else if let item {
            cardColumn(item)
        }
    }

    /// The empty queue's lead — the web's two cases: a scheduled next
    /// card, or nothing ever written.
    private var emptyLead: String {
        if let next = formatDue(firstNextDue) {
            return "The next card is due \(next)."
        }
        return "No review is scheduled yet. Cards appear here once a concept has been taught or probed."
    }

    // MARK: - One card's column

    /// The card: the queue's domain and the estimate over it, the
    /// bordered question card, the kind's body, the rating row or its
    /// ask-phase stand-in, then the key hints and the card's stats.
    @ViewBuilder
    private func cardColumn(_ item: ReviewCardModel) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            // What the frame's label does not already say: the queue's
            // domain and the 30-seconds-a-card estimate.
            HStack {
                if let domain = queueDomain(items.map(\.domain)) {
                    Text(domain)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(G.text2)
                }
                Spacer()
                Text("Est. \(minutesLeft(items.count - index)) min left")
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }

            // The question card — the eyebrow over the serif prompt.
            VStack(alignment: .leading, spacing: 8) {
                if let eyebrow = cardEyebrow(item) {
                    Text(eyebrow)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(G.text2)
                }
                MathText(text: item.prompt, font: .system(size: 24, weight: .bold, design: .serif))
                    .foregroundStyle(G.text)
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(G.border, lineWidth: 2))

            if item.kind == .check {
                choicesBlock(item)
                if phase == .answered, let suggested {
                    feedbackBar(item, suggested: suggested)
                }
            } else if phase != .ask {
                answerPanel(item)
            }

            actionsBlock(item)

            // The footer's quiet line: what the keys do now, and the
            // card's ease and history.
            HStack {
                Text(keysHint)
                Spacer()
                Text(cardStats(item))
            }
            .font(.caption)
            .foregroundStyle(G.text3)
        }
    }

    /// The footer's key line — keysHint: what the keys do at this phase.
    private var keysHint: String {
        guard let item else { return "" }
        if item.kind == .recall { return phase == .ask ? "Space reveals the answer" : "Keys 1 to 4 rate" }
        return phase == .ask ? "Keys 1 to 4 pick an answer" : "Keys 1 to 4 rate · enter continues"
    }

    // MARK: - The check card's body

    /// The numbered options — a tap or a number key picks one and the
    /// card grades itself at once; there is no select-then-confirm here.
    private func choicesBlock(_ item: ReviewCardModel) -> some View {
        VStack(spacing: 8) {
            ForEach(Array((item.choices ?? []).enumerated()), id: \.offset) { i, choice in
                choiceRow(i, choice, item: item)
            }
        }
    }

    private enum ChoiceState { case idle, correct, wrong }

    /// The web's stateOf: once answered, the right option is correct
    /// and a wrong pick is marked; anything else stays idle.
    private func choiceState(_ i: Int, item: ReviewCardModel) -> ChoiceState {
        guard phase == .answered else { return .idle }
        if i == item.correct { return .correct }
        if i == picked { return .wrong }
        return .idle
    }

    /// One option row — the web's ChoiceRow: number badge, the choice's
    /// text, then "correct answer" or "your answer" once graded. Rows
    /// recolour in place and go dead with the pick made — which also
    /// frees their number keys for the rating row.
    private func choiceRow(_ i: Int, _ choice: String, item: ReviewCardModel) -> some View {
        let state = choiceState(i, item: item)
        let fill: Color = switch state {
        case .idle: G.surface
        case .correct: G.ok.opacity(0.15)
        case .wrong: G.streak.opacity(0.15)
        }
        let stroke: Color = switch state {
        case .idle: G.border
        case .correct: G.okText
        case .wrong: G.warnText
        }
        let ink: Color = switch state {
        case .idle: G.text
        case .correct: G.okText
        case .wrong: G.warnText
        }
        let tag: String? = switch state {
        case .correct: "correct answer"
        case .wrong: "your answer"
        default: nil
        }
        return Button {
            pick(i)
        } label: {
            HStack(spacing: 12) {
                Text("\(i + 1)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(G.text3)
                    .frame(width: 26, height: 26)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(G.border, lineWidth: 2))
                MathText(text: choice, font: .callout.weight(.medium))
                    .foregroundStyle(ink)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let tag {
                    Text(tag)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(ink)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(minHeight: 56)
            .background(fill, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(stroke, lineWidth: 2))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(phase != .ask || pending)
        .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: [])
    }

    /// The check's verdict — the web's FeedbackBar: a tinted bar, the ✓
    /// or ! disc, the verdict over the check's `why` and what Continue
    /// records, its source chip and the coloured Continue on the right.
    /// "Not quite" is gold, never red.
    private func feedbackBar(_ item: ReviewCardModel, suggested: ReviewRating) -> some View {
        let right = picked != nil && picked == item.correct
        let verdict = right ? "Correct" : (picked == nil ? "Here is the answer" : "Not quite")
        let tint: Color = right ? G.ok.opacity(0.15) : G.streak.opacity(0.15)
        let ink: Color = right ? G.okText : G.warnText
        return HStack(alignment: .top, spacing: 16) {
            Text(right ? "✓" : "!")
                .font(.title3.weight(.bold))
                .foregroundStyle(right ? Color.white : warnInk)
                .frame(width: 44, height: 44)
                .background(right ? G.ok : G.streak, in: Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(verdict)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ink)
                if let why = item.why {
                    MathText(text: why, font: .callout)
                        .foregroundStyle(ink)
                }
                Text("Counts as \(suggested.label), next in \(formatInterval(item.intervals[safe: suggested.rawValue] ?? 1)).")
                    .font(.caption)
                    .foregroundStyle(G.text2)
            }
            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 8) {
                if let source = item.source {
                    citePill(1, label: source)
                }
                verdictButton("Continue", ok: right) { rate(suggested) }
                    .disabled(pending)
                    .keyboardShortcut(.defaultAction)
                    .background {
                        Button("") { rate(suggested) }
                            .keyboardShortcut(.space)
                            .hidden()
                    }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - The recall card's body

    /// The recall answer — the web's AnswerPanel: the tinted panel, the
    /// Answer label, the answer, then its source chip, "Why?" and Open
    /// concept on one row.
    private func answerPanel(_ item: ReviewCardModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Answer")
                .font(.caption.weight(.semibold))
                .foregroundStyle(G.text2)
            if item.answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text("This note has no summary yet. Open the concept and check yourself against the note.")
                    .font(.body)
                    .foregroundStyle(G.text)
            } else {
                MathText(text: item.answer, font: .body)
                    .foregroundStyle(G.text)
            }
            // One row of the panel — a shut Why? adds no gap under it.
            HStack(spacing: 8) {
                if let source = item.source {
                    citePill(1, label: source)
                }
                if item.why != nil {
                    chipButton("Why?") { whyOpen.toggle() }
                }
                NavigationLink(value: AppDestination.concept(item.conceptId)) {
                    Text("Open concept")
                }
                .buttonStyle(.plain)
                .font(.caption.weight(.medium))
                .foregroundStyle(G.text)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(G.surface, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border, lineWidth: 1))
                Spacer(minLength: 0)
            }
            .padding(.top, 4)
            if whyOpen, let why = item.why {
                MathText(text: why, font: .callout)
                    .foregroundStyle(G.text2)
                    .padding(.top, 4)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(G.tint, in: RoundedRectangle(cornerRadius: 20))
    }

    /// The numbered citation chip — the kit's Cite: a disc and the
    /// source's name in a 26pt pill. A review's source is the check's
    /// `source:` line, which goes nowhere, so it is a label, not a link.
    private func citePill(_ n: Int, label: String) -> some View {
        HStack(spacing: 6) {
            Text("\(n)")
                .font(.caption.weight(.bold))
                .foregroundStyle(G.text2)
                .frame(width: 20, height: 20)
                .background(G.surface2, in: Circle())
            Text(label)
                .font(.caption)
                .foregroundStyle(G.text2)
                .lineLimit(1)
        }
        .padding(.leading, 3)
        .padding(.trailing, 10)
        .frame(height: 26)
        .background(G.surface, in: Capsule())
        .overlay(Capsule().stroke(G.border, lineWidth: 1))
    }

    // MARK: - The actions under the card

    /// What sits under the card: the four ratings once the answer is
    /// out, Show answer or "I don't know" before it — and a failed
    /// write's error beneath either.
    @ViewBuilder
    private func actionsBlock(_ item: ReviewCardModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if phase != .ask {
                VStack(alignment: .leading, spacing: 10) {
                    Text(item.kind == .check ? "Or rate it yourself" : "How well did you recall it?")
                        .font(.callout.weight(.medium))
                        .foregroundStyle(G.text2)
                    HStack(spacing: 12) {
                        ForEach(ReviewRating.allCases, id: \.rawValue) { rating in
                            ratingButton(rating, item: item)
                        }
                    }
                }
            } else if item.kind == .recall {
                Button("Show answer") { reveal() }
                    .buttonStyle(.plain)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(G.btnText)
                    .padding(.vertical, 11)
                    .frame(maxWidth: .infinity)
                    .background(G.btnFace, in: RoundedRectangle(cornerRadius: 10))
                    .keyboardShortcut(.space)
                    .background {
                        Button("") { reveal() }
                            .keyboardShortcut(.defaultAction)
                            .hidden()
                    }
                    .disabled(pending)
            } else {
                ghostButton("I don't know") { pick(nil) }
                    .disabled(pending)
            }
            if let error {
                Text(error)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.danger)
            }
        }
    }

    /// One of the four ratings — the web's RatingButton: the label in
    /// bold over the interval it would give, an equal-bordered choice
    /// between equals until `suggested` takes the accent ring and tint
    /// to show what Continue will record.
    private func ratingButton(_ rating: ReviewRating, item: ReviewCardModel) -> some View {
        let isSuggested = suggested == rating
        return Button {
            rate(rating)
        } label: {
            VStack(spacing: 4) {
                Text(rating.label)
                    .font(.callout.weight(.bold))
                    .foregroundStyle(G.text)
                Text(formatInterval(item.intervals[safe: rating.rawValue] ?? 1))
                    .font(.caption)
                    .foregroundStyle(G.text3)
                    .monospacedDigit()
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(isSuggested ? G.tint : G.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(isSuggested ? G.accent : G.border, lineWidth: 2))
            .contentShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .disabled(pending)
        .keyboardShortcut(KeyEquivalent(Character("\(rating.rawValue + 1)")), modifiers: [])
    }

    // MARK: - The closing screens

    /// "Review done" — the queue worked through: how many, how many
    /// Agains, and where the next card lands, then Back to Home.
    private var closeScreen: some View {
        let outcomes = shownOutcomes
        let again = outcomes.filter { $0.rating == .again }.count
        // The next due is read after the last grade — the writes just
        // made are what moved it.
        let queue = store.reviewQueue()
        let next = formatDue(queue.nextDue) ?? "none"
        let lead = "\(outcomes.count) \(outcomes.count == 1 ? "card" : "cards") reviewed"
            + (queue.items.count > 0 ? ", and \(queue.items.count) more came due" : "") + "."

        return VStack(spacing: 24) {
            VStack(spacing: 6) {
                Text("Review done")
                    .font(.system(size: 30, weight: .bold, design: .serif))
                    .foregroundStyle(G.text)
                Text(lead)
                    .font(.callout)
                    .foregroundStyle(G.text2)
                    .frame(maxWidth: 480)
                    .multilineTextAlignment(.center)
            }
            HStack(spacing: 14) {
                statTile("\(outcomes.count)", label: "Reviewed", tone: G.ok)
                statTile("\(again)", label: "Again", tone: G.streak)
                statTile(next, label: "Next due", tone: G.accent)
            }
            primaryButton("Back to Home") { onExit() }
        }
        .padding(.top, 40)
        .frame(maxWidth: .infinity)
    }

    /// A Closing: the title over one lead line, centred, then the way
    /// out — shared by the empty queue and the unreachable one.
    private func closing(_ title: String, _ lead: String) -> some View {
        VStack(spacing: 24) {
            VStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 30, weight: .bold, design: .serif))
                    .foregroundStyle(G.text)
                Text(lead)
                    .font(.callout)
                    .foregroundStyle(G.text2)
                    .frame(maxWidth: 480)
                    .multilineTextAlignment(.center)
            }
            primaryButton("Back to Home") { onExit() }
        }
        .padding(.top, 40)
        .frame(maxWidth: .infinity)
    }

    /// One stat tile of the three — the web's StatTile: a coloured frame,
    /// the metric's strip naming it, and the value in a surface box.
    private func statTile(_ value: String, label: String, tone: Color) -> some View {
        VStack(spacing: 0) {
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(.black) // the strip's ink is black on every tone
                .frame(height: 26)
            Text(value)
                .font(.system(size: 26, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(G.text)
                .frame(maxWidth: .infinity)
                .frame(height: 64)
                .background(G.surface, in: RoundedRectangle(cornerRadius: 13))
        }
        .padding(3)
        .frame(maxWidth: .infinity)
        .background(tone, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Picks, reveals and grades

    /// Space or Enter on a recall card's ask phase — the web's reveal.
    private func reveal() {
        guard phase == .ask, item?.kind == .recall else { return }
        phase = .shown
    }

    /// A check's pick — or nil from "I don't know", which answers with
    /// Again suggested, as the web's `pick(null)` does.
    private func pick(_ choice: Int?) {
        guard phase == .ask, !pending else { return }
        picked = choice
        phase = .answered
    }

    /// One rating: this card's gradeReview — estimated over the store's
    /// freshest rows the way the web reads them inside its learner lock,
    /// so Home and the queue move at once; the catalog's reply replaces
    /// the estimate when the queued grade lands (LearnerStore.applyRecorded)
    /// — and the card advances only once the write lands. A failed write
    /// keeps the card with the error on it; the slot's requestId stays
    /// pinned so the retry is a replay, not a second count.
    private func rate(_ rating: ReviewRating) {
        guard let item, phase != .ask, !pending else { return }
        pending = true
        error = nil
        let requestId = attempts[index] ?? UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        attempts[index] = requestId
        let now = Date()
        let params = bktParams(preferences: store.preferences)
        let entry = store.mastery[item.conceptId]
            ?? CatalogMastery(conceptSlug: item.conceptId, pL: params.pL0, observations: 0, correct: 0, lastSeen: nil)
        let passed = rating.grade >= SM2.passGrade
        let pLAfter = bktUpdate(entry.pL, correct: passed, params: params, opportunity: true)
        let sched = sm2Review(card: store.learn.cards[item.conceptId], grade: rating.grade, now: now)
        let write = ReviewGradeWrite(
            conceptId: item.conceptId,
            grade: rating.grade,
            rating: rating.rawValue,
            requestId: requestId,
            at: now,
            pLBefore: entry.pL,
            pLAfter: pLAfter,
            mastery: CatalogMastery(
                conceptSlug: item.conceptId,
                pL: pLAfter,
                observations: entry.observations + 1,
                correct: entry.correct + (passed ? 1 : 0),
                lastSeen: now),
            card: CatalogReview(
                conceptSlug: item.conceptId,
                repetitions: Int64(sched.repetitions),
                ease: sched.ease,
                intervalDays: Int64(sched.intervalDays),
                lapses: Int64(sched.lapses),
                due: sched.due,
                lastReviewed: now,
                leech: sched.leech))
        if let recorded = learner.recordReviewGrade(write) {
            // The rating on record — the one asked for, or on a replay
            // the first write's, whatever this press claimed.
            outcomes.append(Outcome(conceptId: item.conceptId, rating: recorded, requestId: requestId))
            index += 1
            phase = .ask
            picked = nil
            whyOpen = false
            store.refreshLearner()
        } else {
            error = learner.error ?? "Not saved. Press Try again; your rating is kept."
        }
        pending = false
    }

    // MARK: - Buttons

    /// The primary action — the web's brand Button: deep teal face,
    /// cream label.
    private func primaryButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .buttonStyle(.plain)
            .font(.callout.weight(.semibold))
            .foregroundStyle(G.btnText)
            .padding(.horizontal, 18)
            .padding(.vertical, 9)
            .background(G.btnFace, in: RoundedRectangle(cornerRadius: 10))
    }

    /// The coloured Continue on a verdict — the web's `ok`/`warn`
    /// variants: the green or gold face the verdict already drew in.
    private func verdictButton(_ label: String, ok: Bool, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .buttonStyle(.plain)
            .font(.callout.weight(.semibold))
            .foregroundStyle(ok ? Color.white : warnInk)
            .padding(.horizontal, 18)
            .padding(.vertical, 9)
            .background(ok ? G.ok : G.streak, in: RoundedRectangle(cornerRadius: 10))
    }

    /// The secondary action — ghost: surface face, border ring.
    private func ghostButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .buttonStyle(.plain)
            .font(.callout.weight(.medium))
            .foregroundStyle(G.text)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border, lineWidth: 1))
    }

    /// The small ghost under an answer — the web's `size="sm"` variant:
    /// the same bordered surface, a step shorter.
    private func chipButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .buttonStyle(.plain)
            .font(.caption.weight(.medium))
            .foregroundStyle(G.text)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(G.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border, lineWidth: 1))
    }

    /// `--warn-on`, the ink on the gold disc and button — the same dark
    /// brown in both of the web's themes.
    private var warnInk: Color { Color(light: 0x5c4400, dark: 0x5c4400) }
}

// MARK: - The session's pure half (review-core.ts)

/// "algorithms", "mostly algorithms", or nil when the queue has no
/// plurality — queueDomain.
private func queueDomain(_ domains: [String?]) -> String? {
    var counts: [String: Int] = [:]
    for d in domains { if let d { counts[d, default: 0] += 1 } }
    guard let best = counts.max(by: { $0.value < $1.value }) else { return nil }
    if best.value == domains.count { return best.key }
    return best.value * 2 > domains.count ? "mostly \(best.key)" : nil
}

/// Minutes left at thirty seconds a card — minutesLeft: a round number
/// for the header, not a measurement.
private func minutesLeft(_ cards: Int) -> Int {
    max(0, Int(ceil(Double(cards) * 30 / 60)))
}

/// "today", "tomorrow", "in 3 days", or a date past a week — formatDue,
/// calendar days like it.
private func formatDue(_ due: Date?, now: Date = Date()) -> String? {
    guard let due else { return nil }
    let days = DayMath.diff(now, due)
    if days <= 0 { return "today" }
    if days == 1 { return "tomorrow" }
    if days < 7 { return "in \(days) days" }
    return DayMath.shortDate(due, today: now)
}

/// "today", "yesterday", "4 days ago" — formatAgo.
private func formatAgo(_ at: Date?, now: Date = Date()) -> String? {
    guard let at else { return nil }
    let days = DayMath.diff(at, now)
    if days <= 0 { return "today" }
    if days == 1 { return "yesterday" }
    return "\(days) days ago"
}

/// The label over a card's prompt, or nil when it would only repeat it —
/// cardEyebrow. A check names its concept here since its prompt is a
/// question; a "Recall: <title>" prompt names it already; a recall built
/// from a check keeps the question as its prompt and the label is the
/// only place the concept is named. A leech says "Keeps slipping" either
/// way.
private func cardEyebrow(_ item: ReviewCardModel) -> String? {
    let named = item.kind == .recall
        && item.prompt.trimmingCharacters(in: .whitespaces)
            == recallPrompt(item.title).trimmingCharacters(in: .whitespaces)
    var parts: [String] = []
    if !named { parts.append("\(item.kind == .check ? "Check" : "Recall") · \(item.title)") }
    if item.leech { parts.append("Keeps slipping") }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
}

/// The footer's card line — cardStats: "ease 2.5 · 4 reps · last seen
/// 4 days ago", or "new card".
private func cardStats(_ item: ReviewCardModel, now: Date = Date()) -> String {
    guard let ease = item.ease else { return "new card" }
    var parts = ["ease \(easeText(ease))", "\(item.repetitions) \(item.repetitions == 1 ? "rep" : "reps")"]
    if let ago = formatAgo(item.lastReviewed, now: now) { parts.append("last seen \(ago)") }
    return parts.joined(separator: " · ")
}

/// Two decimals with the tail zeros off — `Number(ease.toFixed(2))`,
/// which prints 2.5 rather than 2.50.
private func easeText(_ ease: Double) -> String {
    var s = String(format: "%.2f", ease)
    while s.hasSuffix("0") { s = String(s.dropLast()) }
    if s.hasSuffix(".") { s = String(s.dropLast()) }
    return s
}
