import Foundation
import Testing
@testable import Gnosia

/// S9-06: the Swift port of the catalog's learning rules, held to one
/// fixture that apps/macos/scripts/learning-rules.test.ts writes from the
/// catalog's own code (bkt.mjs, schedule.mjs, observe.ts).
@Suite struct LearningRules {
    private func fixture() throws -> [String: Any] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appending(path: "Fixtures/learning-rules.json")
        return try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func cases(_ key: String) throws -> [[String: Any]] {
        try #require(try fixture()[key] as? [[String: Any]])
    }

    private func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 1e-12 }

    @Test func theConstantsAreTheCatalogs() throws {
        let c = try #require(try fixture()["constants"] as? [String: Any])
        let p = try #require(c["params"] as? [String: Double])
        #expect(BKTParams() == BKTParams(pL0: p["pL0"]!, pT: p["pT"]!, pG: p["pG"]!, pS: p["pS"]!))
        #expect(c["lowConfidence"] as? Int == sessionLowConfidence)
        #expect(c["minEase"] as? Double == SM2.minEase)
        #expect(c["defaultEase"] as? Double == SM2.defaultEase)
        #expect(c["passGrade"] as? Int == SM2.passGrade)
        #expect(c["leechThreshold"] as? Int == SM2.leechThreshold)
        #expect(c["maxIntervalDays"] as? Int == SM2.maxIntervalDays)
    }

    @Test func bktUpdateAndPropagation() throws {
        for c in try cases("update") {
            let got = bktUpdate(c["prior"] as! Double, correct: c["correct"] as! Bool, params: BKTParams(), opportunity: c["opportunity"] as! Bool)
            #expect(close(got, c["expect"] as! Double), "update \(c)")
        }
        for c in try cases("propagate") {
            let got = bktPropagate(c["prior"] as! Double, hops: c["hops"] as! Int, params: BKTParams())
            #expect(close(got, c["expect"] as! Double), "propagate \(c)")
        }
    }

    @Test func grades() throws {
        for c in try cases("grade") {
            #expect(gradeFromOutcome(correct: c["correct"] as! Bool, pL: c["pL"] as! Double) == c["expect"] as! Int, "grade \(c)")
        }
        for c in try cases("confidence") {
            let got = confidenceGrade(correct: c["correct"] as! Bool, confidence: c["confidence"] as? Int, pL: c["pL"] as! Double)
            #expect(got == c["expect"] as! Int, "confidence \(c)")
        }
    }

    @Test func theCardOneReviewWrites() throws {
        for c in try cases("review") {
            let card = (c["card"] as? [String: Any]).map {
                CatalogReview(
                    conceptSlug: "x",
                    repetitions: Int64($0["repetitions"] as! Int),
                    ease: $0["ease"] as! Double,
                    intervalDays: Int64($0["intervalDays"] as! Int),
                    lapses: Int64($0["lapses"] as! Int),
                    due: Date(timeIntervalSince1970: 0),
                    lastReviewed: nil,
                    leech: false
                )
            }
            let expect = c["expect"] as! [String: Any]
            let got = sm2Review(card: card, grade: c["grade"] as! Int, now: Date(timeIntervalSince1970: 0))
            #expect(got.repetitions == expect["repetitions"] as! Int, "repetitions \(c)")
            #expect(close(got.ease, expect["ease"] as! Double), "ease \(c)")
            #expect(got.intervalDays == expect["intervalDays"] as! Int, "interval \(c)")
            #expect(got.lapses == expect["lapses"] as! Int, "lapses \(c)")
            #expect(got.leech == expect["leech"] as! Bool, "leech \(c)")
        }
    }
}
