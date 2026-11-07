//
//  NotificationBridge.swift
//  GnosiaWeb
//
//  WKWebView has no `Notification`, so the studio's "your diagram is ready"
//  never showed in the window (JobsProvider checks for one and skips). This
//  gives the page a small one: a user script defines `Notification` with
//  `permission`, `requestPermission()` and a constructor, and each posts a
//  message to one script message handler, which answers with the
//  notification center's permission or posts a notification.
//
//  What page script can reach through it is a notification, and nothing
//  else: the handler takes three message kinds, reads only a title, a body
//  and a tag as plain strings, cuts them to a length, and hands them to
//  UNUserNotificationCenter as text (no HTML anywhere, no URL, no action).
//  It answers only the main frame of the app's own origin, so a framed page
//  (the studio's live canvas on another loopback port) cannot post one.
//
//  The tag keeps a browser's own rule: a notification with a tag an earlier
//  one already used replaces it, so two windows announcing one job stack to
//  one banner. And the page's `permission` is pushed back into the open
//  windows when the app comes forward again or a grant lands, so a change
//  made in System Settings while the app ran is not stale until a reload.
//

import AppKit
import Foundation
import UserNotifications
import WebKit

/// What the page's `Notification` asks for.
enum NotificationRequest: Equatable {
    /// `Notification.permission`'s value, read at load.
    case permission
    /// `Notification.requestPermission()`: ask, the first time.
    case requestPermission
    /// `new Notification(title, { body, tag })`.
    case show(title: String, body: String, tag: String)
}

/// The longest title, body and tag the bridge passes on; the rest is cut.
let notificationTitleLimit = 200
let notificationBodyLimit = 1000
let notificationTagLimit = 200

/// The message the shim posts, read as a pure rule: a dictionary with a
/// known `kind`, and for `show` a string `title` and optional string
/// `body` and `tag`. Anything else is nil and does nothing.
func notificationRequest(from body: Any) -> NotificationRequest? {
    guard let message = body as? [String: Any], let kind = message["kind"] as? String else { return nil }
    switch kind {
    case "permission":
        return .permission
    case "requestPermission":
        return .requestPermission
    case "show":
        guard let title = message["title"] as? String else { return nil }
        let text: String
        switch message["body"] {
        case nil, is NSNull: text = ""
        case let value as String: text = value
        default: return nil
        }
        let tag: String
        switch message["tag"] {
        case nil, is NSNull: tag = ""
        case let value as String: tag = value
        default: return nil
        }
        return .show(
            title: String(title.prefix(notificationTitleLimit)),
            body: String(text.prefix(notificationBodyLimit)),
            tag: String(tag.prefix(notificationTagLimit))
        )
    default:
        return nil
    }
}

/// The page's `Notification.permission` for an authorization status.
func notificationPermission(for status: UNAuthorizationStatus) -> String {
    switch status {
    case .authorized, .provisional, .ephemeral: return "granted"
    case .denied: return "denied"
    case .notDetermined: return "default"
    @unknown default: return "denied"
    }
}

/// Whether a message's frame may use the bridge: the main frame, on the
/// app's own origin.
func acceptsNotificationMessage(isMainFrame: Bool, origin: URL?, appOrigin: URL) -> Bool {
    guard isMainFrame, let origin else { return false }
    let scheme = origin.scheme?.lowercased()
    return (scheme == "http" || scheme == "https") && sameOrigin(origin, appOrigin)
}

/// A frame's security origin as a URL, or nil when it has no host (an
/// opaque origin). Port 0 is the scheme's default.
func originURL(protocol scheme: String, host: String, port: Int) -> URL? {
    guard !scheme.isEmpty, !host.isEmpty else { return nil }
    var components = URLComponents()
    components.scheme = scheme
    components.host = host.contains(":") && !host.hasPrefix("[") ? "[\(host)]" : host
    if port != 0 { components.port = port }
    return components.url
}

@MainActor
final class NotificationBridge: NSObject, WKScriptMessageHandlerWithReply, UNUserNotificationCenterDelegate {
    nonisolated static let handlerName = "gnosiaNotification"
    /// The page-side function the shim defines for a permission pushed at it.
    nonisolated static let syncFunctionName = "__gnosiaNotificationSync"
    static let shared = NotificationBridge()

    /// The windows holding a page the shim may be in, so a permission
    /// change can reach them all. Weak: a closed window's view goes on its
    /// own.
    private let views = NSHashTable<WKWebView>.weakObjects()

    /// The notification center needs an app bundle: in an unbundled
    /// `swift run`, or the test runner, `UNUserNotificationCenter.current()`
    /// throws, so the window there gets no `Notification`, as before.
    nonisolated static var isAvailable: Bool {
        Bundle.main.bundleURL.pathExtension == "app" && Bundle.main.bundleIdentifier != nil
    }

