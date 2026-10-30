//
//  WeekCheckModel.swift
//  Gnosia
//
//  A module's check — the web's week check (apps/web/src/lib/week-check.ts,
//  plus the plan half of week-check-page.ts): the module's concepts, each
//  asked until it is mastered, answered wrong once, or asked three times,
//  24 questions at most, every answer a probe that names the module.
//
//  Pure arithmetic and read-model lookups; ModuleCheckView owns the walk.
//  One approximation the mirror forces, the same one checkStatuses
//  documents: the mirrored `observation` rows name no concept, so a check's
//  last asking is matched by question text over every observation rather
//  than the concept's own history.
//

import Foundation

/// The most questions one check asks — WEEK_CHECK_LIMIT.
let weekCheckLimit = 24

/// The most questions about one concept — WEEK_CHECK_PER_CONCEPT. Three
/// correct probes take a new concept from the 0.25 prior past the mastery
/// threshold, so three is the number that can finish one.
let weekCheckPerConcept = 3

/// "Up to N questions": three a concept, never past the limit — weekCheckBound.
func weekCheckBound(_ concepts: Int) -> Int {
    min(weekCheckLimit, weekCheckPerConcept * max(0, concepts))
}

/// One concept as the check asks it — WeekCheckConcept.
struct WeekCheckConcept: Hashable {
    let slug: String
    let title: String
    /// p(L) when the check began.
    let pL: Double
    /// The note's checks as questions, the one asked least recently first.
    var questions: [SessionQuestion]
}

/// WeekCheckPlan: the concepts in the order the check asks them, and
/// whether a tutor model can write the questions a note runs out of.
struct WeekCheckPlan: Hashable {
    var concepts: [WeekCheckConcept]
    var modelAvailable: Bool
}

/// What one step came to — WeekCheckOutcome: answered right or wrong (with
/// whether the concept is now mastered), or `none` when there was no
/// question to ask it.
struct WeekCheckOutcome: Hashable {
    enum Result: String, Hashable { case right, wrong, none }
    let concept: String
    let result: Result
    let mastered: Bool
}

/// The question a step asks — WeekCheckQuestion.
struct WeekCheckQuestion {
    let concept: WeekCheckConcept
    /// 1-based, in the check's order.
    let position: Int
    /// 1-based: the how-manyth question about this concept.
    let question: Int
    /// The note's question, or nil when the tutor writes this one.
    let note: SessionQuestion?
}

/// The order the check asks the concepts in — weekCheckOrder: the path's,
/// when every concept fits its three questions in the 24; otherwise the
/// weakest by p(L) first, ties keeping the path's order.
func weekCheckOrder(_ concepts: [WeekCheckConcept]) -> [WeekCheckConcept] {
    if concepts.count * weekCheckPerConcept <= weekCheckLimit { return concepts }
    return concepts.enumerated().sorted { a, b in
        a.element.pL != b.element.pL ? a.element.pL < b.element.pL : a.offset < b.offset
    }.map(\.element)
}

/// A note's checks, the one this learner was asked least recently first —
/// checksByLastAsked: never asked, then the oldest last asking; a check's
/// last asking is the latest observation whose question reads the same.
/// Ties keep the note's order.
func checksByLastAsked(checks: [ConceptCheck], history: [(at: Date, question: String?)]) -> [ConceptCheck] {
    var last: [String: Date] = [:]
    for o in history {
        guard let question = o.question else { continue }
        let key = normaliseQuestion(question)
        if let seen = last[key], seen >= o.at { continue }
        last[key] = o.at
    }
    return checks.enumerated().sorted { a, b in
        let ta = last[normaliseQuestion(a.element.question)] ?? .distantPast
        let tb = last[normaliseQuestion(b.element.question)] ?? .distantPast
        return ta != tb ? ta < tb : a.offset < b.offset
    }.map(\.element)
}

/// The question after `outcomes`, or nil when the check is over —
/// nextWeekCheckQuestion. Every concept is asked at least once, a mastered
/// one included; one stops on a wrong answer, a step with no question, a
/// correct answer that leaves it mastered, or its third question. Its
/// questions are the note's, then the tutor's; with no tutor model a
/// concept whose note has run out stops there. The check stops at 24 answers.
func nextWeekCheckQuestion(plan: WeekCheckPlan, outcomes: [WeekCheckOutcome]) -> WeekCheckQuestion? {
    let answered = outcomes.filter { $0.result != .none }.count
    if answered >= weekCheckLimit { return nil }
    for (i, concept) in plan.concepts.enumerated() {
        let own = outcomes.filter { $0.concept == concept.slug }
        let last = own.last
        let finished = own.count >= weekCheckPerConcept
            || (last != nil && (last!.result != .right || last!.mastered))
        if finished { continue }
        let note = own.count < concept.questions.count ? concept.questions[own.count] : nil
        if note == nil && !plan.modelAvailable { continue }
        return WeekCheckQuestion(concept: concept, position: i + 1, question: own.count + 1, note: note)
    }
    return nil
}

