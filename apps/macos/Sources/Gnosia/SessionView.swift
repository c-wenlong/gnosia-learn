//
//  SessionView.swift
//  Gnosia
//
//  The web's concept session — apps/web/src/components/session/
//  SessionFocus.tsx — walked natively over the sidecar, in both modes the
//  page knows: learn (Teach me — probe, teach, check, close) and check
//  (`?mode=check`, the workspace's Quiz me — the note's checks in turn,
//  then close). A question step asks the note's own check
//  when the plan has one; otherwise it asks the tutor for a question
//  (`POST /api/agent/session` through SidecarClient), and when the model
//  is not configured or answers in prose it falls back to the plan's
//  fallback, or says there is no question and lets the learner carry on.
//
//  An answer is graded and persisted through recordSessionAnswer — the
//  local `POST /api/learner/observe` — which moves p(L), spreads a correct
//  answer to the prerequisites and schedules the review card, all inside
//  learner.db, never the read-only catalog. A write that fails keeps the
//  pick so "Try again" can replay it. The session row opens with the
//  first answer and closes on the close step — or on leaving mid-session,
//  as the web's does.
//
//  The module week check (`/courses/<slug>/<module>/check`) has no
//  native surface yet.
//

import SwiftUI

struct SessionView: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner
    @Environment(SidecarManager.self) private var sidecar
    @Environment(\.dismiss) private var dismiss

    /// The concept the session is about — the plan, the pool and the
    /// model are built from the workspace at open, once.
    let slug: String
    /// `?mode=` on the web URL: `.learn` is Teach me, `.check` is Quiz me.
    var mode: SessionMode = .learn

    // MARK: The plan, built at open

    @State private var ready = false
    @State private var missing = false
    @State private var title = ""
    @State private var summary = ""
    @State private var steps: [SessionStep] = []
    @State private var teach = ""
    /// No question step has anything the note supplied — every question
    /// would be the tutor's, the web's "this note has no check" callout.
    @State private var noteAsksNothing = false
    @State private var next: (slug: String, title: String)? = nil
    @State private var model = SessionLearnerModel(params: BKTParams(), mastery: [:], cards: [:])
    /// slug → title, for the close screen's What moved rows.
    @State private var titles: [String: String] = [:]

    // MARK: The walk

    /// A step's question once the tutor answered, or why it did not.
    struct Resolved { var question: SessionQuestion?; var note: String? }
    /// An answer that landed — the pick and the recorded outcome.
    struct Graded { var picked: Int?; var correct: Bool; var outcome: SessionAnswerOutcome }

    @State private var index = 0
    @State private var selected: Int? = nil
    @State private var resolved: [Int: Resolved] = [:]
    /// Steps whose tutor request already ran — the web's `requested` ref.
    @State private var requested = Set<Int>()
    @State private var graded: [Int: Graded] = [:]
    /// The first attempt fixes the pick; a retry sends that pick again
    /// under its first requestId, so a replay never duplicates evidence.
    @State private var attempts: [Int: (requestId: String, picked: Int?)] = [:]
    @State private var pending = false
    @State private var error: String? = nil
    @State private var whyOpen = false
    @State private var sessionId: String? = nil
    @State private var sessionClosed = false
    @State private var startedAt = Date()
    @State private var closedAt: Date? = nil
    /// Every answer that landed, in order — the close screen's input.
    @State private var answers: [SessionAnswerOutcome] = []
    /// The session's answered concepts, first-answer order, for
    /// session-close's `concepts` list.
    @State private var answeredConcepts: [String] = []

    var body: some View {
        Group {
            if missing {
                ContentUnavailableView(
                    "No workspace data",
                    systemImage: "questionmark.circle",
                    description: Text("The knowledge base has no workspace for “\(slug)” to run a session from.")
                )
            } else if ready {
                sessionBody
            } else {
                ContentUnavailableView {
                    ProgressView()
                } description: {
                    Text("Preparing the session…").font(.callout)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(G.page)
        .navigationTitle(title.isEmpty ? "Session" : title)
        .task { prepare() }
        .onChange(of: store.loaded) { _, _ in prepare() }
        .onChange(of: index) { _, i in askModelQuestion(i) }
        .onDisappear { closeSessionOnce() }
    }

    /// The plan, the pool and the learner model, once — the server half
    /// of the web's session page (session-page.ts) run at open.
    private func prepare() {
        guard !ready, store.loaded else { return }
        guard let w = store.workspace(for: slug) else {
            if store.loaded { missing = true }
            return
        }
        let checks = w.checks.map(\.check)
        let neighbours = Set(
            w.requires.map(\.slug) + w.assumes.map(\.slug)
                + w.dependants.map(\.slug) + w.backlinks.map(\.slug)
        )
        let pool = sessionDistractorPool(
            slug: slug, domain: w.domain, neighbours: neighbours,
            concepts: store.learn.concepts
        )
        steps = buildSessionPlan(slug: slug, mode: mode, checks: checks, pool: pool, summary: w.summary)
        teach = teachProse(w.body ?? "")
        noteAsksNothing = !steps.contains {
            ($0.kind == .probe || $0.kind == .check) && ($0.question != nil || $0.fallback != nil)
        }
        title = w.title
        summary = w.summary
        next = sessionNextConcept(
            frontier: store.learn.frontier.compactMap { store.learn.byId[$0] },
            current: (slug: slug, domain: w.domain, dependants: Set(w.dependants.map(\.slug)))
        )
        model = SessionLearnerModel(
            params: bktParams(preferences: store.preferences),
            mastery: store.mastery,
            cards: store.learn.cards
        )
        titles = Dictionary(uniqueKeysWithValues: store.learn.concepts.map { ($0.slug, $0.title) })
        startedAt = Date()
        ready = true
        askModelQuestion(index)
    }

    // MARK: What a question step shows

    private enum QuestionStatus {
        case loading
        case ready(SessionQuestion)
        case none(String)
    }

    /// The question on screen for a step, or why there is none, or that
    /// it is coming — the web's questionFor.
    private func questionFor(_ i: Int) -> QuestionStatus {
        guard let step = steps[safe: i], step.kind == .probe || step.kind == .check else { return .none("") }
        if let question = step.question { return .ready(question) }
        guard let r = resolved[i] else { return .loading }
        if let question = r.question { return .ready(question) }
        if let fallback = step.fallback { return .ready(fallback) }
        return .none(r.note ?? NOTHING_TO_ASK)
    }

    /// A question step with nothing from the note asks the tutor, once.
    /// `requested` marks a step asked; Ask again clears it to ask again.
    private func askModelQuestion(_ i: Int) {
        guard let step = steps[safe: i],
              step.kind == .probe || step.kind == .check,
              step.question == nil,
              !requested.contains(i)
        else { return }
        requested.insert(i)
        let asked = graded.keys.sorted().compactMap { k -> String? in
            if case .ready(let q) = questionFor(k) { return q.prompt }
            return nil
        }.suffix(4).map { $0 }
        let stepKind = step.kind == .probe ? "probe" : "check"
        let slug = self.slug
        Task { @MainActor in
            do {
                let client = try await sidecar.readyClient()
                let reply = try await client.sessionQuestion(conceptSlug: slug, step: stepKind, avoid: asked)
                if let question = Self.modelQuestion(reply["question"]) {
                    resolved[i] = Resolved(question: question, note: nil)
                } else {
                    resolved[i] = Resolved(
                        question: nil,
                        note: "The tutor answered, but not with a question it could be graded on."
                    )
                }
            } catch let err as SidecarClient.SidecarError {
                resolved[i] = Resolved(question: nil, note: modelProblem(err))
            } catch {
                resolved[i] = Resolved(question: nil, note: "The tutor could not be reached.")
            }
        }
    }

    /// The refusal the web's modelProblem names.
    private func modelProblem(_ err: SidecarClient.SidecarError) -> String {
        switch err.code {
        case "MISSING_API_KEY":
            return err.error ?? "The tutor has no model provider key yet. Add one in Settings, under Providers."
        case "UNSTRUCTURED_REPLY":
            return "The tutor answered, but not with a question it could be graded on."
        case "RATE_LIMITED":
            return "Too many questions in a minute; the tutor is resting."
        default:
            return err.error ?? "The tutor did not answer (HTTP \(err.status))."
        }
    }

    /// `reply["question"]` → SessionQuestion, or nil when the object is
    /// not one — the server already parsed, shuffled and numbered it, so
    /// this only has to believe the fields it names.
    private static func modelQuestion(_ raw: Any?) -> SessionQuestion? {
        guard
            let q = raw as? [String: Any],
            let prompt = q["prompt"] as? String,
            let choices = q["choices"] as? [String],
            let correct = (q["correct"] as? NSNumber)?.intValue,
            choices.count >= 2, correct >= 0, correct < choices.count
        else { return nil }
        return SessionQuestion(
            id: q["id"] as? String ?? "model",
            prompt: prompt,
            choices: choices,
            correct: correct,
            reason: q["reason"] as? String,
            explanation: q["explanation"] as? String,
            source: q["source"] as? String,
            origin: .model
        )
    }

    // MARK: Grade, advance, close

    /// Grade the pick — the observe call as a local write: BKT for the
    /// concept, propagation to its prerequisites, the card rescheduled,
    /// the observation event and the session row, one transaction. The
    /// pick is locked at the first attempt; a failed write keeps it so
    /// "Try again" replays the same answer rather than a new one.
    private func grade(_ choice: Int?) {
        guard let step = steps[safe: index],
              case .ready(let question) = questionFor(index),
              graded[index] == nil, !pending
        else { return }
        pending = true
        error = nil
        let attempt = attempts[index] ?? (
            requestId: UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased(),
            picked: choice
        )
        attempts[index] = attempt
        let picked = attempt.picked
        let correct = picked != nil && picked == question.correct
        if sessionId == nil {
            sessionId = newSessionId(slug: slug, now: Date(), random: UUID().uuidString)
        }
        // Asked after this session taught it, a check is a teaching
        // check; a Quiz me check with no teaching only measures —
        // `source` in the web's grade, the same either way.
        let source = step.kind == .check && mode == .learn ? "teach" : "probe"
        // The model advances with the answer; if the write does not land
        // the model goes back too, so a retry replays the same answer from
        // the same state rather than stacking a second update on the first.
        let baseline = model
        var write = model.answer(
            slug, correct: correct, source: source,
            prereqsOf: { store.learn.byId[$0]?.requires ?? [] }
        )
        write.sessionId = sessionId!
        write.sessionTitle = title
        write.sessionGoal = slug
        write.requestId = attempt.requestId
        write.question = question.prompt
        write.answer = question.choices[safe: question.correct]
        write.chosen = picked.flatMap { question.choices[safe: $0] }
        if learner.recordSessionAnswer(write) {
            graded[index] = Graded(picked: picked, correct: write.outcome.correct, outcome: write.outcome)
            answers.append(write.outcome)
            if !answeredConcepts.contains(write.outcome.concept) {
                answeredConcepts.append(write.outcome.concept)
            }
            store.refreshLearner()
        } else {
            model = baseline
            error = learner.error ?? "Not saved. Press Try again; your pick is kept."
        }
        pending = false
    }

    /// To the next step; the close step stamps the session and closes it —
    /// the web's advance with its closeSession call.
    private func advance() {
        let to = index + 1
        guard to < steps.count else { return }
        index = to
        selected = nil
        error = nil
        whyOpen = false
        if steps[to].kind == .close {
            closedAt = Date()
            closeSessionOnce()
            store.refreshLearner()
        }
    }

    /// session-close fires once, however the session ends — the close
    /// step, Exit mid-way, or the view going away. A session no answer
    /// opened has nothing to close.
    private func closeSessionOnce() {
        guard let sid = sessionId, !sessionClosed else { return }
        sessionClosed = true
        learner.closeSession(sid, concepts: answeredConcepts, at: closedAt ?? Date())
    }

    /// The first reason a question step gave for asking nothing — the
    /// close screen's explanation when no belief moved.
    private var nothingReason: String? {
        for i in steps.indices where steps[i].kind == .probe || steps[i].kind == .check {
            if case .none(let note) = questionFor(i) { return note }
        }
        return nil
    }

    // MARK: - The frame

    private var sessionBody: some View {
        let step = steps[safe: index]
        let label = sessionStepLabel(steps, index: index, title: title)
        let percent: Double = steps.isEmpty ? 0
            : (step?.kind == .close ? 100 : Double(index + 1) / Double(steps.count) * 100)
        return VStack(spacing: 0) {
            // The session's thin top bar — Step i of n.
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    G.track
                    G.accent.frame(width: geo.size.width * percent / 100)
                }
            }
            .frame(height: 8)

            HStack {
                Text(label)
                    .font(.callout)
                    .foregroundStyle(G.text2)
                    .lineLimit(1)
                Spacer()
                Button("Exit to workspace") { dismiss() }
                    .buttonStyle(.plain)
                    .font(.callout)
                    .foregroundStyle(G.text2)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 12)

            ScrollView {
                Group {
                    if let step {
                        stepContent(step)
                    }
                }
                .id(index)
                .frame(maxWidth: 720, alignment: .leading)
                .padding(.horizontal, 28)
                .padding(.top, 10)
                .padding(.bottom, 48)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private func stepContent(_ step: SessionStep) -> some View {
        switch step.kind {
        case .teach: teachStep
        case .close: closeStep
        case .probe, .check: questionStep(step)
        }
    }

    // MARK: A question step

    private func questionStep(_ step: SessionStep) -> some View {
        let status = questionFor(index)
        let answered = graded[index]
        return VStack(alignment: .leading, spacing: 20) {
            Text("\(title) · \(step.kind.name)")
                .font(.gnosiaTitle(26))
            if step.kind == .probe {
                Text("One question before any teaching — not for marks, just to see what you already hold.")
                    .font(.callout)
                    .foregroundStyle(G.text2)
            }
            switch status {
            case .loading:
                placeholder("The tutor is writing a question…")
            case .none(let note):
                noQuestionCard(note: note, probe: step.kind == .probe)
            case .ready(let question):
                questionCard(question, answered: answered)
            }
        }
    }

    /// "The tutor is writing a question…" — the loading placeholder's
    /// empty card.
    private func placeholder(_ text: String) -> some View {
        VStack(spacing: 10) {
            ProgressView()
                .controlSize(.small)
            Text(text)
                .font(.callout)
                .foregroundStyle(G.text3)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 180)
        .background(G.surface2, in: RoundedRectangle(cornerRadius: 16))
    }

    /// A step the note could not fill and the tutor declined — the
    /// callout the web draws, with its Ask again when the step can be
    /// re-asked and the consequence line on carrying on.
    private func noQuestionCard(note: String, probe: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("No question for this step")
                .font(.headline)
            Text(withConsequence(note, "Nothing is recorded; carry on\(probe ? " to the teaching" : "")."))
                .font(.callout)
                .foregroundStyle(G.text2)
            HStack {
                Spacer()
                if canAskAgain {
                    Button("Ask again") {
                        requested.remove(index)
                        resolved[index] = nil
                        askModelQuestion(index)
                    }
                    .buttonStyle(.plain)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.accentText)
                    .padding(.trailing, 12)
                }
                primaryButton("Continue") { advance() }
            }
            .padding(.top, 6)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(G.border, lineWidth: 1))
    }

    /// canAskAgain — the step may be re-asked: it has no question of its
    /// own, no fallback, and the ask resolved to nothing.
    private var canAskAgain: Bool {
        guard let step = steps[safe: index],
              step.question == nil, step.fallback == nil,
              let r = resolved[index], r.question == nil
        else { return false }
        return true
    }

    /// The question card — the prompt, the numbered choices, then either
    /// the Check row or the feedback bar once graded.
    private func questionCard(_ question: SessionQuestion, answered: Graded?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(question.prompt)
                .font(.title3.weight(.semibold))

            VStack(spacing: 8) {
                ForEach(Array(question.choices.enumerated()), id: \.offset) { i, choice in
                    choiceRow(i, choice, question: question, answered: answered)
                }
            }

            if let answered {
                feedbackBar(question, answered: answered)
            } else {
                HStack(spacing: 12) {
                    ghostButton("I don't know") { grade(nil) }
                    Spacer()
                    primaryButton(attempts[index] != nil ? "Try again" : "Check") {
                        grade(selected)
                    }
                    .disabled(selected == nil && attempts[index] == nil)
                    .disabled(pending)
                    .keyboardShortcut(.defaultAction)
                }
                if let error {
                    Text(error)
                        .font(.callout)
                        .foregroundStyle(G.warnText)
                }
            }
        }
    }

    private enum ChoiceState { case idle, selected, correct, wrong }

    private func choiceState(_ i: Int, question: SessionQuestion, answered: Graded?) -> ChoiceState {
        guard let answered else { return selected == i ? .selected : .idle }
        if i == question.correct { return .correct }
        if answered.picked == i { return .wrong }
        return .idle
    }

    /// One choice row — the web's ChoiceRow: number badge, then the text,
    /// then the tag a graded row earns. Graded rows recolour in place.
    private func choiceRow(_ i: Int, _ choice: String, question: SessionQuestion, answered: Graded?) -> some View {
        let state = choiceState(i, question: question, answered: answered)
        let fill: Color = switch state {
        case .idle: G.surface
        case .selected: G.tint
        case .correct: G.ok.opacity(0.15)
        case .wrong: G.streak.opacity(0.15)
        }
        let stroke: Color = switch state {
        case .idle: G.border
        case .selected: G.accent
        case .correct: G.okText
        case .wrong: G.warnText
        }
        let ink: Color = switch state {
        case .idle, .selected: G.text
        case .correct: G.okText
        case .wrong: G.warnText
        }
        let tag: String? = switch state {
        case .correct: "correct answer"
        case .wrong: "your answer"
        default: nil
        }
        return Button {
            if answered == nil && !pending { selected = i }
        } label: {
            HStack(spacing: 12) {
                Text("\(i + 1)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(G.text3)
                    .frame(width: 26, height: 26)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(G.border, lineWidth: 1.5))
                Text(choice)
                    .font(.callout.weight(.medium))
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
            .padding(.vertical, 9)
            .frame(minHeight: 52)
            .background(fill, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(stroke, lineWidth: 1.5))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(answered != nil || pending)
        .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: [])
    }

    /// The verdict bar — the web's FeedbackBar: tinted card, the ✓ or !
    /// disc, the verdict over the reason and the mastery note, "Why?" and
    /// Continue to the right.
    private func feedbackBar(_ question: SessionQuestion, answered: Graded) -> some View {
        let ok = answered.correct
        let verdict = ok ? "Correct" : (answered.picked == nil ? "Here is the answer" : "Not quite")
        let tint: Color = ok ? G.ok.opacity(0.15) : G.streak.opacity(0.15)
        let ink: Color = ok ? G.okText : G.warnText
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 14) {
                Text(ok ? "✓" : "!")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ok ? Color.white : G.btnText)
                    .frame(width: 44, height: 44)
                    .background(ok ? G.ok : G.streak, in: Circle())

                VStack(alignment: .leading, spacing: 3) {
                    Text(verdict)
                        .font(.headline)
                        .foregroundStyle(ink)
                    if let reason = question.reason, !reason.isEmpty {
                        Text(reason)
                            .font(.callout)
                            .foregroundStyle(ink)
                    }
                    Text(sessionFeedbackNote(answered.outcome))
                        .font(.caption)
                        .foregroundStyle(G.text2)
                }
                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 8) {
                    if question.explanation != nil || question.source != nil {
                        ghostButton(whyOpen ? "Hide why" : "Why?") { whyOpen.toggle() }
                    }
                    primaryButton("Continue") { advance() }
                        .keyboardShortcut(.defaultAction)
                }
            }
            if whyOpen {
                VStack(alignment: .leading, spacing: 4) {
                    if let explanation = question.explanation {
                        Text(explanation)
                            .font(.callout)
                            .foregroundStyle(G.text)
                    }
                    if let source = question.source {
                        Text(source)
                            .font(.caption)
                            .foregroundStyle(G.text2)
                    }
                }
                .padding(.leading, 58)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: The teaching step

    private var teachStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("\(title) · Teach")
                .font(.gnosiaTitle(26))
            if !teach.isEmpty {
                NoteBodyView(source: teach)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if !summary.isEmpty {
                Text(summary)
                    .font(.body)
            } else {
                Text("This note has no body yet. Read the summary in the workspace, then check yourself below.")
                    .font(.callout)
                    .foregroundStyle(G.text2)
            }
            if noteAsksNothing {
                callout(
                    "No question from the note",
                    "This note has no check the session can ask. Any question will be the tutor's; if the tutor cannot write one either, nothing is recorded."
                )
            }
            HStack {
                Spacer()
                primaryButton("Continue") { advance() }
                    .keyboardShortcut(.defaultAction)
            }
        }
    }

    /// A quiet information card — the web's Callout.
    private func callout(_ heading: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(heading)
                .font(.headline)
            Text(text)
                .font(.callout)
                .foregroundStyle(G.text2)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(G.border, lineWidth: 1))
    }

    // MARK: The close

    private var closeStep: some View {
        let minutes = max(1, Int(((closedAt ?? Date()).timeIntervalSince(startedAt) / 60).rounded()))
        let totals = sessionTotals(slug: slug, answers: answers)
        let moved = sessionWhatMoved(slug: slug, title: title, answers: answers, titles: titles)
        let scheduled = sessionScheduled(slug: slug, title: title, answers: answers, titles: titles)
        let walked = stepsWalked(steps)
        return VStack(spacing: 24) {
            VStack(spacing: 8) {
                Text(walked.isEmpty ? "Nothing to ask" : "Session closed")
                    .font(.gnosiaTitle(30))
                Text(walked.isEmpty ? title : "\(title) · \(minutes) min · \(walked)")
                    .font(.callout)
                    .foregroundStyle(G.text2)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)

            HStack(spacing: 12) {
                statTile("Right", "\(totals.right) / \(totals.answered)")
                statTile("Mastery moved", formatTotalsMove(totals))
                statTile("Review cards", "\(totals.cards)")
            }

            cardBlock("What moved") {
                if moved.isEmpty {
                    Text(nothingReason == nil
                        ? "Nothing was answered, so no belief moved."
                        : withConsequence(nothingReason!, "Nothing was recorded."))
                        .font(.callout)
                        .foregroundStyle(G.text2)
                        .padding(.vertical, 4)
                } else {
                    ForEach(Array(moved.enumerated()), id: \.offset) { i, row in
                        movedRow(row)
                        if i < moved.count - 1 {
                            Divider().overlay(G.hair)
                        }
                    }
                }
            }

            cardBlock("Scheduled") {
                if scheduled.isEmpty {
                    Text("No review card was scheduled.")
                        .font(.callout)
                        .foregroundStyle(G.text2)
                        .padding(.vertical, 4)
                } else {
                    ForEach(Array(scheduled.enumerated()), id: \.offset) { i, row in
                        HStack(spacing: 10) {
                            Circle().fill(G.text3).frame(width: 8, height: 8)
                            Text(row.title)
                                .font(.callout.weight(.medium))
                                .lineLimit(1)
                            Spacer()
                            Text("\(row.created ? "new card, " : "")review \(dueLabel(row.due).label)")
                                .font(.caption)
                                .foregroundStyle(G.text2)
                        }
                        .padding(.vertical, 7)
                        if i < scheduled.count - 1 {
                            Divider().overlay(G.hair)
                        }
                    }
                }
            }

            // The web's exits: a secondary workspace link on the left, and
            // on the right either "Keep going" to the next concept's own
            // session or, frontier spent, the primary way back.
            HStack(spacing: 12) {
                if let next {
                    NavigationLink(value: AppDestination.concept(slug)) {
                        Text("Back to the workspace")
                            .font(.callout.weight(.medium))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border, lineWidth: 1))
                            .foregroundStyle(G.text)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    NavigationLink(value: AppDestination.session(concept: next.slug)) {
                        Text("Keep going · \(next.title)")
                            .font(.callout.weight(.semibold))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(G.btnFace, in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(G.btnText)
                            .lineLimit(1)
                    }
                    .buttonStyle(.plain)
                } else {
                    Spacer()
                    NavigationLink(value: AppDestination.concept(slug)) {
                        Text("Back to the workspace")
                            .font(.callout.weight(.semibold))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(G.btnFace, in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(G.btnText)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// One stat tile of the three — the web's StatTile: value over label
    /// on a surface card.
    private func statTile(_ label: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3.weight(.bold))
                .monospacedDigit()
            Text(label)
                .font(.caption)
                .foregroundStyle(G.text2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(G.border, lineWidth: 1))
    }

    /// A titled card of close-screen rows.
    private func cardBlock<Content: View>(_ heading: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(heading)
                .font(.headline)
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(G.border, lineWidth: 1))
    }

    /// One What moved row — the concept, its before bar and its after
    /// bar, "(prerequisite)" when the move was propagation's.
    private func movedRow(_ row: SessionMovedRow) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(row.title)
                    .font(.callout.weight(.medium))
                    .lineLimit(1)
                if row.prerequisite {
                    Text("(prerequisite)")
                        .font(.caption)
                        .foregroundStyle(G.text3)
                }
                Spacer()
                Text("\(formatPL(row.before)) → \(formatPL(row.after))")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(G.text2)
            }
            movedBar(row.before, tint: G.text3.opacity(0.45))
            movedBar(row.after, tint: G.accent)
        }
        .padding(.vertical, 7)
    }

    private func movedBar(_ pL: Double, tint: Color) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                G.track
                tint.frame(width: geo.size.width * min(1, max(0, pL)))
            }
        }
        .frame(height: 5)
        .clipShape(Capsule())
    }

    // MARK: - Buttons

    /// The primary action — the web's brand Button: deep teal face, cream
    /// label, the 3D shadow flattened to a border of its own hue.
    private func primaryButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .buttonStyle(.plain)
            .font(.callout.weight(.semibold))
            .foregroundStyle(G.btnText)
            .padding(.horizontal, 18)
            .padding(.vertical, 9)
            .background(G.btnFace, in: RoundedRectangle(cornerRadius: 10))
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
}
