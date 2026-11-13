//
//  NotificationBridgeTests.swift
//  HermesWebTests
//
//  The page's `Notification` in the shell: what the shim posts, what the
//  handler reads from it, and whose messages it answers.
//

import JavaScriptCore
import UserNotifications
import XCTest
@testable import HermesWeb

final class NotificationBridgeTests: XCTestCase {
    func testTheHandlerReadsOnlyTheThreeKinds() {
        XCTAssertEqual(notificationRequest(from: ["kind": "permission"]), .permission)
        XCTAssertEqual(notificationRequest(from: ["kind": "requestPermission"]), .requestPermission)
        XCTAssertEqual(
            notificationRequest(from: ["kind": "show", "title": "Diagram ready", "body": "Graph"]),
            .show(title: "Diagram ready", body: "Graph", tag: "")
        )
        XCTAssertEqual(
            notificationRequest(from: ["kind": "show", "title": "Diagram ready", "body": "Graph", "tag": "job-1"]),
            .show(title: "Diagram ready", body: "Graph", tag: "job-1")
        )
        XCTAssertEqual(notificationRequest(from: ["kind": "show", "title": "t"]), .show(title: "t", body: "", tag: ""))
        XCTAssertEqual(
            notificationRequest(from: ["kind": "show", "title": "t", "body": NSNull(), "tag": NSNull()]),
            .show(title: "t", body: "", tag: "")
        )
        for body: Any in [
            "show",
            ["kind": "open", "url": "file:///Applications/Terminal.app"],
            ["kind": "show"],
            ["kind": "show", "title": 3],
            ["kind": "show", "title": "t", "body": ["html": "<b>x</b>"]],
            ["kind": "show", "title": "t", "tag": 3],
            ["title": "t"],
            [String: Any](),
        ] {
            XCTAssertNil(notificationRequest(from: body), "\(body)")
        }
    }

    func testATitleAndBodyAndTagAreCutToTheirLimits() {
        let long = String(repeating: "x", count: 5000)
        guard case .show(let title, let body, let tag) = notificationRequest(
            from: ["kind": "show", "title": long, "body": long, "tag": long]
        )
        else { return XCTFail("not a show") }
        XCTAssertEqual(title.count, notificationTitleLimit)
        XCTAssertEqual(body.count, notificationBodyLimit)
        XCTAssertEqual(tag.count, notificationTagLimit)
    }

    func testThePermissionReadsAsTheWebAPIs() {
        XCTAssertEqual(notificationPermission(for: .authorized), "granted")
        XCTAssertEqual(notificationPermission(for: .provisional), "granted")
        XCTAssertEqual(notificationPermission(for: .denied), "denied")
        XCTAssertEqual(notificationPermission(for: .notDetermined), "default")
    }

    /// Only the main frame of the app's own origin may post: not the
    /// studio's framed canvas on another loopback port, not a foreign page.
    func testOnlyTheAppsMainFrameIsAnswered() {
        let app = URL(string: "http://127.0.0.1:51234/api/auth/local")!
        func accepts(_ origin: String?, mainFrame: Bool = true) -> Bool {
            acceptsNotificationMessage(isMainFrame: mainFrame, origin: origin.flatMap(URL.init(string:)), appOrigin: app)
        }
        XCTAssertTrue(accepts("http://127.0.0.1:51234"))
        XCTAssertTrue(accepts("http://localhost:51234"))
        XCTAssertFalse(accepts("http://127.0.0.1:51234", mainFrame: false))
        XCTAssertFalse(accepts("http://127.0.0.1:61001"))
        XCTAssertFalse(accepts("https://example.com"))
        XCTAssertFalse(accepts("file:///"))
        XCTAssertFalse(accepts(nil))
    }

