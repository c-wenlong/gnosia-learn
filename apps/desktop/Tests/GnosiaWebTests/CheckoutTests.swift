//
//  CheckoutTests.swift
//  GnosiaWebTests
//
//  The data home's .env as the shell reads it must be what the launchers'
//  resolver reads from the same file: AUTH_SECRET seals the provider keys
//  the web saves. The fixture is Node's own `util.parseEnv` output
//  (services/launch-env/test/fixtures/dotenv.json).
//

import Foundation
import XCTest
@testable import GnosiaWeb

final class CheckoutTests: XCTestCase {
    func testTheDotenvReadIsNodes() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appending(path: "../../../../services/launch-env/test/fixtures/dotenv.json")
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
        for off in ["", " ", "0", "false", "OFF", "no", "false\n", " off\r\n"] {
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

    /// A failed resolver run is not kept: the next prepare runs it again,
    /// and an answer, once there is one, is reused.
    func testAFailedResolverRunIsTriedAgain() async {
        let calls = Calls()
        let state = Checkout.ResolverState { _ in
            calls.next() == 1
                ? Checkout.Resolution(failure: "the resolver exited with status 1: boom")
                : Checkout.Resolution(env: ["CATALOG_DB": "/x.db"])
        }
        let root = URL(fileURLWithPath: "/repo")
        await state.prepare(root: root)
        XCTAssertNil(state.resolved)
        XCTAssertEqual(state.failure, "the resolver exited with status 1: boom")
        await state.prepare(root: root)
        XCTAssertEqual(state.resolved, ["CATALOG_DB": "/x.db"])
        XCTAssertNil(state.failure)
        await state.prepare(root: root)
        XCTAssertEqual(calls.count, 2)
    }

    /// Launchers asking at once share one run.
    func testConcurrentPreparesShareOneRun() async {
        let calls = Calls()
        let state = Checkout.ResolverState { _ in
            _ = calls.next()
            Thread.sleep(forTimeInterval: 0.2)
            return Checkout.Resolution(env: [:])
        }
        let root = URL(fileURLWithPath: "/repo")
        async let a: Void = state.prepare(root: root)
        async let b: Void = state.prepare(root: root)
        _ = await (a, b)
        XCTAssertEqual(calls.count, 1)
    }

    func testTheResolversStderrTailIsKept() {
        let long = String(repeating: "x", count: 3000) + "\nError: Cannot find module 'tsx'\n"
        let tail = Checkout.stderrTail(Data(long.utf8))
        XCTAssertLessThanOrEqual(tail.count, 1500)
        XCTAssertTrue(tail.hasSuffix("Error: Cannot find module 'tsx'"))
    }

    /// The read before any spawn: a missing file and a refused one say
    /// different things, and both name the path.
    func testTheCheckoutAccessCheck() throws {
        let dir = FileManager.default.temporaryDirectory.appending(path: "gnosia-access-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let missing = try XCTUnwrap(Checkout.accessProblem(root: dir))
        XCTAssertTrue(missing.contains("There is no package.json at \(dir.path)"), missing)
        try Data("{}".utf8).write(to: dir.appending(path: "package.json"))
        XCTAssertNil(Checkout.accessProblem(root: dir))

        let file = URL(fileURLWithPath: "/Users/o/Desktop/repo/package.json")
        let refused = NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoPermissionError, userInfo: [
            NSUnderlyingErrorKey: NSError(domain: NSPOSIXErrorDomain, code: Int(EPERM)),
        ])
        let message = Checkout.accessMessage(file: file, error: refused)
        XCTAssertTrue(message.contains(file.path), message)
        XCTAssertTrue(message.contains("Privacy & Security > Files and Folders"), message)
    }
}

/// How many times a stand-in resolver ran.
private final class Calls: @unchecked Sendable {
    private let lock = NSLock()
    private var calls = 0
    var count: Int { lock.withLock { calls } }
    func next() -> Int { lock.withLock { calls += 1; return calls } }
}
