//
//  SessionModel.swift
//  Gnosia
//
//  The session's pure half: the step plan, the questions a note's check
//  blocks become, the teaching prose cut from the note, and the estimate
//  one graded answer writes — BKT update, propagation to the prerequisites,
//  the SM-2 review card — plus the close screen's numbers. The estimate is
//  what the app draws the moment an answer lands; the catalog's reply
//  replaces it (RecordedAnswer, recordedOutcome, LearnerStore.applyRecorded),
//  so the rules here only have to agree with the catalog's, which
//  LearningRulesTests holds them to.
//
//  Kept in step with:
//    packages/tutor/src/session-core.ts     — plan, questions, prose, close
//    packages/tutor/src/session-question.ts — the model's question shape
//    services/catalog/src/state/observe.ts  — recordObservation's writes
//    scripts/learn/lib/bkt.mjs              — the Bayesian update
//    scripts/learn/lib/schedule.mjs         — gradeFromOutcome, newCard
//    packages/tutor/src/check-block.ts      — the confidence stops
//
//  The concept session's two modes: learn (Teach me — probe, teach, check,
//  close) and check (`?mode=check`, the workspace's Quiz me — the note's
//  checks in turn, then close). The module check is a third thing —
//  WeekCheckModel.swift, a different walk rather than a `?mode=` — that
//  reuses this file's steps and writes.
//

import Foundation

// MARK: - Questions (session-core.ts)

/// One multiple-choice question as the session renders it — SessionQuestion.
/// `id` is `c1` for a note's check block, `model` for one the tutor wrote.
struct SessionQuestion: Hashable {
    enum Origin: String, Hashable { case note, model }
    let id: String
    let prompt: String
    let choices: [String]
    /// Index into `choices`.
    let correct: Int
    /// One line for the feedback bar.
    let reason: String?
    /// What "Why?" opens.
    let explanation: String?
    /// The check's `source:` line, shown as a citation.
    let source: String?
    let origin: Origin
}

/// A check block as a multiple-choice question — noteQuestion: its answer
/// and wrong options from `pool`, in an order fixed by `variant` so the same
/// check asked twice (once as the probe, once after teaching) does not put
/// the answer in the same slot both times. Nil when the check has no answer
/// or the pool cannot supply two wrong options.
func sessionNoteQuestion(
    slug: String,
    check: ConceptCheck,
    pool: [String],
    variant: String,
    summary: String = ""
) -> SessionQuestion? {
    let answer = check.answer.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !check.question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !answer.isEmpty else { return nil }
    guard let mc = buildChoices(conceptId: "\(slug)#\(check.id)#\(variant)", answer: answer, pool: pool) else { return nil }
    let why = check.why.trimmingCharacters(in: .whitespacesAndNewlines)
    let source = check.source.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedSummary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
    return SessionQuestion(
        id: check.id,
        prompt: check.question.trimmingCharacters(in: .whitespacesAndNewlines),
        choices: mc.choices,
        correct: mc.correct,
        reason: why.isEmpty ? nil : why,
        explanation: trimmedSummary.isEmpty ? nil : "From your note: \(trimmedSummary)",
        source: source.isEmpty ? nil : source,
        origin: .note
    )
}

/// Wrong options for a note's checks, split by how near they sit to this
/// concept — DistractorPool.
struct SessionDistractorPool {
    /// Summaries of the concept's neighbours (requires, assumes, dependants,
    /// backlinks), then of its domain.
    var near: [String] = []
    /// Every other concept's summary, used only to make up the numbers.
    var far: [String] = []
}

