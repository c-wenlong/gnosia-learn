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
}
