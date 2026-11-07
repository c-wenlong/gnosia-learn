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

    /// Only the bare `about:blank` and `about:srcdoc` load; a fragment or
    /// query on them is dropped, the strict side.
    func testAboutBlankWithAFragmentIsDropped() {
        XCTAssertEqual(verdict("about:blank#x"), .cancel)
        XCTAssertEqual(verdict("about:blank?x"), .cancel)
        XCTAssertEqual(verdict("about:blank#x", mainFrame: false), .cancel)
        XCTAssertEqual(verdict("about:blank"), .allow)
    }

    func testAnIPv6LoopbackAppOrigin() {
        let v6 = URL(string: "http://[::1]:51234/api/auth/local")!
        func check(_ string: String, mainFrame: Bool = true) -> NavigationVerdict {
            navigationVerdict(for: URL(string: string), appOrigin: v6, mainFrame: mainFrame)
        }
        XCTAssertEqual(check("http://[::1]:51234/home"), .allow)
        // The loopback names count as one host, on the same port.
        XCTAssertEqual(check("http://127.0.0.1:51234/home"), .allow)
        XCTAssertEqual(check("http://localhost:51234/home"), .allow)
        XCTAssertEqual(check("blob:http://[::1]:51234/7d2c0f9e"), .allow)
        // Another port, or another address, is not the app.
        XCTAssertEqual(check("http://[::1]:7250/"), .openInBrowser)
        XCTAssertEqual(check("http://[::2]:51234/"), .openInBrowser)
        XCTAssertEqual(check("http://[2001:db8::1]:51234/"), .openInBrowser)
        XCTAssertEqual(check("blob:http://[::1]:7250/x"), .cancel)
        // And an IPv4 app origin accepts the IPv6 loopback.
        XCTAssertEqual(verdict("http://[::1]:51234/home"), .allow)
        XCTAssertEqual(verdict("http://[::1]:7250/home"), .openInBrowser)
    }

    /// A blob whose origin is opaque or foreign never loads.
    func testBlobsFromAnythingButTheAppAreDropped() {
        for url in [
            "blob:null/7d2c0f9e-1b1a-4c55-9d0a-2b7f4f0c1e11",
            "blob:null",
            "blob:",
            "blob:https://example.com/x",
            "blob:file:///tmp/x",
            "blob:blob:http://127.0.0.1:51234/x",
            "blob:http://127.0.0.1.evil.com:51234/x",
        ] {
            XCTAssertEqual(verdict(url), .cancel, url)
            XCTAssertEqual(verdict(url, mainFrame: false), .cancel, url)
        }
    }

    /// An omitted port is the scheme's default, on both sides.
    func testADefaultPortMatchesAnOmittedOne() {
        let http = URL(string: "http://localhost/api/auth/local")!
        let https = URL(string: "https://localhost/api/auth/local")!
        func check(_ string: String, app: URL) -> NavigationVerdict {
            navigationVerdict(for: URL(string: string), appOrigin: app, mainFrame: true)
        }
        XCTAssertEqual(check("http://localhost:80/x", app: http), .allow)
        XCTAssertEqual(check("http://127.0.0.1/x", app: http), .allow)
        XCTAssertEqual(check("http://localhost:443/x", app: http), .openInBrowser)
        XCTAssertEqual(check("https://localhost/x", app: http), .openInBrowser)
        XCTAssertEqual(check("https://localhost:443/x", app: https), .allow)
        XCTAssertEqual(check("https://localhost/x", app: https), .allow)
        XCTAssertEqual(check("https://localhost:80/x", app: https), .openInBrowser)
        XCTAssertEqual(check("http://localhost/x", app: https), .openInBrowser)
        // A default port is not the app's random port.
        XCTAssertEqual(verdict("http://127.0.0.1/x"), .openInBrowser)
        XCTAssertEqual(verdict("http://127.0.0.1:80/x"), .openInBrowser)
    }

    /// Scheme and host compare without case; the verdict is the same as for
    /// the lowercase URL.
    func testSchemeAndHostCaseDoNotMatter() {
        XCTAssertEqual(verdict("HTTP://LOCALHOST:51234/home"), .allow)
        XCTAssertEqual(verdict("Http://127.0.0.1:51234/home"), .allow)
        XCTAssertEqual(verdict("BLOB:HTTP://LOCALHOST:51234/x"), .allow)
        XCTAssertEqual(verdict("ABOUT:blank"), .allow)
        XCTAssertEqual(verdict("HTTP://LOCALHOST:7250/", mainFrame: false), .allow)
        XCTAssertEqual(verdict("HTTP://LOCALHOST:7250/"), .openInBrowser)
        XCTAssertEqual(verdict("HTTPS://EXAMPLE.COM/"), .openInBrowser)
        XCTAssertEqual(verdict("FILE:///etc/passwd"), .cancel)
        XCTAssertEqual(verdict("JavaScript:alert(1)"), .cancel)
    }

    /// Look-alike hosts and user-info tricks are not the app's origin.
    func testLookAlikeHostsAreNotTheApp() {
        XCTAssertEqual(verdict("http://127.0.0.1.evil.com:51234/"), .openInBrowser)
        XCTAssertEqual(verdict("http://localhost.evil.com:51234/"), .openInBrowser)
        XCTAssertEqual(verdict("http://127.0.0.1:51234@evil.com/"), .openInBrowser)
        // Not a valid URL (the port is not a number): dropped.
        XCTAssertEqual(verdict("http://127.0.0.1:51234.evil.com/"), .cancel)
        XCTAssertEqual(verdict("http://evil.com/?http://127.0.0.1:51234/"), .openInBrowser)
        XCTAssertEqual(verdict("http://evil.com", mainFrame: false), .cancel)
    }
}
