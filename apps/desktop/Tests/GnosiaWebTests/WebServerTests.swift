//
//  WebServerTests.swift
//  GnosiaWebTests
//
//  The web server's launch: Next runs in the app's own directory, as
//  `npm run dev` runs it, or `next.config.ts` cannot load its imports.
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
}