/// The steps the session walks — weekCheckSteps: one per outcome so far,
/// then the next question, or the close when there is none. A step is
/// decided by the outcomes before it alone, so the list only ever grows at
/// its end; a step the tutor is to fill has no question and no fallback.
func weekCheckSteps(plan: WeekCheckPlan, outcomes: [WeekCheckOutcome]) -> [SessionStep] {
    var steps: [SessionStep] = []
    for i in 0 ... outcomes.count {
        guard let next = nextWeekCheckQuestion(plan: plan, outcomes: Array(outcomes.prefix(i))) else {
            steps.append(SessionStep(kind: .close))
            break
        }
        steps.append(SessionStep(
            kind: .check,
            question: next.note,
            place: SessionStep.Place(
                slug: next.concept.slug,
                title: next.concept.title,
                position: next.position,
                of: plan.concepts.count,
                question: next.question
            )
        ))
    }
    return steps
}

/// One recorded answer as the plan reads it — outcomeOf.
func weekCheckOutcome(of answer: SessionAnswerOutcome) -> WeekCheckOutcome {
    WeekCheckOutcome(
        concept: answer.concept,
        result: answer.correct ? .right : .wrong,
        mastered: answer.mastered
    )
}

/// The progress bar's share, 0 to 100 — weekCheckPercent: the concepts
/// behind this step, and this step's place in its concept.
func weekCheckPercent(_ step: SessionStep?) -> Double {
    guard let step, step.kind != .close else { return 100 }
    guard let place = step.place, place.of > 0 else { return 0 }
    return ((Double(place.position) - 1 + Double(place.question) / Double(weekCheckPerConcept + 1)) / Double(place.of)) * 100
}

/// "Concept 2 of 6 · Question 1" — weekCheckLabel, the frame's label on a
/// check step.
func weekCheckLabel(_ step: SessionStep?) -> String {
    guard let place = step?.place else { return "Module check" }
    return "Concept \(place.position) of \(place.of) · Question \(place.question)"
}

/// The check's two reasons for asking nothing — NOTHING_TO_ASK_MODULE and
/// NO_CONCEPTS_TO_CHECK in session-core.ts.
let NOTHING_TO_ASK_MODULE =
    "No note in this module has a check the session can ask, and the tutor has no model provider key to write one. Add one in Settings, under Providers."
let NO_CONCEPTS_TO_CHECK = "This module names no concept in your knowledge base, so there is nothing to check."

/// Why this check asks nothing, when it does — the page's `reason`: a
/// module naming no concept the knowledge base holds, or a module whose
/// notes all ran dry with no tutor model to ask.
func weekCheckReason(_ plan: WeekCheckPlan) -> String? {
    if plan.concepts.isEmpty { return NO_CONCEPTS_TO_CHECK }
    if !plan.modelAvailable, plan.concepts.allSatisfy({ $0.questions.isEmpty }) {
        return NOTHING_TO_ASK_MODULE
    }
    return nil
}

/// The plan the check page builds once — loadWeekCheck: the module's
/// concepts the knowledge base holds, in path order (lesson by lesson,
/// each in its lesson's order, a concept two lessons name once), each with
/// its p(L) and its note's checks as questions ordered least recently
/// asked first, then put in the check's order.
///
/// The "least recently asked" history is the concept's own observations,
/// matched by the check's question text, as checkStatuses matches them. Wrong options come as a concept session's
/// do (`sessionDistractorPool`, `sessionWrongOptionsFor`), and the variant
/// is "week" so a check asked here and in Quiz me is not laid out the same.
@MainActor func moduleCheckPlan(module: CourseModule, store: CatalogStore, modelAvailable: Bool) -> WeekCheckPlan {
    var taught: [String] = []
    for item in module.items {
        for slug in item.concepts where !taught.contains(slug) { taught.append(slug) }
    }
    var asked: [WeekCheckConcept] = []
    for slug in taught {
        guard let c = store.learn.byId[slug] else { continue }
        let checks = parseChecks(store.conceptBody(slug))
        // This concept's own observations: another concept asking the same
        // question does not make this one's check recently asked.
        let history = store.events
            .filter { observation($0, couldBeAbout: slug) }
            .map { (at: $0.at, question: $0.payload["question"] as? String) }
        // The week check's neighbours: requires, assumes, and the concepts
        // that require or assume this one — distractorPool over the same
        // inputs week-check-page.ts passes (backlinks deliberately empty).
        let neighbours = Set(
            c.requires + c.assumes
                + dependantsOf(store.learn.edges, slug: slug, kinds: [.requires, .assumes])
        )
        let pool = sessionDistractorPool(
            slug: slug, domain: c.domain, neighbours: neighbours,
            concepts: store.learn.concepts
        )
        let answers = checks
            .map { $0.answer.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let questions = checksByLastAsked(checks: checks, history: history).compactMap { check in
            sessionNoteQuestion(
                slug: slug,
                check: check,
                pool: sessionWrongOptionsFor(
                    check: check,
                    otherAnswers: answers.filter {
                        $0 != check.answer.trimmingCharacters(in: .whitespacesAndNewlines)
                    },
                    pool: pool
                ),
                variant: "week",
                summary: c.summary
            )
        }
        asked.append(WeekCheckConcept(slug: slug, title: c.title, pL: c.pL, questions: questions))
    }
    return WeekCheckPlan(concepts: weekCheckOrder(asked), modelAvailable: modelAvailable)
}
