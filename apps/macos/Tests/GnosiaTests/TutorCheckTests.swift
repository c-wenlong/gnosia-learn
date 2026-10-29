//
//  TutorCheckTests.swift
//  GnosiaTests
//
//  The concept tutor's chat checks (TutorCheck.swift) against the web's
//  rules. Fixtures/check-blocks.json is written by check-block.ts and read
//  by both this suite and services/sidecar/test/check-contract.test.ts, so
//  a change to either side's text fails one of them.
//

import Foundation
import Testing
@testable import Gnosia

private struct Case {
    let check: [String: Any]
    let block: String
    let answers: [[String: Any]]
}

private func fixture() throws -> [Case] {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .appending(path: "Fixtures/check-blocks.json")
    let data = try Data(contentsOf: url)
    let list = try #require(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
    return try list.map { raw in
        Case(
            check: try #require(raw["check"] as? [String: Any]),
            block: try #require(raw["block"] as? String),
            answers: try #require(raw["answers"] as? [[String: Any]])
        )
    }
}

/// A fixture value that may be JSON null.
private func optional<T>(_ value: Any?) -> T? {
    value is NSNull ? nil : value as? T
}

@Suite struct TutorCheckContract {
    @Test func theBlockWrittenBackIsTheWebsByteForByte() throws {
        for c in try fixture() {
            let check = try #require(TutorCardCheck(json: c.check))
            // Bytes, not Swift string equality, which would call a composed
            // and a decomposed é the same.
            #expect(Array(check.blockText.utf8) == Array(c.block.utf8))
        }
    }

    @Test func answersReadAsTheWebWritesThem() throws {
        for c in try fixture() {
            let check = try #require(TutorCardCheck(json: c.check))
            for a in c.answers {
                let expected = try #require(a["text"] as? String)
                let thinking: String? = optional(a["thinking"])
                if check.kind == .choice {
                    let picked: Int? = optional(a["picked"])
                    let confidence: Int? = optional(a["confidence"])
                    #expect(Array(tutorChoiceAnswerText(check, picked: picked, confidence: confidence, thinking: thinking).utf8) == Array(expected.utf8))
                } else {
                    let words = try #require(a["words"] as? String)
                    let confidence = try #require(a["confidence"] as? Int)
                    #expect(Array(tutorRecallAnswerText(answer: words, confidence: confidence, thinking: thinking).utf8) == Array(expected.utf8))
                }
            }
        }
    }
}

@Suite struct TutorCheckReading {
    private let choice: [String: Any] = [
        "kind": "choice", "question": "Q?", "options": ["a", "b", "c"], "why": "because", "answer": "a",
    ]

    @Test func aCheckTheCardCannotDrawIsNone() {
        var keyless = choice
        keyless["answer"] = "d"
        #expect(TutorCardCheck(json: keyless) == nil)
        var two = choice
        two["options"] = ["a", "b"]
        #expect(TutorCardCheck(json: two) == nil)
        var twice = choice
        twice["options"] = ["a", "a", "c"]
        #expect(TutorCardCheck(json: twice) == nil)
        // An open check: the question alone, already in the prose.
        #expect(TutorCardCheck(json: ["question": "Q?"]) == nil)
        #expect(TutorCardCheck(json: nil) == nil)
        #expect(TutorCardCheck(json: ["kind": "recall", "question": "Q?", "answer": "  "]) == nil)
    }

    @Test func theThreadSendsTheBlockAndTheAnswer() throws {
        let check = try #require(TutorCardCheck(json: choice))
        let sent = tutorChoiceAnswerText(check, picked: 0, confidence: 50, thinking: nil)
        let turns = [
            TutorThreadTurn(role: "user", content: "teach me"),
            TutorThreadTurn(role: "assistant", content: "Which one?", check: check, order: [2, 0, 1]),
            TutorThreadTurn(role: "user", content: "a · 50% sure", sent: sent),
        ]
        let messages = tutorRequestMessages(turns)
        #expect(messages.map(\.role) == ["user", "assistant", "user"])
        #expect(messages[1].content == "Which one?\n\n\(check.blockText)")
        #expect(messages[2].content == sent)
        #expect(sent.contains("Picked: \"a\" (correct)"))
    }

    @Test func aPickIsRightOnlyOnTheKey() throws {
        let check = try #require(TutorCardCheck(json: choice))
        #expect(TutorCheckAnswer(picked: 0, words: nil, confidence: 50).correct(for: check) == true)
        #expect(TutorCheckAnswer(picked: 1, words: nil, confidence: 50).correct(for: check) == false)
        #expect(TutorCheckAnswer(picked: nil, words: nil, confidence: nil).correct(for: check) == false)
    }
}