/// Other concepts' summaries as wrong options, nearest first — distractorPool.
/// A wrong option about a neighbouring idea is a real test; one about an
/// unrelated course is a giveaway, so `far` only fills in when `near` and the
/// note's other checks cannot supply three.
func sessionDistractorPool(
    slug: String,
    domain: String?,
    neighbours: Set<String>,
    concepts: [LearnConcept]
) -> SessionDistractorPool {
    let others = concepts.filter { $0.slug != slug && !$0.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    func tier(_ c: LearnConcept) -> Int {
        neighbours.contains(c.slug) ? 0 : (c.domain != nil && c.domain == domain ? 1 : 2)
    }
    // `enumerated` on the tie keeps the sort stable, as the web's is.
    let ordered = others.enumerated().sorted { a, b in
        let ta = tier(a.element), tb = tier(b.element)
        return ta != tb ? ta < tb : a.offset < b.offset
    }.map(\.element)
    return SessionDistractorPool(
        near: ordered.filter { tier($0) < 2 }.map(\.summary),
        far: ordered.filter { tier($0) == 2 }.map(\.summary)
    )
}

/// The wrong options a multiple-choice question wants.
private let sessionWrongOptions = 3

/// The wrong options for one check — wrongOptionsFor: the note's other
/// checks' answers and the near summaries, all of them; then, only if those
/// come to fewer than three, the far summaries closest in length to this
/// answer, so a filler does not stand out by its shape.
func sessionWrongOptionsFor(check: ConceptCheck, otherAnswers: [String], pool: SessionDistractorPool) -> [String] {
    let strong = otherAnswers + pool.near
    if strong.count >= sessionWrongOptions { return strong }
    let length = check.answer.trimmingCharacters(in: .whitespacesAndNewlines).count
    // A filler with raw TeX in it (`$T(n)$`) stands out as much as one from
    // another course would; plain prose first.
    func tex(_ text: String) -> Int { text.contains("$") ? 1 : 0 }
    let fill = pool.far.enumerated().sorted { a, b in
        let ta = tex(a.element), tb = tex(b.element)
        if ta != tb { return ta < tb }
        let la = abs(a.element.count - length), lb = abs(b.element.count - length)
        return la != lb ? la < lb : a.offset < b.offset
    }.prefix(sessionWrongOptions - strong.count).map(\.element)
    return strong + fill
}

// MARK: - The plan (buildSessionPlan)

/// The two modes a concept's own session page takes — ConceptSessionMode
/// in session-core.ts. `learn` is Teach me; `check` is the workspace's
/// Quiz me, `?mode=check` on the session URL. (`module`, the week check,
/// is a third thing on the web — a different page, not a `?mode=` — and
/// has no native surface.)
enum SessionMode: String, Hashable {
    case learn, check
}

/// The most checks Quiz me asks in one session — MAX_QUIZ_CHECKS.
let maxQuizChecks = 5

enum SessionStepKind: String, Hashable {
    case probe, teach, check, close
    var name: String {
        switch self {
        case .probe: return "Probe"
        case .teach: return "Teach"
        case .check: return "Check"
        case .close: return "Close"
        }
    }
}

struct SessionStep: Hashable {
    let kind: SessionStepKind
    /// The question for a probe or check step, when the note supplies one.
    var question: SessionQuestion? = nil
    /// Asked of the tutor model first; what the step falls back to when the
    /// model is unavailable or answers in prose. Nil means there is nothing
    /// to fall back to, and the step says so and lets the learner continue.
    var fallback: SessionQuestion? = nil
    /// Where a module check's step sits — the web's `step.place`: which of
    /// the module's concepts it asks, and the how-manyth question for it.
    /// A concept session's steps carry none.
    var place: Place? = nil

    /// `step.place` in session-core.ts.
    struct Place: Hashable {
        let slug: String
        let title: String
        /// 1-based, in the check's order — "Concept i of n".
        let position: Int
        let of: Int
        /// 1-based — "Question k" for this concept.
        let question: Int
    }
}

/// The steps a session walks — buildSessionPlan.
///
/// Learn (Teach me): probe, teach, check, close. The probe is the note's
/// first check; the check after teaching is its next one, or one the tutor
/// writes, falling back to the first check asked again (reshuffled) when
/// the tutor is unavailable. A note with no usable checks leaves both
/// questions to the tutor.
///
/// Check (Quiz me): each of the note's checks in turn, up to
/// `maxQuizChecks`, then close; with none, one question from the tutor.
func buildSessionPlan(slug: String, mode: SessionMode = .learn, checks: [ConceptCheck], pool: SessionDistractorPool, summary: String = "") -> [SessionStep] {
    let answers = checks.map { $0.answer.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    func poolFor(_ check: ConceptCheck) -> [String] {
        sessionWrongOptionsFor(
            check: check,
            otherAnswers: answers.filter { $0 != check.answer.trimmingCharacters(in: .whitespacesAndNewlines) },
            pool: pool
        )
    }
    func ask(_ variant: String) -> [SessionQuestion] {
        checks.compactMap { sessionNoteQuestion(slug: slug, check: $0, pool: poolFor($0), variant: variant, summary: summary) }
    }

    let close = SessionStep(kind: .close)
    if mode == .check {
        let questions = ask("check").prefix(maxQuizChecks)
        if questions.isEmpty { return [SessionStep(kind: .check), close] }
        return questions.map { SessionStep(kind: .check, question: $0) } + [close]
    }
    let probes = ask("probe")
    let checksAfter = ask("check")
    let probe = probes.first
    let next = checksAfter.count > 1 ? checksAfter[1] : nil
    return [
        SessionStep(kind: .probe, question: probe),
        SessionStep(kind: .teach),
        SessionStep(kind: .check, question: next, fallback: next == nil ? checksAfter.first : nil),
        close,
    ]
}

/// Why a session asks nothing — the one sentence the session, its close
/// screen and the workspace all print.
let NOTHING_TO_ASK =
    "This note has no check the session can ask, and the tutor has no model provider key to write one. Add one in Settings, under Providers."

/// "Step 2 of 4 · Teach · Dot product" — stepLabel.
func sessionStepLabel(_ plan: [SessionStep], index: Int, title: String) -> String {
    guard let step = plan[safe: index] else { return title }
    let head = "Step \(index + 1) of \(plan.count) · \(step.kind.name)"
    return step.kind == .close ? head : "\(head) · \(title)"
}

/// The close screen's subtitle list: "Probe, Teach, Check" — stepsWalked.
func stepsWalked(_ plan: [SessionStep]) -> String {
    var seen: [String] = []
    for step in plan where step.kind != .close && !seen.contains(step.kind.name) {
        seen.append(step.kind.name)
    }
    return seen.joined(separator: ", ")
}

/// A reason and what follows from it, as one paragraph — withConsequence:
/// "The tutor could not be reached. Nothing is recorded; carry on." The
/// reason is often an error string with no full stop, so one is added when
/// it does not already end a sentence.
func withConsequence(_ reason: String, _ consequence: String) -> String {
    let tail = consequence.trimmingCharacters(in: .whitespaces)
    var trimmed = reason.trimmingCharacters(in: .whitespaces)
    if trimmed.hasSuffix("..") && !trimmed.hasSuffix("...") { trimmed = String(trimmed.dropLast()) }
    if trimmed.isEmpty { return tail }
    let terminated = trimmed.range(of: #"[.?!…]["'”’)\]]*$"#, options: .regularExpression) != nil
    let head = terminated ? trimmed : "\(trimmed)."
    return tail.isEmpty ? head : "\(head) \(tail)"
}

/// Where Keep going leads — nextConcept: a frontier concept, preferring one
/// this concept leads to, then one in its domain, then the frontier's own
/// order. Never this concept. Nil when the frontier holds nothing else.
func sessionNextConcept(
    frontier: [LearnConcept],
    current: (slug: String, domain: String?, dependants: Set<String>)
) -> (slug: String, title: String)? {
    let others = frontier.filter { $0.slug != current.slug }
    let pick =
        others.first { current.dependants.contains($0.slug) } ??
        others.first { $0.domain != nil && $0.domain == current.domain } ??
        others.first
    return pick.map { (slug: $0.slug, title: $0.title) }
}

// MARK: - Teaching prose (teachProse)

/// Sections a teaching step leaves out: the quiz, the backlinks, the link list.
private let sessionHiddenSections: Set<String> = ["checks", "sessions", "prerequisites"]

/// The part of a note a teach step shows — teachProse: the body without its
/// frontmatter, its `# Title` (the page prints the title), its ```check
/// blocks, the Checks, Sessions and Prerequisites sections, and any heading
/// with nothing under it. Line-based, and fence-aware so a `#` inside a code
/// block is code.
func teachProse(_ source: String) -> String {
    var lines = source.replacingOccurrences(of: "^\u{FEFF}", with: "", options: .regularExpression)
        .components(separatedBy: .newlines)
    var start = 0
    if lines.first?.trimmingCharacters(in: .whitespaces) == "---",
       let end = lines.dropFirst().firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == "---" }) {
        start = end + 1
    }
    if start > 0 { lines = Array(lines.dropFirst(start)) }

    struct Section { var heading: String?; var level: Int; var body: [String] }
    var sections: [Section] = [Section(heading: nil, level: 0, body: [])]
    /// The open fence's run of marker characters, nil outside a fence.
    var fence: String? = nil
    /// True while inside a ```check fence — its lines are dropped, close
    /// included.
    var inCheck = false

    for line in lines {
        if let marker = fence {
            let ch = marker.first!
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let closes = trimmed.count >= marker.count && trimmed.allSatisfy { $0 == ch }
            if closes {
                fence = nil
                if inCheck { inCheck = false; continue }
                sections[sections.count - 1].body.append(line)
                continue
            }
            if !inCheck { sections[sections.count - 1].body.append(line) }
            continue
        }
        let opener = line.drop(while: { $0 == " " || $0 == "\t" })
        if let ch = opener.first, ch == "`" || ch == "~" {
            let run = String(opener.prefix(while: { $0 == ch }))
            if run.count >= 3 {
                fence = run
                let info = opener.dropFirst(run.count)
                    .trimmingCharacters(in: .whitespaces)
                    .components(separatedBy: .whitespaces).first?.lowercased() ?? ""
                inCheck = info == "check"
                if !inCheck { sections[sections.count - 1].body.append(line) }
                continue
            }
        }
        if let heading = line.range(of: #"^(#{1,6})\s+"#, options: .regularExpression) {
            let level = line[heading].trimmingCharacters(in: .whitespaces).count
            sections.append(Section(heading: line, level: level, body: []))
            continue
        }
        sections[sections.count - 1].body.append(line)
    }

    var kept: [String] = []
    var skipBelow: Int? = nil
    for section in sections {
        if let heading = section.heading {
            let text = heading.replacingOccurrences(of: #"^#+\s*"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"\s*#*\s*$"#, with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces).lowercased()
            if let skip = skipBelow, section.level > skip { continue }
            skipBelow = nil
            if section.level == 1 {
                kept.append(contentsOf: section.body)
                continue
            }
            if sessionHiddenSections.contains(text) { skipBelow = section.level; continue }
            if section.body.allSatisfy({ $0.trimmingCharacters(in: .whitespaces).isEmpty }) { continue }
            kept.append(heading)
            kept.append(contentsOf: section.body)
            continue
        }
        kept.append(contentsOf: section.body)
    }

    return kept.joined(separator: "\n")
        .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

// MARK: - Session id (newSessionId, surface "mac")

/// `mac-2026-09-26-dot-product-k3f9x2` — the web's `web-` id with the native
/// surface's prefix, so the log says which surface opened the session.
func newSessionId(slug: String, now: Date, random: String) -> String {
    let day = String(isoDay(now).prefix(10))
    let tail = String(random.filter { $0.isLetter || $0.isNumber }.prefix(8))
    return "mac-\(day)-\(slug)-\(tail.isEmpty ? "0" : tail)".prefix(128).description
}

private func isoDay(_ date: Date) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

// MARK: - BKT (bkt.mjs)

/// The BKT parameters, shared by every concept — `bktParams` in the
/// preference mirror, DEFAULT_PARAMS when absent.
struct BKTParams: Hashable {
    var pL0 = 0.25
    var pT = 0.15
    var pG = 0.2
    var pS = 0.1
}

/// `bktParams` from the preference mirror, DEFAULT_PARAMS for anything that
/// is not a usable number — asParams in state/mastery.ts.
func bktParams(preferences: [String: String]) -> BKTParams {
    var params = BKTParams()
    guard
        let raw = preferences["bktParams"],
        let data = raw.data(using: .utf8),
        let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return params }
    func number(_ key: String) -> Double? {
        guard let value = (object[key] as? NSNumber)?.doubleValue, value.isFinite else { return nil }
        return value
    }
    if let v = number("pL0") { params.pL0 = v }
    if let v = number("pT") { params.pT = v }
    if let v = number("pG") { params.pG = v }
    if let v = number("pS") { params.pS = v }
    return params
}

private func clamp01(_ x: Double) -> Double {
    x.isNaN ? 0 : min(1, max(0, x))
}

/// Posterior p(L) given one observation, before the learning step — posterior.
private func bktPosterior(_ prior: Double, correct: Bool, params: BKTParams) -> Double {
    let pL = clamp01(prior)
    let numerator = correct ? pL * (1 - params.pS) : pL * params.pS
    let denominator = correct
        ? pL * (1 - params.pS) + (1 - pL) * params.pG
        : pL * params.pS + (1 - pL) * (1 - params.pG)
    if denominator == 0 { return pL }
    return clamp01(numerator / denominator)
}

/// Full update for one observation — update. `opportunity` is false for pure
/// assessment (a probe teaches nothing, so no transit step).
func bktUpdate(_ prior: Double, correct: Bool, params: BKTParams, opportunity: Bool) -> Double {
    let post = bktPosterior(prior, correct: correct, params: params)
    return opportunity ? clamp01(post + (1 - post) * params.pT) : post
}

/// How much of a direct update indirect evidence carries, per hop.
private let propagationDecay = 0.4
/// Indirect evidence can raise confidence but never confer mastery on its own.
private let propagationCeiling = 0.9

/// Update a prerequisite from evidence observed `hops` away — propagate
/// with `correct` fixed true: blends toward the full posterior by
/// `decay^hops`, and never lifts a prior above the ceiling it did not earn.
func bktPropagate(_ prior: Double, hops: Int, params: BKTParams) -> Double {
    guard hops >= 1 else { return clamp01(prior) }
    let p = clamp01(prior)
    let full = bktPosterior(p, correct: true, params: params)
    let blended = p + pow(propagationDecay, Double(hops)) * (full - p)
    return clamp01(min(blended, max(p, propagationCeiling)))
}

/// A mastery probability to an SM-2 grade — gradeFromOutcome.
func gradeFromOutcome(correct: Bool, pL: Double) -> Int {
    if !correct { return pL > 0.7 ? 2 : 1 }
    if pL >= 0.9 { return 5 }
    if pL >= 0.7 { return 4 }
    return 3
}

// MARK: - Confidence (docs/proposals/structured-checks.md, K5 and K6)

/// The stops "How sure are you?" offers, in percent — CONFIDENCE_STOPS.
let sessionConfidenceStops = [0, 30, 50, 70, 90, 100]
/// The stop it rests on before the learner moves it — DEFAULT_CONFIDENCE.
let sessionDefaultConfidence = 50
/// A confidence at or under this marks a correct answer as a likely guess —
/// observe.ts's LOW_CONFIDENCE.
let sessionLowConfidence = 30
/// The longest reasoning an answer carries — SESSION_TEXT_LIMIT, counted in
/// UTF-16 units as the route's `value.length` counts it.
let sessionTextLimit = 2_000

/// `text` cut to at most `limit` UTF-16 units, never inside a character: a
/// cap in Swift characters would let emoji past the route's limit, which
/// refuses the whole observation.
func sessionPrefix(_ text: String, utf16 limit: Int) -> String {
    guard text.utf16.count > limit else { return text }
    var units = 0
    var out = ""
    for character in text {
        units += character.utf16.count
        if units > limit { break }
        out.append(character)
    }
    return out
}

/// The SM-2 grade an answer schedules with — confidenceGrade: a correct
/// answer at `sessionLowConfidence` or less passes at 3 at most, so a lucky
/// guess grows its interval more slowly. Confidence never moves p(L), and a
/// wrong answer needs no rule (every failing grade resets the card).
func confidenceGrade(correct: Bool, confidence: Int?, pL: Double) -> Int {
    let grade = gradeFromOutcome(correct: correct, pL: pL)
    guard correct, let confidence, confidence <= sessionLowConfidence else { return grade }
    return min(grade, 3)
}

/// The reasoning box's text as an answer sends it: trimmed, cut to
/// `sessionTextLimit` UTF-16 units, and nil when nothing is left.
func sessionThinking(_ text: String) -> String? {
    let cut = sessionPrefix(text.trimmingCharacters(in: .whitespacesAndNewlines), utf16: sessionTextLimit)
    let trimmed = cut.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

// MARK: - One answer, recorded (recordObservation)

/// A prerequisite a correct answer spread to.
struct SessionPropagation: Hashable {
    let concept: String
    let hops: Int
    let pLBefore: Double
    let pLAfter: Double
}

/// Whose numbers an answer's outcome carries (S9-06).
enum AnswerStatus: Hashable {
    /// The app's own, from its copy of the rules: what it draws the moment
    /// an answer lands, until the catalog answers.
    case estimated
    /// The catalog's, from the observe route's reply.
    case recorded
    /// The catalog refused the answer, or the mirror gave up on it; the
    /// numbers stay the app's and the reason says why.
    case notRecorded(String)
}

/// What one graded answer became, as the feedback bar and the close screen
/// read it: first the app's estimate, then — `recordedOutcome` — the observe
/// route's reply laid over it.
struct SessionAnswerOutcome {
    var concept: String
    var correct: Bool
    /// `probe` or `teach` — which step asked, as `source` records it.
    var source: String
    var opportunity: Bool
    var grade: Int
    var pLBefore: Double
    var pLAfter: Double
    var mastered: Bool
    var propagated: [SessionPropagation]
    var card: CatalogReview
    /// True when this answer created the concept's first card.
    var cardCreated: Bool
    /// The answer's own request id: the key its catalog record comes back
    /// under. Empty until the caller sets it on the write.
    var requestId: String = ""
    var status: AnswerStatus = .estimated
}

/// The observe route's reply for one answer: what the catalog recorded.
struct RecordedAnswer: Hashable {
    let concept: String
    let pLBefore: Double
    let pLAfter: Double
    let mastered: Bool
    /// The prerequisites the answer spread to, with their numbers. A
    /// replayed answer's reply names them without numbers, and those are
    /// left out — the web's whatMoved leaves them out too.
    let propagated: [SessionPropagation]
    /// The concept's next review, when the reply names one.
    let due: Date?
    let cardCreated: Bool
    let replayed: Bool

    /// The reply's `result`, or nil when it is not an observe result.
    init?(result: [String: Any]) {
        guard
            let concept = result["concept"] as? String,
            let before = (result["pLBefore"] as? NSNumber)?.doubleValue,
            let after = (result["pLAfter"] as? NSNumber)?.doubleValue,
            before.isFinite, after.isFinite
        else { return nil }
        self.concept = concept
        pLBefore = before
        pLAfter = after
        mastered = result["mastered"] as? Bool ?? false
        propagated = (result["propagated"] as? [[String: Any]] ?? []).compactMap { p in
            guard
                let slug = p["concept"] as? String,
                let hops = (p["hops"] as? NSNumber)?.intValue,
                let before = (p["pLBefore"] as? NSNumber)?.doubleValue,
                let after = (p["pLAfter"] as? NSNumber)?.doubleValue
            else { return nil }
            return SessionPropagation(concept: slug, hops: hops, pLBefore: before, pLAfter: after)
        }
        let card = result["card"] as? [String: Any]
        due = ((card?["due"] ?? result["due"]) as? String).flatMap(isoDate)
        cardCreated = card?["created"] as? Bool ?? false
        replayed = result["replayed"] as? Bool ?? false
    }
}

/// What the catalog said about one answer or review grade, by request id.
enum AnswerRecord: Hashable {
    case observed(RecordedAnswer)
    /// A review grade: the rating on record, which on a replay is the
    /// first write's.
    case graded(ReviewRating)
    case notRecorded(String)
}

/// `outcome` with the catalog's record laid over it: the recorded p(L)
/// move, propagation and next review replace the estimate, or the reason
/// it was not recorded marks it. No record leaves the estimate as it is.
func recordedOutcome(_ outcome: SessionAnswerOutcome, _ record: AnswerRecord?) -> SessionAnswerOutcome {
    var shown = outcome
    switch record {
    case .observed(let r)?:
        shown.pLBefore = r.pLBefore
        shown.pLAfter = r.pLAfter
        shown.mastered = r.mastered
        shown.propagated = r.propagated
        if let due = r.due {
            let c = shown.card
            shown.card = CatalogReview(
                conceptSlug: c.conceptSlug, repetitions: c.repetitions, ease: c.ease,
                intervalDays: c.intervalDays, lapses: c.lapses, due: due,
                lastReviewed: c.lastReviewed, leech: c.leech)
        }
        shown.cardCreated = r.cardCreated
        shown.status = .recorded
    case .notRecorded(let reason)?:
        shown.status = .notRecorded(reason)
    case .graded?, nil:
        break
    }
    return shown
}

/// The mastery rows an answer touched, to upsert — the concept's own and
/// each prerequisite propagation reached, moved or not (the web's
/// `ensureEntry` keeps a newly-created entry in the model either way).
struct SessionAnswerWrite {
    var outcome: SessionAnswerOutcome
    var masteryRows: [CatalogMastery]
    var sessionId: String
    var sessionTitle: String
    var sessionGoal: String
    /// The module a check's answer names — the collection id the event's
    /// `module` carries and the observe body sends, as the web's week
    /// check payload does. Nil on a concept's own session.
    var module: String? = nil
    /// The answer's request id, copied onto the outcome as it is set so the
    /// catalog's record finds its way back to the outcome it replaces.
    var requestId: String { didSet { outcome.requestId = requestId } }
    var question: String?
    var answer: String?
    var chosen: String?
    /// How sure the learner was of the pick, in percent; nil for "I don't
    /// know" (K6) and for an answer asked without the stops.
    var confidence: Int? = nil
    /// Their reasoning, trimmed; nil when they wrote none.
    var thinking: String? = nil
    var at: Date
}

/// The learner's state one answer's estimate starts from — the mastery
/// table and the review cards, as `readModel` frames them. Built fresh for
/// each answer from the store (`current`), so an estimate starts from the
/// catalog's numbers wherever a reply has already replaced the app's.
struct SessionLearnerModel {
    var params: BKTParams
    var mastery: [String: CatalogMastery]
    var cards: [String: CatalogReview]

    /// The concept's row, or the `ensureEntry` default at p(L) = pL0.
    private func masteryEntry(_ slug: String) -> CatalogMastery {
        mastery[slug] ?? CatalogMastery(conceptSlug: slug, pL: params.pL0, observations: 0, correct: 0, lastSeen: nil)
    }

    /// `recordObservation` over the in-memory model: the BKT update (with the
    /// transit step only when the source teaches), a correct answer spread to
    /// the prerequisites, and the concept's card rescheduled under the grade
    /// the outcome and the confidence map to. `prereqsOf` walks the
    /// `requires` edges — the same graph `prerequisiteDistances` BFSes.
    mutating func answer(
        _ slug: String,
        correct: Bool,
        source: String,
        confidence: Int? = nil,
        prereqsOf: (String) -> [String],
        at now: Date = Date()
    ) -> SessionAnswerWrite {
        let opportunity = source != "probe"

        var writes: [String: CatalogMastery] = [:]
        let prior = masteryEntry(slug)
        let priorPL = prior.pL
        let nextPL = bktUpdate(priorPL, correct: correct, params: params, opportunity: opportunity)
        let entry = CatalogMastery(
            conceptSlug: slug,
            pL: nextPL,
            observations: prior.observations + 1,
            correct: prior.correct + (correct ? 1 : 0),
            lastSeen: now
        )
        mastery[slug] = entry
        writes[slug] = entry

        // Spread a correct answer to the prerequisites — propagateCorrect.
        // `observations` is deliberately not incremented: it counts questions
        // the learner was actually asked, and propagation asks nothing. An
        // untouched prerequisite still lands in `writes`, as ensureEntry's
        // freshly-made row does on the web.
        var spread: [SessionPropagation] = []
        if correct {
            var seen: Set<String> = [slug]
            var queue: [(slug: String, depth: Int)] = [(slug, 0)]
            var head = 0
            while head < queue.count {
                let (current, depth) = queue[head]
                head += 1
                for dep in prereqsOf(current) where !seen.contains(dep) {
                    seen.insert(dep)
                    queue.append((dep, depth + 1))
                    let prev = masteryEntry(dep)
                    let before = prev.pL
                    let after = bktPropagate(before, hops: depth + 1, params: params)
                    let next = after - before < 1e-9
                        ? prev
                        : CatalogMastery(conceptSlug: dep, pL: after, observations: prev.observations,
                                         correct: prev.correct, lastSeen: prev.lastSeen)
                    mastery[dep] = next
                    writes[dep] = next
                    if after - before >= 1e-9 {
                        spread.append(SessionPropagation(concept: dep, hops: depth + 1, pLBefore: before, pLAfter: after))
                    }
                }
            }
        }

        // Whether an answer teaches and whether it should come back for
        // review are different questions: every answered question earns a
        // review slot, whatever the source.
        let grade = confidenceGrade(correct: correct, confidence: confidence, pL: nextPL)
        let existing = cards[slug]
        let sched = sm2Review(card: existing, grade: grade, now: now)
        let card = CatalogReview(
            conceptSlug: slug,
            repetitions: Int64(sched.repetitions),
            ease: sched.ease,
            intervalDays: Int64(sched.intervalDays),
            lapses: Int64(sched.lapses),
            due: sched.due,
            lastReviewed: now,
            leech: sched.leech
        )
        cards[slug] = card

        return SessionAnswerWrite(
            outcome: SessionAnswerOutcome(
                concept: slug,
                correct: correct,
                source: source,
                opportunity: opportunity,
                grade: grade,
                pLBefore: priorPL,
                pLAfter: nextPL,
                mastered: nextPL >= BKT.masteryThreshold,
                propagated: spread,
                card: card,
                cardCreated: existing == nil
            ),
            masteryRows: writes.keys.sorted().compactMap { writes[$0] },
            sessionId: "",
            sessionTitle: "",
            sessionGoal: slug,
            requestId: "",
            confidence: confidence,
            at: now
        )
    }
}

extension SessionLearnerModel {
    /// The model as the store's merged rows stand now: learner.db's (the
    /// catalog's once their reply landed, the app's estimate before) over
    /// the snapshot's.
    @MainActor static func current(_ store: CatalogStore) -> SessionLearnerModel {
        SessionLearnerModel(
            params: bktParams(preferences: store.preferences),
            mastery: store.mastery,
            cards: store.learn.cards
        )
    }
}

// MARK: - Feedback and close (session-core.ts)

/// p(L) to two places, the way every page prints it.
func formatPL(_ pL: Double) -> String {
    String(format: "%.2f", pL)
}

/// A change, always with its sign, zero included — formatSigned.
func formatSigned(_ delta: Double) -> String {
    let rounded = (delta * 100).rounded() / 100
    return "\(rounded < 0 ? "-" : "+")\(String(format: "%.2f", abs(rounded)))"
}

/// "+0.13", "-0.06", "+0.00" — formatMove: pass the two ends so 0.36 to 0.36
/// reads "+0.00" rather than the "-0.01" the unrounded difference rounds to.
func formatMove(before: Double, after: Double) -> String {
    formatSigned(Double(formatPL(after))! - Double(formatPL(before))!)
}

/// The feedback bar's note — feedbackNote: "p(L) 0.55 to 0.49 · this becomes
/// a review card".
/// Until the catalog answers the numbers are the app's estimate, and the
/// note says so.
func sessionFeedbackNote(_ answer: SessionAnswerOutcome, now: Date = Date()) -> String {
    let move = "p(L) \(formatPL(answer.pLBefore)) to \(formatPL(answer.pLAfter))"
    let note = answer.cardCreated
        ? "\(move) · this becomes a review card"
        : "\(move) · next review \(dueLabel(answer.card.due, now: now).label)"
    switch answer.status {
    case .recorded: return note
    case .estimated: return "\(note) · not yet recorded"
    case .notRecorded: return "\(note) · not recorded"
    }
}

/// The close screen's line under its numbers when any of them are still
/// the app's estimate, or nil when the catalog recorded every answer.
func sessionEstimateNote(_ answers: [SessionAnswerOutcome]) -> String? {
    estimateNote(answers.map(\.status), noun: "answer")
}

/// The same line over bare statuses: `noun` is what was recorded, an
/// answer or (Review's close screen) a grade.
func estimateNote(_ statuses: [AnswerStatus], noun: String) -> String? {
    if statuses.contains(where: { if case .notRecorded = $0 { return true }; return false }) {
        return "The catalog did not record every \(noun), so some of these numbers are this app's own."
    }
    if statuses.contains(.estimated) {
        return "Some \(noun)s are not recorded yet, so some of these numbers are this app's estimate."
    }
    return nil
}

/// A close screen's What moved row — MovedRow.
struct SessionMovedRow: Hashable {
    let slug: String
    let title: String
    var before: Double
    var after: Double
    /// Moved by propagation from a correct answer, not asked about.
    let prerequisite: Bool
}

/// The close screen's What moved — whatMoved: each concept answered, from
/// its first answer's prior to its last answer's posterior, then every
/// prerequisite a correct answer spread to, the same way.
func sessionWhatMoved(
    slug: String,
    title: String,
    answers: [SessionAnswerOutcome],
    titles: [String: String] = [:]
) -> [SessionMovedRow] {
    func titleOf(_ concept: String) -> String {
        titles[concept] ?? (concept == slug ? title : concept)
    }
    var rows: [String: SessionMovedRow] = [:]
    var order: [String] = []
    for a in answers {
        if let existing = rows[a.concept] {
            // Answered, not propagated to: a concept a correct answer
            // spread to and the check then asked itself is one answered —
            // the web's `own.prerequisite = false`, not a guess kept.
            rows[a.concept] = SessionMovedRow(slug: a.concept, title: titleOf(a.concept),
                                              before: existing.before, after: a.pLAfter,
                                              prerequisite: false)
        } else {
            rows[a.concept] = SessionMovedRow(slug: a.concept, title: titleOf(a.concept),
                                              before: a.pLBefore, after: a.pLAfter, prerequisite: false)
            order.append(a.concept)
        }
        for p in a.propagated {
            if let existing = rows[p.concept] {
                rows[p.concept] = SessionMovedRow(slug: p.concept, title: existing.title,
                                                  before: existing.before, after: p.pLAfter,
                                                  prerequisite: existing.prerequisite)
            } else {
                rows[p.concept] = SessionMovedRow(slug: p.concept, title: titleOf(p.concept),
                                                  before: p.pLBefore, after: p.pLAfter, prerequisite: true)
                order.append(p.concept)
            }
        }
    }
    // Answered concepts first, then the prerequisites propagation reached —
    // the web's stable `prerequisite` sort, kept as a partition so the
    // insertion order inside each half is the answer's own.
    let listed = order.compactMap { rows[$0] }
    return listed.filter { !$0.prerequisite } + listed.filter { $0.prerequisite }
}

/// The close screen's numbers — SessionTotals.
struct SessionTotals {
    var answered: Int = 0
    var right: Int = 0
    /// The session concept's p(L) before its first answer and after its last;
    /// nil with no answers.
    var before: Double? = nil
    var after: Double? = nil
    /// Review cards this session created or rescheduled, one per concept.
    var cards: Int = 0
}

/// sessionTotals for a concept session: the session concept's own first
/// prior and last posterior.
func sessionTotals(slug: String, answers: [SessionAnswerOutcome]) -> SessionTotals {
    sessionTotals(slugs: [slug], answers: answers)
}

/// sessionTotals for a module check: the mean move over the concepts
/// answered — each one's first prior to its last posterior, averaged, so
/// the tile reads the same for one concept and for twelve.
func sessionTotals(slugs: [String], answers: [SessionAnswerOutcome]) -> SessionTotals {
    let wanted = Set(slugs)
    var ends: [String: (before: Double, after: Double)] = [:]
    for a in answers where wanted.contains(a.concept) {
        ends[a.concept] = ends[a.concept].map { (before: $0.before, after: a.pLAfter) }
            ?? (before: a.pLBefore, after: a.pLAfter)
    }
    func mean(_ pick: ((before: Double, after: Double)) -> Double) -> Double? {
        ends.isEmpty ? nil : ends.values.reduce(0) { $0 + pick($1) } / Double(ends.count)
    }
    return SessionTotals(
        answered: answers.count,
        right: answers.filter(\.correct).count,
        before: mean { $0.before },
        after: mean { $0.after },
        cards: Set(answers.map(\.concept)).count
    )
}

/// formatTotalsMove — signed move, or "–" when nothing about the concept
/// was answered.
func formatTotalsMove(_ totals: SessionTotals) -> String {
    guard let before = totals.before, let after = totals.after else { return "–" }
    return formatMove(before: before, after: after)
}

/// The close screen's Scheduled rows — scheduledCards: each concept's card
/// as the last answer left it.
func sessionScheduled(
    slug: String,
    title: String,
    answers: [SessionAnswerOutcome],
    titles: [String: String] = [:]
) -> [(slug: String, title: String, due: Date, created: Bool)] {
    var rows: [String: (slug: String, title: String, due: Date, created: Bool)] = [:]
    var order: [String] = []
    for a in answers {
        let prior = rows[a.concept]
        rows[a.concept] = (
            slug: a.concept,
            title: titles[a.concept] ?? (a.concept == slug ? title : a.concept),
            due: a.card.due,
            created: (prior?.created ?? false) || a.cardCreated
        )
        if prior == nil { order.append(a.concept) }
    }
    return order.compactMap { rows[$0] }
}

// MARK: - Small helpers

extension Array {
    /// `plan[safe: i]` — nil rather than a crash, as `steps[i]` is on the web.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
