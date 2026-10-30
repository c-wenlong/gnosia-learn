//
//  CheckoutTests.swift
//  GnosiaWebTests
//
//  The data home's .env as the shell reads it must be what the macOS app's
//  sidecar reads from the same file: AUTH_SECRET seals the provider keys
//  the web saves, and the sidecar opens them. The fixture is Node's own
//  `util.parseEnv` output (services/sidecar/test/fixtures/dotenv.json).
//

import Foundation
import XCTest
@testable import GnosiaWeb

final class CheckoutTests: XCTestCase {
    func testTheDotenvReadIsNodes() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appending(path: "../../../../services/sidecar/test/fixtures/dotenv.json")
            .standardized
        let fixture = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        )
        let text = try XCTUnwrap(fixture["text"] as? String)
        let expected = try XCTUnwrap(fixture["expected"] as? [String: String])
        let read = Checkout.parseDotenv(text)
        XCTAssertEqual(read, expected)
        // Byte for byte, not only equal as Swift strings.
        for (key, value) in expected {
            XCTAssertEqual(Array(read[key]?.utf8 ?? "".utf8), Array(value.utf8), key)
        }
    }

    /// S9-08: the resolver's answer is one JSON object of strings, possibly
    /// after whatever a login shell printed first.
    func testTheResolversAnswerReads() throws {
        let out = Data("profile says hi\n{\"CATALOG_DB\":\"/x/catalog.db\",\"AUTH_SECRET\":\"s\"}\n".utf8)
        XCTAssertEqual(Checkout.parseResolved(out), ["CATALOG_DB": "/x/catalog.db", "AUTH_SECRET": "s"])
        XCTAssertNil(Checkout.parseResolved(Data("{\"PORT\":7250}".utf8)))
        XCTAssertNil(Checkout.parseResolved(Data("child-env: failed\n".utf8)))
    }

    /// S9-15: the web's own `studioEnabled` rule.
    func testTheStudioStartsOnlyWhenTheWebServesIt() {
        XCTAssertFalse(Checkout.studioEnabled([:]))
        for off in ["", " ", "0", "false", "OFF", "no"] {
            XCTAssertFalse(Checkout.studioEnabled(["STUDIO_ENABLED": off]), off)
        }
        for on in ["1", "true", "yes", "anything"] {
            XCTAssertTrue(Checkout.studioEnabled(["STUDIO_ENABLED": on]), on)
        }
    }

    /// S9-10: an attachment, or a type the view cannot show, is saved.
    func testAttachmentsAreSavedNotShown() {
        XCTAssertTrue(shouldDownload(disposition: "attachment; filename=\"gnosia-export.json\"", canShowMIMEType: true))
        XCTAssertTrue(shouldDownload(disposition: "Attachment", canShowMIMEType: true))
        XCTAssertFalse(shouldDownload(disposition: "inline; filename=\"a.mp4\"", canShowMIMEType: true))
        XCTAssertFalse(shouldDownload(disposition: nil, canShowMIMEType: true))
        XCTAssertTrue(shouldDownload(disposition: nil, canShowMIMEType: false))
    }
}
