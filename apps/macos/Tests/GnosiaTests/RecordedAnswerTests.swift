//
//  RecordedAnswerTests.swift
//  GnosiaTests
//
//  S9-06: an answer's numbers are the catalog's once its reply is in. The
//  app's estimate is drawn and written first; the observe or grade reply's
//  record and rows then replace it, in learner.db and on screen.
//

import Foundation
import Testing
import CSQLite3
@testable import Gnosia

/// One row's columns of one query, as text, from a learner.db.
private func row(_ path: String, _ sql: String) throws -> [String] {
    var db: OpaquePointer?
    try #require(sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK)
    defer { sqlite3_close(db) }
    var stmt: OpaquePointer?
    try #require(sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK)
    defer { sqlite3_finalize(stmt) }
    try #require(sqlite3_step(stmt) == SQLITE_ROW)
    return (0 ..< sqlite3_column_count(stmt)).map { i in
        sqlite3_column_text(stmt, i).map { String(cString: $0) } ?? ""
    }
}

/// A mastery row's p(L), as stored.
private func pL(_ path: String, _ slug: String) throws -> Double? {
    Double(try row(path, "SELECT p_l FROM mastery WHERE concept_slug = '\(slug)'")[0])
}

@MainActor private func tempStore() throws -> (dir: URL, path: String, store: LearnerStore) {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("gnosia-tests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let path = dir.appendingPathComponent("learner.db").path
    return (dir, path, LearnerStore(path: path))
}

@MainActor @Suite struct RecordedAnswers {
    /// A correct teach answer on `gamma`, which rests on `beta`, from an
    /// empty model: the app's estimate.
    private func answer() -> SessionAnswerWrite {
        var model = SessionLearnerModel(params: BKTParams(), mastery: [:], cards: [:])
        var write = model.answer("gamma", correct: true, source: "teach",
                                 prereqsOf: { $0 == "gamma" ? ["beta"] : [] },
                                 at: Date(timeIntervalSince1970: 1_000))
        write.sessionId = "s-recorded"
        write.sessionTitle = "Gamma"
        write.sessionGoal = "gamma"
        write.requestId = "req-gamma"
        return write
    }

    /// What the sidecar answers when the catalog's prior for gamma was not
    /// the app's: the learner answered on the web since the last snapshot.
    private let observeReply: [String: Any] = [
        "ok": true,
        "result": [
            "concept": "gamma", "correct": true,
            "pLBefore": 0.6, "pLAfter": 0.81, "mastered": false,
            "propagated": [["concept": "beta", "hops": 1, "pLBefore": 0.5, "pLAfter": 0.52, "title": "Beta"]],
            "card": ["due": "2026-11-02T10:00:00.000Z", "intervalDays": 6, "created": false],
            "replayed": false,
            "rows": [
                "mastery": [
                    ["conceptSlug": "gamma", "pL": 0.81, "observations": 4, "correct": 3, "lastSeen": "2026-10-30T10:00:00.000Z"],
                    ["conceptSlug": "beta", "pL": 0.52, "observations": 2, "correct": 1, "lastSeen": NSNull()],
                ],
                "review": [
                    ["conceptSlug": "gamma", "repetitions": 2, "ease": 2.6, "intervalDays": 6, "lapses": 0,
                     "due": "2026-11-02T10:00:00.000Z", "lastReviewed": "2026-10-30T10:00:00.000Z", "leech": false],
                ],
            ],
        ] as [String: Any],
    ]

    @Test func theRepliesNumbersReplaceTheEstimate() throws {
        let (dir, path, store) = try tempStore()
        defer { try? FileManager.default.removeItem(at: dir) }
        let write = answer()
        #expect(write.outcome.requestId == "req-gamma")
        #expect(store.recordSessionAnswer(write), "\(store.error ?? "")")

        // Before the reply: the estimate, drawn and written, and said to be one.
        let estimate = store.shown(write.outcome)
        #expect(estimate.status == .estimated)
        #expect(estimate.pLBefore == BKTParams().pL0)
        #expect(sessionFeedbackNote(estimate).hasSuffix("· not yet recorded"))
        #expect(try pL(path, "gamma") == write.outcome.pLAfter)

        let body = try #require(LearnerStore.observeJSON(write))
        store.applyRecorded(route: LearnerStore.observeRoute, body: body, reply: observeReply)

        // The outcome on screen is the catalog's.
        let shown = store.shown(write.outcome)
        #expect(shown.status == .recorded)
        #expect(shown.pLBefore == 0.6 && shown.pLAfter == 0.81)
        #expect(shown.propagated == [SessionPropagation(concept: "beta", hops: 1, pLBefore: 0.5, pLAfter: 0.52)])
        #expect(!shown.cardCreated)
        #expect(sessionFeedbackNote(shown, now: Date(timeIntervalSince1970: 0)).hasPrefix("p(L) 0.60 to 0.81 · next review"))
        #expect(sessionEstimateNote([shown]) == nil)
        #expect(store.recordedVersion == 1)

        // And learner.db holds the catalog's rows and numbers.
        #expect(try row(path, "SELECT p_l, observations, correct FROM mastery WHERE concept_slug = 'gamma'")
            == ["0.81", "4", "3"])
        #expect(try row(path, "SELECT p_l, last_seen FROM mastery WHERE concept_slug = 'beta'") == ["0.52", ""])
        #expect(try row(path, "SELECT repetitions, ease, interval_days FROM review WHERE concept_slug = 'gamma'")
            == ["2", "2.6", "6"])
        #expect(try row(path, """
            SELECT json_extract(payload, '$.pLBefore'), json_extract(payload, '$.pLAfter')
            FROM event WHERE type = 'observation'
            """) == ["0.6", "0.81"])
    }

    @Test func aConceptAStillQueuedAnswerMovesKeepsItsRowForThatReply() throws {
        let (dir, path, store) = try tempStore()
        defer { try? FileManager.default.removeItem(at: dir) }
        let write = answer()
        #expect(store.recordSessionAnswer(write))
        let body = try #require(LearnerStore.observeJSON(write))
        store.applyRecorded(route: LearnerStore.observeRoute, body: body, reply: observeReply, pending: ["gamma"])

        // gamma's rows wait for the later answer's reply; beta's land, and
        // the answer itself is recorded either way.
        #expect(try pL(path, "gamma") == write.outcome.pLAfter)
        #expect(try row(path, "SELECT p_l FROM mastery WHERE concept_slug = 'beta'")[0] == "0.52")
        #expect(store.shown(write.outcome).status == .recorded)
    }

    @Test func aGradeKeepsTheRatingTheCatalogRecorded() throws {
        let (dir, path, store) = try tempStore()
        defer { try? FileManager.default.removeItem(at: dir) }
        let at = Date(timeIntervalSince1970: 1_000)
        let rating = store.recordReviewGrade(ReviewGradeWrite(
            conceptId: "alpha", grade: 4, rating: 2, requestId: "req-grade", at: at,
            pLBefore: 0.5, pLAfter: 0.6,
            mastery: CatalogMastery(conceptSlug: "alpha", pL: 0.6, observations: 1, correct: 1, lastSeen: at),
            card: CatalogReview(conceptSlug: "alpha", repetitions: 1, ease: 2.5, intervalDays: 1, lapses: 0,
                                due: at, lastReviewed: at, leech: false)
        ))
        #expect(rating == .good)
        #expect(store.recordedRating("req-grade") == nil)

        // A replay: the catalog already holds this request id as Hard.
        let body = try JSONSerialization.data(withJSONObject: ["conceptId": "alpha", "grade": 2, "requestId": "req-grade"])
        store.applyRecorded(route: LearnerStore.gradeRoute, body: body, reply: [
            "ok": true,
            "result": [
                "concept": "alpha", "rating": 1, "grade": 3, "due": "2026-11-01T00:00:00.000Z", "intervalDays": 1,
                "ease": 2.36, "lapses": 0, "leech": false, "pL": 0.55, "replayed": true,
                "rows": [
                    "mastery": [["conceptSlug": "alpha", "pL": 0.55, "observations": 3, "correct": 2, "lastSeen": "2026-10-30T10:00:00.000Z"]],
                    "review": [["conceptSlug": "alpha", "repetitions": 1, "ease": 2.36, "intervalDays": 1, "lapses": 0,
                                "due": "2026-11-01T00:00:00.000Z", "lastReviewed": "2026-10-30T10:00:00.000Z", "leech": false]],
                ],
            ] as [String: Any],
        ])
        #expect(store.recordedRating("req-grade") == .hard)
        #expect(try row(path, "SELECT p_l, observations FROM mastery WHERE concept_slug = 'alpha'") == ["0.55", "3"])
        #expect(try row(path, "SELECT ease FROM review WHERE concept_slug = 'alpha'") == ["2.36"])
        #expect(try row(path, """
            SELECT json_extract(payload, '$.grade'), json_extract(payload, '$.pLAfter')
            FROM event WHERE type = 'review'
            """) == ["3", "0.55"])
    }

    @Test func aReplayedAnswerDrawsNoPrerequisiteItHasNoNumbersFor() throws {
        let recorded = try #require(RecordedAnswer(result: [
            "concept": "gamma", "pLBefore": 0.6, "pLAfter": 0.81, "mastered": false,
            "propagated": [["concept": "beta", "hops": 1]],
            "card": ["due": "2026-11-02T10:00:00Z", "intervalDays": 6, "created": false],
            "replayed": true,
        ]))
        #expect(recorded.propagated.isEmpty)
        #expect(recorded.replayed)
        #expect(recorded.due == isoDate("2026-11-02T10:00:00Z"))
        #expect(RecordedAnswer(result: ["concept": "gamma"]) == nil)
    }

    @Test func anAnswerTheCatalogNeverHeldSaysSo() {
        let outcome = answer().outcome
        let refused = recordedOutcome(outcome, .notRecorded("no live concept"))
        #expect(refused.pLAfter == outcome.pLAfter)
        #expect(sessionFeedbackNote(refused).hasSuffix("· not recorded"))
        #expect(sessionEstimateNote([refused])?.hasPrefix("The catalog did not record every answer") == true)
        #expect(sessionEstimateNote([outcome])?.hasPrefix("Some answers are not recorded yet") == true)
    }
}
