//
//  WebServerTests.swift
//  GnosiaWebTests
//
//  The web server's launch: Next runs in the app's own directory, as
//  `npm run dev` runs it, or `next.config.ts` cannot load its imports.
//  The checkout's path reaches the shell as one quoted word, an old
//  attempt's exit and stderr never land on the next one, and a child's
//  stderr is all read before the failure text is built.
//

import Foundation
import XCTest
@testable import GnosiaWeb

final class WebServerTests: XCTestCase {
    func testNextRunsInTheWebAppsDirectory() {
        let root = URL(fileURLWithPath: "/repo")
        let next = root.appending(path: "node_modules/next/dist/bin/next")
        let launch = WebServer.launch(root: root, next: next, mode: "dev", port: 50123)
        XCTAssertEqual(launch.directory.standardizedFileURL.path, "/repo/apps/web")
        XCTAssertEqual(launch.command, "exec node '/repo/node_modules/next/dist/bin/next' dev -p 50123 -H 127.0.0.1")
    }

    func testAPathWithAQuoteStaysOneWord() throws {
        let root = URL(fileURLWithPath: "/Users/o'neil/my repo $HOME")
        let next = root.appending(path: "node_modules/next/dist/bin/next")
        let launch = WebServer.launch(root: root, next: next, mode: "dev", port: 50123)
        XCTAssertEqual(
            launch.command,
            #"exec node '/Users/o'\''neil/my repo $HOME/node_modules/next/dist/bin/next' dev -p 50123 -H 127.0.0.1"#
        )
        // What the shell makes of it: the path, whole and literal.
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/sh")
        proc.arguments = ["-c", "printf '%s\\n' \(Checkout.shellQuoted(next.path))"]
        let out = Pipe()
        proc.standardOutput = out
        try proc.run()
        proc.waitUntilExit()
        let printed = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        XCTAssertEqual(printed, next.path + "\n")
    }

