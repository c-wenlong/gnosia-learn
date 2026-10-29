//
//  TutorCheck.swift
//  Gnosia
//
//  A check the concept tutor asks at the end of a chat reply
//  (docs/proposals/structured-checks.md), drawn natively: the rules of
//  packages/tutor/src/check-block.ts that the thread needs, and the card
//  the web draws as ChoiceCheckCard and RecallCheckCard.
//
//  The chat route takes the tutor's fenced `check` block off the reply and
//  returns it beside the prose as `check`. The prose asks the question; the
//  options of a choice check and the answer the tutor committed to live
//  only in `check`, so a thread that drops the field shows a question with
//  nothing to answer it with, and sends the tutor's next turn without the
//  answer it committed to. Here the card draws the options, takes a
//  confidence and optional reasoning (SessionSureness), and the answer
//  goes back as the web's `<check_answer>` block, with the asking turn's
//  block written back after its prose (`checkBlockText`), as the web's
//  `requestTurns` does.
//
//  What differs from the web, by design: nothing is recorded. The
//  chat's graded path stays the structured session (TutorChatView's
//  header), so a check answered here is conversation the tutor grades in
//  its next reply, never an observation.
//

import SwiftUI

// MARK: - The rules, ported from check-block.ts

/// The longest answer the chat takes — CHAT_ANSWER_LIMIT in tutor-check.ts,
/// counted in UTF-16 units as the route counts it.
let tutorChatAnswerLimit = 4_000

/// A choice or recall check as the chat route returns it: `ChoiceCheck` or
/// `RecallCheck`. An open check (a question alone) is not one: its question
/// is already in the prose, which is all it needs.
struct TutorCardCheck: Equatable {
    enum Kind: String { case choice, recall }

    let kind: Kind
    let question: String
    /// As the tutor wrote them; the card shows them shuffled. Empty for recall.
    let options: [String]
    /// Why the key is right, shown once answered. Empty for recall.
    let why: String
    /// The key (one of `options`, exactly), or the recall answer the tutor committed to.
    let answer: String
    let concept: String?

