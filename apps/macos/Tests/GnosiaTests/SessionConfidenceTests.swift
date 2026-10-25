//
//  SessionConfidenceTests.swift
//  GnosiaTests
//
//  The session page's confidence and reasoning (structured checks, K5 and
//  K6): the grade rule observe.ts applies, the observe body the mirror
//  sends, and the observation event recordSessionAnswer writes.
//

import Foundation
import Testing
import CSQLite3
@testable import Gnosia

@Suite struct ConfidenceGrade {
    @Test func aCorrectGuessPassesAtThree() {
        // pL 0.95 earns a 5 on its own; 30% or less caps it at 3.
        #expect(confidenceGrade(correct: true, confidence: nil, pL: 0.95) == 5)
        #expect(confidenceGrade(correct: true, confidence: 50, pL: 0.95) == 5)
        #expect(confidenceGrade(correct: true, confidence: 30, pL: 0.95) == 3)
        #expect(confidenceGrade(correct: true, confidence: 0, pL: 0.75) == 3)
        // Already at 3, nothing to cap.
        #expect(confidenceGrade(correct: true, confidence: 0, pL: 0.4) == 3)
    }

    @Test func aWrongAnswerKeepsItsGrade() {
        #expect(confidenceGrade(correct: false, confidence: 0, pL: 0.8) == 2)
        #expect(confidenceGrade(correct: false, confidence: 100, pL: 0.3) == 1)
    }

    @Test func confidenceMovesTheCardNotTheMastery() {
        let prior = CatalogMastery(conceptSlug: "c", pL: 0.9, observations: 3, correct: 3, lastSeen: nil)
        var sure = SessionLearnerModel(params: BKTParams(), mastery: ["c": prior], cards: [:])
        var guess = sure
        let a = sure.answer("c", correct: true, source: "teach", confidence: 90, prereqsOf: { _ in [] })
        let b = guess.answer("c", correct: true, source: "teach", confidence: 30, prereqsOf: { _ in [] })
        #expect(a.outcome.pLAfter == b.outcome.pLAfter)
        #expect(a.outcome.grade == 5)
        #expect(b.outcome.grade == 3)
        #expect(b.confidence == 30)
    }

    @Test func reasoningIsTrimmedAndCut() {
        #expect(sessionThinking("  \n ") == nil)
        #expect(sessionThinking("  because  ") == "because")
        #expect(sessionThinking(String(repeating: "x", count: 2_500))?.count == sessionTextLimit)
    }

    @Test func theCapCountsUTF16AsTheRouteDoes() throws {
        // 1,998 letters then two emoji of two units each: 2,000 characters,
        // but 2,002 units, which the route would refuse whole.
        let text = String(repeating: "a", count: 1_998) + "👍👍"
        #expect(text.count == sessionTextLimit)
        let sent = try #require(sessionThinking(text))
        // The emoji that does not fit is dropped, never split.
        #expect(sent == String(repeating: "a", count: 1_998) + "👍")
        #expect(sent.utf16.count == sessionTextLimit)
        #expect(sessionPrefix("ab👍", utf16: 3) == "ab")
        #expect(sessionPrefix("ab👍", utf16: 4) == "ab👍")
        #expect(sessionPrefix("é👨‍👩‍👧", utf16: 5) == "é")
    }
}

@MainActor @Suite struct ObservationPayload {
    private func write(confidence: Int?, thinking: String?, chosen: String?) -> SessionAnswerWrite {
        var model = SessionLearnerModel(params: BKTParams(), mastery: [:], cards: [:])
        var write = model.answer("bayes", correct: chosen == "right", source: "teach",
                                 confidence: confidence, prereqsOf: { _ in [] })
        write.sessionId = "s-test"
        write.sessionTitle = "Bayes"
        write.sessionGoal = "bayes"
        write.requestId = UUID().uuidString
        write.question = "Which?"
        write.answer = "right"
        write.chosen = chosen
        write.thinking = thinking
        return write
    }

    private func body(_ write: SessionAnswerWrite) throws -> [String: Any] {
        let data = try #require(LearnerStore.observeJSON(write))
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test func theObserveBodyCarriesConfidenceAndReasoning() throws {
        let sent = try body(write(confidence: 70, thinking: "the prior was low", chosen: "right"))
        #expect(sent["confidence"] as? Int == 70)
        #expect(sent["thinking"] as? String == "the prior was low")
    }

    @Test func dontKnowSendsNoConfidence() throws {
        let sent = try body(write(confidence: nil, thinking: nil, chosen: nil))
        #expect(sent["confidence"] == nil)
        #expect(sent["thinking"] == nil)
        #expect(sent["chosen"] is NSNull)
    }

    @Test func theObservationEventStoresThem() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("gnosia-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let path = dir.appendingPathComponent("learner.db").path
        let store = LearnerStore(path: path)

        var picked = write(confidence: 30, thinking: "a guess", chosen: "right")
        var dontKnow = write(confidence: nil, thinking: nil, chosen: nil)
        dontKnow.sessionId = picked.sessionId
        picked.at = Date(timeIntervalSince1970: 1_000)
        dontKnow.at = Date(timeIntervalSince1970: 2_000)
        #expect(store.recordSessionAnswer(picked), "\(store.error ?? "")")
        #expect(store.recordSessionAnswer(dontKnow), "\(store.error ?? "")")

        let events = try observationPayloads(path)
        try #require(events.count == 2)
        #expect(events[0]["confidence"] as? Int == 30)
        #expect(events[0]["thinking"] as? String == "a guess")
        // Correct at 30% on a fresh concept: gradeFromOutcome's 3 either way,
        // and the event records the grade the card was scheduled with.
        #expect(events[0]["grade"] as? Int == 3)
        #expect(events[1]["confidence"] == nil)
        #expect(events[1]["thinking"] == nil)
        #expect(events[1]["chosen"] is NSNull)
    }

    /// Every `observation` event's payload, oldest first.
    private func observationPayloads(_ path: String) throws -> [[String: Any]] {
        var db: OpaquePointer?
        try #require(sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK)
        defer { sqlite3_close(db) }
        var stmt: OpaquePointer?
        try #require(sqlite3_prepare_v2(db, "SELECT payload FROM event WHERE type = 'observation' ORDER BY at", -1, &stmt, nil) == SQLITE_OK)
        defer { sqlite3_finalize(stmt) }
        var out: [[String: Any]] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let text = String(cString: sqlite3_column_text(stmt, 0))
            out.append(try #require(try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]))
        }
        return out
    }
}
