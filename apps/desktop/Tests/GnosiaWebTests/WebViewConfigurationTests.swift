import WebKit
import XCTest
@testable import GnosiaWeb

/// The window's web view is configured like a desktop browser for the keyboard.
final class WebViewConfigurationTests: XCTestCase {
    func testTabReachesLinks() {
        // WebKit's own default skips links on Tab; the window must not.
        XCTAssertFalse(WKWebViewConfiguration().preferences.tabFocusesLinks)
        XCTAssertTrue(webViewConfiguration().preferences.tabFocusesLinks)
    }
}