    /// Adds the shim and the handler to a configuration's controller.
    static func install(in controller: WKUserContentController) {
        controller.addUserScript(WKUserScript(
            source: notificationShimSource, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page
        ))
        controller.addScriptMessageHandler(shared, contentWorld: .page, name: handlerName)
    }

    /// Track a window's view for `pushPermission`. Called for every view,
    /// bundled or not, so the guard lives here rather than at the call.
    static func track(_ view: WKWebView) {
        guard isAvailable else { return }
        shared.views.add(view)
    }

    override init() {
        super.init()
        // Permission can change in System Settings while the app runs; the
        // pages learn it the next time the app comes forward.
        NotificationCenter.default.addObserver(
            self, selector: #selector(applicationBecameActive),
            name: NSApplication.didBecomeActiveNotification, object: nil
        )
    }

    private var center: UNUserNotificationCenter {
        let center = UNUserNotificationCenter.current()
        if center.delegate == nil { center.delegate = self }
        return center
    }

    @objc private func applicationBecameActive() {
        Task { await pushPermission() }
    }

    /// The center's current permission pushed into every tracked page's
    /// shim, so a window that missed the grant does not stay on `denied`.
    /// The `&&` no-ops on a page the shim never defined itself in.
    private func pushPermission() async {
        let value = notificationPermission(for: await center.notificationSettings().authorizationStatus)
        let source = "window.\(Self.syncFunctionName) && window.\(Self.syncFunctionName)(\"\(value)\")"
        for view in views.allObjects {
            // A page mid-navigation can refuse the call; its shim asks for
            // the permission itself at load anyway.
            _ = try? await view.evaluateJavaScript(source)
        }
    }

    func userContentController(
        _ controller: WKUserContentController, didReceive message: WKScriptMessage
    ) async -> (Any?, String?) {
        let security = message.frameInfo.securityOrigin
        let origin = originURL(protocol: security.protocol, host: security.host, port: security.port)
        guard let coordinator = message.webView?.navigationDelegate as? WebView.Coordinator,
              acceptsNotificationMessage(isMainFrame: message.frameInfo.isMainFrame, origin: origin,
                                         appOrigin: coordinator.origin),
              let request = notificationRequest(from: message.body)
        else { return (nil, "refused") }
        switch request {
        case .permission:
            return (notificationPermission(for: await center.notificationSettings().authorizationStatus), nil)
        case .requestPermission:
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
            await pushPermission()
            return (notificationPermission(for: await center.notificationSettings().authorizationStatus), nil)
        case .show(let title, let body, let tag):
            guard notificationPermission(for: await center.notificationSettings().authorizationStatus) == "granted"
            else { return (nil, nil) }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            // A second show on one tag replaces the first, as a browser's
            // `tag` does: two windows announcing one job stay one banner.
            let identifier = tag.isEmpty ? UUID().uuidString : "gnosia.\(tag)"
            try? await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil))
            return (nil, nil)
        }
    }

    /// Shown while the app is active too: the page asks only when its window
    /// is hidden or unfocused, which can be with another Gnosia window in
    /// front.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}

/// The page's `Notification`, defined only where the page has none (inside
/// the shell). It keeps the permission it last heard, so `permission`
/// reads synchronously as the web API's does, posts only `kind`, `title`,
/// `body` and `tag`, and hears a pushed permission through
/// `__gnosiaNotificationSync`.
let notificationShimSource = """
(() => {
  if (typeof window.Notification !== "undefined") return;
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(NotificationBridge.handlerName);
  if (!handler) return;
  let permission = "default";
  const heard = (value) => {
    if (value === "granted" || value === "denied" || value === "default") permission = value;
    return permission;
  };
  class Notification {
    constructor(title, options) {
      this.title = String(title);
      this.body = options && options.body != null ? String(options.body) : "";
      this.tag = options && options.tag != null ? String(options.tag) : "";
      this.onclick = null;
      this.onclose = null;
      this.onerror = null;
      this.onshow = null;
      if (permission === "granted") {
        handler.postMessage({ kind: "show", title: this.title, body: this.body, tag: this.tag }).catch(() => undefined);
      }
    }
    static get permission() { return permission; }
    static requestPermission(callback) {
      const asked = handler.postMessage({ kind: "requestPermission" }).then(heard, () => permission);
      if (typeof callback === "function") asked.then(callback);
      return asked;
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  Object.defineProperty(window, "Notification", { value: Notification, configurable: true, writable: true });
  Object.defineProperty(window, "\(NotificationBridge.syncFunctionName)", { value: heard });
  handler.postMessage({ kind: "permission" }).then(heard, () => undefined);
})();
"""