    /// The route's `check` field, read with `readCheckBlock`'s rules so a
    /// field this thread could not draw falls back to the prose alone, as
    /// `restoreCardCheck` does for a stored one.
    init?(json: Any?) {
        guard let raw = json as? [String: Any],
              let kind = (raw["kind"] as? String).flatMap(Kind.init(rawValue:)),
              let question = Self.line(raw["question"]),
              !question.isEmpty, question.utf16.count <= 400
        else { return nil }
        let concept = Self.line(raw["concept"]).flatMap { $0.isEmpty ? nil : $0.lowercased() }
        switch kind {
        case .recall:
            guard let answer = (raw["answer"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !answer.isEmpty, answer.utf16.count <= 800
            else { return nil }
            self.init(kind: .recall, question: question, options: [], why: "", answer: answer, concept: concept)
        case .choice:
            guard let list = raw["options"] as? [Any], (3 ... 5).contains(list.count) else { return nil }
            let options = list.compactMap { Self.line($0) }
            guard options.count == list.count,
                  options.allSatisfy({ !$0.isEmpty && $0.utf16.count <= 240 }),
                  Set(options).count == options.count,
                  let why = Self.line(raw["why"]), !why.isEmpty, why.utf16.count <= 800,
                  let answer = Self.line(raw["answer"]), options.contains(answer)
            else { return nil }
            self.init(kind: .choice, question: question, options: options, why: why, answer: answer, concept: concept)
        }
    }

    init(kind: Kind, question: String, options: [String], why: String, answer: String, concept: String?) {
        self.kind = kind
        self.question = question
        self.options = options
        self.why = why
        self.answer = answer
        self.concept = concept
    }

    /// `line` in check-block.ts: trimmed, inner whitespace collapsed.
    private static func line(_ value: Any?) -> String? {
        guard let text = value as? String else { return nil }
        return text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    /// `checkBlockText`: the block the check was read from, written back so
    /// the tutor sees the answer it committed to. Fields in the prompts'
    /// order (`why` before `answer`, `concept` after `kind`), serialized as
    /// `JSON.stringify` does, so the text matches the web's byte for byte.
    var blockText: String {
        var fields: [(String, String)] = [("kind", jsJSON(kind.rawValue))]
        if let concept { fields.append(("concept", jsJSON(concept))) }
        fields.append(("question", jsJSON(question)))
        if kind == .choice {
            fields.append(("options", "[" + options.map(jsJSON).joined(separator: ",") + "]"))
            fields.append(("why", jsJSON(why)))
        }
        fields.append(("answer", jsJSON(answer)))
        let object = "{" + fields.map { "\(jsJSON($0.0)):\($0.1)" }.joined(separator: ",") + "}"
        return "```check\n\(object)\n```"
    }
}

/// One string as `JSON.stringify` writes it: `"` and `\` escaped, the
/// control characters JSON names by letter, every other one below U+0020
/// as `\u00xx`, and nothing else (no `\/`, no escaped non-ASCII).
func jsJSON(_ text: String) -> String {
    var out = "\""
    for scalar in text.unicodeScalars {
        switch scalar {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\u{08}": out += "\\b"
        case "\u{0C}": out += "\\f"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if scalar.value < 0x20 {
                out += String(format: "\\u%04x", scalar.value)
            } else {
                out.unicodeScalars.append(scalar)
            }
        }
    }
    return out + "\""
}

/// `fenced`: the delimiters a learner could type to close the data block early, removed.
private func checkFenced(_ text: String) -> String {
    text.replacingOccurrences(of: #"</?check_answer>"#, with: "", options: [.regularExpression, .caseInsensitive])
}

/// `cleanThinking`: trimmed, cut to the session text limit, nil when empty.
func tutorCheckThinking(_ text: String?) -> String? {
    sessionThinking(text ?? "")
}

/// `choiceAnswerText`: the learner's pick as the tutor reads it on the next
/// turn. `picked` indexes `options` as the tutor wrote them; nil is "I
/// don't know", which carries no confidence (K6).
func tutorChoiceAnswerText(_ check: TutorCardCheck, picked: Int?, confidence: Int?, thinking: String?) -> String {
    var lines: [String] = []
    if let picked, check.options.indices.contains(picked) {
        let chosen = check.options[picked]
        lines.append(chosen == check.answer
            ? "Picked: \"\(chosen)\" (correct)"
            : "Picked: \"\(chosen)\" (incorrect; the key was \"\(check.answer)\")")
        if let confidence { lines.append("Confidence: \(confidence)%") }
    } else {
        lines.append("I don't know (the key was \"\(check.answer)\")")
    }
    if let thinking = tutorCheckThinking(thinking) { lines.append("Reasoning: \(checkFenced(thinking))") }
    return sessionPrefix("<check_answer>\n\(lines.joined(separator: "\n"))\n</check_answer>", utf16: tutorChatAnswerLimit)
}

/// `recallAnswerText`: the learner's words, confidence and reasoning, with
/// no verdict: the tutor grades them against the answer it committed to.
/// The body is cut, never the closing tag.
func tutorRecallAnswerText(answer: String, confidence: Int, thinking: String?) -> String {
    var lines = [
        "Answer: \(checkFenced(answer.trimmingCharacters(in: .whitespacesAndNewlines)))",
        "Confidence: \(confidence)%",
    ]
    if let thinking = tutorCheckThinking(thinking) { lines.append("Reasoning: \(checkFenced(thinking))") }
    let open = "<check_answer>\n", close = "\n</check_answer>"
    let body = sessionPrefix(lines.joined(separator: "\n"), utf16: tutorChatAnswerLimit - open.utf16.count - close.utf16.count)
    return open + body + close
}

/// What the learner gave on a card, kept on the asking turn so the card
/// draws its result once answered.
struct TutorCheckAnswer: Equatable {
    /// An index into `options` as the tutor wrote them; nil for "I don't know" or a recall check.
    let picked: Int?
    /// The recall answer in the learner's words.
    let words: String?
    let confidence: Int?

    func correct(for check: TutorCardCheck) -> Bool? {
        guard check.kind == .choice else { return nil }
        guard let picked, check.options.indices.contains(picked) else { return false }
        return check.options[picked] == check.answer
    }
}

// MARK: - The card

/// The card under a tutor turn that asked a choice or recall check: the
/// web's ChoiceCheckCard and RecallCheckCard. Live only while it is the
/// thread's newest turn and unanswered; afterwards it draws the result.
struct TutorCheckCard: View {
    let check: TutorCardCheck
    /// The order the options show in, as indices into `check.options`.
    let order: [Int]
    let answer: TutorCheckAnswer?
    /// False once the thread moved past this turn without an answer, or while a turn is in flight.
    let live: Bool
    /// The learner's answer: what the bubble shows, and the `<check_answer>` block the tutor reads.
    var onAnswer: (TutorCheckAnswer, _ shown: String, _ sent: String) -> Void

    @State private var picked: Int? = nil
    @State private var words = ""
    @State private var confidence = sessionDefaultConfidence
    @State private var thinking = ""
    @FocusState private var reasoningFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(check.kind == .choice ? "Pick one" : "Answer in your own words")
                .font(.caption)
                .foregroundStyle(G.text2)
            if check.kind == .choice { choice } else { recall }
        }
        .padding(12)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(G.border))
    }

    // MARK: Choice

    @ViewBuilder private var choice: some View {
        ForEach(order, id: \.self) { i in
            optionRow(i)
        }
        if let answer {
            if answer.picked == nil {
                Text("You said you don't know.").font(.callout).foregroundStyle(G.text2)
            }
            Text(check.why).font(.callout).foregroundStyle(G.text)
        } else if live {
            Button("I don't know") { submitChoice(nil) }
                .buttonStyle(.plain)
                .font(.callout)
                .foregroundStyle(G.accentText)
            if picked != nil {
                SessionSureness(confidence: $confidence, thinking: $thinking, locked: false, reasoningFocused: $reasoningFocused)
                Button("Submit") { submitChoice(picked) }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private func optionRow(_ i: Int) -> some View {
        let text = check.options[i]
        let isKey = text == check.answer
        let chosen = (answer?.picked ?? picked) == i
        let mark: (String, Color)? = answer == nil
            ? nil
            : isKey ? ("checkmark.circle.fill", G.okText) : chosen ? ("xmark.circle.fill", G.danger) : nil
        return Button {
            picked = i
        } label: {
            HStack(spacing: 8) {
                Image(systemName: mark?.0 ?? (chosen ? "largecircle.fill.circle" : "circle"))
                    .foregroundStyle(mark?.1 ?? (chosen ? G.accentText : G.text3))
                Text(text)
                    .font(.callout)
                    .foregroundStyle(G.text)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(chosen ? G.surface2 : Color.clear, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!live || answer != nil)
    }

    private func submitChoice(_ index: Int?) {
        let sure = index == nil ? nil : confidence
        let sent = tutorChoiceAnswerText(check, picked: index, confidence: sure, thinking: index == nil ? nil : thinking)
        let shown = index.map { "\(check.options[$0]) · \(confidence)% sure" } ?? "I don't know"
        onAnswer(TutorCheckAnswer(picked: index, words: nil, confidence: sure), shown, sent)
    }

    // MARK: Recall

    @ViewBuilder private var recall: some View {
        if let answer {
            Text(answer.words ?? "").font(.callout).foregroundStyle(G.text)
            Text("The tutor's answer").font(.caption).foregroundStyle(G.text2)
            Text(check.answer).font(.callout).foregroundStyle(G.text)
        } else if live {
            TextField("Your answer", text: $words, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(2 ... 8)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(G.page, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                .onChange(of: words) { _, next in
                    if next.utf16.count > tutorChatAnswerLimit { words = sessionPrefix(next, utf16: tutorChatAnswerLimit) }
                }
            SessionSureness(confidence: $confidence, thinking: $thinking, locked: false, reasoningFocused: $reasoningFocused)
            Button("Submit") {
                let text = words.trimmingCharacters(in: .whitespacesAndNewlines)
                onAnswer(
                    TutorCheckAnswer(picked: nil, words: text, confidence: confidence),
                    "\(text) · \(confidence)% sure",
                    tutorRecallAnswerText(answer: text, confidence: confidence, thinking: thinking)
                )
            }
            .buttonStyle(.borderedProminent)
            .disabled(words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}