    func testAFramesOriginBecomesAURL() {
        XCTAssertEqual(originURL(protocol: "http", host: "127.0.0.1", port: 51234)?.absoluteString, "http://127.0.0.1:51234")
        XCTAssertEqual(originURL(protocol: "http", host: "::1", port: 51234)?.absoluteString, "http://[::1]:51234")
        XCTAssertEqual(originURL(protocol: "https", host: "example.com", port: 0)?.absoluteString, "https://example.com")
        XCTAssertNil(originURL(protocol: "", host: "", port: 0))
        XCTAssertNil(originURL(protocol: "file", host: "", port: 0))
    }

    /// The shim itself, run in JavaScriptCore with a stand-in for the
    /// message handler: it posts `permission` at load, a `requestPermission`
    /// when asked, and a `show` with only the title, body and tag once
    /// granted, and hears a pushed permission through the sync function.
    func testTheShimPostsTheMessagesTheHandlerReads() throws {
        let context = try XCTUnwrap(JSContext())
        var posted: [[String: Any]] = []
        var reply = "default"
        let post: @convention(block) (JSValue) -> JSValue = { message in
            posted.append(message.toDictionary() as? [String: Any] ?? [:])
            let kind = message.forProperty("kind").toString()
            return context.evaluateScript("Promise.resolve(\(kind == "show" ? "undefined" : "\"\(reply)\""))")
        }
        context.setObject(post, forKeyedSubscript: "post" as NSString)
        context.evaluateScript("""
            var window = globalThis;
            window.webkit = { messageHandlers: { hermesNotification: { postMessage: post } } };
            """)
        context.evaluateScript(notificationShimSource)
        XCTAssertNil(context.exception)
        XCTAssertEqual(posted.map { $0["kind"] as? String }, ["permission"])
        XCTAssertEqual(context.evaluateScript("Notification.permission").toString(), "default")

        // Not granted: a notification posts nothing.
        context.evaluateScript("new Notification('Early', { body: 'x' })")
        XCTAssertEqual(posted.count, 1)

        reply = "granted"
        context.evaluateScript("Notification.requestPermission()")
        XCTAssertEqual(posted.last?["kind"] as? String, "requestPermission")
        XCTAssertEqual(context.evaluateScript("Notification.permission").toString(), "granted")

        context.evaluateScript("new Notification('Diagram ready', { body: 'Graph', tag: 'job-1', icon: 'x.png' })")
        XCTAssertNil(context.exception)
        let shown = try XCTUnwrap(posted.last)
        XCTAssertEqual(Set(shown.keys), ["kind", "title", "body", "tag"])
        XCTAssertEqual(shown["kind"] as? String, "show")
        XCTAssertEqual(shown["title"] as? String, "Diagram ready")
        XCTAssertEqual(shown["body"] as? String, "Graph")
        XCTAssertEqual(shown["tag"] as? String, "job-1")
        XCTAssertEqual(notificationRequest(from: shown), .show(title: "Diagram ready", body: "Graph", tag: "job-1"))

        // A permission the app pushes (a grant in System Settings or in
        // another window) lands through the sync function.
        context.evaluateScript("\(NotificationBridge.syncFunctionName)('denied')")
        XCTAssertEqual(context.evaluateScript("Notification.permission").toString(), "denied")
        // And a value it does not know is ignored.
        context.evaluateScript("\(NotificationBridge.syncFunctionName)('maybe')")
        XCTAssertEqual(context.evaluateScript("Notification.permission").toString(), "denied")
    }

    /// A page that already has a `Notification` (a browser) keeps its own.
    func testTheShimLeavesAnExistingNotificationAlone() throws {
        let context = try XCTUnwrap(JSContext())
        var posts = 0
        let post: @convention(block) (JSValue) -> JSValue = { _ in
            posts += 1
            return context.evaluateScript("Promise.resolve('granted')")
        }
        context.setObject(post, forKeyedSubscript: "post" as NSString)
        context.evaluateScript("""
            var window = globalThis;
            window.webkit = { messageHandlers: { hermesNotification: { postMessage: post } } };
            window.Notification = { native: true };
            """)
        context.evaluateScript(notificationShimSource)
        XCTAssertEqual(context.evaluateScript("Notification.native").toBool(), true)
        XCTAssertEqual(posts, 0)
    }
}
