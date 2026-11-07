//
//  FindBarTests.swift
//  GnosiaWebTests
//
//  Cmd+F: the JavaScript the bar runs in the page, and what `window.find`
//  does with it in a real web view.
//

import WebKit
import XCTest
@testable import GnosiaWeb

final class FindBarTests: XCTestCase {
    /// The term lands in the script as a JavaScript string literal: a quote
    /// or a backslash in it cannot break out of the call.
    func testTheTermIsAStringLiteralWhateverItHolds() {
        XCTAssertEqual(findJavaScript(term: "needle", backwards: false), #"window.find("needle", false, false, true)"#)
        XCTAssertEqual(findJavaScript(term: "needle", backwards: true), #"window.find("needle", false, true, true)"#)
        // A typed search anchors at the match it refines; a walk does not.
        XCTAssertEqual(
            findJavaScript(term: "needle", backwards: false, anchored: true),
            #"var s=getSelection();if(s.rangeCount)s.collapseToStart();window.find("needle", false, false, true)"#
        )
        for term in [#"say "hi""#, #"C:\path"#, "one\ntwo", #"'); alert(1); //"#] {
            let script = findJavaScript(term: term, backwards: false)
            XCTAssertTrue(script.hasPrefix("window.find("), script)
            XCTAssertTrue(script.hasSuffix(", false, false, true)"), script)
            XCTAssertFalse(script.contains(term), script)
        }
    }

    /// `window.find` selects the match and reports the miss, and the clear
    /// the bar runs puts the selection away again — the same calls the
    /// coordinator makes on a real page.
    @MainActor
    func testWindowFindSelectsAndClears() async throws {
        let view = WKWebView(frame: .zero, configuration: webViewConfiguration())
        view.loadHTMLString(
            "<html><body><p>the needle sits here</p><p>another needle</p></body></html>",
            baseURL: URL(string: "http://127.0.0.1/")
        )
        // `isLoading` only turns true once the load is underway, so give it
        // a beat before waiting it out.
        try await Task.sleep(for: .milliseconds(100))
        while view.isLoading { try await Task.sleep(for: .milliseconds(50)) }

        let found = try await view.evaluateJavaScript(findJavaScript(term: "needle", backwards: false)) as? Bool
        XCTAssertEqual(found, true)
        let selection = try await view.evaluateJavaScript("getSelection().toString()") as? String
        XCTAssertEqual(selection, "needle")

        let missed = try await view.evaluateJavaScript(findJavaScript(term: "no such text", backwards: false)) as? Bool
        XCTAssertEqual(missed, false)

        _ = try await view.evaluateJavaScript(clearFindJavaScript)
        let cleared = try await view.evaluateJavaScript("getSelection().toString()") as? String
        XCTAssertEqual(cleared, "")
    }
}
