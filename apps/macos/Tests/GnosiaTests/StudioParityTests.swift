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

    private func entries(_ json: String) throws -> [StudioClient.TranscriptEntry] {
        try JSONDecoder().decode([StudioClient.TranscriptEntry].self, from: Data(json.utf8))
    }

    @Test func onlyTheNewestOfferIsActionable() throws {
        let thread = try entries("""
        [{"seq":1,"role":"person","text":"hi"},
         {"seq":2,"role":"planner","text":"a","suggest":["video"]},
         {"seq":3,"role":"person","text":"@video"},
         {"seq":4,"role":"planner","text":"b","suggest":{"kinds":["diagram","svg","nope"]},"pitch":"p","declined":["svg"]},
         {"seq":5,"role":"planner","text":"retry","superseded":true}]
        """)
        let offer = StudioClient.offer(transcript: thread, inFlight: false)
        #expect(offer == StudioClient.DraftOffer(seq: 4, kinds: ["diagram", "svg"], pitch: "p", declined: ["svg"]))
        // A turn in flight, or a person's message since: no card.
        #expect(StudioClient.offer(transcript: thread, inFlight: true) == nil)
        let moved = try entries(#"[{"seq":1,"role":"planner","text":"a","suggest":["video"]},{"seq":2,"role":"person","text":"no"}]"#)
        #expect(StudioClient.offer(transcript: moved, inFlight: false) == nil)
    }

    @Test func aPictureNavigatesNowhere() {
        #expect(SvgRasterizer.allowsLoad(of: URL(string: "about:blank")))
        #expect(!SvgRasterizer.allowsLoad(of: URL(string: "https://example.com/x")))
        #expect(!SvgRasterizer.allowsLoad(of: URL(string: "file:///etc/hosts")))
    }
}
