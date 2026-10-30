import Foundation
import Testing
@testable import Gnosia

/// S9-14: the studio's svg kind and consent card, with the web as the reference.
@Suite struct StudioParity {
    @Test func svgIsATagKind() {
        let mentions = draftMentions("draw it @svg please")
        #expect(mentions.count == 1)
        #expect(mentions.first?["kind"] as? String == "svg")
        #expect(mentions.first?["start"] as? Int == 8)
        #expect(mentions.first?["end"] as? Int == 12)
        #expect(draftMentions("@svgs are not a tag").isEmpty)
    }

    @Test func aReplysPictureIsItsSvgBlock() {
        let reply = "Here it is.\n\n```svg\n<svg viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\"/></svg>\n```\n\nAsk for changes."
        let parts = plannerReplyParts(reply)
        #expect(parts.svg == "<svg viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\"/></svg>")
        #expect(parts.prose == "Here it is.\n\nAsk for changes.")
        // Still streaming, or cut off: no picture, the words stay.
        #expect(plannerReplyParts("Drawing:\n```svg\n<svg>").svg == nil)
        #expect(plannerReplyParts("No picture.").prose == "No picture.")
    }

    @Test func theCardSaysWhatAMakeCosts() throws {
        #expect(consentTitle("svg") == "The planner wants to draw an SVG")
        #expect(consentTitle("video") == "The planner wants to make a video")
        #expect(consentCost("svg", band: nil) == nil)
        let band = try JSONDecoder().decode(StudioClient.CostBand.self, from: Data(#"{"low":0.74,"high":1.35,"n":4}"#.utf8))
        #expect(consentCost("video", band: band) == "A make of this kind has cost $0.74–$1.35 here, over 4 makes.")
        #expect(consentCost("diagram", band: nil) == "A make of this kind usually costs a few cents.")
    }
}
