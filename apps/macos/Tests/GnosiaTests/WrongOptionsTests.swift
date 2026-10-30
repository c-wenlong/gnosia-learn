import Foundation
import Testing
@testable import Gnosia

/// A note check's wrong options: the Swift port of checkQuestion and
/// withWrittenOptions (SessionModel.swift) held to the fixture
/// services/sidecar/test/wrong-options-contract.test.ts holds to
/// session-core.ts, so the app lays a check out as the web does, with the
/// notes' options, padded or not, and with the tutor's from the sidecar.
@Suite struct WrongOptions {
    private func cases() throws -> [[String: Any]] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appending(path: "Fixtures/wrong-options.json")
        return try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [[String: Any]])
    }

    @Test func eachCaseLaysOutAsTheWebDoes() throws {
        for c in try cases() {
            let name = c["name"] as? String ?? "?"
            let raw = try #require(c["check"] as? [String: String])
            let check = ConceptCheck(
                id: raw["id"] ?? "", question: raw["question"] ?? "", answer: raw["answer"] ?? "",
                why: raw["why"] ?? "", source: raw["source"] ?? ""
            )
            let poolRaw = try #require(c["pool"] as? [String: [String]])
            let question = try #require(sessionCheckQuestion(
                slug: c["slug"] as! String,
                check: check,
                variant: c["variant"] as! String,
                otherAnswers: c["otherAnswers"] as! [String],
                pool: SessionDistractorPool(near: poolRaw["near"] ?? [], far: poolRaw["far"] ?? []),
                written: c["written"] as? [String],
                canWrite: c["canWrite"] as! Bool
            ), "\(name)")
            let expected = try #require(c["expected"] as? [String: Any])
            #expect(question.choices == expected["choices"] as! [String], "\(name)")
            #expect(question.correct == expected["correct"] as! Int, "\(name)")
            #expect(question.wrong?.rawValue == expected["wrong"] as? String, "\(name)")
            if let rewrite = expected["rewrite"] as? [String: String] {
                #expect(question.rewrite == .init(concept: rewrite["concept"]!, check: rewrite["check"]!, variant: rewrite["variant"]!), "\(name)")
            } else {
                #expect(question.rewrite == nil, "\(name)")
            }
            if let tutor = c["tutor"] as? [String], let rewritten = c["rewritten"] as? [String: Any] {
                let laid = try #require(withWrittenOptions(question, tutor), "\(name)")
                #expect(laid.choices == rewritten["choices"] as! [String], "\(name)")
                #expect(laid.correct == rewritten["correct"] as! Int, "\(name)")
                #expect(laid.wrong == .tutor, "\(name)")
            }
        }
    }

    @Test func theLinesAreTheWebs() {
        #expect(WrongSource.notes.note == "Options made without the tutor, from related notes.")
        #expect(WrongSource.padded.note?.hasPrefix("Options made without the tutor. Some come from unrelated notes") == true)
        #expect(WrongSource.tutor.note == nil)
    }
}