    func testShellQuoting() {
        XCTAssertEqual(Checkout.shellQuoted("plain"), "'plain'")
        XCTAssertEqual(Checkout.shellQuoted("it's"), #"'it'\''s'"#)
        XCTAssertEqual(Checkout.shellQuoted(""), "''")
    }

    /// A terminated attempt's exit, reported after the next spawn began,
    /// leaves the new attempt running.
    func testAnOldAttemptsExitDoesNotEndTheNextOne() {
        var clock = AttemptClock()
        XCTAssertTrue(clock.exited)
        let first = clock.begin()
        let second = clock.begin()
        XCTAssertFalse(clock.exited)
        clock.ended(first)
        XCTAssertFalse(clock.exited, "the first attempt's late exit ended the second")
        clock.ended(second)
        XCTAssertTrue(clock.exited)
    }

    /// The pipe is read to its end before the tail is used, the handler is
    /// gone afterwards, and two captures keep their own text.
    func testStderrIsSettledAndScopedToItsChild() async throws {
        func run(_ script: String) throws -> (Process, StderrCapture) {
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/bin/sh")
            proc.arguments = ["-c", script]
            let err = Pipe()
            proc.standardError = err
            let capture = StderrCapture(pipe: err)
            try proc.run()
            return (proc, capture)
        }
        let (firstProc, first) = try run("echo first >&2; sleep 0.2; echo 'and its reason' >&2")
        let (secondProc, second) = try run("echo second >&2")
        firstProc.waitUntilExit()
        secondProc.waitUntilExit()
        await first.settle(timeout: .seconds(5))
        await second.settle(timeout: .seconds(5))
        XCTAssertEqual(first.tail, "first\nand its reason")
        XCTAssertEqual(second.tail, "second")
        XCTAssertTrue(first.isClosed)
        XCTAssertTrue(second.isClosed)
    }

    /// A grandchild holding the pipe open does not hold the settle past its
    /// timeout.
    func testSettleGivesUpOnAPipeHeldOpen() async throws {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/sh")
        proc.arguments = ["-c", "echo started >&2; (sleep 5) & exit 0"]
        let err = Pipe()
        proc.standardError = err
        let capture = StderrCapture(pipe: err)
        try proc.run()
        proc.waitUntilExit()
        let began = ContinuousClock.now
        await capture.settle(timeout: .milliseconds(300))
        XCTAssertLessThan(ContinuousClock.now - began, .seconds(3))
        XCTAssertTrue(capture.isClosed)
        XCTAssertEqual(capture.tail, "started")
    }

    func testTheDevSingletonsURLIsRead() {
        let tail = "Another next dev server is already running.\n\nYou can access the existing server at http://localhost:3000, or stop it.\n"
        XCTAssertEqual(WebServer.existingServer(in: tail), URL(string: "http://localhost:3000"))
        XCTAssertNil(WebServer.existingServer(in: "Error: listen EADDRINUSE"))
    }

    func testASilentChildIsNamedAsPossiblyBlocked() {
        let message = WebServer.silentMessage(root: URL(fileURLWithPath: "/Users/o/Desktop/repo"), seconds: 90)
        XCTAssertTrue(message.contains("still running but silent after 90 s"))
        XCTAssertTrue(message.contains("/Users/o/Desktop/repo"))
    }

    private let root = URL(fileURLWithPath: "/Users/o/repo")

    func testTheResolverNoteIsAppendedOnlyWhenTheResolverFailed() {
        XCTAssertEqual(WebServer.withResolverNote("boom", failure: nil), "boom")
        XCTAssertEqual(
            WebServer.withResolverNote("boom", failure: "no shell"),
            "boom\n\nThe environment resolver also failed: no shell"
        )
    }

    /// Alive and silent for the whole wait stops at once with the
    /// blocked-checkout message, on the first attempt, without trying
    /// another port.
    func testASilentTimeoutStopsOnTheFirstAttemptWithTheBlockedMessage() {
        let verdict = WebServer.judge(attempt: 1, outcome: .timedOut, tail: "", root: root, resolverFailure: nil)
        XCTAssertEqual(verdict, .fail(WebServer.silentMessage(root: root, seconds: WebServer.readyTimeout)))
        guard case .fail(let message) = verdict else { return XCTFail("expected a failure") }
        XCTAssertTrue(message.contains("still running but silent after 90 s"))
        XCTAssertTrue(message.contains("/Users/o/repo"))
        // And the resolver's failure rides along.
        XCTAssertEqual(
            WebServer.judge(attempt: 1, outcome: .timedOut, tail: "", root: root, resolverFailure: "no shell"),
            .fail(WebServer.silentMessage(root: root, seconds: 90) + "\n\nThe environment resolver also failed: no shell")
        )
    }

    func testOtherFailuresRetryUntilTheThirdPort() {
        // Timed out but with output: another port may help.
        XCTAssertEqual(WebServer.judge(attempt: 1, outcome: .timedOut, tail: "compiling", root: root, resolverFailure: nil), .retry)
        // Exited silently: retried.
        XCTAssertEqual(WebServer.judge(attempt: 2, outcome: .exited, tail: "", root: root, resolverFailure: nil), .retry)
        // Exited silently with the resolver down: no note until the end.
        XCTAssertEqual(WebServer.judge(attempt: 1, outcome: .exited, tail: "EADDRINUSE", root: root, resolverFailure: "x"), .retry)
        XCTAssertEqual(
            WebServer.judge(attempt: 3, outcome: .exited, tail: "", root: root, resolverFailure: nil),
            .fail("The web server did not come up after three ports.")
        )
        XCTAssertEqual(
            WebServer.judge(attempt: 3, outcome: .exited, tail: "EADDRINUSE", root: root, resolverFailure: "x"),
            .fail("EADDRINUSE\n\nThe environment resolver also failed: x")
        )
        // A silent timeout on the last attempt is still the blocked message.
        XCTAssertEqual(
            WebServer.judge(attempt: 3, outcome: .timedOut, tail: "", root: root, resolverFailure: nil),
            .fail(WebServer.silentMessage(root: root, seconds: 90))
        )
    }

    func testAnExistingDevServerIsAdoptedOnAnyAttempt() {
        let tail = "You can access the existing server at http://localhost:3000, or stop it."
        for outcome in [WebServer.ReadyOutcome.exited, .timedOut] {
            XCTAssertEqual(
                WebServer.judge(attempt: 3, outcome: outcome, tail: tail, root: root, resolverFailure: "x"),
                .adopt(URL(string: "http://localhost:3000")!)
            )
        }
    }

    /// The first attempt keeps the last launch's port, and with it the
    /// window's origin and localStorage; anything else takes a random one.
    func testTheFirstAttemptTakesTheRememberedPortWhenItIsFree() {
        func port(_ attempt: Int, _ remembered: Int?, free: Bool = true) -> Int {
            WebServer.port(attempt: attempt, remembered: remembered, isFree: { _ in free }, random: { 50001 })
        }
        XCTAssertEqual(port(1, 51234), 51234)
        XCTAssertEqual(port(1, nil), 50001)
        // Held by something else: a random port, never the held one.
        XCTAssertEqual(port(1, 51234, free: false), 50001)
        // A retry means the remembered port failed.
        XCTAssertEqual(port(2, 51234), 50001)
        XCTAssertEqual(port(3, 51234), 50001)
        // Out of range, as a hand-edited default could be.
        XCTAssertEqual(port(1, 80), 50001)
        XCTAssertEqual(port(1, 70000), 50001)
        XCTAssertEqual(port(1, WebServer.portRange.upperBound), WebServer.portRange.upperBound)
    }

    func testTheFreeCheckSeesAListener() {
        let listener = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = 0
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let bound = withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { pointer in
                Darwin.bind(listener, pointer, length) == 0 && Darwin.listen(listener, 1) == 0
                    && Darwin.getsockname(listener, pointer, &length) == 0
            }
        }
        XCTAssertTrue(bound)
        let port = Int(UInt16(bigEndian: address.sin_port))
        XCTAssertFalse(WebServer.portIsFree(port))
        Darwin.close(listener)
        XCTAssertTrue(WebServer.portIsFree(port))
    }
}
