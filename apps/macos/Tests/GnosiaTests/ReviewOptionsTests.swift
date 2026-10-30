import Foundation
import Testing
@testable import Gnosia

/// A review card's wrong options: the Swift port of checkHash,
/// readWrittenOptions (StoredCheckOptions.swift) and toReviewItem
/// (LearnModel.swift) held to the fixture
/// apps/web/src/lib/review-options-contract.test.ts holds to the web, so a
/// card asks with the tutor's stored options when they still fit its check
/// and with the notes' otherwise, as the web's review queue does.
@Suite struct ReviewOptions {
    private func fixture() throws -> [String: Any] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appending(path: "Fixtures/review-options.json")
        return try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    @Test func hashesACheckAsTheStoreKeysIt() throws {
        let f = try fixture()
        #expect(f["checkOptionsVersion"] as? Int == checkOptionsVersion)
        let hashes = try #require(f["hashes"] as? [[String: String]])
        #expect(hashes.count >= 5)
        for h in hashes {
            #expect(checkOptionsHash(question: h["question"]!, answer: h["answer"]!) == h["hash"], "\(h["question"]!.debugDescription)")
        }
    }

    /// The hash starts from the note's text, so the checks have to read as
    /// the web reads them first: CRLF endings, a BOM, JavaScript's spaces.
    @Test func readsANotesChecksAsTheStoreKeysThem() throws {
        let notes = try #require(try fixture()["notes"] as? [[String: Any]])
        #expect(notes.count >= 5)
        for n in notes {
            let name = n["name"] as? String ?? "?"
            let expected = try #require(n["checks"] as? [[String: String]])
            let checks = parseChecks(n["body"] as? String)
            #expect(checks.count == expected.count, "\(name)")
            for (check, want) in zip(checks, expected) {
                #expect(check == ConceptCheck(id: want["id"]!, question: want["question"]!, answer: want["answer"]!,
                                              why: want["why"]!, source: want["source"]!), "\(name)")
                #expect(checkOptionsHash(question: check.question, answer: check.answer) == want["hash"], "\(name)")
            }
        }
    }

    @Test func eachCardAsksAsTheWebDoes() throws {
        let f = try fixture()
        let item = try #require(f["item"] as? [String: Any])
        let pool = try #require(f["pool"] as? [String])
        let cards = try #require(f["cards"] as? [[String: Any]])
        #expect(Set(cards.compactMap { ($0["expected"] as? [String: Any])?["wrong"] as? String }) == ["tutor", "notes"])
        for c in cards {
            let name = c["name"] as? String ?? "?"
            let checks = try #require(c["checks"] as? [[String: String]]).map {
                ConceptCheck(id: $0["id"] ?? "", question: $0["question"] ?? "", answer: $0["answer"] ?? "",
                             why: $0["why"] ?? "", source: $0["source"] ?? "")
            }
            var stored: [String: StoredCheckOptions] = [:]
            for row in try #require(c["stored"] as? [[String: Any]]) {
                let id = row["checkId"] as! String
                stored[id] = StoredCheckOptions(checkId: id, checkHash: row["checkHash"] as! String, options: row["options"] as! [String])
            }
            let queued = ReviewQueueItem(
                conceptId: c["conceptId"] as! String,
                title: item["title"] as! String,
                summary: item["summary"] as! String,
                domain: item["domain"] as? String,
                card: nil,
                intervals: item["intervals"] as! [Int]
            )
            let card = LearnGraph().reviewCard(
                for: queued, checks: checks, pool: pool,
                written: writtenOptions(checks: checks, stored: stored)
            )
            let expected = try #require(c["expected"] as? [String: Any])
            #expect(card.kind.rawValue == expected["kind"] as? String, "\(name)")
            #expect(card.prompt == expected["prompt"] as? String, "\(name)")
            #expect(card.answer == expected["answer"] as? String, "\(name)")
            #expect(card.choices == expected["choices"] as? [String], "\(name)")
            #expect(card.correct == expected["correct"] as? Int, "\(name)")
            #expect(card.wrong?.rawValue == expected["wrong"] as? String, "\(name)")
        }
    }

    @Test func aRowThatIsNotThreeStringsIsMissing() {
        #expect(parseStoredOptions(#"["a","b","c"]"#) == ["a", "b", "c"])
        #expect(parseStoredOptions(#"["a","b"]"#) == nil)
        #expect(parseStoredOptions(#"["a","b",3]"#) == nil)
        #expect(parseStoredOptions("not json") == nil)
        #expect(parseStoredOptions(nil) == nil)
    }

    @Test func trimsAsJavaScriptDoes() {
        #expect(jsTrim("\u{FEFF} a b \u{2028}") == "a b")
        #expect(jsTrim("x\u{85}") == "x\u{85}")
        #expect(jsTrim(" \t\n ") == "")
    }
}
