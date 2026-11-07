//
//  NavigationPolicyTests.swift
//  GnosiaWebTests
//
//  The window shows the app server's origin only: other web pages go to
//  the browser, and no other scheme reaches NSWorkspace, which would
//  launch whatever local app claims it.
//

import Foundation
import XCTest
@testable import GnosiaWeb

final class NavigationPolicyTests: XCTestCase {
    private let app = URL(string: "http://127.0.0.1:51234/api/auth/local")!

    private func verdict(_ string: String, mainFrame: Bool = true) -> NavigationVerdict {
        navigationVerdict(for: URL(string: string), appOrigin: app, mainFrame: mainFrame)
    }

    func testTheAppsOwnOriginLoadsHere() {
        XCTAssertEqual(verdict("http://127.0.0.1:51234/home"), .allow)
        XCTAssertEqual(verdict("http://localhost:51234/learn?view=table"), .allow)
        XCTAssertEqual(verdict("about:blank"), .allow)
        XCTAssertEqual(verdict("blob:http://127.0.0.1:51234/7d2c0f9e-1b1a-4c55-9d0a-2b7f4f0c1e11"), .allow)
    }

    func testAnotherLoopbackPortIsNotTheApp() {
        XCTAssertEqual(verdict("http://127.0.0.1:7250/api/health"), .openInBrowser)
        XCTAssertEqual(verdict("http://localhost:3000/"), .openInBrowser)
        XCTAssertEqual(verdict("https://127.0.0.1:51234/home"), .openInBrowser)
        XCTAssertEqual(verdict("blob:http://127.0.0.1:7250/x"), .cancel)
    }

    func testExternalPagesGoToTheBrowser() {
        XCTAssertEqual(verdict("https://en.wikipedia.org/wiki/Graph"), .openInBrowser)
        XCTAssertEqual(verdict("http://example.com:51234/"), .openInBrowser)
    }

    func testOtherSchemesAreDropped() {
        for url in [
            "file:///Applications/Calculator.app",
            "file:///etc/passwd",
            "vscode://file/etc/hosts",
            "x-apple.systempreferences:com.apple.preference.security",
            "mailto:someone@example.com",
            "data:text/html,<script>alert(1)</script>",
            "javascript:alert(1)",
            "about:config",
        ] {
            XCTAssertEqual(verdict(url), .cancel, url)
            XCTAssertEqual(verdict(url, mainFrame: false), .cancel, url)
        }
        XCTAssertEqual(navigationVerdict(for: nil, appOrigin: app, mainFrame: true), .cancel)
    }

    /// The studio's live canvas frames `tldrawkc serve` on its own loopback
    /// port; a frame never opens the browser by loading.
    func testASubframeMayShowLoopbackButNeverOpensTheBrowser() {
        XCTAssertEqual(verdict("http://127.0.0.1:61001/?file=x.tldr", mainFrame: false), .allow)
        XCTAssertEqual(verdict("http://localhost:61001/", mainFrame: false), .allow)
        XCTAssertEqual(verdict("about:srcdoc", mainFrame: false), .allow)
        XCTAssertEqual(verdict("https://www.youtube.com/embed/x", mainFrame: false), .cancel)
    }

    func testOnlyWebLinksOpenANewWindowInTheBrowser() {
        XCTAssertTrue(opensInBrowser(URL(string: "https://example.com/a")))
        XCTAssertTrue(opensInBrowser(URL(string: "HTTP://example.com/a")))
        XCTAssertFalse(opensInBrowser(URL(string: "file:///Applications/Terminal.app")))
        XCTAssertFalse(opensInBrowser(URL(string: "ssh://host")))
        XCTAssertFalse(opensInBrowser(URL(string: "about:blank")))
        XCTAssertFalse(opensInBrowser(nil))
    }
}
