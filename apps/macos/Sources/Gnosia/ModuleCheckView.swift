//
//  ModuleCheckView.swift
//  Gnosia
//
//  A module's check — the web's /courses/<slug>/<module>/check route,
//  SessionFocus in its `module` mode: the module's concepts, each asked
//  until it is mastered, answered wrong once, or asked three times, at
//  most 24 questions, then the session's close screen showing what moved.
//  The last step of the module's path links here; the concept workspace's
//  header offers it too.
//
//  The plan is read once at open (moduleCheckPlan in WeekCheckModel.swift)
//  and held, so the learner refresh after each answer cannot reorder the
//  check under the learner — the rule the web's `useState(() => plan)`
//  states. Which question follows is decided by the answer just given:
//  weekCheckSteps over the outcomes so far.
//
//  Every answer is a probe through recordSessionAnswer — the local
//  `POST /api/learner/observe` — recorded against the step's own concept
//  with the module named, exactly as the web's grade payload sends it, so
//  the check keeps no score of its own and mastery moves per concept. The
//  session row is the module's: its id is the goal, its title the name.
//  The numbers the check draws are the app's estimate until each answer's
//  reply lands, then the catalog's (`LearnerStore.shown`).
//

import SwiftUI

struct ModuleCheckView: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner
    @Environment(SidecarManager.self) private var sidecar

    /// The course and the module the check is for — the route's segments,
    /// resolved.
    let course: CatalogCourse
    let module: CourseModule

    // MARK: The plan, built at open

    @State private var ready = false
    @State private var plan = WeekCheckPlan(concepts: [], modelAvailable: false)
    /// Why the check asks nothing, when the plan knew before it began —
    /// the web page's `weekCheck.reason`.
    @State private var reason: String? = nil
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
    /// A step left with no question: the concept it was about — the web's
    /// `skipped`, which is what ends that concept's asking.
    @State private var skipped: [Int: String] = [:]
    /// The first attempt fixes the pick, the confidence and the reasoning;
    /// a retry sends them again under its first requestId, so a replay
    /// never duplicates evidence.
    @State private var attempts: [Int: (requestId: String, picked: Int?, confidence: Int?, thinking: String?)] = [:]
    /// "How sure are you?" and the reasoning box, asked once an option is
    /// picked (SessionSureness); they start over on every step.
    @State private var confidence = sessionDefaultConfidence
    @State private var thinking = ""
    @FocusState private var reasoningFocused: Bool
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

    /// What each step came to, in order, as far as they are decided — the
    /// web's `outcomes`: graded answers, then the steps left with nothing
    /// to ask.
    private var outcomes: [WeekCheckOutcome] {
        var out: [WeekCheckOutcome] = []
        var i = 0
        while true {
            if let g = graded[i] {
                out.append(weekCheckOutcome(of: g.outcome))
            } else if let concept = skipped[i] {
                out.append(WeekCheckOutcome(concept: concept, result: .none, mastered: false))
            } else {
                break
            }
            i += 1
        }
        return out
    }

    /// The steps the walk shows — grown from the outcomes, so an answer
    /// decides what follows it.
    private var steps: [SessionStep] {
        weekCheckSteps(plan: plan, outcomes: outcomes)
    }

    /// The concept a step asks about — its own in a module check.
    private func conceptOf(_ step: SessionStep?) -> String {
        step?.place?.slug ?? module.id
    }

    var body: some View {
        Group {
            if ready {
                sessionBody
            } else {
                ContentUnavailableView {
                    ProgressView()
                } description: {
                    Text("Preparing the check…").font(.callout)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(G.page)
        .navigationTitle("\(course.code) · Module check · \(module.title)")
        .task { await prepare() }
        .onChange(of: store.loaded) { _, _ in Task { await prepare() } }
        .onChange(of: index) { _, i in askModelQuestion(i) }
        .onDisappear { closeSessionOnce() }
    }

    /// The plan, the model availability and the learner model, once — the
    /// server half of the web's check page (week-check-page.ts) run at
    /// open. The tutor-model probe is the mirror's stand-in for the
    /// web's `tutorModelConfigured`: a chain entry whose provider has a
    /// key, saved or server, is a model that can be asked.
    private func prepare() async {
        guard !ready, store.loaded else { return }
        let available = await probeModelAvailable()
        plan = moduleCheckPlan(module: module, store: store, modelAvailable: available)
        reason = weekCheckReason(plan)
        titles = Dictionary(uniqueKeysWithValues: store.learn.concepts.map { ($0.slug, $0.title) })
        startedAt = Date()
        ready = true
        askModelQuestion(index)
    }

    /// Whether a tutor model can be asked at all, as the sidecar answers
    /// it: a chain entry (or, with no chain, any provider) whose key is in
    /// use — `tutorCredentials().some(isCallable)` over the endpoints the
    /// sidecar mirrors. Everything failing reads as no model, the answer
    /// the web's check would get with no key anywhere.
    private func probeModelAvailable() async -> Bool {
        guard let client = try? await sidecar.readyClient() else { return false }
        async let chainCall = client.tutorChain()
        async let keysCall = client.providerKeys()
        guard
            let chain = try? await chainCall, chain.ok,
            let keys = try? await keysCall
        else { return false }
        let keyed = Set(keys.rows.filter { $0.inUse != nil }.map(\.id))
        if chain.chain.isEmpty { return !keyed.isEmpty }
        return chain.chain.contains { keyed.contains($0.provider) }
    }

    // MARK: What a question step shows

    private enum QuestionStatus {
        case loading
        case ready(SessionQuestion)
        case none(String)
    }

    /// The question on screen for a step, or why there is none, or that
    /// it is coming — the web's questionFor: the note's own question
    /// first, then the tutor's; a check step carries no fallback.
    private func questionFor(_ i: Int) -> QuestionStatus {
        guard let step = steps[safe: i], step.kind == .check else { return .none("") }
        if let question = step.question { return .ready(question) }
        guard plan.modelAvailable else { return .none(NOTHING_TO_ASK) }
        guard let r = resolved[i] else { return .loading }
        if let question = r.question { return .ready(question) }
        return .none(r.note ?? NOTHING_TO_ASK)
    }

    /// A check step with nothing from the note asks the tutor, once —
    /// `POST /api/agent/session` with `{ conceptSlug, step: "check",
    /// avoid }` where avoid is the last questions this concept already
    /// stood in front of.
    private func askModelQuestion(_ i: Int) {
        guard
            ready,
            let step = steps[safe: i], step.kind == .check, step.question == nil,
            plan.modelAvailable,
            !requested.contains(i)
        else { return }
        requested.insert(i)
        let concept = conceptOf(step)
        let asked = graded.keys.sorted().compactMap { k -> String? in
            guard let s = steps[safe: k], conceptOf(s) == concept,
                  case .ready(let q) = questionFor(k) else { return nil }
            return q.prompt
        }.suffix(4).map { $0 }
        Task { @MainActor in
            do {
                let client = try await sidecar.readyClient()
                let reply = try await client.sessionQuestion(conceptSlug: concept, step: "check", avoid: asked)
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
    /// not one — the same parse the concept session runs.
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

    /// Grade the pick — one probe recorded against the step's own concept
    /// with the module named, as the web's grade payload sends it. The
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
            picked: choice,
            // "I don't know" carries no confidence (K6).
            confidence: choice == nil ? nil : confidence,
            thinking: sessionThinking(thinking)
        )
        attempts[index] = attempt
        let picked = attempt.picked
        let correct = picked != nil && picked == question.correct
        if sessionId == nil {
            sessionId = newSessionId(slug: module.id, now: Date(), random: UUID().uuidString)
        }
        let concept = conceptOf(step)
        // The estimate starts from the store's rows as they stand, which
        // a failed write leaves untouched, so a retry replays the same
        // answer from the same state.
        var model = SessionLearnerModel.current(store)
        var write = model.answer(
            concept, correct: correct, source: "probe", confidence: attempt.confidence,
            prereqsOf: { store.learn.byId[$0]?.requires ?? [] }
        )
        write.sessionId = sessionId!
        write.sessionTitle = module.title
        write.sessionGoal = module.id
        write.module = module.id
        write.requestId = attempt.requestId
        write.question = question.prompt
        write.answer = question.choices[safe: question.correct]
        write.chosen = picked.flatMap { question.choices[safe: $0] }
        write.thinking = attempt.thinking
        if learner.recordSessionAnswer(write) {
            graded[index] = Graded(picked: picked, correct: write.outcome.correct, outcome: write.outcome)
            answers.append(write.outcome)
            if !answeredConcepts.contains(write.outcome.concept) {
                answeredConcepts.append(write.outcome.concept)
            }
            store.refreshLearner()
        } else {
            error = learner.error ?? "Not saved. Press Try again; your pick is kept."
        }
        pending = false
    }

    /// To the next step — the web's advance: a step left with nothing to
    /// ask ends its concept first (the `skipped` outcome), then the walk
    /// recomputes what follows; the close step stamps the session and
    /// closes it.
    private func advance() {
        // What follows an answer is decided by the answer as it stands when
        // the learner moves on: the catalog's record when its reply is in
        // (it says whether the concept is now mastered), else the app's
        // estimate. Taken here, once, so a reply arriving later cannot
        // rewrite the step the learner is on.
        if let g = graded[index] {
            graded[index]?.outcome = learner.shown(g.outcome)
        }
        var walk = steps
        let current = steps[safe: index]
        if current?.kind == .check, graded[index] == nil, skipped[index] == nil {
            let concept = conceptOf(current)
            skipped[index] = concept
            walk = weekCheckSteps(plan: plan, outcomes: outcomes)
        }
        let to = index + 1
        guard to < walk.count else { return }
        index = to
        selected = nil
        confidence = sessionDefaultConfidence
        thinking = ""
        whyOpen = false
        error = nil
        if walk[to].kind == .close {
            closedAt = Date()
            closeSessionOnce()
            store.refreshLearner()
        }
    }

    /// session-close fires once, however the check ends — the close step,
    /// Exit mid-way, or the view going away. A session no answer opened
    /// has nothing to close.
    private func closeSessionOnce() {
        guard let sid = sessionId, !sessionClosed else { return }
        sessionClosed = true
        learner.closeSession(sid, concepts: answeredConcepts, at: closedAt ?? Date())
    }

    // MARK: - The frame

    private var sessionBody: some View {
        let step = steps[safe: index]
        let label = "Module check · \(weekCheckLabel(step))"
        let percent = weekCheckPercent(step)
        return VStack(spacing: 0) {
            // The session's thin top bar — weekCheckPercent's share.
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
                NavigationLink(value: AppDestination.module(course: course.slug, module: module.slug)) {
                    Text("Exit to module")
                        .font(.callout)
                        .foregroundStyle(G.text2)
                }
                .buttonStyle(.plain)
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
        case .close: closeStep
        default: questionStep(step)
        }
    }

    // MARK: A question step

    private func questionStep(_ step: SessionStep) -> some View {
        let status = questionFor(index)
        let answered = graded[index]
        return VStack(alignment: .leading, spacing: 20) {
            // The web's h1: the concept this step asks, not the module.
            Text(step.place?.title ?? module.title)
                .font(.gnosiaTitle(26))
            switch status {
            case .loading:
                placeholder("The tutor is writing a question…")
            case .none(let note):
                noQuestionCard(note: note)
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
    /// callout the web draws, with Ask again when the step can be
    /// re-asked and the consequence line on carrying on.
    private func noQuestionCard(note: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("No question for this step")
                .font(.headline)
            Text(withConsequence(note, "Nothing is recorded; carry on."))
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

    /// canAskAgain — the step may be re-asked: a model is set up, it has
    /// no question of its own, no fallback, and the ask resolved to
    /// nothing.
    private var canAskAgain: Bool {
        guard plan.modelAvailable,
              let step = steps[safe: index],
              step.question == nil, step.fallback == nil,
              let r = resolved[index], r.question == nil
        else { return false }
        return true
    }

    /// The question card — the prompt, the numbered choices, then either
    /// the Check row or the feedback bar once graded.
    private func questionCard(_ question: SessionQuestion, answered: Graded?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            MathText(text: question.prompt, font: .title3.weight(.semibold))

            VStack(spacing: 8) {
                ForEach(Array(question.choices.enumerated()), id: \.offset) { i, choice in
                    choiceRow(i, choice, question: question, answered: answered)
                }
            }

            if answered == nil, shownPick != nil {
                SessionSureness(
                    confidence: $confidence, thinking: $thinking,
                    locked: pending || attempts[index] != nil,
                    reasoningFocused: $reasoningFocused
                )
            }

            if let answered {
                feedbackBar(question, answered: answered)
            } else {
                HStack(spacing: 12) {
                    ghostButton("I don't know") { grade(nil) }
                        .disabled(pending || attempts[index] != nil)
                    Spacer()
                    primaryButton(pending ? "Saving…" : (attempts[index] != nil ? "Try again" : "Check")) {
                        grade(selected)
                    }
                    .disabled((selected == nil && attempts[index] == nil) || pending)
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

    /// The pick as sent: once Check went out the choice is fixed — the
    /// web's `sent` — so a retried write pairs the saved verdict with the
    /// option it was made for, not the one tapped since.
    private var shownPick: Int? {
        attempts[index].map { $0.picked } ?? selected
    }

    private func choiceState(_ i: Int, question: SessionQuestion, answered: Graded?) -> ChoiceState {
        guard let answered else { return shownPick == i ? .selected : .idle }
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
            if answered == nil && !pending && attempts[index] == nil { selected = i }
        } label: {
            HStack(spacing: 12) {
                Text("\(i + 1)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(G.text3)
                    .frame(width: 26, height: 26)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(G.border, lineWidth: 1.5))
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
            .padding(.vertical, 9)
            .frame(minHeight: 52)
            .background(fill, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(stroke, lineWidth: 1.5))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(answered != nil || pending || attempts[index] != nil)
        // Stood down while the reasoning box has focus, so a digit typed
        // there stays in the box.
        .keyboardShortcut(reasoningFocused ? nil : KeyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: []))
    }

    /// The verdict bar — the web's FeedbackBar: tinted card, the ✓ or !
    /// disc, the verdict over the reason and the mastery note, "Why?" and
    /// the ways on to the right. "Ask the tutor" leads to the concept's
    /// own workspace — the native stand-in for the web's `?ask=` prefill,
    /// which the native tutor has no composer to accept.
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
                        MathText(text: reason, font: .callout)
                            .foregroundStyle(ink)
                    }
                    Text(sessionFeedbackNote(learner.shown(answered.outcome)))
                        .font(.caption)
                        .foregroundStyle(G.text2)
                }
                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 8) {
                    if question.explanation != nil || question.source != nil {
                        ghostButton(whyOpen ? "Hide why" : "Why?") { whyOpen.toggle() }
                    }
                    if let slug = steps[safe: index]?.place?.slug {
                        NavigationLink(value: AppDestination.concept(slug)) {
                            Text("Ask the tutor")
                                .font(.callout.weight(.medium))
                                .foregroundStyle(G.text)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                    primaryButton("Continue") { advance() }
                        .keyboardShortcut(.defaultAction)
                }
            }
            if whyOpen {
                VStack(alignment: .leading, spacing: 4) {
                    if let explanation = question.explanation {
                        MathText(text: explanation, font: .callout)
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

    // MARK: The close

    private var closeStep: some View {
        let minutes = max(1, Int(((closedAt ?? Date()).timeIntervalSince(startedAt) / 60).rounded()))
        let slugs = plan.concepts.map(\.slug)
        let shown = answers.map(learner.shown)
        let totals = sessionTotals(slugs: slugs, answers: shown)
        let moved = sessionWhatMoved(slug: module.id, title: module.title, answers: shown, titles: titles)
        let scheduled = sessionScheduled(slug: module.id, title: module.title, answers: shown, titles: titles)
        let walked = stepsWalked(steps)
        let asked = "\(answers.count) question\(answers.count == 1 ? "" : "s")"
        return VStack(spacing: 24) {
            VStack(spacing: 8) {
                Text(walked.isEmpty ? "Nothing to ask" : "Module check done")
                    .font(.gnosiaTitle(30))
                Text(walked.isEmpty ? module.title : "\(module.title) · \(minutes) min · \(asked)")
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
            if let estimate = sessionEstimateNote(shown) {
                Text(estimate)
                    .font(.caption)
                    .foregroundStyle(G.text2)
                    .frame(maxWidth: .infinity, alignment: .center)
            }

            cardBlock("What moved") {
                if moved.isEmpty {
                    Text(reason == nil
                        ? "Nothing was answered, so no belief moved."
                        : withConsequence(reason!, "Nothing was recorded."))
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

            // The web's way on for a check: back to the module, the same
            // place its Exit row goes.
            HStack(spacing: 12) {
                Spacer()
                NavigationLink(value: AppDestination.module(course: course.slug, module: module.slug)) {
                    Text("Back to the module")
                        .font(.callout.weight(.semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(G.btnFace, in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(G.btnText)
                }
                .buttonStyle(.plain)
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
    /// label.
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
