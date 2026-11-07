import AppKit
import WebKit
import XCTest
@testable import GnosiaWeb

/// The window's web view is configured like a desktop browser.
@MainActor
final class WebViewConfigurationTests: XCTestCase {
    func testTabReachesLinks() {
        // WebKit's own default skips links on Tab; the window must not.
        XCTAssertFalse(WKWebViewConfiguration().preferences.tabFocusesLinks)
        XCTAssertTrue(webViewConfiguration().preferences.tabFocusesLinks)
    }

    /// Off, WebKit's default, the player's Full screen does nothing.
    func testElementFullscreenIsOn() {
        XCTAssertFalse(WKWebViewConfiguration().preferences.isElementFullscreenEnabled)
        XCTAssertTrue(webViewConfiguration().preferences.isElementFullscreenEnabled)
    }

    /// A new window is one somebody clicked for, as with a popup blocker.
    func testScriptCannotOpenAWindowWithoutAClick() {
        XCTAssertTrue(WKWebViewConfiguration().preferences.javaScriptCanOpenWindowsAutomatically)
        XCTAssertFalse(webViewConfiguration().preferences.javaScriptCanOpenWindowsAutomatically)
    }

    /// The `Notification` shim goes in only where the bridge can post, and
    /// only into the main frame of the page's own world.
    func testTheNotificationShimIsInstalledOnlyWhenAsked() {
        XCTAssertTrue(webViewConfiguration(notifications: false).userContentController.userScripts.isEmpty)
        let scripts = webViewConfiguration(notifications: true).userContentController.userScripts
        XCTAssertEqual(scripts.count, 1)
        XCTAssertEqual(scripts.first?.source, notificationShimSource)
        XCTAssertEqual(scripts.first?.isForMainFrameOnly, true)
        XCTAssertEqual(scripts.first?.injectionTime, .atDocumentStart)
        // The test runner is no app bundle, so the default leaves it out.
        XCTAssertFalse(NotificationBridge.isAvailable)
        XCTAssertTrue(webViewConfiguration().userContentController.userScripts.isEmpty)
    }

    func testTheViewPinchesAndIsInspectableInADebugBuildOnly() {
        let view = WKWebView(frame: .zero, configuration: webViewConfiguration())
        XCTAssertFalse(view.allowsMagnification)
        configureWebView(view)
        XCTAssertTrue(view.allowsMagnification)
        XCTAssertTrue(view.allowsBackForwardNavigationGestures)
        #if DEBUG
        XCTAssertTrue(view.isInspectable)
        #else
        XCTAssertFalse(view.isInspectable)
        #endif
    }

    func testZoomMovesThroughTheStepsAndStopsAtTheEnds() {
        XCTAssertEqual(nextZoom(from: 1, zoomingIn: true), 1.15)
        XCTAssertEqual(nextZoom(from: 1, zoomingIn: false), 0.85)
        XCTAssertEqual(nextZoom(from: 3, zoomingIn: true), 3)
        XCTAssertEqual(nextZoom(from: 0.5, zoomingIn: false), 0.5)
        // Between steps: the nearest one that way.
        XCTAssertEqual(nextZoom(from: 1.2, zoomingIn: true), 1.25)
        XCTAssertEqual(nextZoom(from: 1.2, zoomingIn: false), 1.15)
    }

    /// The window can be made as narrow as the web app's phone layout.
    func testTheWindowCanReachThePhoneLayout() {
        XCTAssertLessThanOrEqual(shellWindowMinimumSize.width, 480)
    }

    /// The menu's commands act on the front window only: a window that is
    /// not key ignores Reload, Back, Forward and the zoom steps.
    func testAWindowThatIsNotKeyIgnoresTheMenu() {
        let view = SpyWebView(frame: .zero, configuration: webViewConfiguration())
        let coordinator = WebView.Coordinator(origin: URL(string: "http://127.0.0.1:51234/")!)
        coordinator.attach(to: view)
        for name in [Notification.Name.gnosiaWebReload, .gnosiaWebBack, .gnosiaWebForward, .gnosiaWebZoomIn] {
            NotificationCenter.default.post(name: name, object: nil)
        }
        XCTAssertEqual(view.calls, [])
        XCTAssertEqual(view.pageZoom, 1)
    }
}

private final class SpyWebView: WKWebView {
    var calls: [String] = []
    override func reload() -> WKNavigation? { calls.append("reload"); return nil }
    override func goBack() -> WKNavigation? { calls.append("back"); return nil }
    override func goForward() -> WKNavigation? { calls.append("forward"); return nil }
}
