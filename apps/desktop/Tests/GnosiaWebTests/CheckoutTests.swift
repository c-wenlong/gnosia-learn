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
}
